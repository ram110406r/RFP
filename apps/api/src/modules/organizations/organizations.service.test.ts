import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  getDb,
  invitations,
  organizationMembers,
  organizations,
  teams,
  users,
  workspaceMembers,
  workspaces,
} from "@rfp-os/db";
import { permissionsForRole, type AuthContext, type OrgRole } from "@rfp-os/types";

import { testEnv } from "../../config/test-env";
import { AuthService } from "../auth/auth.service";
import { WorkspacesService } from "../workspaces/workspaces.service";
import { OrganizationsService } from "./organizations.service";
import { hashInvitationToken } from "./invitation-token";

const shouldRunDbTests = Boolean(process.env.DATABASE_URL && !process.env.TENDYY_ROOT_BUN_TEST);
const dbTest = shouldRunDbTests ? test : test.skip;
const describeDb = shouldRunDbTests ? describe : describe.skip;

const env = testEnv({ WEB_APP_URL: "http://localhost:3000" });
const config = { get: (key: keyof typeof env) => env[key] } as never;

/** Resolves an error from a promise that is expected to reject. */
async function rejection(promise: Promise<unknown>): Promise<{ response?: { code?: string } } | null> {
  return promise.then(() => null, (error: unknown) => error as { response?: { code?: string } });
}

describeDb("OrganizationsService membership rules", () => {
  const db = shouldRunDbTests ? getDb() : (undefined as never);
  const recorder = { record: async () => undefined };
  const sent: string[] = [];
  const mailer = { sendInvitation: async (input: { to: string }) => void sent.push(input.to) };
  const service = new OrganizationsService(db, config, recorder as never, recorder as never, mailer as never);
  const authService = new AuthService(db, config);

  const suffix = randomUUID().slice(0, 8);
  const orgId = randomUUID();
  const otherOrgId = randomUUID();
  const workspaceId = randomUUID();
  const userIds: Record<string, string> = {};
  const emailOf = (key: string) => `${key}-${suffix}@example.invalid`;

  const auth = (key: string, role: OrgRole): AuthContext => ({
    userId: userIds[key]!,
    organizationId: orgId,
    role,
    permissions: permissionsForRole(role),
    organizationPermissions: permissionsForRole(role),
    sessionId: `session-${key}`,
  });

  async function addUser(key: string, role: OrgRole, status: "active" | "suspended" = "active", organizationId = orgId) {
    const [user] = await db
      .insert(users)
      .values({ name: key, email: emailOf(key), emailVerified: true, organizationId })
      .returning({ id: users.id });
    userIds[key] = user!.id;
    await db.insert(organizationMembers).values({ organizationId, userId: user!.id, role, status });
    return user!.id;
  }

  async function memberRow(key: string, organizationId = orgId) {
    const [row] = await db
      .select()
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userIds[key]!)));
    return row;
  }

  beforeAll(async () => {
    await db.insert(organizations).values([
      { id: orgId, name: `Membership ${suffix}`, domain: `membership-${suffix}.invalid` },
      { id: otherOrgId, name: `Other ${suffix}`, domain: `other-${suffix}.invalid` },
    ]);
    await db.insert(workspaces).values({ id: workspaceId, organizationId: orgId, name: "Main", slug: `main-${suffix}` });
    await addUser("owner1", "OWNER");
    await addUser("owner2", "OWNER");
    await addUser("admin", "ADMIN");
    await addUser("manager", "RFP_MANAGER");
    await addUser("suspended", "CONTRIBUTOR", "suspended");
  });

  afterAll(async () => {
    await db.delete(organizations).where(inArray(organizations.id, [orgId, otherOrgId]));
    await db.delete(users).where(inArray(users.id, Object.values(userIds)));
  });

  dbTest("only OWNER/ADMIN may grant ADMIN, even with member:* in hand", async () => {
    // A non-admin holding member permissions (the matrix does not grant this
    // today; the ceiling holds regardless).
    const manager = { ...auth("manager", "RFP_MANAGER"), permissions: permissionsForRole("ADMIN") };
    const invite = await rejection(
      service.invite(manager, { email: emailOf("would-be-admin"), role: "ADMIN", workspaceId }),
    );
    expect(invite?.response?.code).toBe("ADMIN_REQUIRED");

    const promote = await rejection(service.updateMember(manager, userIds.suspended!, { role: "ADMIN" }));
    expect(promote?.response?.code).toBe("ADMIN_REQUIRED");

    // An ADMIN may.
    const result = await service.invite(auth("admin", "ADMIN"), { email: emailOf("new-admin"), role: "ADMIN", workspaceId });
    expect(result.invitation.role).toBe("ADMIN");
    expect(sent).toContain(emailOf("new-admin"));
  });

  dbTest("a suspended member cannot be re-invited or reactivate themselves by accepting", async () => {
    const reinvite = await rejection(
      service.invite(auth("admin", "ADMIN"), { email: emailOf("suspended"), role: "VIEWER", workspaceId }),
    );
    expect(reinvite?.response?.code).toBe("MEMBER_SUSPENDED");

    // An invitation that predates the suspension must not undo it either.
    const token = randomBytes(32).toString("base64url");
    await db.insert(invitations).values({
      organizationId: orgId,
      workspaceId,
      email: emailOf("suspended"),
      role: "ADMIN",
      tokenHash: hashInvitationToken(token),
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    // Accepting normally requires no other active membership.
    const accept = await rejection(service.acceptInvitation(userIds.suspended!, token));
    expect(accept?.response?.code).toBe("MEMBER_SUSPENDED");
    expect((await memberRow("suspended"))?.status).toBe("suspended");
  });

  dbTest("two owners demoting each other at once cannot leave the organization ownerless", async () => {
    const results = await Promise.allSettled([
      service.updateMember(auth("owner1", "OWNER"), userIds.owner2!, { role: "ADMIN" }),
      service.updateMember(auth("owner2", "OWNER"), userIds.owner1!, { role: "ADMIN" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect((failure.reason as { response?: { code?: string } }).response?.code).toBe("LAST_OWNER");

    const owners = await db
      .select({ id: organizationMembers.id })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.role, "OWNER"), eq(organizationMembers.status, "active")));
    expect(owners).toHaveLength(1);
  });

  dbTest("removing a member repoints their default organization and revokes workspace access", async () => {
    const leaverId = await addUser("leaver", "CONTRIBUTOR");
    await db.insert(organizationMembers).values({ organizationId: otherOrgId, userId: leaverId, role: "VIEWER", status: "active" });
    const membership = await memberRow("leaver");
    await db.insert(workspaceMembers).values({ workspaceId, organizationMemberId: membership!.id });

    await service.removeMember(auth("admin", "ADMIN"), leaverId);

    const [user] = await db.select({ organizationId: users.organizationId }).from(users).where(eq(users.id, leaverId));
    expect(user?.organizationId).toBe(otherOrgId);
    const [workspaceMembership] = await db
      .select({ status: workspaceMembers.status })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.organizationMemberId, membership!.id));
    expect(workspaceMembership?.status).toBe("removed");
  });

  dbTest("a suspended organization grants nothing", async () => {
    const viewerId = await addUser("viewer", "VIEWER");
    const session = { userId: viewerId, sessionId: "s", activeOrganizationId: orgId, emailVerified: true };
    expect(await authService.resolveAuthContext(session)).not.toBeNull();

    await db.update(organizations).set({ status: "suspended" }).where(eq(organizations.id, orgId));
    try {
      expect(await authService.resolveAuthContext(session)).toBeNull();
      expect(await authService.resolveAuthContext({ ...session, activeOrganizationId: null })).toBeNull();
      expect((await authService.listMemberships(viewerId)).some((m) => m.organizationId === orgId)).toBe(false);
      const activate = await rejection(authService.activateOrganization(session, orgId));
      expect(activate?.response?.code).toBe("NOT_A_MEMBER");
    } finally {
      await db.update(organizations).set({ status: "active" }).where(eq(organizations.id, orgId));
    }
  });
});

describeDb("OrganizationsService invitations, seats and workspace lifecycle", () => {
  const db = shouldRunDbTests ? getDb() : (undefined as never);
  const recorder = { record: async () => undefined };
  const mailer = { sendInvitation: async () => undefined };
  const service = new OrganizationsService(db, config, recorder as never, recorder as never, mailer as never);
  const workspacesService = new WorkspacesService(db, recorder as never, recorder as never);

  const suffix = randomUUID().slice(0, 8);
  const orgId = randomUUID();
  const workspaceId = randomUUID();
  const createdUserIds: string[] = [];
  let ownerId = "";
  const emailOf = (key: string) => `${key}-${suffix}@example.invalid`;

  const owner = (): AuthContext => ({
    userId: ownerId,
    organizationId: orgId,
    role: "OWNER",
    permissions: permissionsForRole("OWNER"),
    organizationPermissions: permissionsForRole("OWNER"),
    sessionId: "owner-session",
  });

  async function verifiedUser(key: string) {
    const [user] = await db
      .insert(users)
      .values({ name: key, email: emailOf(key), emailVerified: true })
      .returning({ id: users.id });
    createdUserIds.push(user!.id);
    return user!.id;
  }

  const tokenFrom = (acceptUrl: string) => decodeURIComponent(acceptUrl.split("#token=")[1]!);

  beforeAll(async () => {
    await db.insert(organizations).values({ id: orgId, name: `Seats ${suffix}`, domain: `seats-${suffix}.invalid`, seats: 3 });
    await db.insert(workspaces).values({ id: workspaceId, organizationId: orgId, name: "Main", slug: `main-${suffix}` });
    ownerId = await verifiedUser("owner");
    await db.insert(organizationMembers).values({ organizationId: orgId, userId: ownerId, role: "OWNER", status: "active" });
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  dbTest("stores only a hash of the token, and the emailed link is what accepts", async () => {
    const { invitation, acceptUrl } = await service.invite(owner(), { email: emailOf("hashed"), role: "VIEWER", workspaceId });
    const token = tokenFrom(acceptUrl);

    const [row] = await db.select().from(invitations).where(eq(invitations.id, invitation.id));
    expect(row?.token).toBeNull();
    expect(row?.tokenHash).toBe(hashInvitationToken(token));
    expect(row?.tokenHash).not.toContain(token);

    const userId = await verifiedUser("hashed");
    const accepted = await service.acceptInvitation(userId, token);
    expect(accepted.organizationId).toBe(orgId);
  });

  dbTest("the migration's SQL hash matches the application's, so pre-existing links keep working", async () => {
    const legacyToken = randomBytes(32).toString("base64url");
    const [row] = await db.execute<{ hash: string }>(
      sql`select encode(sha256(convert_to(${legacyToken}, 'UTF8')), 'hex') as hash`,
    );
    expect(row?.hash).toBe(hashInvitationToken(legacyToken));
  });

  dbTest("resending rotates the token: the old link stops working, the new one works", async () => {
    const first = await service.invite(owner(), { email: emailOf("resend"), role: "VIEWER", workspaceId });
    const resent = await service.resendInvitation(owner(), first.invitation.id);
    expect(tokenFrom(resent.acceptUrl)).not.toBe(tokenFrom(first.acceptUrl));

    const userId = await verifiedUser("resend");
    const stale = await rejection(service.acceptInvitation(userId, tokenFrom(first.acceptUrl)));
    expect(stale?.response?.code).toBe("INVITATION_INVALID");
    const accepted = await service.acceptInvitation(userId, tokenFrom(resent.acceptUrl));
    expect(accepted.invitationId).toBe(first.invitation.id);
  });

  dbTest("enforces the seat limit, counting pending invitations, even under concurrency", async () => {
    // 3 seats: owner + "hashed" + "resend" are active members now.
    const full = await rejection(service.invite(owner(), { email: emailOf("over"), role: "VIEWER", workspaceId }));
    expect(full?.response?.code).toBe("SEAT_LIMIT_REACHED");

    await db.update(organizations).set({ seats: 4 }).where(eq(organizations.id, orgId));
    const results = await Promise.allSettled([
      service.invite(owner(), { email: emailOf("race-a"), role: "VIEWER", workspaceId }),
      service.invite(owner(), { email: emailOf("race-b"), role: "VIEWER", workspaceId }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const loser = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect((loser.reason as { response?: { code?: string } }).response?.code).toBe("SEAT_LIMIT_REACHED");
  });

  dbTest("lowering seats blocks acceptance once active members fill them", async () => {
    // One pending invitation (the race winner) exists; take the org to exactly full.
    const [pending] = await db
      .select()
      .from(invitations)
      .where(and(eq(invitations.organizationId, orgId), eq(invitations.status, "pending")));
    await db.update(organizations).set({ seats: 3 }).where(eq(organizations.id, orgId));
    const token = randomBytes(32).toString("base64url");
    await db.update(invitations).set({ tokenHash: hashInvitationToken(token) }).where(eq(invitations.id, pending!.id));

    const userId = await verifiedUser(pending!.email.split("-")[0]! + "-late");
    await db.update(users).set({ email: pending!.email }).where(eq(users.id, userId));
    const blocked = await rejection(service.acceptInvitation(userId, token));
    expect(blocked?.response?.code).toBe("SEAT_LIMIT_REACHED");
    await db.update(organizations).set({ seats: 10 }).where(eq(organizations.id, orgId));
  });

  dbTest("archiving a workspace revokes its invitations and teams, and a stale link cannot join it", async () => {
    const extraWorkspaceId = randomUUID();
    await db.insert(workspaces).values({ id: extraWorkspaceId, organizationId: orgId, name: "Side", slug: `side-${suffix}` });
    const { acceptUrl, invitation } = await service.invite(owner(), { email: emailOf("archived"), role: "VIEWER", workspaceId: extraWorkspaceId });
    const [team] = await db.insert(teams).values({ organizationId: orgId, workspaceId: extraWorkspaceId, name: "Side team" }).returning();

    await workspacesService.archive(owner(), extraWorkspaceId);

    const [revoked] = await db.select({ status: invitations.status }).from(invitations).where(eq(invitations.id, invitation.id));
    expect(revoked?.status).toBe("revoked");
    const [archivedTeam] = await db.select({ status: teams.status }).from(teams).where(eq(teams.id, team!.id));
    expect(archivedTeam?.status).toBe("archived");

    // Even if the invitation were still pending, the archived workspace refuses it.
    await db.update(invitations).set({ status: "pending" }).where(eq(invitations.id, invitation.id));
    const userId = await verifiedUser("archived");
    const blocked = await rejection(service.acceptInvitation(userId, tokenFrom(acceptUrl)));
    expect(blocked?.response?.code).toBe("INVITATION_WORKSPACE_ARCHIVED");

    const restored = await workspacesService.unarchive(owner(), extraWorkspaceId);
    expect(restored?.status).toBe("active");
  });
});

describeDb("OrganizationsService multi-organization membership", () => {
  const db = shouldRunDbTests ? getDb() : (undefined as never);
  const recorder = { record: async () => undefined };
  const mailer = { sendInvitation: async () => undefined };
  const service = new OrganizationsService(db, config, recorder as never, recorder as never, mailer as never);
  const authService = new AuthService(db, config);

  const suffix = randomUUID().slice(0, 8);
  const createdOrganizationIds: string[] = [];
  let userId = "";

  beforeAll(async () => {
    const [user] = await db
      .insert(users)
      .values({ name: "Multi", email: `multi-${suffix}@example.invalid`, emailVerified: true })
      .returning({ id: users.id });
    userId = user!.id;
  });

  afterAll(async () => {
    if (createdOrganizationIds.length > 0) {
      await db.delete(organizations).where(inArray(organizations.id, createdOrganizationIds));
    }
    await db.delete(users).where(eq(users.id, userId));
  });

  dbTest("creates an organization with a first workspace the owner can invite into", async () => {
    const first = await service.create(userId, { name: `First ${suffix}`, domain: `first-${suffix}.invalid` });
    createdOrganizationIds.push(first.id);
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, first.defaultWorkspaceId));
    expect(workspace?.organizationId).toBe(first.id);

    const owner = await authService.resolveAuthContext({ userId, sessionId: "s", activeOrganizationId: first.id, emailVerified: true });
    const invited = await service.invite(owner!, {
      email: `colleague-${suffix}@example.invalid`,
      role: "VIEWER",
      workspaceId: first.defaultWorkspaceId,
    });
    expect(invited.invitation.status).toBe("pending");
  });

  dbTest("a member of one organization can create and join others, and switch between them", async () => {
    const second = await service.create(userId, { name: `Second ${suffix}`, domain: `second-${suffix}.invalid` });
    createdOrganizationIds.push(second.id);

    const [third] = await db.insert(organizations).values({ name: `Third ${suffix}`, domain: `third-${suffix}.invalid` }).returning();
    createdOrganizationIds.push(third!.id);
    const [thirdWorkspace] = await db.insert(workspaces).values({ organizationId: third!.id, name: "Main", slug: `main-${suffix}` }).returning();
    const token = randomBytes(32).toString("base64url");
    await db.insert(invitations).values({
      organizationId: third!.id,
      workspaceId: thirdWorkspace!.id,
      email: `multi-${suffix}@example.invalid`,
      role: "CONTRIBUTOR",
      tokenHash: hashInvitationToken(token),
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    const accepted = await service.acceptInvitation(userId, token);
    expect(accepted.organizationId).toBe(third!.id);

    const memberships = await authService.listMemberships(userId);
    expect(memberships.map((m) => m.organizationId).sort()).toEqual([...createdOrganizationIds].sort());

    const inThird = await authService.resolveAuthContext({ userId, sessionId: "s", activeOrganizationId: third!.id, emailVerified: true });
    expect(inThird?.role).toBe("CONTRIBUTOR");
    const inSecond = await authService.resolveAuthContext({ userId, sessionId: "s", activeOrganizationId: second.id, emailVerified: true });
    expect(inSecond?.role).toBe("OWNER");
  });
});
