import { notificationPreferences, notifications, type Database } from "@rfp-os/db";
import { and, eq } from "drizzle-orm";

type NotificationInsert = typeof notifications.$inferInsert;
type NotificationCategory = NonNullable<NotificationInsert["category"]>;

/**
 * Inserts a notification unless an identical one (same recipient, entity,
 * title and detail) already exists. Scheduled jobs re-run on every window, so
 * without this a daily sweep would re-notify the same thing every day.
 *
 * Callers put what should re-alert into `detail` (e.g. "expires in 7 days"):
 * a new detail is a new notification, the same detail is not.
 */
export async function insertNotificationOnce(
  db: Database,
  values: NotificationInsert & { userId: string; relatedEntityType: string; relatedEntityId: string },
): Promise<boolean> {
  const [existing] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.organizationId, values.organizationId),
        eq(notifications.userId, values.userId),
        eq(notifications.relatedEntityType, values.relatedEntityType),
        eq(notifications.relatedEntityId, values.relatedEntityId),
        eq(notifications.title, values.title),
        eq(notifications.detail, values.detail ?? ""),
      ),
    )
    .limit(1);
  if (existing) return false;
  await db.insert(notifications).values(values);
  return true;
}

/** An org can switch a category's in-app notifications off; absent means on. */
export async function inAppEnabled(db: Database, organizationId: string, category: NotificationCategory): Promise<boolean> {
  const [preference] = await db
    .select({ inApp: notificationPreferences.inApp })
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.organizationId, organizationId), eq(notificationPreferences.category, category)))
    .limit(1);
  return preference?.inApp !== false;
}
