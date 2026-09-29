# Codebase Cleanup Candidates

This file records conservative follow-up refactor candidates found during the
file consolidation pass. They are active source files, so they were not moved
or deleted in the cleanup.

## Large Files To Split Later

- `apps/api/src/modules/tenders/tenders.service.ts` - split orchestration,
  document handling, AI activity, and tender persistence into focused services.
- `apps/web/components/knowledge-workspace.tsx` - split page-level state,
  filters, and repeated panels into smaller components.
- `apps/web/components/tender-workspace.tsx` - split tender list, detail,
  actions, and empty/loading states.
- `apps/web/lib/api.ts` - split API client methods by domain while keeping a
  shared request/error layer.
- `packages/db/src/seed/index.ts` - split seed data builders by bounded
  context so fixtures are easier to review.

## Exact Duplicates Kept Intentionally

- `apps/*/eslint.config.js` files remain tiny app-level entrypoints that export
  shared config from `@rfp-os/config/eslint`.
- Route-level `loading.tsx` files remain because Next.js discovers loading UI by
  filename convention.
- DB schema and relation files with the same names remain separate because they
  model different Drizzle responsibilities.
