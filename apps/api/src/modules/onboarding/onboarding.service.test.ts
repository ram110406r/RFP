import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import {
  getDb,
  invitations,
  onboardingProgress,
  organizationMembers,
  organizations,
  users,
  workspaces,
} from "@rfp-os/db";
import { and, eq } from "drizzle-orm";

import { OnboardingService } from "./onboarding.service";
import type { OrganizationsService } from "../organizations/organizations.service";

const dbTest = process.env.DATABASE_URL ? test : test.skip;
// Database scenarios are skipped locally unless a disposable DATABASE_URL is supplied.
const db = process.env.DATABASE_URL ? getDb() : (undefined as never);
const service = new OnboardingService(db, {} as OrganizationsService);
const suffix = randomUUID().slice(0, 8);
const email = `onboarding-${suffix}@example.invalid`;
let userId = "";
let organizationId = "";

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
});

afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  if (userId) await db.delete(onboardingProgress).where(eq(onboardingProgress.userId, userId));
  if (organizationId) await db.delete(organizations).where(eq(organizations.id, organizationId));
  if (userId) await db.delete(users).where(eq(users.id, userId));
});
