import { sql } from "drizzle-orm";

import { closeDb, getDb } from "./client";

async function main() {
  const db = getDb();
  try {
    const before = await db.execute(sql`
      select count(*)::int as count
      from onboarding_progress progress
      where progress.completed = false
        and exists (
          select 1 from organization_members member
          join workspace_members workspace_member on workspace_member.organization_member_id = member.id
          join workspaces workspace on workspace.id = workspace_member.workspace_id
          where member.user_id = progress.user_id
            and member.status = 'active'
            and workspace_member.status = 'active'
            and workspace.status = 'active'
        )
    `);

    const updated = await db.execute(sql`
      update onboarding_progress progress
      set journey = coalesce(progress.journey, 'COMPANY'),
          current_state = 'COMPLETE',
          current_step = greatest(progress.current_step, 4),
          completed = true,
          completed_at = coalesce(progress.completed_at, now()),
          updated_at = now()
      where progress.completed = false
        and exists (
          select 1 from organization_members member
          join workspace_members workspace_member on workspace_member.organization_member_id = member.id
          join workspaces workspace on workspace.id = workspace_member.workspace_id
          where member.user_id = progress.user_id
            and member.status = 'active'
            and workspace_member.status = 'active'
            and workspace.status = 'active'
        )
      returning progress.id
    `);

    const after = await db.execute(sql`
      select count(*)::int as count
      from onboarding_progress progress
      where progress.completed = false
        and exists (
          select 1 from organization_members member
          join workspace_members workspace_member on workspace_member.organization_member_id = member.id
          join workspaces workspace on workspace.id = workspace_member.workspace_id
          where member.user_id = progress.user_id
            and member.status = 'active'
            and workspace_member.status = 'active'
            and workspace.status = 'active'
        )
    `);

    console.log(`[onboarding-backfill] eligible before: ${before[0]?.count ?? 0}`);
    console.log(`[onboarding-backfill] rows updated: ${updated.length}`);
    console.log(`[onboarding-backfill] eligible after: ${after[0]?.count ?? 0}`);
  } finally {
    await closeDb();
  }
}

main().catch((error: unknown) => {
  console.error("[onboarding-backfill] failed", error);
  process.exit(1);
});
