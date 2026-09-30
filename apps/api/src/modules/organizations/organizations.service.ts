import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, desc, eq, gt, sql, type SQL } from "drizzle-orm";
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
  type Transaction,
} from "@rfp-os/db";
import { ORG_ADMIN_ROLES, type AuthContext, type OrgRole } from "@rfp-os/types";

import type { Env } from "../../config/env.schema";
import { ActivityService } from "../../infrastructure/activity";
import { AuditService } from "../../infrastructure/audit";
import { DATABASE } from "../../infrastructure/database";
import { MailService } from "../../infrastructure/mail";
import { createInvitationToken, hashInvitationToken } from "./invitation-token";
import type {
  CreateOrganizationInput,
  InviteMemberInput,
  UpdateMemberInput,
  UpdateOrganizationInput,
} from "./organizations.dto";

/** Who is inviting. A subset of AuthContext so onboarding can invite too. */
export type InviteActor = Pick<AuthContext, "userId" | "organizationId" | "role">;

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly config: ConfigService<Env, true>,
    private readonly activity: ActivityService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
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

  async update(organizationId: string, actorId: string, input: UpdateOrganizationInput) {
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
      actorId,
      actorType: "user",
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
      actorId,
      actorType: "user",
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
   * Takes a bare userId rather than an AuthContext because the caller may
   * belong to no tenant yet. A user may belong to several organizations, so
   * existing memberships do not block creating another.
   *
   * A first workspace is created alongside, with the owner in it: invitations
   * are always into a workspace, so an organization without one could not
   * invite anybody.
   */
  async create(userId: string, input: CreateOrganizationInput) {
    await this.requireVerifiedUser(userId);
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

      const [ownerMembership] = await tx
        .insert(organizationMembers)
        .values({
          organizationId: organization.id,
          userId,
          role: "OWNER",
          status: "active",
        })
        .returning({ id: organizationMembers.id });

      const workspaceName = input.workspaceName?.trim() || "General";
      const [workspace] = await tx
        .insert(workspaces)
        .values({
          organizationId: organization.id,
          name: workspaceName,
          slug: slugify(workspaceName),
        })
        .returning();
      await tx.insert(workspaceMembers).values({
        workspaceId: workspace!.id,
        organizationMemberId: ownerMembership!.id,
        status: "active",
      });

      await this.audit.record(
        {
          organizationId: organization.id,
          actorId: userId,
          action: "ORGANIZATION_CREATED",
          entityType: "organization",
          entityId: organization.id,
          newValue: { organization, workspaceId: workspace!.id },
        },
        tx,
      );

      /** Adopt it as the user's default tenant when they had none. */
      await tx
        .update(users)
        .set({ organizationId: organization.id, updatedAt: new Date() })
        .where(and(eq(users.id, userId), sql`${users.organizationId} is null`));

      return { ...organization, defaultWorkspaceId: workspace!.id };
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

    this.assertRoleCeiling(auth, input.role);
    if (membership.role === "ADMIN") this.assertRoleCeiling(auth, "ADMIN");

    const losesOwner =
      membership.role === "OWNER" &&
      ((input.role !== undefined && input.role !== "OWNER") || input.status === "suspended");

    const [updated] = await withTransaction(async (tx) => {
      if (losesOwner) await this.assertNotLastOwner(tx, auth.organizationId, targetUserId);
      if (input.status === "active" && membership.status !== "active") {
        await this.assertSeatAvailable(tx, auth.organizationId, { countPendingInvitations: true });
      }
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
    if (membership.role === "ADMIN") this.assertRoleCeiling(auth, "ADMIN");

    await withTransaction(async (tx) => {
      if (membership.role === "OWNER") {
        await this.assertNotLastOwner(tx, auth.organizationId, targetUserId);
      }
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
      await this.repointDefaultOrganization(tx, targetUserId, auth.organizationId);

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

  /**
   * Invites an email address into the actor's organization and emails the
   * join link. Also the single path onboarding uses to invite a company's
   * first colleagues, so every rule (role ceiling, workspace and team
   * validation, TTL, audit) lives here and nowhere else.
   */
  async invite(auth: InviteActor, input: InviteMemberInput) {
    if (input.role === "OWNER" && auth.role !== "OWNER") {
      throw new ForbiddenException({
        code: "OWNER_REQUIRED",
        message: "Only an owner can invite another owner.",
      });
    }
    this.assertRoleCeiling(auth, input.role);
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
      /*
       * Re-inviting must not become a way round a suspension another admin
       * applied: accepting would otherwise flip the row back to active.
       */
      if (alreadyMember && alreadyMember.status === "suspended") {
        throw new ConflictException({
          code: "MEMBER_SUSPENDED",
          message: "That person is suspended. Reinstate them from the members list instead of inviting them.",
        });
      }
    }

    const ttlHours = this.config.get("INVITATION_TTL_HOURS", { infer: true });
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    const { token, tokenHash } = createInvitationToken();

    const [invitation] = await withTransaction(async (tx) => {
      /**
       * Supersede any outstanding invitation for the same address so a single
       * pending invite exists per email — otherwise revoking one leaves another
       * live, which defeats the revocation. The superseded one frees its seat.
       */
      await tx
        .update(invitations)
        .set({ status: "revoked", updatedAt: new Date() })
        .where(
          and(
            eq(invitations.organizationId, auth.organizationId),
            eq(invitations.email, input.email),
            eq(invitations.status, "pending"),
          ),
        );
      await this.assertSeatAvailable(tx, auth.organizationId, { countPendingInvitations: true });

      const [created] = await tx
        .insert(invitations)
        .values({
          organizationId: auth.organizationId,
          workspaceId: input.workspaceId,
          email: input.email,
          role: input.role,
          proposedDepartment: input.proposedDepartment ?? null,
          proposedTeamId: input.proposedTeamId ?? null,
          tokenHash,
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

    const acceptUrl = this.joinUrl(token);
    await this.sendInvitationEmail(auth, invitation, acceptUrl);

    return {
      invitation: this.invitationSummary(invitation),
      acceptUrl,
    };
  }

  /**
   * Delivery failure does not undo the invitation: the inviter still gets the
   * link back and can share it by hand. It is logged rather than swallowed.
   */
  private async sendInvitationEmail(
    auth: InviteActor,
    invitation: typeof invitations.$inferSelect,
    acceptUrl: string,
  ) {
    const [context] = await this.db
      .select({ organizationName: organizations.name, inviterName: users.name })
      .from(organizations)
      .leftJoin(users, eq(users.id, auth.userId))
      .where(eq(organizations.id, auth.organizationId))
      .limit(1);
    try {
      await this.mail.sendInvitation({
        to: invitation.email,
        organizationName: context?.organizationName ?? "your company",
        inviterName: context?.inviterName ?? null,
        role: invitation.role,
        url: acceptUrl,
        expiresAt: invitation.expiresAt,
      });
    } catch (error) {
      this.logger.error(`Invitation ${invitation.id} email failed: ${(error as Error).message}`);
    }
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
   * Re-sends a pending invitation with a fresh token and expiry. The old link
   * stops working, since only the newest token's hash is stored.
   */
  async resendInvitation(auth: InviteActor, invitationId: string) {
    const [existing] = await this.db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.organizationId, auth.organizationId),
          eq(invitations.status, "pending"),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "No pending invitation with that id." });
    }
    if (existing.role === "OWNER" && auth.role !== "OWNER") {
      throw new ForbiddenException({ code: "OWNER_REQUIRED", message: "Only an owner can invite another owner." });
    }
    this.assertRoleCeiling(auth, existing.role as OrgRole);

    const ttlHours = this.config.get("INVITATION_TTL_HOURS", { infer: true });
    const { token, tokenHash } = createInvitationToken();
    const [invitation] = await withTransaction(async (tx) => {
      const [updated] = await tx
        .update(invitations)
        .set({ tokenHash, expiresAt: new Date(Date.now() + ttlHours * 60 * 60 * 1000), updatedAt: new Date() })
        .where(and(eq(invitations.id, existing.id), eq(invitations.status, "pending")))
        .returning();
      if (!updated) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "No pending invitation with that id." });
      }
      await this.audit.record(
        {
          organizationId: auth.organizationId,
          actorId: auth.userId,
          action: "MEMBER_INVITATION_RESENT",
          entityType: "invitation",
          entityId: updated.id,
          previousValue: { expiresAt: existing.expiresAt },
          newValue: { expiresAt: updated.expiresAt },
        },
        tx,
      );
      return [updated];
    });

    const acceptUrl = this.joinUrl(token);
    await this.sendInvitationEmail(auth, invitation!, acceptUrl);
    return { invitation: this.invitationSummary(invitation!), acceptUrl };
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
    return this.acceptInvitationWhere(userId, eq(invitations.tokenHash, hashInvitationToken(token)));
  }

  /**
   * Accepts an invitation the user was shown in onboarding (matched on their
   * verified email) by id. Safe without the token: the email check below
   * still requires the account to own the invited address, and that address
   * is verified.
   */
  async acceptInvitationById(userId: string, invitationId: string) {
    return this.acceptInvitationWhere(userId, eq(invitations.id, invitationId));
  }

  private async acceptInvitationWhere(userId: string, match: SQL) {
    await this.requireVerifiedUser(userId);
    const [candidate] = await this.db.select().from(invitations).where(match).limit(1);
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
        .where(match)
        .for("update")
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

      const [priorMembership] = await tx
        .select({ status: organizationMembers.status })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.organizationId, invitation.organizationId),
            eq(organizationMembers.userId, userId),
          ),
        )
        .limit(1);
      if (priorMembership?.status === "suspended") {
        throw new ForbiddenException({
          code: "MEMBER_SUSPENDED",
          message: "Your membership in this organization is suspended. Contact an administrator.",
        });
      }
      if (invitation.workspaceId) {
        const [workspace] = await tx
          .select({ status: workspaces.status })
          .from(workspaces)
          .where(eq(workspaces.id, invitation.workspaceId))
          .limit(1);
        if (workspace?.status !== "active") {
          throw new ConflictException({
            code: "INVITATION_WORKSPACE_ARCHIVED",
            message: "The workspace this invitation was for has been archived. Ask for a new invitation.",
          });
        }
      }
      if (priorMembership?.status !== "active") {
        await this.assertSeatAvailable(tx, invitation.organizationId, { countPendingInvitations: false });
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

  private joinUrl(token: string) {
    const origin = this.config.get("WEB_APP_URL", { infer: true }).replace(/\/$/, "");
    return `${origin}/join#token=${encodeURIComponent(token)}`;
  }

  /**
   * Enforces the organization's seat limit inside the caller's transaction.
   *
   * The organization row is locked first, so concurrent invitations and
   * acceptances for one organization queue up here and each counts what the
   * previous one committed — two admins cannot both take the last seat.
   *
   * Pending, unexpired invitations reserve a seat when inviting; accepting
   * converts a reservation into a member, so only active members count then
   * (first to accept wins if the limit was lowered in between).
   */
  private async assertSeatAvailable(
    tx: Transaction,
    organizationId: string,
    options: { countPendingInvitations: boolean },
  ) {
    const [organization] = await tx
      .select({ seats: organizations.seats })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .for("update");
    if (!organization) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Organization not found." });
    }

    const [members] = await tx
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.status, "active")));
    let used = members?.count ?? 0;

    if (options.countPendingInvitations) {
      const [pending] = await tx
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(invitations)
        .where(
          and(
            eq(invitations.organizationId, organizationId),
            eq(invitations.status, "pending"),
            gt(invitations.expiresAt, new Date()),
          ),
        );
      used += pending?.count ?? 0;
    }

    if (used + 1 > organization.seats) {
      throw new ConflictException({
        code: "SEAT_LIMIT_REACHED",
        message: `All ${organization.seats} seats are in use${options.countPendingInvitations ? " (including pending invitations)" : ""}. Remove a member, revoke an invitation, or add seats.`,
        seats: organization.seats,
        used,
      });
    }
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

  /**
   * Only OWNER and ADMIN may hand out or take away ADMIN. The permission matrix
   * already keeps member:* with those roles; this holds even if that changes.
   */
  private assertRoleCeiling(auth: InviteActor, role: OrgRole | undefined) {
    if (role !== "ADMIN" && role !== "OWNER") return;
    if (!ORG_ADMIN_ROLES.includes(auth.role)) {
      throw new ForbiddenException({
        code: "ADMIN_REQUIRED",
        message: "Only an owner or admin can grant or change administrator access.",
      });
    }
  }

  /**
   * users.organization_id is the user's default tenant. When they leave that
   * tenant, point it at another active membership (or clear it) so the default
   * never names an organization they no longer belong to.
   */
  private async repointDefaultOrganization(tx: Transaction, userId: string, leftOrganizationId: string) {
    const [next] = await tx
      .select({ organizationId: organizationMembers.organizationId })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(
        and(
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.status, "active"),
          eq(organizations.status, "active"),
          sql`${organizationMembers.organizationId} <> ${leftOrganizationId}`,
        ),
      )
      .orderBy(desc(organizationMembers.joinedAt))
      .limit(1);
    await tx
      .update(users)
      .set({ organizationId: next?.organizationId ?? null, updatedAt: new Date() })
      .where(and(eq(users.id, userId), eq(users.organizationId, leftOrganizationId)));
  }

  /**
   * Runs inside the caller's transaction and locks every active OWNER row, so
   * two owners demoting or removing each other at the same moment serialize
   * here: the second re-counts after the first commits and is refused.
   */
  private async assertNotLastOwner(tx: Transaction, organizationId: string, excludingUserId: string) {
    const owners = await tx
      .select({ userId: organizationMembers.userId })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.role, "OWNER"),
          eq(organizationMembers.status, "active"),
        ),
      )
      .for("update");

    if (owners.every((owner) => owner.userId === excludingUserId)) {
      throw new ConflictException({
        code: "LAST_OWNER",
        message: "An organization must keep at least one owner.",
      });
    }
  }
}

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "general";
}

function initialsFor(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
