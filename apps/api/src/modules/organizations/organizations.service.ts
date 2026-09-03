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
  teamMembers,
  teams,
  users,
  withTransaction,
  workspaceMembers,
  workspaces,
  type Database,
} from "@rfp-os/db";
import type { AuthContext, OrgRole } from "@rfp-os/types";

import type { Env } from "../../config/env.schema";
import { ActivityService } from "../../infrastructure/activity";
import { AuditService } from "../../infrastructure/audit";
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
    private readonly activity: ActivityService,
    private readonly audit: AuditService,
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
    const [existing] = await this.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Organization not found." });
    }

    const [updated] = await this.db
      .update(organizations)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(organizations.id, organizationId))
      .returning();

    await this.audit.record({
      organizationId,
      action: "ORGANIZATION_UPDATED",
      entityType: "organization",
      entityId: organizationId,
      previousValue: existing,
      newValue: updated,
    });
    await this.activity.record({
      organizationId,
      action: "ORGANIZATION_UPDATED",
      entityType: "organization",
      entityId: organizationId,
      actorType: "system",
      actorLabel: "System",
      label: `Organization updated: ${updated!.name}`,
      summary: `Updated organization ${updated!.name}`,
    });

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
    await this.requireVerifiedUser(userId);
    const [existingMembership] = await this.db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.status, "active")))
      .limit(1);
    if (existingMembership) {
      throw new ConflictException({
        code: "COMPANY_ALREADY_ASSIGNED",
        message: "This account already belongs to a company.",
      });
    }
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
        organizationMemberId: organizationMembers.id,
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

    const [updated] = await withTransaction(async (tx) => {
      const [next] = await tx
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

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          action: "MEMBER_UPDATED",
          entityType: "organization_member",
          entityId: membership.id,
          previousValue: membership,
          newValue: next,
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          actorLabel: auth.userId,
          action: "MEMBER_UPDATED",
          entityType: "organization_member",
          entityId: membership.id,
          label: "Member updated",
          summary: `Updated member ${targetUserId}`,
        },
        tx,
      );

      return [next!];
    });

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

    await withTransaction(async (tx) => {
      const [updated] = await tx
        .update(organizationMembers)
        .set({ status: "removed", updatedAt: new Date() })
        .where(
          and(
            eq(organizationMembers.organizationId, auth.organizationId),
            eq(organizationMembers.userId, targetUserId),
          ),
        )
        .returning();

      // Keep historical membership rows, but revoke every live grant derived
      // from them so a removed member cannot retain workspace or team access.
      await tx
        .update(workspaceMembers)
        .set({ status: "removed", updatedAt: new Date() })
        .where(eq(workspaceMembers.organizationMemberId, membership.id));
      await tx.delete(teamMembers).where(eq(teamMembers.organizationMemberId, membership.id));

      const [targetUser] = await tx
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, targetUserId))
        .limit(1);
      if (targetUser) {
        await tx
          .update(invitations)
          .set({ status: "revoked", updatedAt: new Date() })
          .where(
            and(
              eq(invitations.organizationId, auth.organizationId),
              eq(invitations.email, targetUser.email),
              eq(invitations.status, "pending"),
            ),
          );
      }

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          action: "MEMBER_REMOVED",
          entityType: "organization_member",
          entityId: membership.id,
          previousValue: membership,
          newValue: updated,
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          actorLabel: auth.userId,
          action: "MEMBER_REMOVED",
          entityType: "organization_member",
          entityId: membership.id,
          kind: "rejected",
          label: "Member removed",
          summary: `Removed member ${targetUserId}`,
        },
        tx,
      );
    });

    return { removed: true };
  }

  async listInvitations(organizationId: string) {
    return this.db
      .select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        workspaceId: invitations.workspaceId,
        proposedDepartment: invitations.proposedDepartment,
        proposedTeamId: invitations.proposedTeamId,
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
    const [workspace] = await this.db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.id, input.workspaceId), eq(workspaces.organizationId, auth.organizationId), eq(workspaces.status, "active")))
      .limit(1);
    if (!workspace) {
      throw new BadRequestException({ code: "INVALID_WORKSPACE", message: "Choose an active workspace in this organization." });
    }
    if (input.proposedTeamId) {
      const [team] = await this.db
        .select({ id: teams.id, workspaceId: teams.workspaceId })
        .from(teams)
        .where(and(eq(teams.id, input.proposedTeamId), eq(teams.organizationId, auth.organizationId), eq(teams.status, "active")))
        .limit(1);
      if (!team || team.workspaceId !== input.workspaceId) {
        throw new BadRequestException({ code: "INVALID_PROPOSED_TEAM", message: "The proposed team is not available in that workspace." });
      }
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

    const [invitation] = await withTransaction(async (tx) => {
      const [created] = await tx
        .insert(invitations)
        .values({
          organizationId: auth.organizationId,
          workspaceId: input.workspaceId,
          email: input.email,
          role: input.role,
          proposedDepartment: input.proposedDepartment ?? null,
          proposedTeamId: input.proposedTeamId ?? null,
          token: randomBytes(32).toString("base64url"),
          invitedBy: auth.userId,
          expiresAt,
        })
        .returning();

      await this.audit.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          action: "MEMBER_INVITED",
          entityType: "invitation",
          entityId: created!.id,
          newValue: this.invitationSummary(created!),
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          actorLabel: auth.userId,
          action: "MEMBER_INVITED",
          entityType: "invitation",
          entityId: created!.id,
          kind: "assigned",
          label: "Member invited",
          summary: `Invited ${input.email} to join the organization`,
        },
        tx,
      );

      return [created!];
    });

    return {
      invitation: this.invitationSummary(invitation),
      acceptUrl: `${this.applicationUrl()}/join#token=${encodeURIComponent(invitation.token)}`,
    };
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
    return this.invitationSummary(revoked);
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
    await this.requireVerifiedUser(userId);
    const [candidate] = await this.db.select().from(invitations).where(eq(invitations.token, token)).limit(1);
    if (candidate?.status === "accepted" && candidate.acceptedBy === userId) {
      return {
        invitationId: candidate.id,
        organizationId: candidate.organizationId,
        workspaceId: candidate.workspaceId,
        role: candidate.role as OrgRole,
      };
    }
    if (!candidate || candidate.status !== "pending") {
      throw new NotFoundException({ code: "INVITATION_INVALID", message: "That invitation is no longer valid." });
    }
    const [existingMembership] = await this.db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.status, "active")))
      .limit(1);
    if (existingMembership) {
      throw new ConflictException({
        code: "COMPANY_ALREADY_ASSIGNED",
        message: "This account already belongs to a company.",
      });
    }
    if (candidate.expiresAt.getTime() < Date.now()) {
      await this.db.update(invitations).set({ status: "expired", updatedAt: new Date() }).where(and(eq(invitations.id, candidate.id), eq(invitations.status, "pending")));
      throw new BadRequestException({ code: "INVITATION_EXPIRED", message: "That invitation has expired. Ask for a new one." });
    }
    const [candidateUser] = await this.db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (!candidateUser) throw new NotFoundException({ code: "NOT_FOUND", message: "User not found." });
    if (candidateUser.email.toLowerCase() !== candidate.email.toLowerCase()) {
      throw new ForbiddenException({ code: "INVITATION_EMAIL_MISMATCH", message: "This invitation was sent to a different email address." });
    }

    return withTransaction(async (tx) => {
      const [invitation] = await tx
        .select()
        .from(invitations)
        .where(eq(invitations.token, token))
        .limit(1);

      if (invitation?.status === "accepted" && invitation.acceptedBy === userId) {
        return {
          invitationId: invitation.id,
          organizationId: invitation.organizationId,
          workspaceId: invitation.workspaceId,
          role: invitation.role as OrgRole,
        };
      }
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

      let membershipId = "";
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

      const [membership] = await tx
        .select({ id: organizationMembers.id })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, invitation.organizationId),
            eq(organizationMembers.userId, userId),
          ),
        )
        .limit(1);
      membershipId = membership?.id ?? "";

      if (invitation.workspaceId && membershipId) {
        await tx
          .insert(workspaceMembers)
          .values({ workspaceId: invitation.workspaceId, organizationMemberId: membershipId, status: "active" })
          .onConflictDoUpdate({
            target: [workspaceMembers.workspaceId, workspaceMembers.organizationMemberId],
            set: { status: "active", updatedAt: new Date() },
          });
      }
      if (invitation.proposedTeamId && membershipId) {
        const [team] = await tx
          .select({ id: teams.id, workspaceId: teams.workspaceId })
          .from(teams)
          .where(and(eq(teams.id, invitation.proposedTeamId), eq(teams.organizationId, invitation.organizationId), eq(teams.status, "active")))
          .limit(1);
        if (team && (!invitation.workspaceId || !team.workspaceId || team.workspaceId === invitation.workspaceId)) {
          await tx
            .insert(teamMembers)
            .values({ teamId: team.id, organizationMemberId: membershipId })
            .onConflictDoNothing({ target: [teamMembers.teamId, teamMembers.organizationMemberId] });
        }
      }

      await tx
        .update(invitations)
        .set({
          status: "accepted",
          acceptedAt: new Date(),
          acceptedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(invitations.id, invitation.id));

      await this.audit.record(
        {
          organizationId: invitation.organizationId,
          actorId: userId,
          action: "MEMBER_ACCEPTED",
          entityType: "invitation",
          entityId: invitation.id,
          previousValue: { status: "pending" },
          newValue: { status: "accepted", membershipId },
        },
        tx,
      );
      await this.activity.record(
        {
          organizationId: invitation.organizationId,
          actorId: userId,
          actorLabel: user.email,
          action: "MEMBER_ACCEPTED",
          entityType: "invitation",
          entityId: invitation.id,
          kind: "approved",
          label: "Member accepted invitation",
          summary: `${user.email} joined the organization`,
        },
        tx,
      );

      if (!user.organizationId) {
        await tx
          .update(users)
          .set({ organizationId: invitation.organizationId, updatedAt: new Date() })
          .where(eq(users.id, userId));
      }

      return {
        invitationId: invitation.id,
        organizationId: invitation.organizationId,
        workspaceId: invitation.workspaceId,
        role: invitation.role as OrgRole,
      };
    });
  }

  async acceptDetectedInvitation(userId: string, invitationId: string) {
    const rows = await this.db.execute(sql`
      select ${invitations.token} as token
      from ${invitations}
      where ${invitations.id} = ${invitationId}
      limit 1
    `);
    const invitation = rows[0] as { token: string } | undefined;
    if (!invitation) {
      throw new NotFoundException({ code: "INVITATION_INVALID", message: "That invitation is no longer valid." });
    }
    return this.acceptInvitation(userId, invitation.token);
  }

  private invitationSummary(invitation: typeof invitations.$inferSelect) {
    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      workspaceId: invitation.workspaceId,
      proposedDepartment: invitation.proposedDepartment,
      proposedTeamId: invitation.proposedTeamId,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    };
  }

  private applicationUrl() {
    const origin = this.config.get("CORS_ORIGIN", { infer: true }).split(",")[0]?.trim();
    if (!origin || origin === "*") {
      throw new ConflictException({
        code: "INVITATION_URL_UNAVAILABLE",
        message: "Set CORS_ORIGIN to the public application URL before inviting employees.",
      });
    }
    return origin.replace(/\/$/, "");
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

  private async requireVerifiedUser(userId: string) {
    const [user] = await this.db
      .select({ emailVerified: users.emailVerified })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user?.emailVerified) {
      throw new ForbiddenException({
        code: "EMAIL_VERIFICATION_REQUIRED",
        message: "Verify your email address before creating a company or accepting an invitation.",
      });
    }
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
