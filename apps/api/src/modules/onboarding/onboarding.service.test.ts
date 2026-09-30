import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import {
  getDb,
  invitations,
  onboardingProgress,
  organizationMembers,
  organizations,
  users,
  workspaceMembers,
  workspaces,
} from "@rfp-os/db";
import { and, eq } from "drizzle-orm";

import { OnboardingService } from "./onboarding.service";
import { OrganizationsService } from "../organizations/organizations.service";

const shouldRunDbTests = Boolean(process.env.DATABASE_URL && !process.env.TENDYY_ROOT_BUN_TEST);
const dbTest = shouldRunDbTests ? test : test.skip;
// Database scenarios are skipped locally unless a disposable DATABASE_URL is supplied.
const db = shouldRunDbTests ? getDb() : (undefined as never);
const recorder = { record: async () => undefined };
const sentInvitations: Array<{ to: string; url: string }> = [];
const mailer = {
  sendInvitation: async (input: { to: string; url: string }) => {
    sentInvitations.push({ to: input.to, url: input.url });
  },
};
const organizationsService = new OrganizationsService(
  db,
  { get: (key: string) => (key === "WEB_APP_URL" ? "http://localhost:3000" : 72) } as never,
  recorder as never,
  recorder as never,
  mailer as never,
);
const service = new OnboardingService(db, organizationsService, recorder as never);
const suffix = randomUUID().slice(0, 8);
const email = `onboarding-${suffix}@example.invalid`;
let userId = "";
let organizationId = "";
let secondOwnerId = "";

describe("OnboardingService database flow", () => {
  dbTest("persists and completes one idempotent owner onboarding", async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Onboarding Owner", email, emailVerified: true })
      .returning({ id: users.id });
    userId = user!.id;

    const initial = await service.status(userId);
    expect(initial.needsOnboarding).toBe(true);
    expect(initial.hasMembership).toBe(false);
    expect(initial.progress.currentStep).toBe(1);

    await service.start(userId, { journey: "COMPANY" });

    const company = await service.saveCompany(userId, {
      name: `Tendyy Verification ${suffix}`,
      website: "https://example.invalid",
      industry: "Technology",
      coreProducts: [],
      certifications: [],
    });
    expect(company?.currentStep).toBe(3);

    const firstWorkspace = await service.createWorkspace(userId, {
      name: "Proposal Workspace",
      slug: `proposal-${suffix}`,
      timezone: "Asia/Kolkata",
      currency: "INR",
    });
    organizationId = "organization" in firstWorkspace && firstWorkspace.organization
      ? firstWorkspace.organization.id
      : firstWorkspace.organizationId;
    const repeatedWorkspace = await service.createWorkspace(userId, {
      name: "Proposal Workspace",
      slug: `proposal-${suffix}`,
      timezone: "Asia/Kolkata",
      currency: "INR",
    });
    expect(repeatedWorkspace.workspace.id).toBe(firstWorkspace.workspace.id);

    const inProgress = await service.status(userId);
    expect(inProgress.hasMembership).toBe(true);
    expect(inProgress.needsOnboarding).toBe(false);
    expect(inProgress.progress.completed).toBe(true);

    await service.saveProfile(userId, {
      name: "Onboarding Owner",
      preferredName: "Owner",
      jobTitle: "proposal_manager",
      department: "bid_management",
      timezone: "Asia/Kolkata",
      phone: "",
    });
    await service.saveTeam(userId, {
      teams: ["Bid Management"],
      invites: [{ email: `employee-${suffix}@example.invalid`, role: "VIEWER" }],
    });
    const employeeEmail = `employee-${suffix}@example.invalid`;
    expect(sentInvitations.filter((mail) => mail.to === employeeEmail)).toHaveLength(1);
    expect(sentInvitations[0]!.url).toStartWith("http://localhost:3000/join#token=");

    // Re-submitting the step must not re-send an unchanged invitation.
    await service.saveTeam(userId, {
      teams: ["Bid Management"],
      invites: [{ email: employeeEmail, role: "VIEWER" }],
    });
    expect(sentInvitations.filter((mail) => mail.to === employeeEmail)).toHaveLength(1);

    await service.saveRfpContext(userId, { typicalRfpTypes: ["Security"], mainIndustries: [], commonCategories: ["Legal"] });
    await service.complete(userId);

    const complete = await service.status(userId);
    expect(complete.progress.completed).toBe(true);
    expect(complete.progress.completedAt).not.toBeNull();
    expect(complete.needsOnboarding).toBe(false);

    const [membership] = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.role, "OWNER")));
    expect(membership?.organizationId).toBe(organizationId);

    const [invitation] = await db
      .select()
      .from(invitations)
      .where(eq(invitations.organizationId, organizationId));
    expect(invitation?.workspaceId).toBe(firstWorkspace.workspace.id);
    expect(invitation?.invitedBy).toBe(userId);
    expect(invitation?.status).toBe("pending");

    const organizationRows = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, organizationId));
    const workspaceRows = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.organizationId, organizationId));
    expect(organizationRows).toHaveLength(1);
    expect(workspaceRows).toHaveLength(1);
  });

  dbTest("an owner has workspace access without an explicit workspace membership", async () => {
    // Relies on the owner and organization created by the first test.
    const [ownerMembership] = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)));
    await db.delete(workspaceMembers).where(eq(workspaceMembers.organizationMemberId, ownerMembership!.id));

    const state = await service.status(userId);
    expect(state.hasWorkspaceAccess).toBe(true);
    expect(state.lifecycleState).toBe("ACTIVE_MEMBER");
  });

  dbTest("refuses team setup and invitations once the founder is no longer an admin", async () => {
    // Relies on the owner, organization and workspace created by the test above.
    expect(organizationId).not.toBe("");
    const secondOwnerEmail = `second-owner-${suffix}@example.invalid`;
    const [secondOwner] = await db
      .insert(users)
      .values({ name: "Second Owner", email: secondOwnerEmail, emailVerified: true })
      .returning({ id: users.id });
    secondOwnerId = secondOwner!.id;
    await db.insert(organizationMembers).values({ organizationId, userId: secondOwnerId, role: "OWNER", status: "active" });

    for (const [role, status] of [["VIEWER", "active"], ["OWNER", "suspended"], ["OWNER", "removed"]] as const) {
      await db
        .update(organizationMembers)
        .set({ role, status })
        .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)));

      const error = await service
        .saveTeam(userId, {
          teams: [`Shadow Team ${role}-${status}`],
          invites: [{ email: `shadow-admin-${suffix}@example.invalid`, role: "ADMIN" }],
        })
        .then(() => null, (rejection: unknown) => rejection);
      expect((error as { response?: { code?: string } } | null)?.response?.code).toBe("ORG_ADMIN_REQUIRED");
    }

    const shadowInvites = await db
      .select({ id: invitations.id })
      .from(invitations)
      .where(and(eq(invitations.organizationId, organizationId), eq(invitations.email, `shadow-admin-${suffix}@example.invalid`)));
    expect(shadowInvites).toHaveLength(0);
  });
});

afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  if (userId) await db.delete(onboardingProgress).where(eq(onboardingProgress.userId, userId));
  if (organizationId) await db.delete(organizations).where(eq(organizations.id, organizationId));
  if (userId) await db.delete(users).where(eq(users.id, userId));
  if (secondOwnerId) await db.delete(users).where(eq(users.id, secondOwnerId));
});
