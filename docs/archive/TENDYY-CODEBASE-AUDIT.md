# TENDYY Codebase Audit

## 1. Executive Summary

The repository already contains a substantial product core: a Next.js frontend in `apps/web`, a NestJS backend in `apps/api`, a shared Drizzle schema in `packages/db`, Redis/BullMQ worker infrastructure, object storage helpers, and a permission model. The active stack is not a blank slate.

The main issue is not absence of code. It is duplication and boundary drift:

- The current product stack is `apps/web` + `apps/api`; the previous prototype web/API stack has been removed.
- The database contains both `tender_*` tables and `rfp_*` tables, which overlap conceptually.
- Identity is split across Firebase client auth, Better Auth on the backend, and a persisted `users` table.
- The frontend is mostly API-backed, but some screens still use demo/fallback data or local-only state.
- The Knowledge area has real backend tables, but the UI still mixes real data with demo content and AI-style preview behavior.

Bottom line:

- What exists today is functional enough to support a baseline backend.
- What is missing is canonical domain ownership and a clean removal plan for duplicated legacy concepts.
- The next backend phase should not add new features; it should standardize the core model and retire the duplicate stack boundaries.

## 2. Current Architecture

### Active stack

- `apps/web`: Next.js 15 frontend for the current product.
- `apps/api`: NestJS backend with versioned `/api/v1` routes.
- `packages/db`: Drizzle schema, migrations, seed, reset, and shared database client.
- `apps/worker`: BullMQ worker process for document parsing and requirement extraction.
- `packages/jobs`: shared job contracts and queue names.
- `packages/storage`: S3-compatible object storage abstraction.
- `packages/ai`: AI provider/router abstraction.
- `packages/authorization`: in-process authorization rules and policy evaluation.
- `packages/types`: shared platform and domain types.
- `packages/validation`: validation helpers.
- `packages/ui`: shared UI primitives.
- `packages/observability`: logger helpers.

### Removed Prototype Stack

- Previous TanStack Start/Vite frontend: removed.
- Previous Elysia backend: removed.

### Repo configuration

- Monorepo workspace setup in root `package.json`.
- Turborepo pipeline in `turbo.json`.
- Environment files at `.env`, `.env.example`, `.env.production`.

## 3. Repository Inventory

| Name | Location | Purpose | Status | Used By | Dependencies | Keep / Modify / Remove |
|---|---|---|---|---|---|---|
| Current web app | `apps/web` | Active product UI | Functional | End users | `apps/api`, Firebase, shared packages | Keep, modify |
| Current API | `apps/api` | Canonical backend | Functional to mostly functional | `apps/web`, worker | DB, auth, jobs, storage, AI | Keep, modify |
| Database package | `packages/db` | Schema, migrations, seed | Functional | API, worker, MCP | Postgres/Drizzle | Keep, modify |
| Worker | `apps/worker` | Document parsing and extraction | Functional | API/job pipeline | Redis, storage, DB, jobs | Keep, modify |
| Jobs package | `packages/jobs` | Queue contracts | Functional | API, worker | BullMQ | Keep |
| Storage package | `packages/storage` | S3-compatible file access | Functional | API, worker | AWS SDK/S3 | Keep |
| AI package | `packages/ai` | AI provider/router abstraction | Partially implemented | API | Provider integrations | Keep, isolate |
| Authorization package | `packages/authorization` | Permission and policy logic | Functional | API | Shared permission types | Keep |
| Types package | `packages/types` | Shared platform/domain types | Functional | Many packages | None | Keep |
| Validation package | `packages/validation` | Zod/validation helpers | Functional | API, web | Zod | Keep |
| UI package | `packages/ui` | Shared UI primitives | Functional | Web apps | React | Keep |
| Observability package | `packages/observability` | Logging helpers | Functional | API, worker | Pino | Keep |
| Previous web app | Removed | Old frontend stack | Retired | None | Old API, TanStack Start | Removed |
| Previous API | Removed | Old backend stack | Retired | None | Elysia, old DB schema | Removed |
| Root scripts/config | `package.json`, `turbo.json` | Workspace orchestration | Functional | Entire repo | Bun/Turbo | Keep |

## 4. Frontend Audit

| Page | UI | Real Data | API | Mock Data | Functional | Action |
|---|---|---|---|---|---|---|
| `/` | Yes | Yes | Yes | Some fallback pipeline values | Mostly functional | Keep and refine |
| `/tenders` | Yes | Yes | Yes | Local-only saved/tracked state | Functional | Persist or explicitly scope local-only features |
| `/tenders/[id]` | Yes | Yes | Yes | No obvious mock data | Functional | Keep |
| `/tenders/new` | Yes | Yes | Yes | No obvious mock data | Functional | Clarify naming vs RFP intent |
| `/apply` | Yes | Yes | Yes | No obvious mock data | Functional | Keep |
| `/apply/[id]` | Yes | Yes | Yes | No obvious mock data | Functional | Keep |
| `/pipeline` | Yes | Yes | Yes | No obvious mock data | Functional | Keep |
| `/knowledge` | Yes | Partial | Yes | Yes, demo fallback content exists | Partial | Remove demo fallback from production paths |
| `/knowledge/[id]` | Yes | Partial | Yes | Some fallback behavior possible | Partial | Keep, tighten data contract |
| `/organization` | Yes | Yes | Yes | Minimal fallback text only | Mostly functional | Keep, reduce overlap with workspace/settings |
| `/settings` | Yes | Yes | Yes | Several tab panels are mostly static | Partial | Convert visual tabs to clearer routes or explicit section state |
| `/profile` | Yes | Partial | Mixed | Uses Firebase/Firestore directly | Partial | Move to backend-owned profile persistence |
| `/workspace` | Yes | Yes | Yes | Minimal fallback text only | Mostly functional | Keep, reduce overlap with organization |
| `/reviews` | Yes | Likely yes | Likely yes | Not deeply audited here | Partial | Verify against response workflow |
| `/submissions` | Yes | Likely yes | Likely yes | Not deeply audited here | Partial | Verify against response workflow |
| `/onboarding` | Yes | Yes | Yes | State-driven flows only | Functional | Keep |

## 5. Backend Audit

### Current backend modules

| Module | Status | Notes |
|---|---|---|
| Auth | Functional | Better Auth routes plus session-scoped endpoints |
| Organizations | Functional | Current org, invite, member management |
| Workspaces | Functional | Workspace CRUD and membership |
| Roles | Functional | Role catalog and assignments |
| Teams | Functional | Team CRUD and membership |
| Policies | Functional | ABAC-style policy engine and rules |
| Dashboard | Functional | Aggregates tender, knowledge, and evidence data |
| Tenders | Functional to mostly functional | Large domain surface: search, detail, questions, requirements, answers, reviews, sources, validation, submit, export |
| RFP | Functional but legacy-aligned | Older response-centric domain still present in schema and services |
| Knowledge | Functional to partial | Real CRUD/summary, but product semantics still evolving |
| Documents | Functional | Document upload, listing, versioning, download, deletion |
| Activities | Functional | Shared activity feed |
| Audits | Functional | Audit log exposure |
| Assignments | Functional | Assignment workflow |
| Onboarding | Functional | Guided setup and invitation acceptance |
| Health | Functional | Readiness/liveness endpoints |
| Infrastructure | Functional | DB, events, queue, storage, logger, AI modules |

### Backend risks

- `tenders` and `rfps` overlap conceptually and should not both be treated as first-class long-term models.
- Some AI routes are real, but the repo should not treat AI as the source of truth for domain data.
- Auth/session boundaries are split between Better Auth, Firebase client auth, and database identity rows.

## 6. Database Audit

### Identity and tenancy

| Table | Purpose | Referenced By | Status | Keep / Modify / Remove |
|---|---|---|---|---|
| `organizations` | Tenancy root | Users, memberships, tenders, knowledge, platform tables | Production ready | Keep |
| `users` | Global identity record | Auth, memberships, tenders, knowledge, files | Functional | Keep, modify |
| `roles` | Org-scoped custom roles | Members, roles API | Functional | Keep |
| `permissions` | Global permission catalog | Role permissions | Functional | Keep |
| `role_permissions` | Role to permission mapping | Roles module | Functional | Keep |
| `organization_members` | Canonical org membership | Workspace/team membership, auth | Functional | Keep |
| `invitations` | Pending org membership invite | Onboarding, org APIs | Functional | Keep |
| `workspace_members` | Workspace membership | Workspace APIs | Functional | Keep |
| `team_members` | Team membership | Team APIs | Functional | Keep |
| `organization_member_roles` | Member to custom role | Policy/roles | Functional | Keep |
| `workspace_member_roles` | Workspace member to role | Workspace policy layer | Functional | Keep |

### Workspace and foundation

| Table | Purpose | Referenced By | Status | Keep / Modify / Remove |
|---|---|---|---|---|
| `workspaces` | Operational workspace unit | Tenders, memberships, onboarding | Functional | Keep |
| `teams` | Team grouping within workspace/org | Membership, invites | Functional | Keep |
| `assignments` | Generic assignment model | Assignments module | Functional | Keep |

### Tender domain

| Table | Purpose | Referenced By | Status | Keep / Modify / Remove |
|---|---|---|---|---|
| `tenders` | Current discovery/opportunity record | Web app, dashboard, pipeline, tender APIs | Functional | Keep, canonicalize |
| `tender_status_history` | Tender status transitions | Tender service, pipeline history | Functional | Keep |
| `tender_questions` | Tender questions | Tender/apply/detail | Functional | Keep |
| `tender_requirements` | Tender requirements | Tender/apply/detail | Functional | Keep |
| `tender_question_requirements` | Question to requirement link | Tender workflow | Functional | Keep |
| `tender_answers` | Tender answers | Tender workflow | Functional | Keep |
| `tender_answer_versions` | Answer version history | Tender workflow | Functional | Keep |
| `tender_answer_evidence` | Answer evidence links | Tender workflow | Functional | Keep |
| `tender_validation_runs` | Validation snapshots | Tender workflow | Functional | Keep |
| `tender_answer_reviews` | Review records | Tender workflow | Functional | Keep |
| `tender_documents` | Uploaded tender documents | Document module | Functional | Keep |
| `tender_sources` | Tender source records | Upload/parse flow | Functional | Keep |

### RFP domain

| Table | Purpose | Referenced By | Status | Keep / Modify / Remove |
|---|---|---|---|---|
| `rfps` | Legacy response/workflow record | Legacy web/API, some backend services | Functional but duplicated | Keep for now, migrate later |
| `rfp_collaborators` | RFP collaborators | Legacy RFP flow | Functional | Keep |
| `rfp_documents` | RFP source docs | Legacy document flow | Functional | Keep |
| `rfp_requirements` | Legacy requirements model | Legacy response flow | Functional | Keep |
| `rfp_answers` | Legacy answers model | Legacy response flow | Functional | Keep |
| `rfp_evidence` | Legacy evidence model | Legacy response flow | Functional | Keep |
| `rfp_risks` | Legacy risk model | Legacy response flow | Functional | Keep |
| `rfp_reviews` | Legacy review model | Legacy response flow | Functional | Keep |
| `rfp_assignments` | Legacy assignment model | Legacy response flow | Functional | Keep |
| `rfp_submissions` | Submission records | Legacy response flow | Functional | Keep |
| `rfp_submission_checklist_items` | Submission checklist | Legacy response flow | Functional | Keep |
| `rfp_submission_artifacts` | Submission artifacts | Legacy response flow | Functional | Keep |
| `rfp_outcomes` | Win/loss outcomes | Legacy response flow | Functional | Keep |
| `rfp_team_assignments` | Team assignment in lifecycle | Legacy response flow | Functional | Keep |
| `rfp_status_history` | Legacy lifecycle history | Legacy response flow | Functional | Keep |

### Knowledge domain

| Table | Purpose | Referenced By | Status | Keep / Modify / Remove |
|---|---|---|---|---|
| `knowledge_sources` | Shared knowledge records | Knowledge APIs, dashboard, tender evidence | Functional | Keep |
| `knowledge_claims` | Extracted claims | Knowledge APIs | Functional | Keep |
| `knowledge_versions` | Version history | Knowledge APIs | Functional | Keep |
| `knowledge_conflicts` | Conflict tracking | Knowledge APIs | Partial | Keep |
| `knowledge_conflict_variants` | Conflict variants | Knowledge APIs | Partial | Keep |

### Platform and operational tables

| Table | Purpose | Referenced By | Status | Keep / Modify / Remove |
|---|---|---|---|---|
| `activities` | Activity feed | Dashboard, org, knowledge, backend events | Functional | Keep |
| `audit_logs` | Audit trail | Audits API | Functional | Keep |
| `notifications` | Notification feed | Settings/dashboard | Functional | Keep |
| `api_keys` | API key registry | Settings/API management | Partial | Keep |
| `integrations` | Integration registry | Settings/integrations | Partial | Keep |
| `notification_preferences` | Notification preferences | Settings | Functional | Keep |
| `mcp_connections` | MCP connections | Platform settings | Partial | Keep |
| `config_toggles` | Feature/config toggles | Settings | Partial | Keep |

### Files and extraction

| Table | Purpose | Referenced By | Status | Keep / Modify / Remove |
|---|---|---|---|---|
| `files` | File registry | Documents, storage, evidence | Functional | Keep |
| `document_versions` | Versioned file content | Document module | Functional | Keep |
| `document_extractions` | Parsed document extractions | Worker, document APIs | Functional | Keep |
| `document_pages` | Parsed page records | Worker | Functional | Keep |
| `document_tables` | Parsed table records | Worker | Functional | Keep |
| `document_blocks` | Parsed text blocks | Worker | Functional | Keep |
| `requirement_extractions` | Requirement extraction jobs/results | Worker | Functional | Keep |
| `requirement_candidates` | Candidate requirement records | Worker | Functional | Keep |
| `requirement_candidate_sources` | Source linkage for candidates | Worker | Functional | Keep |

### Organization extras

| Table | Purpose | Referenced By | Status | Keep / Modify / Remove |
|---|---|---|---|---|
| `customers` | Customer/org reference data | RFP schema | Functional | Keep |
| `projects` | Minimal project grouping | RFP schema | Partial | Keep or defer |

## 7. API Audit

### Current API surface

| Route Group | Implementation | Frontend Consumer | Status | Keep / Modify / Remove |
|---|---|---|---|---|
| `/api/auth/*` | Better Auth handler | `apps/web` auth gate | Functional | Keep |
| `/api/v1/auth/me` | Session summary | `apps/web` auth/session UI | Functional | Keep |
| `/api/v1/auth/memberships` | Membership list | Workspace/session UIs | Functional | Keep |
| `/api/v1/auth/organizations/:id/activate` | Switch active org | Auth/session UI | Functional | Keep |
| `/api/v1/organizations/current` | Current org | Org/settings/workspace/profile | Functional | Keep |
| `/api/v1/organizations/current/members` | Org members | Org/settings/workspace | Functional | Keep |
| `/api/v1/organizations/current/invitations` | Org invites | Org/settings/workspace | Functional | Keep |
| `/api/v1/workspaces` | Workspace list | Workspace page | Functional | Keep |
| `/api/v1/teams` | Team list | Org/workspace pages | Functional | Keep |
| `/api/v1/roles` | Role catalog | Org/workspace pages | Functional | Keep |
| `/api/v1/audits` | Audit logs | Org/workspace pages | Functional | Keep |
| `/api/v1/activities` | Activity feed | Dashboard/org/knowledge/pipeline | Functional | Keep |
| `/api/v1/dashboard/summary` | Aggregate dashboard data | Dashboard, knowledge, workspace, settings | Functional | Keep |
| `/api/v1/tenders` | Tender list/create | Tender search, apply, pipeline, dashboard | Functional | Keep |
| `/api/v1/tenders/dashboard` | Tender summary | Dashboard and derived screens | Functional | Keep |
| `/api/v1/tenders/:id` | Tender detail | Tender detail/apply/pipeline | Functional | Keep |
| `/api/v1/tenders/:id/questions` | Tender questions | Tender workspace | Functional | Keep |
| `/api/v1/tenders/:id/requirements` | Tender requirements | Tender workspace | Functional | Keep |
| `/api/v1/tenders/:id/answers` | Tender answers | Tender workspace | Functional | Keep |
| `/api/v1/tenders/:id/reviews` | Tender reviews | Tender workspace | Functional | Keep |
| `/api/v1/tenders/:id/sources` | Tender sources | Tender workspace | Functional | Keep |
| `/api/v1/tenders/:id/validation` | Validation state | Tender workspace | Functional | Keep |
| `/api/v1/tenders/:id/submit` | Submission action | Tender workflow | Functional | Keep |
| `/api/v1/tenders/:id/approve` | Approval action | Tender workflow | Functional | Keep |
| `/api/v1/documents/*` | Document operations | Tender/RFP document flows | Functional | Keep |
| `/api/v1/knowledge` | Knowledge CRUD/list | Knowledge page | Functional | Keep |
| `/api/v1/onboarding/*` | Onboarding flow | Onboarding page | Functional | Keep |

### Legacy API surface

The removed prototype API exposed overlapping modules for RFPs, requirements, reviews, assignments, knowledge, notifications, activities, analytics, submissions, and settings. That historical duplication is now retired; the active NestJS API is the production backend surface.

## 8. Authentication Audit

### What exists

- Backend auth uses Better Auth and session-scoped endpoints.
- `users`, `organization_members`, and `workspace_members` form the data-side identity and tenancy model.
- Backend guards enforce permissions and tenant scoping.
- The frontend uses Firebase Auth for browser session restoration.
- The profile page writes directly to Firebase Auth and Firestore.

### Findings

- Identity is split across at least three layers:
  - Better Auth sessions/accounts on the backend.
  - Firebase Auth on the frontend.
  - PostgreSQL `users` and membership tables as the app identity source.
- This is workable for prototyping, but it is not a clean canonical identity model.
- The `dev-login` route exists for local development and is correctly disabled in production.

### Recommendation

The canonical identity model should be:

- one user record in Postgres,
- one session/auth provider on the backend,
- one membership/role model for tenancy,
- frontend auth should consume that backend model rather than write directly to Firestore.

## 9. Organization / Workspace Audit

### Current boundary

- `organization` is the tenancy root in the database.
- `workspace` is the operational scope.
- The backend schema reflects that separation reasonably well.

### Problems

- The frontend still duplicates many org/workspace concepts across `/organization`, `/workspace`, and `/settings`.
- Both pages expose members, roles, plans, teams, and settings-like content.
- This makes the distinction feel UI-driven rather than domain-driven.

### Recommendation

- `Organization` should own company-wide identity, membership, billing, and access control.
- `Workspace` should own operational scope, active work, and workflow data.
- `Profile` should only own the current user.

## 10. Tender Domain Audit

### What exists

- `tenders` is the active discovery/opportunity model in the current stack.
- It has:
  - source type,
  - status,
  - owner,
  - deadline,
  - history,
  - questions,
  - requirements,
  - answers,
  - evidence,
  - reviews,
  - documents,
  - sources,
  - validation,
  - submission/approval actions.

### What works

- List/search/detail/apply/pipeline views are API-backed.
- Dashboard metrics are aggregated from tender data.
- Background document parsing and requirement extraction exist.

### What is missing or partial

- No clear external tender-source integration is visible in the current code.
- "Live" language in the UI should not be read as an actual external sync guarantee.
- Saved/tracked tenders on the search page are local-only `localStorage` state.

### Recommendation

Treat `tenders` as the current canonical discovery entity. Do not create a separate tender source system until there is an actual integration need.

## 11. Apply / RFP Audit

### What exists

- The current `Apply` and tender workspace UI is powered by `tenders`, not by the legacy `rfps` stack.
- It supports the workflow:
  - tender -> questions -> requirements -> answers -> evidence -> review -> approval -> submission.
- The tender workspace has real backend hooks for brief, analysis, validation, sources, answers, reviews, and evidence.

### Conflicts

- The database still contains a separate `rfp` family of tables and routes.
- `tenders/new` is semantically an RFP intake/create flow, which is confusing relative to the `tenders` route name.

### Recommendation

- Use `tenders` as the upstream discovery/opportunity record.
- Use one canonical response workspace model for the response process.
- Keep the legacy `rfp_*` tables for now, but do not build new backend features on them.

## 12. Requirement / Question / Answer / Evidence Audit

### Current model

- Active tender domain:
  - `tender_questions`
  - `tender_requirements`
  - `tender_question_requirements`
  - `tender_answers`
  - `tender_answer_versions`
  - `tender_answer_evidence`
  - `tender_answer_reviews`
  - `tender_validation_runs`

- Legacy RFP domain:
  - `rfp_requirements`
  - `rfp_answers`
  - `rfp_evidence`
  - `rfp_reviews`

### Assessment

- The core conceptual chain exists in the active tender schema.
- The legacy RFP schema duplicates the same business idea with different table names and different lifecycle vocabulary.
- Evidence freshness and verification are represented, but not yet as a deeply normalized decision model.

### Recommendation

- Canonicalize on one response model.
- Preserve versioning and evidence linkage.
- Do not introduce new parallel tables for the same concept.

## 13. Pipeline Audit

### Current state

- Pipeline is a real domain, not just frontend state.
- It is derived from tender status and status history.
- The active pipeline stages are:
  - intake
  - answering
  - review
  - approval
  - ready
  - submitted

### What is supported

- Stage transition
- Stage history
- Owner
- Team context
- Risk
- Deadline
- Progress/readiness
- Activity feed
- Next action via validation/review context

### Problems

- There is no dedicated pipeline table; pipeline is a derived view over tender status.
- The frontend presents pipeline as if it were a first-class kanban domain, but the backend model is really status-driven.

### Recommendation

Keep pipeline as a derived operational view unless a separate stage model becomes necessary later.

## 14. Knowledge Brain Audit

### What exists

- `knowledge_sources`, `knowledge_claims`, `knowledge_versions`, `knowledge_conflicts`, `knowledge_conflict_variants`.
- Backend list, summary, create, update, approve, and archive routes.
- Frontend knowledge page and detail page.

### What is real

- Knowledge records are real backend entities.
- Knowledge is tied into dashboard and activity data.
- It is not just a static page.

### What is partial or mock

- The knowledge UI still includes `DEMO_*` fallback content and recommendations.
- Search/Ask Brain behavior is partly product preview behavior, not a mature knowledge engine.
- There is no clear production vector search / OpenSearch / pgvector implementation in the active code path yet.

### Recommendation

- Keep the knowledge domain.
- Remove or isolate demo fallbacks from production paths.
- Do not assume AI retrieval is the source of truth for knowledge.

## 15. AI / Agent Audit

### What exists

- `packages/ai` abstraction.
- AI routes/services in `apps/api`.
- Tender answer generation, improvement, and analysis routes.
- Tender AI prompt files and grounding-related tests.

### Assessment

- AI is present, but it is an assistive layer.
- The codebase should not make AI the owner of tender/RFP truth.
- The current state is closer to "AI tooling exists" than "AI automation platform".

### Recommendation

- Keep AI isolated behind domain services.
- Do not build autonomous agents, autonomous submission, or AI-first domain ownership yet.

## 16. Event / Activity Audit

### What exists

- `activities` and `audit_logs` tables.
- API activity and audit modules.
- Backend event infrastructure modules.
- Document/domain events and queue processing.

### Assessment

- There is a shared event/activity direction, but no fully mature real-time event bus in the product UI.
- Activity appears in dashboard, organization, knowledge, and pipeline contexts.

### Recommendation

- Keep one canonical activity/audit model.
- Avoid building a second parallel event system.
- Do not add realtime transport until a concrete use case needs it.

## 17. Mock Data Audit

### Confirmed mock or fallback content

- `apps/web/components/knowledge-workspace.tsx` has `DEMO_*` arrays and fallback usage rows.
- `apps/web/components/dashboard-workspace.tsx` has a `fallbackPipeline`.
- `apps/web/app/tenders/page.tsx` uses `localStorage` for saved/tracked tenders.
- Some settings/profile fields are visually supported but not backend-owned yet.

### Not mock, but still not ideal

- `apps/web/app/profile/page.tsx` writes directly to Firebase Auth and Firestore.
- That is real data mutation, but it is not aligned with the backend ownership model.

### Recommendation

- Keep demo/fallback data only in explicit loading or empty-state pathways.
- Remove any demo data from normal production reads.

## 18. Duplication Audit

| Duplicate concept | Current models | Where used | Problem | Canonical recommendation |
|---|---|---|---|---|
| User vs Member | `users`, `organization_members`, Firebase user | Auth, org, profile | Identity is split | One `users` record plus membership rows |
| Organization vs Workspace | `organizations`, `workspaces` | Org, workspace, settings | UI overlap and boundary blur | Org = company admin, workspace = operational scope |
| Tender vs Opportunity | `tenders` and pipeline UI language | Dashboard, apply, pipeline | Naming is mostly consistent but still drifting | Use `tenders` as discovery/opportunity |
| RFP vs Application | `rfps` vs tender workspace | Legacy vs current stack | Two response models exist | One canonical response workspace; legacy RFP stays transitional |
| Question vs Requirement | `tender_questions`, `tender_requirements`, `rfp_requirements` | Tender/apply | Similar concepts split by source | Keep question/requirement linkage, one canonical response model |
| Answer vs Response | `tender_answers`, `rfp_answers` | Tender/RFP workflows | Parallel answer models | Canonical answer model only |
| Evidence vs Knowledge | `tender_answer_evidence`, `knowledge_sources` | Apply/knowledge | Related but not the same | Knowledge is reusable source of truth; evidence links answers to sources |
| Activity vs Event | `activities`, events infra | Dashboard, backend | Duplicated conceptual layer | One canonical activity/audit approach |
| Status vs Stage | status enums and pipeline stage mapping | Tender, RFP, pipeline | Derived/duplicate state language | Status is persisted; stage is a derived presentation layer unless later justified |

## 19. Legacy Code Audit

### Removed Prototype Stack

- The previous frontend application has been removed.
- The previous backend application has been removed.
- Historical behavior should be recovered from git history when needed, not from duplicate live code.

### Other legacy signals

- `packages/db` retains `rfp_*` tables and older lifecycle concepts for compatibility and migration planning.
- Some comments in schema files explicitly describe deprecated values or prototype-era columns.

### Recommendation

- Keep compatibility schema until migration planning is explicit.
- Stop extending older RFP concepts except where active product routes still require them.
- Remove remaining compatibility tables only after exported data and active usage are verified.

## 20. Security Audit

### Positive findings

- Global auth guard and permissions guard exist in the Nest API.
- Tenant scoping is enforced in backend auth and authorization helpers.
- `helmet`, throttling, request IDs, and structured logging are present.
- Storage access uses presigned S3 URLs rather than proxying raw files through the API.

### Risks

- Frontend profile writes directly to Firebase/Firestore, bypassing the backend model.
- Multiple auth/identity systems increase the chance of inconsistent access control.
- Legacy API/frontend duplicate the surface area, increasing maintenance and security review burden.

### Recommendation

- Keep the current guard and storage approach.
- Reduce the number of identity entry points.
- Re-audit auth boundaries before production backend expansion.

## 21. Data Ownership Audit

| Entity | Owner / tenancy key | Notes |
|---|---|---|
| User | `users.id`, plus membership rows | Global identity, not tenant-owned in isolation |
| Organization | `organization_id` | Tenancy root |
| Workspace | `workspace_id` | Operational scope |
| Tender | `organization_id`, `workspace_id`, `owner_id` | Current upstream opportunity record |
| Application / response workspace | likely `tender_id` / `rfp_id` | Currently represented by tender workspace or legacy RFP rows |
| Requirement | `tender_id` or `rfp_id` | Response unit that should belong to one canonical response domain |
| Question | `tender_id` | Upstream question set |
| Answer | `tender_id`, question/requirement link | Must stay tied to the response workspace |
| Evidence | source-linked, org-scoped | Should remain provenance-aware |
| Knowledge | `organization_id`, `owner_id` | Shared reusable source layer |
| Pipeline item | `tender_id` | Derived from tender state |
| Activity | `organization_id`, optionally `workspace_id` | Shared event/activity log |
| Notification | `organization_id`, `user_id` | User-facing operational message |

## 22. Canonical Domain Map

Proposed canonical model after validation against the codebase:

Organization
  -> Workspaces
     -> Members / Teams / Roles / Permissions
     -> Tenders
        -> Sources / Documents
        -> Response Workspace
           -> Requirements
           -> Questions
           -> Answers
           -> Evidence
           -> Reviews
           -> Submission
        -> Pipeline state / history
     -> Knowledge
     -> Notifications / Integrations / API Keys / Settings
  -> Audits / Activities

Profile
  -> User

Notes:

- Keep `tenders` as the current upstream opportunity record.
- Keep the response workspace as one canonical model.
- Treat `rfp_*` as legacy until migration planning is explicit.

## 23. Keep / Modify / Remove / Defer Matrix

| Area | Current State | Keep | Modify | Remove | Reason |
|---|---|---|---|---|---|
| Active web app | Functional | Yes | Yes | No | It is the current product UI |
| Active API | Functional | Yes | Yes | No | Canonical backend surface |
| Database schema | Rich but duplicated | Yes | Yes | No | Needs canonicalization, not deletion |
| Removed prototype web/API | Duplicate stack | No | No | Complete | Deleted after active stack verification |
| Tender domain | Mostly functional | Yes | Yes | No | Core workflow already exists |
| RFP legacy domain | Functional but duplicate | Short-term | Yes | Not yet | Needed for compatibility, but not canonical |
| Knowledge Brain | Partial | Yes | Yes | No | Useful domain, but demo/fallbacks remain |
| AI routes | Experimental but useful | Yes | Yes | No | Keep as assistant layer only |
| Events/activity | Partial | Yes | Yes | No | Useful, but do not overbuild |
| Profile Firestore writes | Inconsistent | No | Yes | Eventually | Bypasses backend ownership model |
| Saved/tracked tenders localStorage | Local-only | Maybe | Yes | Not necessarily | Decide whether these are intentional client prefs |
| Settings tabs | Mixed static and live | Yes | Yes | No | UI exists, but some tabs need clearer ownership |

## 24. Critical Blockers

1. There is no single canonical domain model yet for tender vs RFP vs response workspace.
2. Identity/auth is split between Firebase, Better Auth, and Postgres user rows.
3. The active frontend still contains demo/fallback pathways that should not be mistaken for product truth.
4. Legacy stack duplication makes it easy to implement the same feature twice.
5. Profile persistence bypasses the backend ownership model.

## 25. Backend Readiness Scores

Scoring:

- 0 = nonexistent
- 1 = concept only
- 2 = schema/UI placeholder
- 3 = partially functional
- 4 = mostly functional
- 5 = production-ready

| Domain | Score | Why |
|---|---|---|
| Authentication | 3 | Real auth exists, but identity is split across Firebase, Better Auth, and DB rows |
| Organization | 4 | Org CRUD, members, invites, and roles exist |
| Workspace | 4 | Workspace CRUD and membership exist |
| Tender | 4 | Core tender API and schema are substantial |
| Tender Search | 4 | Search/listing works, but some filters are local-only or disabled |
| Tender Detail | 4 | Detail/workspace data is real and API-backed |
| Application | 3 | Functional, but still closely tied to tender workspace naming and model drift |
| RFP | 2 | Exists, but looks like a legacy parallel model rather than the future canonical one |
| Requirements | 4 | Core requirement flow is implemented |
| Questions | 4 | Core question flow is implemented |
| Answers | 4 | Answer versioning, evidence, and reviews exist |
| Evidence | 4 | Evidence linkage and freshness concepts exist |
| Pipeline | 4 | Real, but derived from tender status rather than a dedicated pipeline entity |
| Knowledge Brain | 3 | Real records exist, but UI still includes demo/fallback behavior and AI gaps |
| Events | 2 | Event infrastructure exists, but not yet a mature canonical platform event model |
| Notifications | 3 | Schema exists, but UI/backend completeness is partial |
| Dashboard | 4 | Aggregated summary exists and is driven by live data |
| Settings | 3 | Good coverage, but multiple sections are still more UI than backend product surface |
| Profile | 2 | Useful UI, but persistence is split and not backend-canonical |

## 26. Recommended Cleanup Order

1. Keep removed prototype stack out of the workspace.
2. Decide the canonical identity and tenancy model.
3. Resolve tender vs RFP domain ownership.
4. Remove demo/fallback content from production paths.
5. Consolidate duplicated org/workspace/profile responsibilities.
6. Standardize backend persistence for profile and settings.
7. Keep one shared activity/audit model.
8. Then expand the backend domain services only on top of the canonical model.

## 27. Recommended Backend Build Order

1. Canonical identity and tenancy.
2. Tender discovery and tender detail as the upstream domain.
3. Single response workspace model with requirements, questions, answers, evidence, and reviews.
4. Submission and pipeline derivation.
5. Knowledge reuse and provenance.
6. Notifications, activities, and audits.
7. Search and indexing improvements.
8. AI assistance only after the source-of-truth model is stable.

## 28. "Do Not Build Yet" List

- Advanced autonomous AI agents.
- Autonomous submission flows.
- Duplicate search systems.
- Duplicate knowledge systems.
- New microservices.
- Premature real-time infrastructure.
- Separate analytics service.
- Speculative integrations that do not map to existing user workflows.
- Any new backend table that duplicates an existing domain concept.

## 29. Final Recommendation

The repository is not missing a backend. It is missing a clean canonical boundary. The correct next step is to stabilize the domain model and retire the duplicate stack surfaces before adding new backend features.

CURRENT STATE

TENDYY already has a real active frontend, a substantial Nest backend, a working database schema, workers, auth, storage, and permission infrastructure. The duplicate prototype frontend/backend pair has been removed; duplicate domain concepts remain in the older `rfp_*` model.

REMOVE

Remove from the architecture plan: do not reintroduce the duplicate prototype stack, do not keep adding new parallel models for the same business concept, and do not let demo/fallback content masquerade as product behavior.

MODIFY

Modify the canonical identity, tenancy, and response-workspace boundaries. Tighten the frontend so profile/settings/knowledge are backend-owned where they need to be, and reduce org/workspace overlap.

KEEP

Keep the active web app, the active API, the tender domain, the organization/workspace foundations, the document worker, and the shared permission/auth/storage infrastructure.

DEFER

Defer advanced AI agents, autonomous submission, duplicate search/knowledge systems, realtime platform work, and any new microservices.

MISSING

What is still missing is one canonical source of truth for the response workflow, one identity model, a clean retirement plan for `rfp_*` duplication, and a production-grade knowledge/search strategy.

BACKEND FOUNDATION

Implement the canonical user/organization/workspace/tender/response domain first, then attach knowledge, evidence, activity, notifications, and AI assistance to that stable base.

NEXT STEP

Write the canonical domain model decision and migration plan before adding any new backend endpoints.
