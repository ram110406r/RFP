# Web Performance Baseline

This app is optimized incrementally around runtime UX: fewer initial requests, smaller route bundles, stable layouts, and responsive queue pages.

## Route Budget

Track these routes whenever route structure, data loading, or shared shell code changes:

| Route | Request budget | First-load JS budget | LCP target | CLS target | Notes |
| --- | ---: | ---: | ---: | ---: | --- |
| `/` | <= 12 | <= 250 KB | <= 2.5s | <= 0.1 | Dashboard summary is the primary data source. |
| `/tenders` | <= 12 | <= 250 KB | <= 2.5s | <= 0.1 | Search/filter route; preserve placeholder data. |
| `/apply` | <= 8 | <= 250 KB | <= 2.5s | <= 0.1 | Must not issue per-tender package/run requests on initial load. |
| `/apply/:id` | <= 16 | documented | <= 2.5s | <= 0.1 | Workspace route may load multiple panels. |
| `/requirements` | <= 8 | <= 250 KB | <= 2.5s | <= 0.1 | Queue page; avoid per-row detail requests. |
| `/responses` | <= 8 | <= 250 KB | <= 2.5s | <= 0.1 | Queue page; avoid per-row detail requests. |
| `/reviews` | <= 8 | <= 250 KB | <= 2.5s | <= 0.1 | Queue page; avoid per-row detail requests. |
| `/submissions` | <= 8 | <= 250 KB | <= 2.5s | <= 0.1 | Uses dashboard latest package/submission summaries. |
| `/knowledge` | <= 12 | <= 250 KB | <= 2.5s | <= 0.1 | Detail panels can be lazy-loaded. |
| `/organization` | <= 14 | documented | <= 2.5s | <= 0.1 | Management modals can be lazy-loaded. |
| `/settings` | <= 12 | <= 250 KB | <= 2.5s | <= 0.1 | Reference data should use longer stale times. |

## How To Measure

1. Start the local stack with seeded data:
   ```bash
   bun run dev
   ```
2. Verify static health:
   ```bash
   cd apps/web
   bun run lint
   bun run typecheck
   ```
3. Capture bundle output:
   ```bash
   cd apps/web
   bun run build
   ```
   Record the First Load JS values from the Next.js route table.
4. Capture responsive route behavior:
   ```bash
   cd apps/web
   bun run test:e2e -- responsive.spec.ts
   ```
5. Capture request counts and Web Vitals in Chrome DevTools:
   - Disable cache.
   - Navigate directly to each route.
   - Count initial document-to-network-idle requests.
   - Record LCP and CLS from the Performance panel.

## Current Optimization Notes

- Baseline captured on 2026-09-18 with:
  ```powershell
  $env:NEXT_DIST_DIR='.next-build'; $env:NEXT_OUTPUT_STANDALONE='false'; bun run build
  ```
- Current First Load JS highlights:
  - `/`: 333 KB
  - `/tenders`: 337 KB
  - `/apply`: 335 KB
  - `/apply/:id`: 343 KB
  - `/requirements`: 333 KB
  - `/responses`: 333 KB
  - `/reviews`: 331 KB
  - `/submissions`: 327 KB
  - `/knowledge`: 331 KB
  - `/organization`: 340 KB
  - `/settings`: 334 KB
- The current app is above the 250 KB target on most authenticated routes. Treat this as the starting baseline; future optimization should focus on reducing shared authenticated-shell and route-island client bundles.
- `/apply` uses dashboard-provided latest automation/package summaries instead of per-tender run/package queries.
- `/submissions` uses dashboard-provided latest package/submission summaries instead of per-tender package/submission queries.
- React Query defaults keep stable data warm between route changes; volatile automation/package data uses shorter stale windows.
- Queue pages should prefer aggregate view models over `useQueries` fan-outs.

## Regression Rules

- Do not add queue-page `useQueries` fan-outs for per-row data on initial load.
- Document any route exceeding 250 KB First Load JS with the reason and next reduction target.
- Lazy-load panels that are below the fold or hidden behind tabs/drawers when they materially affect route bundles.
- Keep layout dimensions stable for queue rows, badges, and action columns to avoid CLS regressions.
