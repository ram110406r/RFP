import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  invitations,
  onboardingProgress,
  organizationMembers,
  organizations,
  teams,
  users,
  withTransaction,
  workspaceMembers,
  workspaces,
  type Database,
} from "@rfp-os/db";
import { randomBytes } from "node:crypto";

import { DATABASE } from "../../infrastructure/database";
import { OrganizationsService } from "../organizations/organizations.service";
import type { CompanyInput, JourneyInput, ProfileInput, RfpContextInput, TeamInput, WorkspaceInput } from "./onboarding.dto";

type Journey = "COMPANY" | "EMPLOYEE";

@Injectable()
export class OnboardingService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly organizationsService: OrganizationsService,
  ) {}

  private async ensure(userId: string) {
    await this.db.insert(onboardingProgress).values({ userId }).onConflictDoNothing({ target: onboardingProgress.userId });
    const [progress] = await this.db.select().from(onboardingProgress).where(eq(onboardingProgress.userId, userId)).limit(1);
    if (!progress) throw new NotFoundException("Unable to create onboarding state.");
    return progress;
  }

  async status(userId: string) {
    let progress = await this.ensure(userId);
    if (!progress.journey && progress.organizationId && !progress.completed) {
      const [migrated] = await this.db
        .update(onboardingProgress)
        .set({ journey: "COMPANY", currentState: stateForLegacyCompanyStep(progress.currentStep), updatedAt: new Date() })
        .where(eq(onboardingProgress.id, progress.id))
        .returning();
      if (migrated) progress = migrated;
    }
    const [user] = await this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
        preferredName: users.preferredName,
        accountType: users.accountType,
        jobTitle: users.jobTitle,
        department: users.department,
        timezone: users.timezone,
        phone: users.phone,
        emailVerified: users.emailVerified,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) throw new NotFoundException("User not found.");

    await this.db
      .update(invitations)
      .set({ status: "expired", updatedAt: new Date() })
      .where(and(eq(invitations.status, "pending"), sql`lower(${invitations.email}) = lower(${user.email})`, sql`${invitations.expiresAt} <= now()`));

    const [membership] = await this.db
      .select({
        id: organizationMembers.id,
        organizationId: organizationMembers.organizationId,
        organizationName: organizations.name,
        role: organizationMembers.role,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.status, "active")))
      .limit(1);

    const [currentWorkspace] = progress.workspaceId
      ? await this.db
          .select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug })
          .from(workspaces)
          .where(eq(workspaces.id, progress.workspaceId))
          .limit(1)
      : [];

    const workspaceAccess = membership
      ? await this.db
          .select({ id: workspaceMembers.workspaceId })
          .from(workspaceMembers)
          .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
          .where(
            and(
              eq(workspaceMembers.organizationMemberId, membership.id),
              eq(workspaceMembers.status, "active"),
              eq(workspaces.organizationId, membership.organizationId),
              eq(workspaces.status, "active"),
            ),
          )
      : [];

    const invitationRows = await this.db
      .select({
        id: invitations.id,
        organizationId: invitations.organizationId,
        organizationName: organizations.name,
        workspaceId: invitations.workspaceId,
        workspaceName: workspaces.name,
        proposedTeamId: invitations.proposedTeamId,
        proposedTeamName: teams.name,
        proposedDepartment: invitations.proposedDepartment,
        role: invitations.role,
        status: invitations.status,
        expiresAt: invitations.expiresAt,
      })
      .from(invitations)
      .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
      .leftJoin(workspaces, eq(workspaces.id, invitations.workspaceId))
      .leftJoin(teams, eq(teams.id, invitations.proposedTeamId))
      .where(sql`lower(${invitations.email}) = lower(${user.email})`)
      .orderBy(desc(invitations.createdAt));
    const pendingInvitations = invitationRows.filter((invitation) => invitation.status === "pending");
    const journey = (progress.journey ?? (progress.organizationId && !progress.completed ? "COMPANY" : null)) as Journey | null;
    const employeeInProgress = journey === "EMPLOYEE" && !progress.completed;
    // A company is ready for normal login as soon as its owner has the first
    // active workspace. Older progress rows may still contain optional setup
    // steps, but they must not trap an established owner in onboarding.
    const companyInProgress = journey === "COMPANY" && !progress.completed && !(membership && workspaceAccess.length > 0);

    let accountState = "NO_ORGANIZATION";
    if (membership && !employeeInProgress && !companyInProgress) {
      accountState = workspaceAccess.length > 0 ? "ACTIVE_MEMBER" : "NO_WORKSPACE_ACCESS";
    }
    else if (employeeInProgress && membership) accountState = "INVITATION_ACCEPTED";
    else if (pendingInvitations.length > 1) accountState = "MULTIPLE_INVITATIONS";
    else if (pendingInvitations.length === 1) accountState = "PENDING_INVITATION";
    else if (invitationRows.some((invitation) => invitation.status === "expired")) accountState = "EXPIRED_INVITATION";

    return {
      user,
      emailVerified: user.emailVerified === true,
      progress,
      journey,
      accountState,
      hasMembership: Boolean(membership),
      hasWorkspaceAccess: workspaceAccess.length > 0,
      workspaceIds: workspaceAccess.map((workspace) => workspace.id),
      needsOnboarding: !membership || employeeInProgress || companyInProgress,
      organizationId: membership?.organizationId ?? progress.organizationId ?? null,
      workspaceId: progress.workspaceId,
      workspace: currentWorkspace ?? null,
      membership: membership ?? null,
      invitations: pendingInvitations,
      controlledValues: {
        departments: ["executive", "sales", "presales", "bid_management", "engineering", "product", "security", "legal", "finance", "operations", "other"],
        jobTitles: ["founder", "executive", "proposal_manager", "bid_manager", "solutions_architect", "sales_manager", "security_manager", "legal_counsel", "product_manager", "engineer", "analyst", "other"],
      },
    };
  }

  async start(userId: string, input: JourneyInput) {
    await this.requireVerifiedUser(userId);
    const state = await this.status(userId);
    if (state.hasMembership) throw new ConflictException("This account already has an active organization membership.");
    if (input.journey === "COMPANY") {
      if (state.invitations.length > 0) {
        throw new ConflictException("Resolve your pending organization invitation before creating a company.");
      }
      return this.updateProgress(userId, { journey: "COMPANY", currentState: "COMPANY", currentStep: 2 });
    }
    const invitation = state.invitations.find((item) => item.id === input.invitationId);
    if (!invitation) throw new BadRequestException("Choose a valid pending invitation.");
    return this.updateProgress(userId, { journey: "EMPLOYEE", invitationId: invitation.id, currentState: "INVITATION", currentStep: 1 });
  }

  async acceptInvitation(userId: string, invitationId: string) {
    await this.requireVerifiedUser(userId);
    const progress = await this.ensure(userId);
    if (progress.journey !== "EMPLOYEE" || progress.invitationId !== invitationId) {
      throw new ForbiddenException("Start employee onboarding with this invitation first.");
    }
    const accepted = await this.organizationsService.acceptDetectedInvitation(userId, invitationId);
    const [updated] = await this.db
      .update(onboardingProgress)
      .set({
        organizationId: accepted.organizationId,
        workspaceId: accepted.workspaceId ?? null,
        currentState: "PROFILE",
        currentStep: 3,
        updatedAt: new Date(),
      })
      .where(eq(onboardingProgress.userId, userId))
      .returning();
    await this.db.update(users).set({ accountType: accepted.role === "ADMIN" ? "COMPANY_ADMIN" : "EMPLOYEE", updatedAt: new Date() }).where(eq(users.id, userId));
    return updated;
  }

  async acceptInvitationToken(userId: string, token: string) {
    await this.requireVerifiedUser(userId);
    const state = await this.status(userId);
    const [invitation] = await this.db
      .select({ id: invitations.id, status: invitations.status, acceptedBy: invitations.acceptedBy })
      .from(invitations)
      .where(eq(invitations.token, token))
      .limit(1);
    const retryingOwnAcceptedInvitation = invitation?.status === "accepted" && invitation.acceptedBy === userId;
    if (state.hasMembership && !retryingOwnAcceptedInvitation) {
      throw new ConflictException("This account already has an active organization membership.");
    }

    const accepted = await this.organizationsService.acceptInvitation(userId, token);
    const [updated] = await this.db
      .update(onboardingProgress)
      .set({
        journey: "EMPLOYEE",
        invitationId: accepted.invitationId,
        organizationId: accepted.organizationId,
        workspaceId: accepted.workspaceId,
        currentState: "PROFILE",
        currentStep: 2,
        completed: false,
        completedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(onboardingProgress.userId, userId))
      .returning();
    await this.db
      .update(users)
      .set({ accountType: accepted.role === "ADMIN" ? "COMPANY_ADMIN" : "EMPLOYEE", updatedAt: new Date() })
      .where(eq(users.id, userId));
    return updated;
  }

  async saveCompany(userId: string, company: CompanyInput) {
    await this.requireJourney(userId, "COMPANY");
    return this.updateProgress(userId, { company, currentState: "WORKSPACE", currentStep: 3 });
  }

  async createWorkspace(userId: string, input: WorkspaceInput) {
    await this.requireVerifiedUser(userId);
    await this.requireJourney(userId, "COMPANY");
    return withTransaction(async (tx) => {
      const [progress] = await tx.select().from(onboardingProgress).where(eq(onboardingProgress.userId, userId)).for("update").limit(1);
      if (!progress) throw new NotFoundException("Onboarding state not found.");
      if (progress.organizationId && progress.workspaceId) {
        const [workspace] = await tx.select().from(workspaces).where(and(eq(workspaces.id, progress.workspaceId), eq(workspaces.organizationId, progress.organizationId))).limit(1);
        if (workspace) return { organizationId: progress.organizationId, workspace, progress };
      }
      const [existingMembership] = await tx.select({ id: organizationMembers.id }).from(organizationMembers).where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.status, "active"))).limit(1);
      if (existingMembership) throw new ConflictException("Employees and existing members cannot create an organization through onboarding.");
      if (!progress.company || typeof progress.company !== "object" || !("name" in progress.company)) throw new ConflictException("Complete company setup first.");
      const company = progress.company as CompanyInput;
      const domain = company.website ? new URL(company.website).hostname : `${slugify(company.name)}-${userId.slice(0, 8)}.local`;
      const [organization] = await tx.insert(organizations).values({
        name: company.name,
        legalName: company.legalName ?? "",
        slug: slugify(company.name),
        domain,
        industry: company.industry || null,
        country: company.country ?? "",
        operatingRegion: company.operatingRegion ?? "",
        profile: { companySize: company.companySize, description: company.description, coreProducts: company.coreProducts, certifications: company.certifications },
        logoInitials: company.name.slice(0, 2).toUpperCase(),
      }).returning();
      if (!organization) throw new ConflictException("Organization could not be created.");
      const [member] = await tx.insert(organizationMembers).values({ organizationId: organization.id, userId, role: "OWNER", status: "active" }).returning({ id: organizationMembers.id });
      const [workspace] = await tx.insert(workspaces).values({ organizationId: organization.id, name: input.name, slug: input.slug, description: input.purpose ?? "" }).returning();
      if (!member || !workspace) throw new ConflictException("Workspace could not be created.");
      await tx.insert(workspaceMembers).values({ workspaceId: workspace.id, organizationMemberId: member.id, status: "active" });
      await tx.update(users).set({ organizationId: organization.id, accountType: "COMPANY_OWNER", memberRole: "Admin", timezone: input.timezone, updatedAt: new Date() }).where(eq(users.id, userId));
      const [updated] = await tx.update(onboardingProgress).set({ organizationId: organization.id, workspaceId: workspace.id, currentState: "COMPLETE", currentStep: 4, completed: true, completedAt: new Date(), updatedAt: new Date() }).where(eq(onboardingProgress.id, progress.id)).returning();
      return { organization, workspace, progress: updated };
    });
  }

  async saveProfile(userId: string, profile: ProfileInput) {
    const progress = await this.ensure(userId);
    if (!progress.journey) throw new ConflictException("Choose an onboarding journey first.");
    if (progress.journey === "EMPLOYEE" && !progress.organizationId) throw new ConflictException("Accept the invitation before completing your profile.");
    await this.db.update(users).set({
      name: profile.name,
      preferredName: profile.preferredName,
      jobTitle: profile.jobTitle,
      department: profile.department,
      timezone: profile.timezone,
      phone: profile.phone,
      updatedAt: new Date(),
    }).where(eq(users.id, userId));
    if (progress.journey === "EMPLOYEE") {
      return this.updateProgress(userId, {
        profile,
        currentState: "COMPLETE",
        currentStep: 3,
        completed: true,
        completedAt: progress.completedAt ?? new Date(),
      });
    }
    return this.updateProgress(userId, { profile, currentState: "TEAM", currentStep: 5 });
  }

  async saveTeam(userId: string, input: TeamInput) {
    const progress = await this.ensure(userId);
    if (progress.journey === "EMPLOYEE") {
      throw new ForbiddenException("Employees cannot create teams or invite members during onboarding.");
    }
    await this.requireJourney(userId, "COMPANY");
    if (!progress.organizationId || !progress.workspaceId) throw new ConflictException("Create the company workspace first.");
    for (const name of input.teams) {
      const [existing] = await this.db.select({ id: teams.id }).from(teams).where(and(eq(teams.organizationId, progress.organizationId), eq(teams.workspaceId, progress.workspaceId), eq(teams.name, name), eq(teams.status, "active"))).limit(1);
      if (!existing) await this.db.insert(teams).values({ organizationId: progress.organizationId, workspaceId: progress.workspaceId, name });
    }
    for (const invite of input.invites) {
      const [pending] = await this.db.select({ id: invitations.id }).from(invitations).where(and(eq(invitations.organizationId, progress.organizationId), eq(invitations.email, invite.email), eq(invitations.status, "pending"))).limit(1);
      const values = { workspaceId: progress.workspaceId, role: invite.role, proposedDepartment: invite.proposedDepartment ?? null, proposedTeamId: invite.proposedTeamId ?? null, invitedBy: userId, expiresAt: new Date(Date.now() + 7 * 86_400_000), updatedAt: new Date() };
      if (pending) await this.db.update(invitations).set(values).where(eq(invitations.id, pending.id));
      else await this.db.insert(invitations).values({ organizationId: progress.organizationId, email: invite.email, token: randomBytes(32).toString("base64url"), ...values });
    }
    return this.updateProgress(userId, { team: input, currentState: "RFP_CONTEXT", currentStep: 6 });
  }

  async saveRfpContext(userId: string, rfpContext: RfpContextInput) {
    await this.requireJourney(userId, "COMPANY");
    return this.updateProgress(userId, { rfpContext, currentState: "REVIEW", currentStep: 7 });
  }

  async complete(userId: string) {
    const progress = await this.ensure(userId);
    if (!progress.journey) throw new ConflictException("Choose an onboarding journey first.");
    const [membership] = await this.db.select({ id: organizationMembers.id, role: organizationMembers.role }).from(organizationMembers).where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.status, "active"))).limit(1);
    if (!membership) throw new ConflictException("An active membership is required to complete onboarding.");
    if (progress.journey === "COMPANY" && progress.currentState !== "REVIEW" && !progress.completed) {
      throw new ConflictException("Review the company configuration before completing onboarding.");
    }
    if (progress.journey === "EMPLOYEE" && progress.currentState !== "ACCESS" && !progress.completed) {
      throw new ConflictException("Confirm employee access before completing onboarding.");
    }
    const [updated] = await this.db.update(onboardingProgress).set({ currentState: "COMPLETE", currentStep: progress.journey === "COMPANY" ? 8 : 7, completed: true, completedAt: progress.completedAt ?? new Date(), updatedAt: new Date() }).where(eq(onboardingProgress.id, progress.id)).returning();
    await this.db.update(users).set({ accountType: membership.role === "OWNER" ? "COMPANY_OWNER" : membership.role === "ADMIN" ? "COMPANY_ADMIN" : "EMPLOYEE", updatedAt: new Date() }).where(eq(users.id, userId));
    return updated;
  }

  private async requireJourney(userId: string, journey: Journey) {
    const progress = await this.ensure(userId);
    if (progress.journey !== journey) throw new ForbiddenException(`This action is only available during ${journey.toLowerCase()} onboarding.`);
    return progress;
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

  private async updateProgress(userId: string, patch: Partial<typeof onboardingProgress.$inferInsert>) {
    const [updated] = await this.db.update(onboardingProgress).set({ ...patch, updatedAt: new Date() }).where(eq(onboardingProgress.userId, userId)).returning();
    if (!updated) throw new NotFoundException("Onboarding state not found.");
    return updated;
  }
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "company";
}

function stateForLegacyCompanyStep(step: number) {
  if (step >= 7) return "REVIEW";
  if (step >= 6) return "RFP_CONTEXT";
  if (step >= 5) return "TEAM";
  return "PROFILE";
}
