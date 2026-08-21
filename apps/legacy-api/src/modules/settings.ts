import { Elysia, t, type TSchema } from "elysia";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  apiKeys,
  configToggles,
  integrations,
  mcpConnections,
  notificationPreferences,
  organizations,
  roles,
  users,
} from "../db/schema";
import { requireAuth } from "../lib/auth";
import { badRequest, notFound } from "../lib/errors";

function serializeToggle(t: typeof configToggles.$inferSelect) {
  return {
    id: t.id,
    label: t.label,
    description: t.description,
    kind: t.kind,
    value: t.value,
    options: t.options ?? undefined,
    max: t.max ?? undefined,
  };
}

export const settingsModule = new Elysia({ prefix: "/api/settings" })
  .get("/org", async ({ headers }) => {
    const auth = await requireAuth(headers);
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, auth.organizationId));
    if (!org) throw notFound("Organization", auth.organizationId);
    const seatsUsed = (
      await db.select().from(users).where(eq(users.organizationId, auth.organizationId))
    ).length;
    return {
      name: org.name,
      domain: org.domain,
      plan: org.plan,
      seats: org.seats,
      seatsUsed,
      industry: org.industry ?? "",
      logoInitials: org.logoInitials ?? org.name.slice(0, 2).toUpperCase(),
    };
  })
  .patch(
    "/org",
    async ({ headers, body }) => {
      const auth = await requireAuth(headers);
      await db
        .update(organizations)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(organizations.id, auth.organizationId));
      return { updated: true };
    },
    { body: t.Object({ name: t.Optional(t.String()), industry: t.Optional(t.String()) }) },
  )
  .get("/members", async ({ headers }) => {
    const auth = await requireAuth(headers);
    const rows = await db.select().from(users).where(eq(users.organizationId, auth.organizationId));
    return {
      items: rows.map((u) => ({
        id: u.id,
        personId: u.id,
        email: u.email,
        role: u.memberRole,
        status: u.status,
        lastActive: (u.lastActiveAt ?? u.createdAt).toISOString(),
      })),
    };
  })
  .patch(
    "/members/:id",
    async ({ headers, params, body }) => {
      const auth = await requireAuth(headers);
      const rows = await db.select().from(users).where(eq(users.id, params.id)).limit(1);
      if (!rows[0] || rows[0].organizationId !== auth.organizationId)
        throw notFound("Member", params.id);
      await db
        .update(users)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(users.id, params.id));
      return { updated: true };
    },
    {
      body: t.Object({
        memberRole: t.Optional(
          t.Union(
            ["Admin", "Proposal Manager", "Contributor", "Reviewer", "Viewer"].map((r) =>
              t.Literal(r),
            ) as TSchema[],
          ),
        ),
        status: t.Optional(
          t.Union(["active", "invited", "suspended"].map((s) => t.Literal(s)) as TSchema[]),
        ),
      }),
    },
  )
  .get("/roles", async ({ headers }) => {
    const auth = await requireAuth(headers);
    const roleRows = await db
      .select()
      .from(roles)
      .where(eq(roles.organizationId, auth.organizationId));
    const memberRows = await db
      .select()
      .from(users)
      .where(eq(users.organizationId, auth.organizationId));
    return {
      items: roleRows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        memberCount: memberRows.filter((m) => m.roleId === r.id).length,
        permissions: [] as string[],
      })),
    };
  })
  .get("/api-keys", async ({ headers }) => {
    const auth = await requireAuth(headers);
    const rows = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.organizationId, auth.organizationId));
    return {
      items: rows.map((k) => ({
        id: k.id,
        label: k.label,
        prefix: k.prefix,
        createdAt: k.createdAt.toISOString().slice(0, 10),
        lastUsed: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
        scopes: k.scopes as string[],
      })),
    };
  })
  .post(
    "/api-keys",
    async ({ headers, body }) => {
      const auth = await requireAuth(headers);
      const [key] = await db
        .insert(apiKeys)
        .values({
          organizationId: auth.organizationId,
          label: body.label,
          prefix: `rfpos_live_${Math.random().toString(36).slice(2, 6)}`,
          scopes: body.scopes ?? ["read"],
        })
        .returning();
      if (!key) throw badRequest("Could not create API key.");
      return {
        id: key.id,
        label: key.label,
        prefix: key.prefix,
        createdAt: key.createdAt.toISOString().slice(0, 10),
      };
    },
    { body: t.Object({ label: t.String(), scopes: t.Optional(t.Array(t.String())) }) },
  )
  .get("/integrations", async ({ headers }) => {
    const auth = await requireAuth(headers);
    const rows = await db
      .select()
      .from(integrations)
      .where(eq(integrations.organizationId, auth.organizationId));
    return {
      items: rows.map((i) => ({
        id: i.id,
        name: i.name,
        category: i.category,
        connected: i.connected,
        description: i.description,
        lastSynced: i.lastSyncedAt ? i.lastSyncedAt.toISOString() : null,
      })),
    };
  })
  .patch(
    "/integrations/:id",
    async ({ headers, params, body }) => {
      const auth = await requireAuth(headers);
      const rows = await db
        .select()
        .from(integrations)
        .where(eq(integrations.id, params.id))
        .limit(1);
      if (!rows[0] || rows[0].organizationId !== auth.organizationId)
        throw notFound("Integration", params.id);
      await db
        .update(integrations)
        .set({
          connected: body.connected,
          lastSyncedAt: body.connected ? new Date() : rows[0].lastSyncedAt,
        })
        .where(eq(integrations.id, params.id));
      return { updated: true };
    },
    { body: t.Object({ connected: t.Boolean() }) },
  )
  .get("/notification-preferences", async ({ headers }) => {
    const auth = await requireAuth(headers);
    const rows = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.organizationId, auth.organizationId));
    return {
      items: rows.map((p) => ({
        id: p.id,
        category: p.category,
        label: p.label,
        email: p.email,
        inApp: p.inApp,
        digest: p.digest,
      })),
    };
  })
  .patch(
    "/notification-preferences/:id",
    async ({ headers, params, body }) => {
      const auth = await requireAuth(headers);
      const rows = await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.id, params.id))
        .limit(1);
      if (!rows[0] || rows[0].organizationId !== auth.organizationId)
        throw notFound("Notification preference", params.id);
      await db
        .update(notificationPreferences)
        .set(body)
        .where(eq(notificationPreferences.id, params.id));
      return { updated: true };
    },
    {
      body: t.Object({
        email: t.Optional(t.Boolean()),
        inApp: t.Optional(t.Boolean()),
        digest: t.Optional(t.Boolean()),
      }),
    },
  )
  .get("/mcp", async ({ headers }) => {
    const auth = await requireAuth(headers);
    const rows = await db
      .select()
      .from(mcpConnections)
      .where(eq(mcpConnections.organizationId, auth.organizationId));
    return {
      items: rows.map((m) => ({
        id: m.id,
        name: m.name,
        transport: m.transport,
        status: m.status,
        toolsExposed: m.toolsExposed,
        description: m.description,
      })),
    };
  })
  .get("/ai", async ({ headers }) => {
    const auth = await requireAuth(headers);
    const rows = await db
      .select()
      .from(configToggles)
      .where(
        and(eq(configToggles.organizationId, auth.organizationId), eq(configToggles.group, "ai")),
      )
      .orderBy(configToggles.sortOrder);
    return { items: rows.map(serializeToggle) };
  })
  .get("/knowledge", async ({ headers }) => {
    const auth = await requireAuth(headers);
    const rows = await db
      .select()
      .from(configToggles)
      .where(
        and(
          eq(configToggles.organizationId, auth.organizationId),
          eq(configToggles.group, "knowledge"),
        ),
      )
      .orderBy(configToggles.sortOrder);
    return { items: rows.map(serializeToggle) };
  })
  .patch(
    "/toggles/:id",
    async ({ headers, params, body }) => {
      const auth = await requireAuth(headers);
      const rows = await db
        .select()
        .from(configToggles)
        .where(eq(configToggles.id, params.id))
        .limit(1);
      if (!rows[0] || rows[0].organizationId !== auth.organizationId)
        throw notFound("Setting", params.id);
      await db
        .update(configToggles)
        .set({ value: body.value })
        .where(eq(configToggles.id, params.id));
      const [updated] = await db
        .select()
        .from(configToggles)
        .where(eq(configToggles.id, params.id));
      if (!updated) throw notFound("Setting", params.id);
      return serializeToggle(updated);
    },
    { body: t.Object({ value: t.Union([t.Boolean(), t.Number(), t.String()]) }) },
  );
