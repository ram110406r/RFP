import { randomBytes } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  invitations,
  organizationMembers,
  organizations,
  users,
  withTransaction,
  type Database,
} from "@rfp-os/db";
import type { AuthContext, OrgRole } from "@rfp-os/types";

import type { Env } from "../../config/env.schema";
import { DATABASE } from "../../infrastructure/database";
import type {
  CreateOrganizationInput,
  InviteMemberInput,
  UpdateMemberInput,
  UpdateOrganizationInput,
} from "./organizations.dto";

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async getCurrent(organizationId: string) {
    const [organization] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!organization) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Organization not found." });
    }

    const [counts] = await this.db
      .select({ memberCount: sql<number>`count(*)`.mapWith(Number) })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.status, "active"),
        ),
      );

    return { ...organization, memberCount: counts?.memberCount ?? 0 };
  }

  async update(organizationId: string, input: UpdateOrganizationInput) {
    const [updated] = await this.db
      .update(organizations)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(organizations.id, organizationId))
      .returning();

    if (!updated) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Organization not found." });
    }
    return updated;
  }

  /**
   * Creates an organization and makes the caller its OWNER, in one transaction
   * — an organization with no owner would be unadministrable, so the two
   * writes must not be able to come apart.
   *
   * Used by a signed-up user who belongs to no tenant yet, which is why it
   * takes a bare userId rather than an AuthContext.
   */
  async create(userId: string, input: CreateOrganizationInput) {
    return withTransaction(async (tx) => {
      const [organization] = await tx
        .insert(organizations)
        .values({
          name: input.name,
          domain: input.domain,
          industry: input.industry ?? null,
          logoInitials: initialsFor(input.name),
        })
        .returning();

      if (!organization) {
        throw new BadRequestException({
          code: "ORGANIZATION_NOT_CREATED",
          message: "Could not create the organization.",
        });
      }

      await tx.insert(organizationMembers).values({
        organizationId: organization.id,
        userId,
        role: "OWNER",
        status: "active",
      });

      /** Adopt it as the user's default tenant when they had none. */
      await tx
        .update(users)
        .set({ organizationId: organization.id, updatedAt: new Date() })
        .where(and(eq(users.id, userId), sql`${users.organizationId} is null`));

      return organization;
    });
  }

  async listMembers(organizationId: string) {
    return this.db
      .select({
        userId: organizationMembers.userId,
        role: organizationMembers.role,
        status: organizationMembers.status,
        joinedAt: organizationMembers.joinedAt,
        name: users.name,
        email: users.email,
        jobTitle: users.jobTitle,
        team: users.team,
      })
      .from(organizationMembers)
      .innerJoin(users, eq(users.id, organizationMembers.userId))
      .where(eq(organizationMembers.organizationId, organizationId))
      .orderBy(desc(organizationMembers.joinedAt));
  }

  /**
   * Changes a member's role or suspends them.
   *
   * Three guards, each closing a real escalation path:
   *  - only OWNER may grant or revoke OWNER, so an ADMIN cannot promote
   *    themselves past their own ceiling;
   *  - nobody may change their own role, which would make the first rule
   *    trivially bypassable;
   *  - the last active OWNER cannot be demoted or suspended, which would
   *    strand the organization.
   */
  async updateMember(auth: AuthContext, targetUserId: string, input: UpdateMemberInput) {
    const membership = await this.requireMembership(auth.organizationId, targetUserId);

    if (targetUserId === auth.userId) {
      throw new ForbiddenException({
        code: "CANNOT_MODIFY_SELF",
        message: "You cannot change your own role or status.",
      });
    }

    const grantsOrRevokesOwner = input.role === "OWNER" || membership.role === "OWNER";
    if (grantsOrRevokesOwner && auth.role !== "OWNER") {
      throw new ForbiddenException({
        code: "OWNER_REQUIRED",
        message: "Only an owner can grant or revoke the owner role.",
      });
    }

    const losesOwner =
      membership.role === "OWNER" &&
      ((input.role !== undefined && input.role !== "OWNER") || input.status === "suspended");
    if (losesOwner) await this.assertNotLastOwner(auth.organizationId, targetUserId);

    const [updated] = await this.db
      .update(organizationMembers)
      .set({
        ...(input.role ? { role: input.role } : {}),
        ...(input.status ? { status: input.status } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(organizationMembers.organizationId, auth.organizationId),
          eq(organizationMembers.userId, targetUserId),
        ),
      )
      .returning();

    return updated;
  }

  /** Soft removal — the row stays so historical references keep resolving. */
  async removeMember(auth: AuthContext, targetUserId: string) {
    const membership = await this.requireMembership(auth.organizationId, targetUserId);

    if (targetUserId === auth.userId) {
      throw new ForbiddenException({
        code: "CANNOT_REMOVE_SELF",
        message: "You cannot remove yourself from the organization.",
      });
    }
    if (membership.role === "OWNER" && auth.role !== "OWNER") {
      throw new ForbiddenException({
        code: "OWNER_REQUIRED",
        message: "Only an owner can remove another owner.",
      });
    }
    if (membership.role === "OWNER") {
      await this.assertNotLastOwner(auth.organizationId, targetUserId);
    }

    await this.db
      .update(organizationMembers)
      .set({ status: "removed", updatedAt: new Date() })
      .where(
        and(
          eq(organizationMembers.organizationId, auth.organizationId),
          eq(organizationMembers.userId, targetUserId),
        ),
      );

    return { removed: true };
  }

  async listInvitations(organizationId: string) {
    return this.db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        status: invitations.status,
        expiresAt: invitations.expiresAt,
        createdAt: invitations.createdAt,
      })
      .from(invitations)
      .where(eq(invitations.organizationId, organizationId))
      .orderBy(desc(invitations.createdAt));
  }

  async invite(auth: AuthContext, input: InviteMemberInput) {
    if (input.role === "OWNER" && auth.role !== "OWNER") {
      throw new ForbiddenException({
        code: "OWNER_REQUIRED",
        message: "Only an owner can invite another owner.",
      });
    }

    const [existingUser] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    if (existingUser) {
      const [alreadyMember] = await this.db
        .select({ status: organizationMembers.status })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, auth.organizationId),
            eq(organizationMembers.userId, existingUser.id),
          ),
        )
        .limit(1);
      if (alreadyMember && alreadyMember.status === "active") {
        throw new ConflictException({
          code: "ALREADY_MEMBER",
          message: "That person is already a member of this organization.",
        });
      }
    }

    const ttlHours = this.config.get("INVITATION_TTL_HOURS", { infer: true });
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    /**
     * Supersede any outstanding invitation for the same address so a single
     * pending invite exists per email — otherwise revoking one leaves another
     * live, which defeats the revocation.
     */
    await this.db
      .update(invitations)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(
        and(
          eq(invitations.organizationId, auth.organizationId),
          eq(invitations.email, input.email),
          eq(invitations.status, "pending"),
        ),
      );

    const [invitation] = await this.db
      .insert(invitations)
      .values({
        organizationId: auth.organizationId,
        email: input.email,
        role: input.role,
        token: randomBytes(32).toString("base64url"),
        invitedBy: auth.userId,
        expiresAt,
      })
      .returning();

    return invitation;
  }

  async revokeInvitation(organizationId: string, invitationId: string) {
    const [revoked] = await this.db
      .update(invitations)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.organizationId, organizationId),
          eq(invitations.status, "pending"),
        ),
      )
      .returning();

    if (!revoked) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "No pending invitation with that id.",
      });
    }
    return revoked;
  }

  /**
   * Accepts an invitation on behalf of the signed-in user.
   *
   * The token carries the organization and role, so the caller never supplies
   * either — this is the only path by which a user joins a tenant they were
   * not already in, and it cannot be pointed at an arbitrary organization.
   *
   * The email on the invitation must match the authenticated account, so a
   * leaked token cannot be redeemed by whoever finds it.
   */
  async acceptInvitation(userId: string, token: string) {
    return withTransaction(async (tx) => {
      const [invitation] = await tx
        .select()
        .from(invitations)
        .where(eq(invitations.token, token))
        .limit(1);

      if (!invitation || invitation.status !== "pending") {
        throw new NotFoundException({
          code: "INVITATION_INVALID",
          message: "That invitation is no longer valid.",
        });
      }

      if (invitation.expiresAt.getTime() < Date.now()) {
        await tx
          .update(invitations)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(invitations.id, invitation.id));
        throw new BadRequestException({
          code: "INVITATION_EXPIRED",
          message: "That invitation has expired. Ask for a new one.",
        });
      }

      const [user] = await tx
        .select({ id: users.id, email: users.email, organizationId: users.organizationId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "User not found." });
      }
      if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
        throw new ForbiddenException({
          code: "INVITATION_EMAIL_MISMATCH",
          message: "This invitation was sent to a different email address.",
        });
      }

      await tx
        .insert(organizationMembers)
        .values({
          organizationId: invitation.organizationId,
          userId,
          role: invitation.role,
          status: "active",
          invitedBy: invitation.invitedBy,
        })
        .onConflictDoUpdate({
          target: [organizationMembers.organizationId, organizationMembers.userId],
          set: { role: invitation.role, status: "active", updatedAt: new Date() },
        });

      await tx
        .update(invitations)
        .set({
          status: "accepted",
          acceptedAt: new Date(),
          acceptedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(invitations.id, invitation.id));

      if (!user.organizationId) {
        await tx
          .update(users)
          .set({ organizationId: invitation.organizationId, updatedAt: new Date() })
          .where(eq(users.id, userId));
      }

      return {
        organizationId: invitation.organizationId,
        role: invitation.role as OrgRole,
      };
    });
  }

  private async requireMembership(organizationId: string, userId: string) {
    const [membership] = await this.db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, userId),
        ),
      )
      .limit(1);

    if (!membership || membership.status === "removed") {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "That person is not a member of this organization.",
      });
    }
    return membership;
  }

  private async assertNotLastOwner(organizationId: string, excludingUserId: string) {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.role, "OWNER"),
          eq(organizationMembers.status, "active"),
          sql`${organizationMembers.userId} <> ${excludingUserId}`,
        ),
      );

    if ((row?.count ?? 0) === 0) {
      throw new ConflictException({
        code: "LAST_OWNER",
        message: "An organization must keep at least one owner.",
      });
    }
  }
}

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
