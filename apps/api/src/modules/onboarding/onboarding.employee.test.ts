import { afterAll, describe, expect, test } from "bun:test";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
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

import { OrganizationsService } from "../organizations/organizations.service";
import { OnboardingService } from "./onboarding.service";
import { hashInvitationToken } from "../organizations/invitation-token";

const shouldRunDbTests = Boolean(process.env.DATABASE_URL && !process.env.TENDYY_ROOT_BUN_TEST);
const dbTest = shouldRunDbTests ? test : test.skip;
// Database scenarios are skipped locally unless a disposable DATABASE_URL is supplied.
const db = shouldRunDbTests ? getDb() : (undefined as never);
const suffix = randomUUID().slice(0, 8);
const employeeEmail = `employee-v2-${suffix}@example.invalid`;
const attackerEmail = `attacker-v2-${suffix}@example.invalid`;
let organizationId = "";
let ownerId = "";
let employeeId = "";
let attackerId = "";

const recorder = { record: async () => undefined };
const mailer = { sendInvitation: async () => undefined };
const organizationsService = new OrganizationsService(
  db,
  { get: (key: string) => (key === "WEB_APP_URL" ? "http://localhost:3000" : 168) } as never,
  recorder as never,
  recorder as never,
  mailer as never,
);
const service = new OnboardingService(db, organizationsService, recorder as never);

describe("OnboardingService employee journey", () => {
  dbTest("joins an invited employee without creating tenancy and rejects another identity", async () => {
    const [owner, employee, attacker] = await db.insert(users).values([
      { name: "Owner", email: `owner-v2-${suffix}@example.invalid`, emailVerified: true },
      { name: "Invited Employee", email: employeeEmail, emailVerified: true },
      { name: "Wrong Employee", email: attackerEmail, emailVerified: true },
    ]).returning({ id: users.id });
    employeeId = employee!.id;
    attackerId = attacker!.id;
    ownerId = owner!.id;

    const [organization] = await db.insert(organizations).values({ name: `Employee Test ${suffix}`, domain: `employee-${suffix}.invalid` }).returning();
    organizationId = organization!.id;
    const [ownerMembership] = await db.insert(organizationMembers).values({ organizationId, userId: owner!.id, role: "OWNER", status: "active" }).returning({ id: organizationMembers.id });
    const [workspace] = await db.insert(workspaces).values({ organizationId, name: "Existing Workspace", slug: `existing-${suffix}` }).returning();
    await db.insert(workspaceMembers).values({ workspaceId: workspace!.id, organizationMemberId: ownerMembership!.id });

    const invitationToken = randomBytes(32).toString("base64url");
    const mismatchToken = randomBytes(32).toString("base64url");
    await db.insert(invitations).values({
      organizationId,
      workspaceId: workspace!.id,
      email: employeeEmail,
      role: "REVIEWER",
      proposedDepartment: "security",
      tokenHash: hashInvitationToken(invitationToken),
      invitedBy: owner!.id,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await db.insert(invitations).values({
      organizationId,
      workspaceId: workspace!.id,
      email: employeeEmail,
      role: "VIEWER",
      tokenHash: hashInvitationToken(mismatchToken),
      invitedBy: owner!.id,
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    let mismatchCode = "";
    try {
      await organizationsService.acceptInvitation(attackerId, mismatchToken);
    } catch (error) {
      mismatchCode = (error as { response?: { code?: string } }).response?.code ?? "";
    }
    expect(mismatchCode).toBe("INVITATION_EMAIL_MISMATCH");

    const organizationsBefore = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId));
    const workspacesBefore = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.organizationId, organizationId));
    const initial = await service.status(employeeId);
    expect(initial.accountState).toBe("MULTIPLE_INVITATIONS");
    expect(initial.hasMembership).toBe(false);

    let companyStartBlocked = false;
    try {
      await service.start(employeeId, { journey: "COMPANY" });
    } catch {
      companyStartBlocked = true;
    }
    expect(companyStartBlocked).toBe(true);

    const accepted = await service.acceptInvitationToken(employeeId, invitationToken);
    expect(accepted?.organizationId).toBe(organizationId);
    await service.acceptInvitationToken(employeeId, invitationToken);

    let companyWriteBlocked = false;
    try {
      await service.saveCompany(employeeId, { name: "Forbidden Company", coreProducts: [], certifications: [] });
    } catch {
      companyWriteBlocked = true;
    }
    expect(companyWriteBlocked).toBe(true);

    await service.saveProfile(employeeId, {
      name: "Invited Employee",
      preferredName: "Employee",
      department: "security",
      jobTitle: "security_manager",
      timezone: "Asia/Kolkata",
      phone: "",
    });
    let teamCreationBlocked = false;
    try {
      await service.saveTeam(employeeId, { teams: ["Unauthorized team"], invites: [] });
    } catch {
      teamCreationBlocked = true;
    }
    expect(teamCreationBlocked).toBe(true);
    const completed = await service.status(employeeId);
    expect(completed.needsOnboarding).toBe(false);

    const retryAfterCompletion = await service.acceptInvitationToken(employeeId, invitationToken);
    expect(retryAfterCompletion?.completed).toBe(true);
    expect((await service.status(employeeId)).needsOnboarding).toBe(false);

    const [membership] = await db.select().from(organizationMembers).where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, employeeId)));
    const [workspaceMembership] = await db.select().from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, workspace!.id), eq(workspaceMembers.organizationMemberId, membership!.id)));
    const [persistedUser] = await db.select({ accountType: users.accountType, department: users.department, jobTitle: users.jobTitle, timezone: users.timezone }).from(users).where(eq(users.id, employeeId));
    const organizationsAfter = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId));
    const workspacesAfter = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.organizationId, organizationId));

    expect(membership?.role).toBe("REVIEWER");
    expect(membership?.role).not.toBe("OWNER");
    expect(workspaceMembership?.status).toBe("active");
    expect(persistedUser).toEqual({ accountType: "EMPLOYEE", department: "security", jobTitle: "security_manager", timezone: "Asia/Kolkata" });
    expect(organizationsAfter).toHaveLength(organizationsBefore.length);
    expect(workspacesAfter).toHaveLength(workspacesBefore.length);
  }, 60_000);
});

afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  const userIds = [ownerId, employeeId, attackerId].filter(Boolean);
  if (userIds.length) await db.delete(onboardingProgress).where(inArray(onboardingProgress.userId, userIds));
  if (organizationId) await db.delete(organizations).where(eq(organizations.id, organizationId));
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
});
