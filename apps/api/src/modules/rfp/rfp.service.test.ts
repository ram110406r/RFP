import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import {
  auditLogs,
  customers,
  getDb,
  organizationMembers,
  organizations,
  rfpStatusHistory,
  rfpTeamAssignments,
  rfps,
  users,
} from "@rfp-os/db";
import { permissionsForRole, type AuthContext, type OrgRole } from "@rfp-os/types";

import { PolicyService } from "../../common/auth";
import { AuditService } from "../../infrastructure/audit";
import { EventPublisher } from "../../infrastructure/events";
import type { DomainEvent } from "../../infrastructure/events";
import { RfpAssignmentService } from "./rfp-assignment.service";
import { RfpLifecycleService } from "./rfp-lifecycle.service";
import { RfpRepository } from "./rfp.repository";
import { RfpService } from "./rfp.service";
import { expectRejection } from "./test-support";
import type { RfpLifecycleStatus } from "./domain/rfp-state-machine";

/**
 * Integration coverage for the RFP domain against a real database, because the
 * properties that matter here — tenant isolation, transactional history, audit
 * rows — are properties of the SQL, not of the types.
 *
 * Skipped without DATABASE_URL, matching packages/db and the auth suite.
 */
const dbTest = process.env.DATABASE_URL ? test : test.skip;
const describeDb = process.env.DATABASE_URL ? describe : describe.skip;

/** Captures published events so the tests can assert on them. */
class RecordingPublisher extends EventPublisher {
  readonly published: DomainEvent[] = [];
  async publish(event: DomainEvent): Promise<void> {
    this.published.push(event);
  }
}

describeDb("RFP domain", () => {
  const db = getDb();
  const events = new RecordingPublisher();
  const repository = new RfpRepository(db);
  const audit = new AuditService(db);
  const policy = new PolicyService(db);
  const rfpService = new RfpService(repository, audit, events, policy);
  const lifecycle = new RfpLifecycleService(repository, rfpService, audit, events);
  const assignments = new RfpAssignmentService(repository, rfpService, audit, events);

  const suffix = randomUUID().slice(0, 8);
  const orgA = randomUUID();
  const orgB = randomUUID();
  const ownerA = randomUUID();
  const memberA = randomUUID();
  const userB = randomUUID();
  const clientA = randomUUID();
  const clientB = randomUUID();
  const createdRfpIds: string[] = [];

  function authFor(userId: string, organizationId: string, role: OrgRole): AuthContext {
    return {
      userId,
      organizationId,
      role,
      permissions: permissionsForRole(role),
      sessionId: `session-${userId}`,
    };
  }

  const ownerAuth = () => authFor(ownerA, orgA, "OWNER");
  const viewerAuth = () => authFor(memberA, orgA, "VIEWER");
  const contributorAuth = () => authFor(memberA, orgA, "CONTRIBUTOR");
  const orgBAuth = () => authFor(userB, orgB, "OWNER");

  async function newRfp(title = `Probe RFP ${suffix}`) {
    const created = await rfpService.create(ownerAuth(), {
      title,
      clientId: clientA,
      deadline: "2026-12-31",
    });
    createdRfpIds.push(created.id);
    return created;
  }

  /** Walks an RFP to a given state through legal transitions only. */
  async function advanceTo(rfpId: string, target: RfpLifecycleStatus) {
    const path: RfpLifecycleStatus[] = [
      "INTAKE",
      "PARSING",
      "ANALYZING",
      "QUALIFICATION",
      "RESPONSE",
      "REVIEW",
      "VALIDATION",
      "READY_FOR_SUBMISSION",
      "SUBMITTED",
      "OUTCOME_RECORDED",
      "CLOSED",
    ];
    for (const to of path) {
      await lifecycle.transition(ownerAuth(), rfpId, { to });
      if (to === target) return;
    }
  }

  beforeAll(async () => {
    await db.insert(organizations).values([
      { id: orgA, name: `RFP Org A ${suffix}`, domain: `rfp-a-${suffix}.invalid` },
      { id: orgB, name: `RFP Org B ${suffix}`, domain: `rfp-b-${suffix}.invalid` },
    ]);
    await db.insert(users).values([
      { id: ownerA, organizationId: orgA, name: "Owner A", email: `own-${suffix}@probe.invalid` },
      { id: memberA, organizationId: orgA, name: "Member A", email: `mem-${suffix}@probe.invalid` },
      { id: userB, organizationId: orgB, name: "User B", email: `usr-${suffix}@probe.invalid` },
    ]);
    await db.insert(organizationMembers).values([
      { organizationId: orgA, userId: ownerA, role: "OWNER", status: "active" },
      { organizationId: orgA, userId: memberA, role: "CONTRIBUTOR", status: "active" },
      { organizationId: orgB, userId: userB, role: "OWNER", status: "active" },
    ]);
    await db.insert(customers).values([
      { id: clientA, organizationId: orgA, name: `Client A ${suffix}` },
      { id: clientB, organizationId: orgB, name: `Client B ${suffix}` },
    ]);
  });

  afterAll(async () => {
    if (createdRfpIds.length > 0) {
      await db.delete(rfpTeamAssignments).where(inArray(rfpTeamAssignments.rfpId, createdRfpIds));
      await db.delete(rfpStatusHistory).where(inArray(rfpStatusHistory.rfpId, createdRfpIds));
      await db.delete(rfps).where(inArray(rfps.id, createdRfpIds));
    }
    await db.delete(auditLogs).where(inArray(auditLogs.organizationId, [orgA, orgB]));
    await db.delete(customers).where(inArray(customers.organizationId, [orgA, orgB]));
    await db
      .delete(organizationMembers)
      .where(inArray(organizationMembers.organizationId, [orgA, orgB]));
    await db.delete(users).where(inArray(users.id, [ownerA, memberA, userB]));
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
  });

  // --- creation ------------------------------------------------------------

  describe("create", () => {
    dbTest("creates an RFP in DRAFT owned by the creator", async () => {
      const rfp = await newRfp();
      expect(rfp.status).toBe("DRAFT");
      expect(rfp.ownerId).toBe(ownerA);
      expect(rfp.organizationId).toBe(orgA);
      expect(rfp.archivedAt).toBeNull();
    });

    dbTest("writes an opening history row and an audit row", async () => {
      const rfp = await newRfp();

      const history = await repository.listStatusHistory(orgA, rfp.id);
      expect(history).toHaveLength(1);
      expect(history[0]?.fromStatus).toBeNull();
      expect(history[0]?.toStatus).toBe("DRAFT");

      const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, rfp.id));
      expect(logs.map((l) => l.action)).toContain("RFP_CREATED");
    });

    dbTest("publishes RFP_CREATED", async () => {
      const before = events.published.length;
      const rfp = await newRfp();
      const published = events.published.slice(before);
      expect(published.map((e) => e.name)).toContain("RFP_CREATED");
      expect(published[0]?.entityId).toBe(rfp.id);
    });

    dbTest("rejects a client belonging to another organization", async () => {
      // clientB exists, but in orgB. This must not be usable from orgA.
      await expectRejection(
        rfpService.create(ownerAuth(), {
          title: "Cross-tenant client",
          clientId: clientB,
          deadline: "2026-12-31",
        }),
        { code: "RFP_CLIENT_NOT_FOUND" },
      );
    });

    dbTest("rejects an owner who is not a member of the organization", async () => {
      await expectRejection(
        rfpService.create(ownerAuth(), {
          title: "Cross-tenant owner",
          clientId: clientA,
          deadline: "2026-12-31",
          ownerId: userB,
        }),
        { code: "RFP_OWNER_NOT_FOUND" },
      );
    });
  });

  // --- tenant isolation ----------------------------------------------------

  describe("tenant isolation", () => {
    dbTest("an RFP in another organization reads as not found", async () => {
      const rfp = await newRfp();
      await expectRejection(rfpService.getById(orgBAuth(), rfp.id), {
        code: "RFP_NOT_FOUND",
        status: 404,
      });
    });

    dbTest("reports missing rather than forbidden, so ids cannot be probed", async () => {
      const rfp = await newRfp();
      const failure = await expectRejection(rfpService.getById(orgBAuth(), rfp.id));
      // 404 with the same code an absent id yields — never 403, which would
      // confirm the row exists in some other tenant.
      expect(failure.status).toBe(404);
      expect(failure.code).toBe("RFP_NOT_FOUND");
      expect(failure.message).not.toContain(rfp.id);
    });

    dbTest("another organization cannot update, archive or transition it", async () => {
      const rfp = await newRfp();
      await expectRejection(rfpService.update(orgBAuth(), rfp.id, { title: "Hijacked" }), {
        code: "RFP_NOT_FOUND",
      });
      await expectRejection(rfpService.archive(orgBAuth(), rfp.id), { code: "RFP_NOT_FOUND" });
      await expectRejection(lifecycle.transition(orgBAuth(), rfp.id, { to: "INTAKE" }), {
        code: "RFP_NOT_FOUND",
      });
    });

    dbTest("listing never returns another organization's RFPs", async () => {
      await newRfp();
      const listed = await rfpService.list(orgBAuth(), {
        page: 1,
        pageSize: 100,
        sort: "createdAt",
        direction: "desc",
      });
      expect(listed.items).toHaveLength(0);
      expect(listed.total).toBe(0);
    });

    dbTest("history and assignments are org-scoped too", async () => {
      const rfp = await newRfp();
      await expectRejection(lifecycle.getHistory(orgBAuth(), rfp.id), {
        code: "RFP_NOT_FOUND",
      });
      await expectRejection(assignments.list(orgBAuth(), rfp.id, false), {
        code: "RFP_NOT_FOUND",
      });
    });
  });

  // --- lifecycle -----------------------------------------------------------

  describe("lifecycle", () => {
    dbTest("walks the full happy path DRAFT -> CLOSED", async () => {
      const rfp = await newRfp();
      await advanceTo(rfp.id, "CLOSED");

      const stored = await repository.findById(orgA, rfp.id);
      expect(stored?.lifecycleStatus).toBe("CLOSED");

      const history = await repository.listStatusHistory(orgA, rfp.id);
      // 1 creation row + 11 transitions.
      expect(history).toHaveLength(12);
      expect(history.at(-1)?.toStatus).toBe("CLOSED");
    });

    dbTest("rejects a skipped stage and leaves the status untouched", async () => {
      const rfp = await newRfp();
      await expectRejection(lifecycle.transition(ownerAuth(), rfp.id, { to: "SUBMITTED" }), {
        code: "INVALID_RFP_TRANSITION",
        status: 409,
      });

      const stored = await repository.findById(orgA, rfp.id);
      expect(stored?.lifecycleStatus).toBe("DRAFT");
      // The failed attempt must not have written history either.
      expect(await repository.listStatusHistory(orgA, rfp.id)).toHaveLength(1);
    });

    dbTest("recovers from PARSING_FAILED back into PARSING", async () => {
      const rfp = await newRfp();
      await lifecycle.transition(ownerAuth(), rfp.id, { to: "INTAKE" });
      await lifecycle.transition(ownerAuth(), rfp.id, { to: "PARSING" });
      await lifecycle.transition(ownerAuth(), rfp.id, {
        to: "PARSING_FAILED",
        reason: "Corrupt PDF.",
      });

      let stored = await repository.findById(orgA, rfp.id);
      expect(stored?.lifecycleStatus).toBe("PARSING_FAILED");

      await lifecycle.transition(ownerAuth(), rfp.id, { to: "PARSING" });
      stored = await repository.findById(orgA, rfp.id);
      expect(stored?.lifecycleStatus).toBe("PARSING");

      const history = await repository.listStatusHistory(orgA, rfp.id);
      expect(history.map((h) => h.toStatus)).toEqual([
        "DRAFT",
        "INTAKE",
        "PARSING",
        "PARSING_FAILED",
        "PARSING",
      ]);
      expect(history[3]?.reason).toBe("Corrupt PDF.");
    });

    dbTest("records the actor and both endpoints of each transition", async () => {
      const rfp = await newRfp();
      await lifecycle.transition(ownerAuth(), rfp.id, { to: "INTAKE", reason: "Kickoff." });

      const history = await repository.listStatusHistory(orgA, rfp.id);
      const last = history.at(-1);
      expect(last?.fromStatus).toBe("DRAFT");
      expect(last?.toStatus).toBe("INTAKE");
      expect(last?.actorId).toBe(ownerA);
    });

    dbTest("audits the status change with before and after", async () => {
      const rfp = await newRfp();
      await lifecycle.transition(ownerAuth(), rfp.id, { to: "INTAKE" });

      const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, rfp.id));
      const statusLog = logs.find((l) => l.action === "RFP_STATUS_CHANGED");
      expect(statusLog?.previousValue).toEqual({ lifecycleStatus: "DRAFT" });
      expect(statusLog?.newValue).toEqual({ lifecycleStatus: "INTAKE" });
    });

    dbTest("publishes RFP_STATUS_CHANGED with both endpoints", async () => {
      const rfp = await newRfp();
      const before = events.published.length;
      await lifecycle.transition(ownerAuth(), rfp.id, { to: "INTAKE" });
      const event = events.published.slice(before).find((e) => e.name === "RFP_STATUS_CHANGED");
      expect(event?.payload).toMatchObject({ fromStatus: "DRAFT", toStatus: "INTAKE" });
    });

    dbTest("CLOSED accepts no further transitions", async () => {
      const rfp = await newRfp();
      await advanceTo(rfp.id, "CLOSED");
      await expectRejection(lifecycle.transition(ownerAuth(), rfp.id, { to: "DRAFT" }), {
        code: "INVALID_RFP_TRANSITION",
      });
    });

    dbTest("submitting requires rfp:submit, which CONTRIBUTOR lacks", async () => {
      const rfp = await newRfp();
      await advanceTo(rfp.id, "READY_FOR_SUBMISSION");

      // CONTRIBUTOR holds rfp:update, so it clears the endpoint guard, but the
      // transition itself demands rfp:submit.
      expect(permissionsForRole("CONTRIBUTOR")).toContain("rfp:update");
      expect(permissionsForRole("CONTRIBUTOR")).not.toContain("rfp:submit");
      await expectRejection(lifecycle.transition(contributorAuth(), rfp.id, { to: "SUBMITTED" }), {
        code: "RFP_TRANSITION_NOT_ALLOWED",
        status: 403,
      });

      const stored = await repository.findById(orgA, rfp.id);
      expect(stored?.lifecycleStatus).toBe("READY_FOR_SUBMISSION");
    });

    dbTest("lists the transitions available from the current state", async () => {
      const rfp = await newRfp();
      const available = await lifecycle.getAvailableTransitions(ownerAuth(), rfp.id);
      expect(available.status).toBe("DRAFT");
      expect(available.transitions.map((t) => t.to)).toEqual(["INTAKE"]);
    });
  });

  // --- update and archive --------------------------------------------------

  describe("update and archive", () => {
    dbTest("updates editable metadata and audits the diff", async () => {
      const rfp = await newRfp();
      const updated = await rfpService.update(ownerAuth(), rfp.id, {
        title: "Renamed",
        estimatedValue: 1234,
      });
      expect(updated.title).toBe("Renamed");
      expect(updated.estimatedValue).toBe(1234);

      const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, rfp.id));
      const updateLog = logs.find((l) => l.action === "RFP_UPDATED");
      expect(updateLog?.previousValue).toMatchObject({ title: rfp.title });
      expect(updateLog?.newValue).toMatchObject({ title: "Renamed" });
    });

    dbTest("update cannot change lifecycle status", async () => {
      const rfp = await newRfp();
      await lifecycle.transition(ownerAuth(), rfp.id, { to: "INTAKE" });

      // `status` is not part of UpdateRfpInput; the DTO is .strict() so it is
      // rejected at the edge. Passing it through the service must not move it.
      await rfpService.update(ownerAuth(), rfp.id, {
        title: "Still intake",
      } as never);

      const stored = await repository.findById(orgA, rfp.id);
      expect(stored?.lifecycleStatus).toBe("INTAKE");
    });

    dbTest("archives instead of deleting, and hides it from lists", async () => {
      const rfp = await newRfp(`Archive probe ${suffix}`);
      await rfpService.archive(ownerAuth(), rfp.id);

      const stored = await repository.findById(orgA, rfp.id);
      expect(stored).not.toBeNull();
      expect(stored?.archivedAt).not.toBeNull();

      const visible = await rfpService.list(ownerAuth(), {
        page: 1,
        pageSize: 100,
        sort: "createdAt",
        direction: "desc",
        search: `Archive probe ${suffix}`,
      });
      expect(visible.items).toHaveLength(0);

      const withArchived = await rfpService.list(ownerAuth(), {
        page: 1,
        pageSize: 100,
        sort: "createdAt",
        direction: "desc",
        search: `Archive probe ${suffix}`,
        includeArchived: true,
      });
      expect(withArchived.items).toHaveLength(1);
    });

    dbTest("archiving twice is a conflict", async () => {
      const rfp = await newRfp();
      await rfpService.archive(ownerAuth(), rfp.id);
      await expectRejection(rfpService.archive(ownerAuth(), rfp.id), {
        code: "RFP_ALREADY_ARCHIVED",
        status: 409,
      });
    });

    dbTest("an archived RFP cannot be edited or transitioned until restored", async () => {
      const rfp = await newRfp();
      await rfpService.archive(ownerAuth(), rfp.id);

      await expectRejection(rfpService.update(ownerAuth(), rfp.id, { title: "No" }), {
        code: "RFP_ARCHIVED",
      });
      await expectRejection(lifecycle.transition(ownerAuth(), rfp.id, { to: "INTAKE" }), {
        code: "RFP_ARCHIVED",
      });

      await rfpService.restore(ownerAuth(), rfp.id);
      const restored = await rfpService.update(ownerAuth(), rfp.id, { title: "Yes" });
      expect(restored.title).toBe("Yes");
    });
  });

  // --- assignments ---------------------------------------------------------

  describe("assignments", () => {
    dbTest("assigns an organization member to an RFP", async () => {
      const rfp = await newRfp();
      const assignment = await assignments.assign(ownerAuth(), rfp.id, {
        userId: memberA,
        role: "REVIEWER",
      });
      expect(assignment?.userId).toBe(memberA);
      expect(assignment?.role).toBe("REVIEWER");

      const listed = await assignments.list(ownerAuth(), rfp.id, false);
      expect(listed.assignments).toHaveLength(1);
    });

    dbTest("refuses to assign a user from another organization", async () => {
      const rfp = await newRfp();
      await expectRejection(
        assignments.assign(ownerAuth(), rfp.id, { userId: userB, role: "SME" }),
        {
          code: "USER_NOT_IN_ORGANIZATION",
        },
      );
    });

    dbTest("refuses a duplicate active assignment", async () => {
      const rfp = await newRfp();
      await assignments.assign(ownerAuth(), rfp.id, { userId: memberA, role: "CONTRIBUTOR" });
      await expectRejection(
        assignments.assign(ownerAuth(), rfp.id, { userId: memberA, role: "CONTRIBUTOR" }),
        { code: "DUPLICATE_RFP_ASSIGNMENT", status: 409 },
      );
    });

    dbTest("allows the same person in a different role", async () => {
      const rfp = await newRfp();
      await assignments.assign(ownerAuth(), rfp.id, { userId: memberA, role: "CONTRIBUTOR" });
      await assignments.assign(ownerAuth(), rfp.id, { userId: memberA, role: "REVIEWER" });
      const listed = await assignments.list(ownerAuth(), rfp.id, false);
      expect(listed.assignments).toHaveLength(2);
    });

    dbTest("unassigns softly and can re-assign afterwards", async () => {
      const rfp = await newRfp();
      await assignments.assign(ownerAuth(), rfp.id, { userId: memberA, role: "SME" });
      const removed = await assignments.unassign(ownerAuth(), rfp.id, memberA, "SME");
      expect(removed.removed).toBe(1);

      expect((await assignments.list(ownerAuth(), rfp.id, false)).assignments).toHaveLength(0);
      // The row survives, so the history of who was on the deal is intact.
      expect((await assignments.list(ownerAuth(), rfp.id, true)).assignments).toHaveLength(1);

      await assignments.assign(ownerAuth(), rfp.id, { userId: memberA, role: "SME" });
      expect((await assignments.list(ownerAuth(), rfp.id, false)).assignments).toHaveLength(1);
    });

    dbTest("unassigning someone who is not assigned is a 404", async () => {
      const rfp = await newRfp();
      await expectRejection(assignments.unassign(ownerAuth(), rfp.id, memberA, "SME"), {
        code: "RFP_ASSIGNMENT_NOT_FOUND",
        status: 404,
      });
    });

    dbTest("audits assignment creation and removal", async () => {
      const rfp = await newRfp();
      await assignments.assign(ownerAuth(), rfp.id, { userId: memberA, role: "REVIEWER" });
      await assignments.unassign(ownerAuth(), rfp.id, memberA, "REVIEWER");

      const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, rfp.id));
      const actions = logs.map((l) => l.action);
      expect(actions).toContain("RFP_ASSIGNMENT_CREATED");
      expect(actions).toContain("RFP_ASSIGNMENT_REMOVED");
    });
  });

  // --- authorization -------------------------------------------------------

  describe("authorization", () => {
    dbTest("VIEWER holds rfp:read but none of the write permissions", () => {
      const viewer = viewerAuth();
      expect(viewer.permissions).toContain("rfp:read");
      for (const permission of [
        "rfp:create",
        "rfp:update",
        "rfp:delete",
        "rfp:assign",
        "rfp:submit",
      ] as const) {
        expect(viewer.permissions).not.toContain(permission);
      }
    });

    dbTest("OWNER holds the full rfp permission set", () => {
      const owner = ownerAuth();
      for (const permission of [
        "rfp:create",
        "rfp:read",
        "rfp:update",
        "rfp:delete",
        "rfp:assign",
        "rfp:approve",
        "rfp:submit",
      ] as const) {
        expect(owner.permissions).toContain(permission);
      }
    });
  });
});
