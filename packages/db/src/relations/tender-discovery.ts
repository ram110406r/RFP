import { relations } from "drizzle-orm";

import { workspaces } from "../schema/foundation";
import { users } from "../schema/identity";
import { organizations } from "../schema/organization";
import {
  savedTenderNotices,
  tenderNoticeDocuments,
  tenderNotices,
  tenderNoticeSources,
  tenderPortals,
  tenderSourceRecords,
  tenderSyncRuns,
  tenderMatchProfiles,
  tenderSavedSearches,
  tenderSavedSearchMatches,
  tenderDiscoveryEvents,
  tenderDiscoveryDailyMetrics,
} from "../schema/tender-discovery";
import { tenders } from "../schema/tender";

export const tenderPortalsRelations = relations(tenderPortals, ({ many }) => ({
  syncRuns: many(tenderSyncRuns),
  sourceRecords: many(tenderSourceRecords),
  noticeSources: many(tenderNoticeSources),
  documents: many(tenderNoticeDocuments),
}));

export const tenderNoticesRelations = relations(tenderNotices, ({ many }) => ({
  sources: many(tenderNoticeSources),
  documents: many(tenderNoticeDocuments),
  saves: many(savedTenderNotices),
  applications: many(tenders),
}));

export const tenderSyncRunsRelations = relations(tenderSyncRuns, ({ one, many }) => ({
  portal: one(tenderPortals, { fields: [tenderSyncRuns.portalId], references: [tenderPortals.id] }),
  sourceRecords: many(tenderSourceRecords),
}));

export const tenderSourceRecordsRelations = relations(tenderSourceRecords, ({ one, many }) => ({
  portal: one(tenderPortals, { fields: [tenderSourceRecords.portalId], references: [tenderPortals.id] }),
  syncRun: one(tenderSyncRuns, { fields: [tenderSourceRecords.syncRunId], references: [tenderSyncRuns.id] }),
  noticeSources: many(tenderNoticeSources),
}));

export const tenderNoticeSourcesRelations = relations(tenderNoticeSources, ({ one }) => ({
  notice: one(tenderNotices, { fields: [tenderNoticeSources.noticeId], references: [tenderNotices.id] }),
  portal: one(tenderPortals, { fields: [tenderNoticeSources.portalId], references: [tenderPortals.id] }),
  sourceRecord: one(tenderSourceRecords, { fields: [tenderNoticeSources.sourceRecordId], references: [tenderSourceRecords.id] }),
}));

export const tenderNoticeDocumentsRelations = relations(tenderNoticeDocuments, ({ one }) => ({
  notice: one(tenderNotices, { fields: [tenderNoticeDocuments.noticeId], references: [tenderNotices.id] }),
  portal: one(tenderPortals, { fields: [tenderNoticeDocuments.portalId], references: [tenderPortals.id] }),
}));

export const savedTenderNoticesRelations = relations(savedTenderNotices, ({ one }) => ({
  organization: one(organizations, { fields: [savedTenderNotices.organizationId], references: [organizations.id] }),
  workspace: one(workspaces, { fields: [savedTenderNotices.workspaceId], references: [workspaces.id] }),
  notice: one(tenderNotices, { fields: [savedTenderNotices.noticeId], references: [tenderNotices.id] }),
  savedByUser: one(users, { fields: [savedTenderNotices.savedBy], references: [users.id] }),
}));

export const tenderMatchProfilesRelations = relations(tenderMatchProfiles, ({ one }) => ({ organization: one(organizations, { fields: [tenderMatchProfiles.organizationId], references: [organizations.id] }), updatedByUser: one(users, { fields: [tenderMatchProfiles.updatedBy], references: [users.id] }) }));
export const tenderSavedSearchesRelations = relations(tenderSavedSearches, ({ one, many }) => ({ organization: one(organizations, { fields: [tenderSavedSearches.organizationId], references: [organizations.id] }), workspace: one(workspaces, { fields: [tenderSavedSearches.workspaceId], references: [workspaces.id] }), user: one(users, { fields: [tenderSavedSearches.userId], references: [users.id] }), matches: many(tenderSavedSearchMatches) }));
export const tenderSavedSearchMatchesRelations = relations(tenderSavedSearchMatches, ({ one }) => ({ search: one(tenderSavedSearches, { fields: [tenderSavedSearchMatches.searchId], references: [tenderSavedSearches.id] }), notice: one(tenderNotices, { fields: [tenderSavedSearchMatches.noticeId], references: [tenderNotices.id] }) }));
export const tenderDiscoveryEventsRelations = relations(tenderDiscoveryEvents, ({ one }) => ({ organization: one(organizations, { fields: [tenderDiscoveryEvents.organizationId], references: [organizations.id] }), workspace: one(workspaces, { fields: [tenderDiscoveryEvents.workspaceId], references: [workspaces.id] }), user: one(users, { fields: [tenderDiscoveryEvents.userId], references: [users.id] }), notice: one(tenderNotices, { fields: [tenderDiscoveryEvents.noticeId], references: [tenderNotices.id] }) }));
export const tenderDiscoveryDailyMetricsRelations = relations(tenderDiscoveryDailyMetrics, ({ one }) => ({ organization: one(organizations, { fields: [tenderDiscoveryDailyMetrics.organizationId], references: [organizations.id] }), workspace: one(workspaces, { fields: [tenderDiscoveryDailyMetrics.workspaceId], references: [workspaces.id] }) }));
