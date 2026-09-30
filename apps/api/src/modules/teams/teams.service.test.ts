import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb, organizationMembers, organizations, users, workspaceMembers, workspaces } from "@rfp-os/db";

import { testEnv } from "../../config/test-env";
import { AuthService } from "../auth/auth.service";
import { WorkspacesService } from "../workspaces/workspaces.service";
import { TeamsService } from "./teams.service";

const shouldRunDbTests = Boolean(process.env.DATABASE_URL && !process.env.TENDYY_ROOT_BUN_TEST);
const dbTest = shouldRunDbTests ? test : test.skip;
const describeDb = shouldRunDbTests ? describe : describe.skip;

const env = testEnv();
const config = { get: (key: keyof typeof env) => env[key] } as never;

async function rejection(promise: Promise<unknown>): Promise<{ response?: { code?: string } } | null> {
  return promise.then(() => null, (error: unknown) => error as { response?: { code?: string } });
}

describeDb("TeamsService", () => {
  const db = shouldRunDbTests ? getDb() : (undefined as never);
  const recorder = { record: async () => undefined };
  const service = new TeamsService(db, recorder as never, recorder as never);
  const authService = new AuthService(db, config);

  const suffix = randomUUID().slice(0, 8);
  const orgId = randomUUID();
  const workspaceA = randomUUID();
  const workspaceB = randomUUID();
  const archivedWorkspace = randomUUID();
  const userIds: string[] = [];
  const memberIds: Record<string, string> = {};

  async function member(key: string, role: "OWNER" | "RFP_MANAGER" | "CONTRIBUTOR", workspaceIds: string[]) {
    const [user] = await db
      .insert(users)
      .values({ name: key, email: `${key}-${suffix}@example.invalid`, emailVerified: true, organizationId: orgId })
      .returning({ id: users.id });
    userIds.push(user!.id);
    const [membership] = await db
      .insert(organizationMembers)
      .values({ organizationId: orgId, userId: user!.id, role, status: "active" })
      .returning({ id: organizationMembers.id });
    memberIds[key] = membership!.id;
    for (const workspaceId of workspaceIds) {
      await db.insert(workspaceMembers).values({ workspaceId, organizationMemberId: membership!.id });
    }
    return user!.id;
  }

  async function authFor(userId: string) {
    const auth = await authService.resolveAuthContext({ userId, sessionId: `s-${userId}`, activeOrganizationId: orgId, emailVerified: true });
    return auth!;
  }

  let ownerId = "";
  let managerId = "";

  beforeAll(async () => {
    await db.insert(organizations).values({ id: orgId, name: `Teams ${suffix}`, domain: `teams-${suffix}.invalid` });
    await db.insert(workspaces).values([
      { id: workspaceA, organizationId: orgId, name: "A", slug: `a-${suffix}` },
      { id: workspaceB, organizationId: orgId, name: "B", slug: `b-${suffix}` },
      { id: archivedWorkspace, organizationId: orgId, name: "Old", slug: `old-${suffix}`, status: "archived" },
    ]);
    ownerId = await member("owner", "OWNER", [workspaceA, workspaceB]);
    managerId = await member("manager", "RFP_MANAGER", [workspaceA]);
    await member("writer", "CONTRIBUTOR", [workspaceA]);
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.delete(users).where(inArray(users.id, userIds));
  });

  dbTest("an RFP manager runs teams in their own workspace, and only there", async () => {
    const manager = await authFor(managerId);
    const team = await service.create(manager, { name: "Bid team", workspaceId: workspaceA });
    await service.addMember(manager, team!.id, { organizationMemberId: memberIds.writer! });

    const elsewhere = await rejection(service.create(manager, { name: "Not mine", workspaceId: workspaceB }));
    expect(elsewhere?.response?.code).toBe("FORBIDDEN");
  });

  dbTest("lists teams and workspaces with their active member counts", async () => {
    const owner = await authFor(ownerId);
    const teamsList = await service.list(owner);
    // "Bid team" was created in the previous test with one member.
    expect(teamsList.find((team) => team.name === "Bid team")?.memberCount).toBe(1);

    const workspacesService = new WorkspacesService(db, recorder as never, recorder as never);
    const workspacesList = await workspacesService.list(owner);
    // owner, manager and writer are in workspace A; only the owner is in B.
    expect(workspacesList.find((workspace) => workspace.id === workspaceA)?.memberCount).toBe(3);
    expect(workspacesList.find((workspace) => workspace.id === workspaceB)?.memberCount).toBe(1);
  });

  dbTest("refuses teams in an archived workspace", async () => {
    const owner = await authFor(ownerId);
    const blocked = await rejection(service.create(owner, { name: "Ghost team", workspaceId: archivedWorkspace }));
    expect(blocked?.response?.code).toBe("WORKSPACE_ARCHIVED");
  });

  dbTest("refuses to move a team into a workspace its members are not in", async () => {
    const owner = await authFor(ownerId);
    const team = await service.create(owner, { name: "Movers", workspaceId: workspaceA });
    await service.addMember(owner, team!.id, { organizationMemberId: memberIds.writer! });

    const moved = await rejection(service.update(owner, team!.id, { workspaceId: workspaceB }));
    expect(moved?.response?.code).toBe("TEAM_MEMBERS_NOT_IN_WORKSPACE");

    // Once the member is in the destination workspace, the move goes through.
    await db.insert(workspaceMembers).values({ workspaceId: workspaceB, organizationMemberId: memberIds.writer! });
    const updated = await service.update(owner, team!.id, { workspaceId: workspaceB });
    expect(updated?.workspaceId).toBe(workspaceB);
  });

  dbTest("an archived team accepts no new members", async () => {
    const owner = await authFor(ownerId);
    const team = await service.create(owner, { name: "Closing", workspaceId: workspaceA });
    await service.archive(owner, team!.id);

    const blocked = await rejection(service.addMember(owner, team!.id, { organizationMemberId: memberIds.writer! }));
    expect(blocked?.response?.code).toBe("TEAM_ARCHIVED");
  });
});
