import { Elysia } from "elysia";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { notifications } from "../db/schema";
import { requireAuth } from "../lib/auth";
import { notFound } from "../lib/errors";

export const notificationsModule = new Elysia({ prefix: "/api/notifications" })
  .get("/", async ({ headers }) => {
    const auth = await requireAuth(headers);
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, auth.userId))
      .orderBy(desc(notifications.createdAt));
    return {
      items: rows.map((n) => ({
        id: n.id,
        category: n.category,
        title: n.title,
        detail: n.detail,
        at: n.createdAt.toISOString(),
        read: n.read,
        severity: n.severity,
      })),
    };
  })
  .patch("/read-all", async ({ headers }) => {
    const auth = await requireAuth(headers);
    await db
      .update(notifications)
      .set({ read: true })
      .where(and(eq(notifications.userId, auth.userId), eq(notifications.read, false)));
    return { updated: true };
  })
  .patch("/:id", async ({ headers, params }) => {
    const auth = await requireAuth(headers);
    const rows = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, params.id), eq(notifications.userId, auth.userId)))
      .limit(1);
    if (!rows[0]) throw notFound("Notification", params.id);
    await db.update(notifications).set({ read: true }).where(eq(notifications.id, params.id));
    return { updated: true };
  });
