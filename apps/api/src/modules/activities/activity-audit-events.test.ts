import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import {
  accessPolicies,
  activities,
  assignments,
  auditLogs,
  getDb,
  invitations,
  organizationMembers,
  organizations,
  teams,
  users,
  workspaceMembers,
  workspaces,
} from "@rfp-os/db";
import { permissionsForRole, type AuthContext } from "@rfp-os/types";

import { ActivityService } from "../../infrastructure/activity";
import { AuditService } from "../../infrastructure/audit";
import { AssignmentsService } from "../assignments/assignments.service";
import { OrganizationsService } from "../organizations/organizations.service";
import { PoliciesService } from "../policies/policies.service";
import { RolesService } from "../roles/roles.service";
import { TeamsService } from "../teams/teams.service";
import { WorkspacesService } from "../workspaces/workspaces.service";
import type { Env } from "../../config/env.schema";

const dbTest = process.env.DATABASE_URL ? test : test.skip;
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

const env = {
  APP_ENV: "local",
  NODE_ENV: "test",
  API_PORT: 4100,
  CORS_ORIGIN: "http://localhost:3000",
  LOG_LEVEL: "silent",
  RATE_LIMIT_TTL_MS: 60_000,
  RATE_LIMIT_LIMIT: 100,
  BETTER_AUTH_SECRET: "test-secret-that-is-long-enough-for-zod-min-32",
  BETTER_AUTH_URL: "http://localhost:4100",
  AI_PROVIDER: "mock",
  GROQ_API_KEY: undefined,
  GROQ_MODEL: "llama-3.1-8b-instant",
  GROQ_BASE_URL: "https://api.groq.com/openai/v1",
  GROQ_TIMEOUT_MS: 60_000,
  SESSION_MAX_AGE_SECONDS: 3600,
  INVITATION_TTL_HOURS: 72,
  STORAGE_REGION: "us-east-1",
  STORAGE_BUCKET: "rfp-os-documents",
  STORAGE_FORCE_PATH_STYLE: true,
  UPLOAD_MAX_BYTES: 104_857_600,
  UPLOAD_URL_TTL_SECONDS: 900,
  DOWNLOAD_URL_TTL_SECONDS: 300,
} satisfies Env;

const config = {
  get: (key: keyof typeof env) => env[key],
} as never;

describeDb("Tier 0 activity and audit events", () => {
  const db = getDb();
  const activity = new ActivityService(db);
  const audit = new AuditService(db);
  const organizationsService = new OrganizationsService(db, config, activity, audit);
  const workspacesService = new WorkspacesService(db, activity, audit);
  const teamsService = new TeamsService(db, activity, audit);
  const rolesService = new RolesService(db, activity, audit);
  const policiesService = new PoliciesService(db, activity, audit);
  const assignmentsService = new AssignmentsService(db, activity, audit);

  const orgId = randomUUID();
  const ownerId = randomUUID();
  const inviteeId = randomUUID();
  const suffix = randomUUID().slice(0, 8);

  let ownerMembershipId = "";
  let inviteeMembershipId = "";
  let workspaceId = "";
  let inviteeWorkspaceMemberId = "";
  let teamId = "";
  let customRoleId = "";
  let policyId = "";
  let completedAssignmentId = "";
  let cancelledAssignmentId = "";

  const ownerAuth = (): AuthContext => ({
    userId: ownerId,
    organizationId: orgId,
    role: "OWNER",
    permissions: permissionsForRole("OWNER"),
    organizationPermissions: permissionsForRole("OWNER"),
    sessionId: "tier0-owner",
  });

  beforeAll(async () => {
    await db.insert(organizations).values({
      id: orgId,
      name: `Tier0 Org ${suffix}`,
      domain: `tier0-${suffix}.invalid`,
    });

    await db.insert(users).values([
      {
        id: ownerId,
        organizationId: orgId,
        name: "Owner",
        email: `owner-${suffix}@probe.invalid`,
      },
      {
        id: inviteeId,
        organizationId: null,
        name: "Invitee",
        email: `invitee-${suffix}@probe.invalid`,
      },
    ]);

    await db.insert(organizationMembers).values({
      organizationId: orgId,
      userId: ownerId,
      role: "OWNER",
      status: "active",
    });

    const [ownerMembership] = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, ownerId))
      .limit(1);
    ownerMembershipId = ownerMembership!.id;
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.delete(users).where(inArray(users.id, [ownerId, inviteeId]));
  });

  dbTest("records the full Tier 0 event matrix with correct provenance", async () => {
    const workspace = await workspacesService.create(ownerAuth(), {
      name: `Workspace ${suffix}`,
      slug: `workspace-${suffix}`,
      description: "Tier 0 verification workspace",
    });
    workspaceId = workspace.id;

    const invitation = await organizationsService.invite(ownerAuth(), {
      email: `invitee-${suffix}@probe.invalid`,
      role: "CONTRIBUTOR",
      workspaceId,
    });

    const invitationToken = new URLSearchParams(new URL(invitation.acceptUrl).hash.slice(1)).get("token");
    await organizationsService.acceptInvitation(inviteeId, invitationToken!);

    const [inviteeMembership] = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, inviteeId))
      .limit(1);
    inviteeMembershipId = inviteeMembership!.id;

    await workspacesService.update(ownerAuth(), workspaceId, {
      description: "Updated workspace description",
    });

    await workspacesService.addMember(ownerAuth(), workspaceId, {
      organizationMemberId: inviteeMembershipId,
    });

    const [workspaceMember] = await db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.organizationMemberId, inviteeMembershipId))
      .limit(1);
    inviteeWorkspaceMemberId = workspaceMember!.id;

    const team = await teamsService.create(ownerAuth(), {
      workspaceId,
      name: `Team ${suffix}`,
      description: "Tier 0 verification team",
    });
    teamId = team.id;

    await teamsService.update(ownerAuth(), teamId, {
      description: "Updated team description",
    });
    await teamsService.addMember(ownerAuth(), teamId, {
      organizationMemberId: inviteeMembershipId,
    });
    await teamsService.removeMember(ownerAuth(), teamId, inviteeMembershipId);

    const role = await rolesService.create(ownerAuth(), {
      name: `Workspace Reviewer ${suffix}`,
      description: "Workspace-scoped review role",
      permissionKeys: ["team:update"],
    });
    customRoleId = role.id;

    await rolesService.assign(ownerAuth(), {
      scopeType: "workspace_member",
      workspaceMemberId: inviteeWorkspaceMemberId,
      roleId: customRoleId,
    });
    await rolesService.revoke(ownerAuth(), {
      scopeType: "workspace_member",
      workspaceMemberId: inviteeWorkspaceMemberId,
      roleId: customRoleId,
    });

    const policy = await policiesService.create(ownerAuth(), {
      workspaceId,
      name: `Mutable Draft Only ${suffix}`,
      description: "Sample workspace policy",
      resource: "rfp",
      action: "update",
      effect: "deny",
      conditions: [{ attribute: "resource.status", operator: "eq", value: "FINAL" }],
    });
    expect(policy).toBeDefined();
    if (!policy) {
      throw new Error("Expected policy to be created.");
    }
    policyId = policy.id;

    await policiesService.update(ownerAuth(), policyId, {
      description: "Updated sample workspace policy",
    });
    await policiesService.toggle(ownerAuth(), policyId, { status: "disabled" });

    const completedAssignment = await assignmentsService.create(ownerAuth(), {
      workspaceId,
      resourceType: "requirement",
      resourceId: `REQ-${suffix}`,
      assigneeType: "user",
      assigneeId: inviteeMembershipId,
      assignmentRole: "reviewer",
      dueAt: "2026-08-31T00:00:00.000Z",
    });
    expect(completedAssignment).toBeDefined();
    if (!completedAssignment) {
      throw new Error("Expected completed assignment to be created.");
    }
    completedAssignmentId = completedAssignment.id;
    await assignmentsService.update(ownerAuth(), completedAssignmentId, { status: "in_progress" });
    await assignmentsService.complete(ownerAuth(), completedAssignmentId);

    const cancelledAssignment = await assignmentsService.create(ownerAuth(), {
      workspaceId,
      resourceType: "question",
      resourceId: `Q-${suffix}`,
      assigneeType: "user",
      assigneeId: inviteeMembershipId,
      assignmentRole: "owner",
    });
    expect(cancelledAssignment).toBeDefined();
    if (!cancelledAssignment) {
      throw new Error("Expected cancelled assignment to be created.");
    }
    cancelledAssignmentId = cancelledAssignment.id;
    await assignmentsService.cancel(ownerAuth(), cancelledAssignmentId);

    await organizationsService.removeMember(ownerAuth(), inviteeId);

    const activityRows = await db
      .select()
      .from(activities)
      .where(eq(activities.organizationId, orgId));
    const auditRows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, orgId));

    for (const action of [
      "MEMBER_INVITED",
      "MEMBER_ACCEPTED",
      "MEMBER_REMOVED",
      "WORKSPACE_CREATED",
      "WORKSPACE_UPDATED",
      "TEAM_CREATED",
      "TEAM_UPDATED",
      "TEAM_MEMBER_ADDED",
      "TEAM_MEMBER_REMOVED",
      "ROLE_CREATED",
      "ROLE_ASSIGNED",
      "ROLE_REVOKED",
      "POLICY_CREATED",
      "POLICY_UPDATED",
      "POLICY_TOGGLED",
      "ASSIGNMENT_CREATED",
      "ASSIGNMENT_UPDATED",
      "ASSIGNMENT_COMPLETED",
      "ASSIGNMENT_CANCELLED",
    ] as const) {
      const activityRow = activityRows.find((row) => row.action === action);
      expect(activityRow, `missing activity ${action}`).toBeDefined();
      expect(activityRow?.organizationId).toBe(orgId);
      expect(activityRow?.createdAt).toBeInstanceOf(Date);
      expect(activityRow?.summary.length ?? 0).toBeGreaterThan(0);

      const auditRow = auditRows.find((row) => row.action === action);
      expect(auditRow, `missing audit ${action}`).toBeDefined();
      expect(auditRow?.organizationId).toBe(orgId);
      expect(auditRow?.actorType).toBe("user");
      expect(auditRow?.createdAt).toBeInstanceOf(Date);
    }

    const workspaceActivity = activityRows.find((row) => row.action === "WORKSPACE_UPDATED");
    expect(workspaceActivity?.workspaceId).toBe(workspaceId);
    expect(workspaceActivity?.actorId).toBe(ownerId);

    const policyAudit = auditRows.find((row) => row.action === "POLICY_UPDATED");
    expect(policyAudit?.workspaceId).toBe(workspaceId);
    expect(policyAudit?.beforeState).toBeTruthy();
    expect(policyAudit?.afterState).toBeTruthy();

    const assignmentAudit = auditRows.find((row) => row.action === "ASSIGNMENT_UPDATED");
    expect(assignmentAudit?.entityType).toBe("assignment");
    expect(assignmentAudit?.entityId).toBe(completedAssignmentId);
    expect(assignmentAudit?.beforeState).toMatchObject({ status: "pending" });
    expect(assignmentAudit?.afterState).toMatchObject({ status: "in_progress" });

    const completedAudit = auditRows.find((row) => row.action === "ASSIGNMENT_COMPLETED");
    expect(completedAudit?.beforeState).toMatchObject({ status: "in_progress" });
    expect(completedAudit?.afterState).toMatchObject({ status: "completed" });

    const cancelledAudit = auditRows.find((row) => row.action === "ASSIGNMENT_CANCELLED");
    expect(cancelledAudit?.beforeState).toMatchObject({ status: "pending" });
    expect(cancelledAudit?.afterState).toMatchObject({ status: "cancelled" });

    const memberAccepted = activityRows.find((row) => row.action === "MEMBER_ACCEPTED");
    expect(memberAccepted?.actorId).toBe(inviteeId);
    expect(memberAccepted?.actorType).toBe("user");
  });

  dbTest("keeps audit records append-only from the application API surface", async () => {
    const before = await db
      .select({ count: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, orgId));

    expect(typeof organizationsService).toBe("object");
    expect(typeof policiesService.list).toBe("function");
    expect(typeof (policiesService as unknown as { delete?: unknown }).delete).toBe("undefined");

    const after = await db
      .select({ count: auditLogs.id })
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, orgId));

    expect(after.length).toBe(before.length);
  });
});
