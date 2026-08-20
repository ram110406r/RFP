# RFP OS — Enterprise Frontend Prototype

A complete, production-quality frontend for an AI-powered RFP Operating System: calm, light-first, enterprise SaaS (Linear/Vercel feel), built entirely on mock data with a clean seam for a real API later.

## Stack note

TanStack Start + TanStack Router are the prototype framework (Next.js cannot run on this platform). They are treated as the routing shell only: no business logic is coupled to the router, URLs match the intended Next.js App Router paths exactly, and all backend communication stays behind `src/lib/api/*` so a production NestJS service can be swapped in without UI changes. MCP stays a backend concern — Settings shows a UI representation only. Stack: React, TypeScript, Tailwind v4, shadcn/ui, Lucide, TanStack Query, React Hook Form + Zod, Recharts.

## Design system

- Warm off-white background, white surfaces, near-black text, muted gray secondary, subtle cool-gray borders.
- Accent: sophisticated deep teal-green. Semantic-only color for status / risk / confidence / completion.
- Typography: Inter (loaded via a link tag in the root route). Strong headings, compact readable body.
- Radius: 10-12px controls, 14-18px panels. Very subtle shadows, borders and surface contrast do the work.
- All tokens defined in `src/styles.css` (oklch) — no hardcoded colors in components.

## App shell

- Collapsible left sidebar: RFP OS mark, Dashboard, RFPs, Knowledge, Reviews, Submissions, Analytics, Settings; footer with org switcher, user, help.
- Top bar: breadcrumbs, search / command palette trigger (Cmd+K), notifications popover, org/user menus.
- Desktop-first, responsive down to mobile: sidebar collapses to icons then to a sheet; sticky summaries become bottom drawers; multi-column collapses to one.

## Routes

```text
/                         Dashboard (operating console)
/rfps                     RFP list + filters/sort
/rfps/new                 Long-form New RFP + sticky summary
/rfps/$rfpId              Workspace (requirements) + sticky intelligence panel
/rfps/$rfpId/requirements/$reqId   Requirement detail (drawer + deep link)
/rfps/$rfpId/validation   Submission readiness
/rfps/$rfpId/submission   Versions, checklist, package generation
/knowledge                Sources list + freshness/authority
/knowledge/$sourceId      Detail: overview, claims, evidence, versions, usage, conflicts
/reviews                  Review queue
/reviews/$reviewId        Side-by-side review workspace
/analytics                Metrics + restrained charts
/settings                 Profile, Org, Members, Roles, AI, Knowledge, Integrations, Notifications, Security, API, MCP
```

## Screens (highlights)

- **Dashboard**: greeting header + "+ New RFP"; five metric tiles (active, due this week, awaiting review, high-risk requirements, submission readiness); pipeline table (RFP, customer, owner, progress, risk, deadline, status); Attention Required action panel; recent activity timeline.
- **New RFP**: single long-form page (no wizard) — Basic Information, drag-and-drop Upload with per-file processing rows, Source/Questionnaire (upload / URL / web / import), Processing Preferences toggles; sticky RFP Summary with readiness checklist, Create RFP + Save draft. Validated with React Hook Form + Zod.
- **RFP Workspace**: header with title, customer, deadline, status, Review/Export/More; compact progress strip (82% · 282/347 · 17 high risk · 48 needs review); requirement table with search, filters (category/risk/status/owner), sort; rich rows with ID, title, category, mandatory, risk, confidence, status, owner; row click opens the detail panel.
- **Requirement detail**: AI Draft answer editor (Edit / Regenerate / Copy), evidence cards with verification date, freshness, confidence, source link; confidence bar; risk block with rationale; review panel (Approve / Reject / Request Changes / Assign); activity timeline.
- **Knowledge & detail**: source rows with type, version, authority, freshness badges (Fresh/Aging/Stale/Conflicting), owner, last verified; detail tabs plus usage stats and a conflict block with recommended authority.
- **Reviews**: prioritized queue with filters; review workspace side-by-side (question/answer/evidence/risk left, reviewer actions, comments, approval history right), optimized for fast throughput.
- **Validation**: readiness dial + category breakdown, each clickable to filter the workspace; issues grouped Critical/High/Medium/Low with reason and recommended action.
- **Submission**: version selector, checklist, generated artifacts list, Generate Submission Package + Preview.
- **Analytics**: eight KPIs plus a small set of clean charts (volume, win/loss, risk distribution, acceptance rate, completion time, SME performance) via Recharts.
- **Command palette** (Cmd/Ctrl+K) over RFPs, requirements, customers, knowledge, answers, evidence, people, with quick actions.
- **Notifications center** grouped by Reviews, Assignments, Risks, Deadlines, Knowledge, Submissions.

## Shared components

Sidebar, Topbar, PageHeader, StatusBadge, RiskBadge, FreshnessBadge, ConfidenceMeter, ProgressStrip, MetricTile, EvidenceCard, RequirementRow/Table, AnswerEditor, ReviewPanel, ActivityTimeline, DataTable (sortable/filterable), FilterBar, StickySummary, Drawer/Sheet wrappers, CommandPalette, NotificationCenter, EmptyState, Skeletons, ErrorState, ConfirmDialog, Sonner toasts.

## Data layer

- `src/data/*` typed mock datasets (rfps, requirements, evidence, knowledge, reviews, activity, analytics, notifications, settings).
- `src/lib/api/*` async accessors returning promises, consumed through TanStack Query `queryOptions` in loaders + `useSuspenseQuery` in components; mutations via `useMutation` with optimistic local state and toasts. Swapping mocks for a real API means changing only `src/lib/api/*`.

## Quality

Semantic HTML, keyboard navigation and visible focus rings, accessible dialogs/labels, screen-reader text on status indicators, per-route `head()` metadata, skeletons and error states on every data surface.

## Sequencing

1. Design tokens, font, app shell, navigation, command palette, primitives.
2. Mock data + query layer.
3. Dashboard, RFPs, New RFP.
4. Workspace, requirement detail, reviews.
5. Knowledge, validation, submission.
6. Analytics, settings, notifications, empty/loading/error polish and responsive pass.
