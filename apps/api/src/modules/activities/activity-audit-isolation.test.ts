import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { activities, auditLogs, getDb, organizations, workspaces } from "@rfp-os/db";
import type { AuthContext } from "@rfp-os/types";

import { ActivitiesService } from "./activities.service";
import { AuditsService } from "../audits/audits.service";

const dbTest = process.env.DATABASE_URL ? test : test.skip;
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

describeDb("Activity and audit isolation", () => {
  const db = getDb();
  const activitiesService = new ActivitiesService(db);
  const auditsService = new AuditsService(db);

  const orgA = randomUUID();
  const orgB = randomUUID();
  const workspaceA1 = randomUUID();
  const workspaceA2 = randomUUID();
  const workspaceB1 = randomUUID();
  const suffix = randomUUID().slice(0, 8);

  beforeAll(async () => {
    await db.insert(organizations).values([
      { id: orgA, name: `Activity Org A ${suffix}`, domain: `activity-a-${suffix}.invalid` },
      { id: orgB, name: `Activity Org B ${suffix}`, domain: `activity-b-${suffix}.invalid` },
    ]);
    await db.insert(workspaces).values([
      { id: workspaceA1, organizationId: orgA, name: `A1 ${suffix}`, slug: `a1-${suffix}` },
      { id: workspaceA2, organizationId: orgA, name: `A2 ${suffix}`, slug: `a2-${suffix}` },
      { id: workspaceB1, organizationId: orgB, name: `B1 ${suffix}`, slug: `b1-${suffix}` },
    ]);

    await db.insert(activities).values([
      {
        organizationId: orgA,
        workspaceId: workspaceA1,
        actorLabel: "System",
        kind: "generated",
        label: "A1 activity",
        action: "TEST_A1",
        entityType: "workspace",
        entityId: workspaceA1,
        summary: "Activity in workspace A1",
      },
      {
        organizationId: orgA,
        workspaceId: workspaceA2,
        actorLabel: "System",
        kind: "generated",
        label: "A2 activity",
        action: "TEST_A2",
        entityType: "workspace",
        entityId: workspaceA2,
        summary: "Activity in workspace A2",
      },
      {
        organizationId: orgB,
        workspaceId: workspaceB1,
        actorLabel: "System",
        kind: "generated",
        label: "B1 activity",
        action: "TEST_B1",
        entityType: "workspace",
        entityId: workspaceB1,
        summary: "Activity in workspace B1",
      },
    ]);

    await db.insert(auditLogs).values([
      {
        organizationId: orgA,
        workspaceId: workspaceA1,
        actorType: "system",
        action: "AUDIT_A1",
        entityType: "workspace",
        entityId: workspaceA1,
      },
      {
        organizationId: orgA,
        workspaceId: workspaceA2,
        actorType: "system",
        action: "AUDIT_A2",
        entityType: "workspace",
        entityId: workspaceA2,
      },
      {
        organizationId: orgB,
        workspaceId: workspaceB1,
        actorType: "system",
        action: "AUDIT_B1",
        entityType: "workspace",
        entityId: workspaceB1,
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(activities).where(inArray(activities.organizationId, [orgA, orgB]));
    await db.delete(auditLogs).where(inArray(auditLogs.organizationId, [orgA, orgB]));
    await db.delete(workspaces).where(inArray(workspaces.id, [workspaceA1, workspaceA2, workspaceB1]));
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
  });

  dbTest("keeps organization and workspace activity/audit visibility isolated", async () => {
    const orgAdminA: AuthContext = {
      userId: "user-a",
      organizationId: orgA,
      role: "OWNER",
      permissions: ["activity:read", "audit:read"],
      organizationPermissions: ["activity:read", "audit:read"],
      sessionId: "org-a",
    };

    const workspaceOnlyA1: AuthContext = {
      userId: "user-a1",
      organizationId: orgA,
      role: "VIEWER",
      permissions: ["activity:read", "audit:read"],
      organizationPermissions: [],
      sessionId: "ws-a1",
      workspaceIds: [workspaceA1],
      workspacePermissions: {
        [workspaceA1]: ["activity:read", "audit:read"],
      },
      workspaceMemberIds: {
        [workspaceA1]: "wm-a1",
      },
    };

    const orgAActivities = await activitiesService.search(orgAdminA, {});
    expect(orgAActivities.map((row) => row.action).sort()).toEqual(["TEST_A1", "TEST_A2"].sort());

    const wsA1Activities = await activitiesService.search(workspaceOnlyA1, {});
    expect(wsA1Activities.map((row) => row.action)).toEqual(["TEST_A1"]);

    const orgAAudits = await auditsService.search(orgAdminA, {});
    expect(orgAAudits.map((row) => row.action).sort()).toEqual(["AUDIT_A1", "AUDIT_A2"].sort());

    const wsA1Audits = await auditsService.search(workspaceOnlyA1, {});
    expect(wsA1Audits.map((row) => row.action)).toEqual(["AUDIT_A1"]);
  });
});
