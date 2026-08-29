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

const dbTest = process.env.DATABASE_URL ? test : test.skip;
const db = getDb();
const suffix = randomUUID().slice(0, 8);
const employeeEmail = `employee-v2-${suffix}@example.invalid`;
const attackerEmail = `attacker-v2-${suffix}@example.invalid`;
let organizationId = "";
let ownerId = "";
let employeeId = "";
let attackerId = "";

const recorder = { record: async () => undefined };
const organizationsService = new OrganizationsService(db, { get: () => 168 } as never, recorder as never, recorder as never);
const service = new OnboardingService(db, organizationsService);

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

    const [invitation] = await db.insert(invitations).values({
      organizationId,
      workspaceId: workspace!.id,
      email: employeeEmail,
      role: "REVIEWER",
      proposedDepartment: "security",
      token: randomBytes(32).toString("base64url"),
      invitedBy: owner!.id,
      expiresAt: new Date(Date.now() + 86_400_000),
    }).returning();
    const [mismatchInvitation] = await db.insert(invitations).values({
      organizationId,
      workspaceId: workspace!.id,
      email: employeeEmail,
      role: "VIEWER",
      token: randomBytes(32).toString("base64url"),
      invitedBy: owner!.id,
      expiresAt: new Date(Date.now() + 86_400_000),
    }).returning();

    let mismatchCode = "";
    try {
      await organizationsService.acceptInvitation(attackerId, mismatchInvitation!.token);
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

    await service.start(employeeId, { journey: "EMPLOYEE", invitationId: invitation!.id });
    const accepted = await service.acceptInvitation(employeeId, invitation!.id);
    expect(accepted?.organizationId).toBe(organizationId);
    await service.acceptInvitation(employeeId, invitation!.id);

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
    await service.saveTeam(employeeId, { teams: [], invites: [] });
    await service.complete(employeeId);

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
  const userIds = [ownerId, employeeId, attackerId].filter(Boolean);
  if (userIds.length) await db.delete(onboardingProgress).where(inArray(onboardingProgress.userId, userIds));
  if (organizationId) await db.delete(organizations).where(eq(organizations.id, organizationId));
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
});
