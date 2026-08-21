import { Elysia, t } from "elysia";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { activities } from "../db/schema";
import { requireAuth } from "../lib/auth";

export const activitiesModule = new Elysia({ prefix: "/api/activities" }).get(
  "/",
  async ({ headers, query }) => {
    const auth = await requireAuth(headers);
    const rows = await db
      .select()
      .from(activities)
      .where(eq(activities.organizationId, auth.organizationId))
      .orderBy(desc(activities.createdAt))
      .limit(query.limit ? Number(query.limit) : 25);
    return {
      items: rows
        .filter((a) => !query.rfpId || a.rfpId === query.rfpId)
        .map((a) => ({
          id: a.id,
          at: a.createdAt.toISOString(),
          kind: a.kind,
          label: a.label,
          actor: a.actorLabel,
          rfpId: a.rfpId ?? undefined,
        })),
    };
  },
  { query: t.Object({ rfpId: t.Optional(t.String()), limit: t.Optional(t.String()) }) },
);
