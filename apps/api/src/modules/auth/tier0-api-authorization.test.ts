import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { RequestMethod, VersioningType } from "@nestjs/common";
import { eq, inArray } from "drizzle-orm";
import {
  activities,
  assignments,
  auditLogs,
  getDb,
  organizationMembers,
  organizations,
  roles,
  teams,
  users,
  workspaceMembers,
  workspaces,
} from "@rfp-os/db";
import { permissionsForRole, type AuthContext } from "@rfp-os/types";

import { ActivityService } from "../../infrastructure/activity";
import { AuditService } from "../../infrastructure/audit";
import { AssignmentsService } from "../assignments/assignments.service";
import { AuthService, type ResolvedSession } from "./auth.service";
import { PoliciesService } from "../policies/policies.service";

const shouldRunDbTests = Boolean(process.env.DATABASE_URL && !process.env.TENDYY_ROOT_BUN_TEST);
const dbTest = shouldRunDbTests ? test : test.skip;
const describeDb = shouldRunDbTests ? describe : describe.skip;

const env = {
  NODE_ENV: "test",
  API_PORT: 4100,
  CORS_ORIGIN: "http://localhost:3000",
  LOG_LEVEL: "silent",
  RATE_LIMIT_TTL_MS: 60_000,
  RATE_LIMIT_LIMIT: 100,
  BETTER_AUTH_SECRET: "test-secret-that-is-long-enough-for-zod-min-32",
  BETTER_AUTH_URL: "http://localhost:4100",
  SESSION_MAX_AGE_SECONDS: 3600,
  INVITATION_TTL_HOURS: 72,
  STORAGE_REGION: "us-east-1",
  STORAGE_BUCKET: "rfp-os-documents",
  STORAGE_FORCE_PATH_STYLE: true,
  UPLOAD_MAX_BYTES: 104_857_600,
  UPLOAD_URL_TTL_SECONDS: 900,
  DOWNLOAD_URL_TTL_SECONDS: 300,
} as const;

const config = {
  get: (key: keyof typeof env) => env[key],
} as never;

describeDb("Tier 0 HTTP authorization path", () => {
  const db = shouldRunDbTests ? getDb() : (undefined as never);
  const activity = new ActivityService(db);
  const audit = new AuditService(db);
  const policiesService = new PoliciesService(db, activity, audit);
  const assignmentsService = new AssignmentsService(db, activity, audit);
  const realAuthService = new AuthService(db, config);

  const orgA = randomUUID();
  const orgB = randomUUID();
  const ownerA = randomUUID();
  const ownerB = randomUUID();
  const scopedUserA = randomUUID();
  const suffix = randomUUID().slice(0, 8);

  let ownerAMembershipId = "";
  let ownerBMembershipId = "";
  let scopedMembershipId = "";
  let scopedWorkspaceMemberId = "";
  let workspaceA1 = "";
  let workspaceA2 = "";
  let workspaceB1 = "";
  let teamA1 = "";
  let teamA2 = "";
  let teamB1 = "";
  let roleAId = "";
  let roleBId = "";
  let policyAId = "";
  let policyBId = "";
  let assignmentAId = "";
  let assignmentBId = "";
  let baseUrl = "";
  let app: any;

  const ownerAuth = (userId: string, organizationId: string): AuthContext => ({
    userId,
    organizationId,
    role: "OWNER",
    permissions: permissionsForRole("OWNER"),
    organizationPermissions: permissionsForRole("OWNER"),
    sessionId: `${organizationId}-${userId}`,
  });

  beforeAll(async () => {
    const { AppModule } = await import("../../app.module");

    await db.insert(organizations).values([
      { id: orgA, name: `HTTP Org A ${suffix}`, domain: `http-a-${suffix}.invalid` },
      { id: orgB, name: `HTTP Org B ${suffix}`, domain: `http-b-${suffix}.invalid` },
    ]);

    await db.insert(users).values([
      { id: ownerA, organizationId: orgA, name: "Owner A", email: `owner-a-${suffix}@probe.invalid` },
      { id: ownerB, organizationId: orgB, name: "Owner B", email: `owner-b-${suffix}@probe.invalid` },
      { id: scopedUserA, organizationId: orgA, name: "Scoped A", email: `scoped-a-${suffix}@probe.invalid` },
    ]);

    await db.insert(organizationMembers).values([
      { organizationId: orgA, userId: ownerA, role: "OWNER", status: "active" },
      { organizationId: orgB, userId: ownerB, role: "OWNER", status: "active" },
      { organizationId: orgA, userId: scopedUserA, role: "CONTRIBUTOR", status: "active" },
    ]);

    const memberships = await db
      .select({
        id: organizationMembers.id,
        organizationId: organizationMembers.organizationId,
        userId: organizationMembers.userId,
      })
      .from(organizationMembers)
      .where(inArray(organizationMembers.organizationId, [orgA, orgB]));

    ownerAMembershipId = memberships.find((row) => row.organizationId === orgA && row.userId === ownerA)!.id;
    ownerBMembershipId = memberships.find((row) => row.organizationId === orgB && row.userId === ownerB)!.id;
    scopedMembershipId = memberships.find((row) => row.organizationId === orgA && row.userId === scopedUserA)!.id;

    const [a1, a2, b1] = await Promise.all([
      db.insert(workspaces).values({
        id: randomUUID(),
        organizationId: orgA,
        name: `A1 ${suffix}`,
        slug: `a1-${suffix}`,
      }).returning(),
      db.insert(workspaces).values({
        id: randomUUID(),
        organizationId: orgA,
        name: `A2 ${suffix}`,
        slug: `a2-${suffix}`,
      }).returning(),
      db.insert(workspaces).values({
        id: randomUUID(),
        organizationId: orgB,
        name: `B1 ${suffix}`,
        slug: `b1-${suffix}`,
      }).returning(),
    ]);

    workspaceA1 = a1[0]!.id;
    workspaceA2 = a2[0]!.id;
    workspaceB1 = b1[0]!.id;

    await db.insert(workspaceMembers).values({
      id: randomUUID(),
      workspaceId: workspaceA1,
      organizationMemberId: scopedMembershipId,
      status: "active",
    });

    const [scopedWorkspaceMember] = await db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.organizationMemberId, scopedMembershipId))
      .limit(1);
    scopedWorkspaceMemberId = scopedWorkspaceMember!.id;

    const [teamA1Row] = await db.insert(teams).values({
      id: randomUUID(),
      organizationId: orgA,
      workspaceId: workspaceA1,
      name: `Team A1 ${suffix}`,
      description: "HTTP team A1",
    }).returning();
    const [teamA2Row] = await db.insert(teams).values({
      id: randomUUID(),
      organizationId: orgA,
      workspaceId: workspaceA2,
      name: `Team A2 ${suffix}`,
      description: "HTTP team A2",
    }).returning();
    const [teamB1Row] = await db.insert(teams).values({
      id: randomUUID(),
      organizationId: orgB,
      workspaceId: workspaceB1,
      name: `Team B1 ${suffix}`,
      description: "HTTP team B1",
    }).returning();
    teamA1 = teamA1Row!.id;
    teamA2 = teamA2Row!.id;
    teamB1 = teamB1Row!.id;

    // Historical custom-role rows: they can no longer be created through the API.
    const [roleA, roleB] = await db
      .insert(roles)
      .values([
        { organizationId: orgA, name: `Role A ${suffix}`, description: "Org A custom role" },
        { organizationId: orgB, name: `Role B ${suffix}`, description: "Org B custom role" },
      ])
      .returning({ id: roles.id });
    roleAId = roleA!.id;
    roleBId = roleB!.id;

    const policyA = await policiesService.create(ownerAuth(ownerA, orgA), {
      workspaceId: workspaceA1,
      name: `Policy A ${suffix}`,
      resource: "rfp",
      action: "update",
      effect: "deny",
      conditions: [{ attribute: "resource.status", operator: "eq", value: "FINAL" }],
    });
    const policyB = await policiesService.create(ownerAuth(ownerB, orgB), {
      workspaceId: workspaceB1,
      name: `Policy B ${suffix}`,
      resource: "rfp",
      action: "update",
      effect: "deny",
      conditions: [{ attribute: "resource.status", operator: "eq", value: "FINAL" }],
    });
    expect(policyA).toBeDefined();
    expect(policyB).toBeDefined();
    if (!policyA || !policyB) {
      throw new Error("Expected policies to be created.");
    }
    policyAId = policyA.id;
    policyBId = policyB.id;

    const assignmentA = await assignmentsService.create(ownerAuth(ownerA, orgA), {
      workspaceId: workspaceA1,
      resourceType: "requirement",
      resourceId: `REQ-A-${suffix}`,
      assigneeType: "user",
      assigneeId: scopedMembershipId,
      assignmentRole: "reviewer",
    });
    const assignmentB = await assignmentsService.create(ownerAuth(ownerB, orgB), {
      workspaceId: workspaceB1,
      resourceType: "requirement",
      resourceId: `REQ-B-${suffix}`,
      assigneeType: "user",
      assigneeId: ownerBMembershipId,
      assignmentRole: "reviewer",
    });
    expect(assignmentA).toBeDefined();
    expect(assignmentB).toBeDefined();
    if (!assignmentA || !assignmentB) {
      throw new Error("Expected assignments to be created.");
    }
    assignmentAId = assignmentA.id;
    assignmentBId = assignmentB.id;

    const proxyAuthService = {
      resolveSession: async (headers: Headers): Promise<ResolvedSession | null> => {
        const userId = headers.get("x-test-user-id");
        if (!userId) return null;
        return {
          userId,
          sessionId: headers.get("x-test-session-id") ?? `session-${userId}`,
          activeOrganizationId: headers.get("x-test-org-id"),
          emailVerified: headers.get("x-test-unverified") !== "1",
        };
      },
      resolveAuthContext: (session: ResolvedSession) => realAuthService.resolveAuthContext(session),
      listMemberships: (userId: string) => realAuthService.listMemberships(userId),
      activateOrganization: (session: ResolvedSession, organizationId: string) =>
        realAuthService.activateOrganization(session, organizationId),
      auth: realAuthService.auth,
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AuthService)
      .useValue(proxyAuthService)
      .overrideProvider(ConfigService)
      .useValue(config)
      .compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
    app.setGlobalPrefix("api", {
      exclude: [
        { path: "health", method: RequestMethod.GET },
        { path: "ready", method: RequestMethod.GET },
      ],
    });
    await app.init();
    await app.listen(0);
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
    await db.delete(users).where(inArray(users.id, [ownerA, ownerB, scopedUserA]));
  });

  dbTest("proves organization isolation across workspaces, teams, roles, policies, assignments, activity and audit", async () => {
    const aWorkspaces = await requestJson("GET", "/api/v1/workspaces", ownerA, orgA);
    expect(aWorkspaces.status).toBe(200);
    expect(aWorkspaces.body.items.map((item: { id: string }) => item.id).sort()).toEqual(
      [workspaceA1, workspaceA2].sort(),
    );

    const bWorkspaces = await requestJson("GET", "/api/v1/workspaces", ownerB, orgB);
    expect(bWorkspaces.status).toBe(200);
    expect(bWorkspaces.body.items.map((item: { id: string }) => item.id)).toEqual([workspaceB1]);

    expect((await requestJson("GET", `/api/v1/workspaces/${workspaceB1}`, ownerA, orgA)).status).toBe(404);
    expect((await requestJson("GET", `/api/v1/workspaces/${workspaceA1}`, ownerB, orgB)).status).toBe(404);
    expect(
      (await requestJson("PATCH", `/api/v1/workspaces/${workspaceB1}`, ownerA, orgA, {
        description: "cross-tenant",
      })).status,
    ).toBe(404);

    const aTeams = await requestJson("GET", "/api/v1/teams", ownerA, orgA);
    expect(aTeams.status).toBe(200);
    expect(aTeams.body.items.map((item: { id: string }) => item.id).sort()).toEqual(
      [teamA1, teamA2].sort(),
    );
    expect((await requestJson("PATCH", `/api/v1/teams/${teamB1}`, ownerA, orgA, { description: "x" })).status).toBe(404);

    const aRoles = await requestJson("GET", "/api/v1/roles", ownerA, orgA);
    expect(aRoles.status).toBe(200);
    expect(aRoles.body.items.some((item: { id: string }) => item.id === roleAId)).toBe(true);
    expect(aRoles.body.items.some((item: { id: string }) => item.id === roleBId)).toBe(false);
    expect(
      (await requestJson("POST", "/api/v1/roles/assignments", ownerA, orgA, {
        scopeType: "organization_member",
        organizationMemberId: ownerBMembershipId,
        roleId: roleBId,
      })).status,
    ).toBe(404);

    const aPolicies = await requestJson("GET", "/api/v1/policies", ownerA, orgA);
    expect(aPolicies.status).toBe(200);
    expect(aPolicies.body.items.some((item: { id: string }) => item.id === policyAId)).toBe(true);
    expect(aPolicies.body.items.some((item: { id: string }) => item.id === policyBId)).toBe(false);
    expect((await requestJson("GET", `/api/v1/policies?workspaceId=${workspaceB1}`, ownerA, orgA)).status).toBe(404);
    expect(
      (await requestJson("PATCH", `/api/v1/policies/${policyBId}`, ownerA, orgA, {
        description: "cross-tenant",
      })).status,
    ).toBe(404);

    const aAssignments = await requestJson("GET", `/api/v1/assignments?workspaceId=${workspaceA1}`, ownerA, orgA);
    expect(aAssignments.status).toBe(200);
    expect(aAssignments.body.items.some((item: { id: string }) => item.id === assignmentAId)).toBe(true);
    expect(aAssignments.body.items.some((item: { id: string }) => item.id === assignmentBId)).toBe(false);
    expect((await requestJson("GET", `/api/v1/assignments?workspaceId=${workspaceB1}`, ownerA, orgA)).status).toBe(404);
    expect(
      (await requestJson("POST", "/api/v1/assignments", ownerA, orgA, {
        workspaceId: workspaceB1,
        resourceType: "requirement",
        resourceId: "REQ-CROSS",
        assigneeType: "user",
        assigneeId: scopedMembershipId,
        assignmentRole: "reviewer",
      })).status,
    ).toBe(404);

    const aActivities = await requestJson("GET", `/api/v1/activities?workspaceId=${workspaceA1}`, ownerA, orgA);
    expect(aActivities.status).toBe(200);
    expect(aActivities.body.items.every((item: { organizationId: string }) => item.organizationId === orgA)).toBe(true);
    expect((await requestJson("GET", `/api/v1/activities?workspaceId=${workspaceB1}`, ownerA, orgA)).status).toBe(404);

    const aAudits = await requestJson("GET", `/api/v1/audits?workspaceId=${workspaceA1}`, ownerA, orgA);
    expect(aAudits.status).toBe(200);
    expect(aAudits.body.items.every((item: { organizationId: string }) => item.organizationId === orgA)).toBe(true);
    expect((await requestJson("GET", `/api/v1/audits?workspaceId=${workspaceB1}`, ownerA, orgA)).status).toBe(404);
  });

  dbTest("proves workspace isolation and workspace-scoped permission non-bleed for a member with A1 access only", async () => {
    const workspacesResponse = await requestJson("GET", "/api/v1/workspaces", scopedUserA, orgA);
    expect(workspacesResponse.status).toBe(200);
    expect(workspacesResponse.body.items.map((item: { id: string }) => item.id)).toEqual([workspaceA1]);

    expect((await requestJson("GET", `/api/v1/workspaces/${workspaceA1}`, scopedUserA, orgA)).status).toBe(200);
    expect((await requestJson("GET", `/api/v1/workspaces/${workspaceA2}`, scopedUserA, orgA)).status).toBe(403);

    const teamsResponse = await requestJson("GET", "/api/v1/teams", scopedUserA, orgA);
    expect(teamsResponse.status).toBe(200);
    expect(teamsResponse.body.items.map((item: { id: string }) => item.id)).toEqual([teamA1]);
    expect((await requestJson("GET", `/api/v1/activities?workspaceId=${workspaceA1}`, scopedUserA, orgA)).status).toBe(200);
    expect((await requestJson("GET", `/api/v1/activities?workspaceId=${workspaceA2}`, scopedUserA, orgA)).status).toBe(403);
    expect((await requestJson("GET", `/api/v1/audits?workspaceId=${workspaceA1}`, scopedUserA, orgA)).status).toBe(403);
    expect((await requestJson("GET", `/api/v1/assignments?workspaceId=${workspaceA1}`, scopedUserA, orgA)).status).toBe(200);
    expect((await requestJson("GET", `/api/v1/assignments?workspaceId=${workspaceA2}`, scopedUserA, orgA)).status).toBe(403);
  });

  dbTest("returns the intended authorization errors for unauthenticated and unsupported audit mutations", async () => {
    const unauthenticated = await fetch(`${baseUrl}/api/v1/workspaces`);
    expect(unauthenticated.status).toBe(401);

    expect((await requestJson("PATCH", `/api/v1/audits/${randomUUID()}`, ownerA, orgA, {})).status).toBe(404);
    expect((await requestJson("DELETE", `/api/v1/audits/${randomUUID()}`, ownerA, orgA)).status).toBe(404);
  });

  async function requestJson(
    method: string,
    path: string,
    userId?: string,
    organizationId?: string,
    body?: unknown,
  ) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(userId ? { "x-test-user-id": userId } : {}),
        ...(organizationId ? { "x-test-org-id": organizationId } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : null,
    };
  }
});
