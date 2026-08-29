import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { timestamps } from "./_shared";
import { organizations } from "./organization";
import { users } from "./identity";
import { workspaces } from "./foundation";
import { invitations } from "./membership";

/** Backend-owned, resumable first-login state. Values are validated by the API. */
export const onboardingProgress = pgTable(
  "onboarding_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "set null" }),
    workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "set null" }),
    invitationId: uuid("invitation_id").references(() => invitations.id, { onDelete: "set null" }),
    journey: text("journey"),
    currentState: text("current_state").notNull().default("IDENTITY"),
    currentStep: integer("current_step").notNull().default(1),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    company: jsonb("company").notNull().default({}),
    profile: jsonb("profile").notNull().default({}),
    team: jsonb("team").notNull().default({}),
    rfpContext: jsonb("rfp_context").notNull().default({}),
    ...timestamps,
  },
  (t) => [uniqueIndex("onboarding_progress_user_uq").on(t.userId)],
);
