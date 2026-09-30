import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import {
  activities,
  assignments,
  auditLogs,
  getDb,
  organizationMembers,
  organizations,
  teams,
  users,
  workspaces,
} from "@rfp-os/db";
import { permissionsForRole, type AuthContext } from "@rfp-os/types";

import { ActivityService } from "../../infrastructure/activity";
import { AuditService } from "../../infrastructure/audit";
import { AssignmentsService } from "./assignments.service";

const shouldRunDbTests = Boolean(process.env.DATABASE_URL && !process.env.TENDYY_ROOT_BUN_TEST);
const dbTest = shouldRunDbTests ? test : test.skip;
const describeDb = shouldRunDbTests ? describe : describe.skip;

describeDb("AssignmentsService", () => {
  const db = shouldRunDbTests ? getDb() : (undefined as never);
  const service = new AssignmentsService(db, new ActivityService(db), new AuditService(db));

  const orgA = randomUUID();
  const orgB = randomUUID();
  const workspaceA = randomUUID();
  const workspaceB = randomUUID();
  const ownerA = randomUUID();
  const memberA = randomUUID();
  const memberB = randomUUID();
  const teamA = randomUUID();
  const suffix = randomUUID().slice(0, 8);

  let ownerMembershipA = "";
  let memberMembershipA = "";
  let memberMembershipB = "";
  let createdAssignmentId = "";
  let createdTeamAssignmentId = "";

  const ownerAuth = (): AuthContext => ({
    userId: ownerA,
    organizationId: orgA,
    role: "OWNER",
    permissions: permissionsForRole("OWNER"),
    organizationPermissions: permissionsForRole("OWNER"),
    sessionId: "assign-owner",
  });

  beforeAll(async () => {
    await db.insert(organizations).values([
      { id: orgA, name: `Assign Org A ${suffix}`, domain: `assign-a-${suffix}.invalid` },
      { id: orgB, name: `Assign Org B ${suffix}`, domain: `assign-b-${suffix}.invalid` },
    ]);

    await db.insert(users).values([
      { id: ownerA, organizationId: orgA, name: "Owner A", email: `owner-a-${suffix}@probe.invalid` },
      { id: memberA, organizationId: orgA, name: "Member A", email: `member-a-${suffix}@probe.invalid` },
      { id: memberB, organizationId: orgB, name: "Member B", email: `member-b-${suffix}@probe.invalid` },
    ]);

    await db.insert(organizationMembers).values([
      { organizationId: orgA, userId: ownerA, role: "OWNER", status: "active" },
      { organizationId: orgA, userId: memberA, role: "CONTRIBUTOR", status: "active" },
      { organizationId: orgB, userId: memberB, role: "CONTRIBUTOR", status: "active" },
    ]);

    const memberships = await db
      .select({
        id: organizationMembers.id,
        organizationId: organizationMembers.organizationId,
        userId: organizationMembers.userId,
      })
      .from(organizationMembers)
      .where(inArray(organizationMembers.organizationId, [orgA, orgB]));

    ownerMembershipA = memberships.find((row) => row.organizationId === orgA && row.userId === ownerA)!.id;
    memberMembershipA = memberships.find((row) => row.organizationId === orgA && row.userId === memberA)!.id;
    memberMembershipB = memberships.find((row) => row.organizationId === orgB && row.userId === memberB)!.id;

    await db.insert(workspaces).values([
      { id: workspaceA, organizationId: orgA, name: `Workspace A ${suffix}`, slug: `assign-wa-${suffix}` },
      { id: workspaceB, organizationId: orgB, name: `Workspace B ${suffix}`, slug: `assign-wb-${suffix}` },
    ]);

    await db.insert(teams).values({
      id: teamA,
      organizationId: orgA,
      workspaceId: workspaceA,
      name: `Security Team ${suffix}`,
      description: "Assignment target team",
    });
  });

  afterAll(async () => {
    if (createdAssignmentId) {
      await db.delete(activities).where(eq(activities.entityId, createdAssignmentId));
      await db.delete(auditLogs).where(eq(auditLogs.entityId, createdAssignmentId));
      await db.delete(assignments).where(eq(assignments.id, createdAssignmentId));
    }
    if (createdTeamAssignmentId) {
      await db.delete(activities).where(eq(activities.entityId, createdTeamAssignmentId));
      await db.delete(auditLogs).where(eq(auditLogs.entityId, createdTeamAssignmentId));
      await db.delete(assignments).where(eq(assignments.id, createdTeamAssignmentId));
    }
    await db.delete(teams).where(eq(teams.id, teamA));
    await db.delete(workspaces).where(inArray(workspaces.id, [workspaceA, workspaceB]));
    await db.delete(organizationMembers).where(inArray(organizationMembers.organizationId, [orgA, orgB]));
    await db.delete(users).where(inArray(users.id, [ownerA, memberA, memberB]));
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
    void [ownerMembershipA, memberMembershipA, memberMembershipB];
  });

  dbTest("creates user and team assignments, persists events, and enforces tenant boundaries", async () => {
    const userAssignment = await service.create(ownerAuth(), {
      workspaceId: workspaceA,
      resourceType: "requirement",
      resourceId: "REQ-100",
      assigneeType: "user",
      assigneeId: memberMembershipA,
      assignmentRole: "reviewer",
      dueAt: "2026-08-30T00:00:00.000Z",
    });
    expect(userAssignment).toBeDefined();
    if (!userAssignment) {
      throw new Error("Expected user assignment to be created.");
    }
    createdAssignmentId = userAssignment.id;

    expect(userAssignment.organizationId).toBe(orgA);
    expect(userAssignment.workspaceId).toBe(workspaceA);
    expect(userAssignment.assigneeId).toBe(memberMembershipA);
    expect(userAssignment.assignedBy).toBe(ownerA);

    const updated = await service.update(ownerAuth(), userAssignment.id, { status: "in_progress" });
    expect(updated.status).toBe("in_progress");

    const completed = await service.complete(ownerAuth(), userAssignment.id);
    expect(completed.status).toBe("completed");

    const teamAssignment = await service.create(ownerAuth(), {
      workspaceId: workspaceA,
      resourceType: "question",
      resourceId: "Q-200",
      assigneeType: "team",
      assigneeId: teamA,
      assignmentRole: "owner",
    });
    expect(teamAssignment).toBeDefined();
    if (!teamAssignment) {
      throw new Error("Expected team assignment to be created.");
    }
    createdTeamAssignmentId = teamAssignment.id;
    expect(teamAssignment.assigneeId).toBe(teamA);

    let crossTenantError: unknown;
    try {
      await service.create(ownerAuth(), {
        workspaceId: workspaceA,
        resourceType: "requirement",
        resourceId: "REQ-XTENANT",
        assigneeType: "user",
        assigneeId: memberMembershipB,
        assignmentRole: "reviewer",
      });
    } catch (error) {
      crossTenantError = error;
    }
    expect(crossTenantError).toBeDefined();

    const activityRows = await db
      .select()
      .from(activities)
      .where(eq(activities.entityId, userAssignment.id));
    expect(activityRows.some((row) => row.action === "ASSIGNMENT_CREATED")).toBe(true);
    expect(activityRows.some((row) => row.action === "ASSIGNMENT_UPDATED")).toBe(true);
    expect(activityRows.some((row) => row.action === "ASSIGNMENT_COMPLETED")).toBe(true);

    const auditRows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, userAssignment.id));
    expect(auditRows.some((row) => row.action === "ASSIGNMENT_CREATED")).toBe(true);
    expect(auditRows.some((row) => row.action === "ASSIGNMENT_UPDATED")).toBe(true);
    expect(auditRows.some((row) => row.action === "ASSIGNMENT_COMPLETED")).toBe(true);
  });
});
