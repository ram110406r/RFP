-- Custom roles are retired: their write endpoints answer 410 Gone and
-- permission resolution reads only the fixed role matrix. Remove leftover
-- assignments so a stale row can never widen access again (for example when
-- a removed member is re-invited and their old membership row is reused).
-- The role definitions themselves are kept for the audit trail.
DELETE FROM "workspace_member_roles";--> statement-breakpoint
DELETE FROM "organization_member_roles";
