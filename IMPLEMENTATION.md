# RFP OS — Implementation Phases

Status of the enterprise frontend prototype build, tracked against the sequencing
defined in `.lovable/plan/rfp-os-enterprise-frontend-prototype-2026-08-19.md`.

## Phase 1 — Design tokens, font, app shell, navigation, command palette, primitives

**Status: Complete**

- Design tokens in `src/styles.css` (oklch, warm off-white surfaces, deep
  teal-green accent, semantic success/warning/danger/info tokens).
- Inter font loaded via Google Fonts link tags in `src/routes/__root.tsx`.
- Domain model in `src/types/index.ts`, extended with Settings-related types
  (`OrgProfile`, `MemberSetting`, `RoleSetting`, `AiSetting`,
  `IntegrationSetting`, `NotificationPreference`, `ApiKeySetting`,
  `McpConnection`).
- App shell: `src/components/layout/`
  - `app-shell.tsx` — composes sidebar + topbar + command palette + toaster.
  - `app-sidebar.tsx` / `sidebar-nav.tsx` — collapsible desktop sidebar,
    reused inside a mobile `Sheet`.
  - `app-topbar.tsx` — breadcrumbs, search trigger, notifications, account menu.
  - `breadcrumbs.tsx` — reads entity titles out of the TanStack Query cache.
  - `command-palette.tsx` — Cmd/Ctrl+K palette over RFPs, requirements,
    customers, knowledge, people, quick actions.
  - `notification-center.tsx` — popover grouped by category, mark read/all.
- Shared primitives: `src/components/common/` (status/risk/freshness badges,
  confidence meter, metric tile, progress strip, evidence card, activity
  timeline, page header, page skeleton, empty/error states, confirm dialog,
  sticky summary, person avatar, tone tokens).

## Phase 2 — Mock data + query layer

**Status: Complete**

- `src/data/*` — typed mock datasets: people, RFPs (8, every status),
  requirements (52 across 3 RFPs), evidence (18), knowledge sources (8, with
  claims/versions/conflicts), reviews (15), activity feed, validation
  issues/categories, submission versions, notifications (12), analytics
  snapshot, org/settings data. RFP aggregate stats (progress, risk counts,
  readiness) are derived from the requirements array rather than hand-entered,
  so the dashboard and workspace numbers stay internally consistent.
- `src/lib/api/*` — one file per entity, each exporting:
  - async accessor functions (simulated network delay via `lib/api/client.ts`)
  - `queryOptions()` factories for use in route loaders + `useSuspenseQuery`
  - mutation functions for the interactive flows (approve/reject/request
    changes, assign reviewer, edit/regenerate answer, create RFP, generate
    submission package, mark notifications read)
  - This is the seam: swapping mocks for a real NestJS API means editing only
    `src/lib/api/*`.

## Phase 3 — Dashboard, RFPs, New RFP

**Status: Complete**

- `/` — Dashboard: greeting header, 5 metric tiles, pipeline table, Attention
  Required panel (derived from critical risk + upcoming deadlines + overdue
  reviews), recent activity timeline.
- `/rfps` — list with search, status filter, sort.
- `/rfps/new` — long-form page (React Hook Form + Zod): basic information,
  drag-and-drop upload with simulated per-file processing, source/questionnaire
  mode picker, processing-preference toggles, sticky summary with a live
  readiness checklist, Create RFP / Save draft.

## Phase 4 — Workspace, requirement detail, reviews

**Status: Complete**

- `/rfps/$rfpId` — shell layout (header, tabs: Workspace / Validation /
  Submission) wrapping:
  - `/rfps/$rfpId/` (index) — progress strip, filterable/sortable requirement
    table, sticky intelligence panel (readiness ring, risk distribution,
    weakest categories).
  - `/rfps/$rfpId/requirements/$reqId` — deep-linkable drawer over the
    workspace (shared `WorkspaceBody` + `RequirementDetailSheet`): AI answer
    editor (edit/regenerate/copy), evidence cards, confidence bar, risk
    rationale, review panel (approve/reject/request changes/assign), activity
    timeline.
- `/reviews` — prioritized queue with mine/all and status filters, overdue
  flagging.
- `/reviews/$reviewId` — side-by-side review workspace: question/answer/
  evidence/risk on the left, reviewer actions/comments/approval history on
  the right.

## Phase 5 — Knowledge, validation, submission

**Status: Complete**

- `/knowledge` — source list with freshness/authority badges, search + filters.
- `/knowledge/$sourceId` — tabs: overview, claims, versions, usage, conflicts
  (with recommended-authority resolution).
- `/rfps/$rfpId/validation` — readiness dial, clickable category breakdown
  (deep-links back into the workspace with pre-applied filters via URL search
  params), issues grouped Critical/High/Medium/Low with reason + recommended
  action.
- `/rfps/$rfpId/submission` — version selector, checklist, generated
  artifacts list, Generate Submission Package + Preview dialog.

## Phase 6 — Analytics, settings, notifications, polish

**Status: Complete**

- `/analytics` — 8 KPI tiles (with directional delta coloring) + 6 Recharts
  charts: RFP volume, win/loss, risk distribution (status-colored donut),
  AI draft acceptance, completion time trend, SME review load.
- `/settings` — 11 tabs: Profile, Org, Members, Roles, AI, Knowledge,
  Integrations, Notifications, Security, API, MCP (MCP shown as a read-only
  backend status view, per the stack note).
- `/submissions` — bonus aggregate view backing the sidebar's "Submissions"
  nav item (not in the original route list, added for nav completeness).
- Empty/loading/error states present on every data surface (`PageSkeleton`,
  `EmptyState`, `ErrorState`).
- Responsive pass: sidebar → icon rail → mobile sheet; sticky summaries stack
  on small screens; tables scroll horizontally where needed.

## Verification performed

- `tsc --noEmit` — clean (project uses strict mode incl.
  `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`).
- `eslint .` — zero errors (only pre-existing warnings in vendored shadcn/ui
  files, unrelated to this work).
- `bun run dev` — booted successfully; every route was curled and confirmed
  to return `200` with real server-rendered content (not an error boundary
  fallback).
- Not yet click-tested end-to-end in a live browser session by an agent —
  pending manual testing.

## Known simplifications (prototype scope)

- Mutations update in-memory mock arrays; there is no persistence across a
  server restart.
- `RequirementTable` filter deep-links from Validation only support a single
  value per field (e.g. "risk" links to `high` or `critical`, not both) —
  a minor simplification of the URL-search-param filter schema.
- Settings toggles (AI, Knowledge, Integrations, Notifications) are optimistic
  local state only; nothing is persisted back through `src/lib/api`.
