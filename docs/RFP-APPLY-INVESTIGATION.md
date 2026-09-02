# TENDYY RFP Apply Investigation

## Status

Investigation complete. No new `rfp-apply` module, route, migration, or table is
required for the current foundation phase.

## Executive Decision

The active product workflow is tender-centered:

```text
Tender
  -> Questions / Requirements
  -> Answers / Answer Versions
  -> Evidence
  -> Reviews / Approval
  -> Validation
  -> Submission / Export
```

`RFP` and `Tender` are parallel representations, not parent and child records.
The current Next.js UI calls `/api/v1/tenders` and related endpoints. The NestJS
application now registers the tender domain but does not register the legacy
`rfp` or `documents` controllers.

The legacy RFP model cannot be deleted yet because extraction, audit, seed, and
worker code still reference `rfps`, `rfp_documents`, and related tables.

## Architecture Map

| Apply capability | Canonical owner | Current evidence | Status |
| --- | --- | --- | --- |
| Intake | `TendersService` | `POST /tenders`, tender source upload intent | Available for document/manual intake |
| Questions | Tender schema/service | `tenderQuestions`, tender question endpoints | Available |
| Requirements | Tender schema/service | `tenderRequirements`, requirement endpoints | Available |
| Document sources | Tender source flow | `tenderSources`, `tenderDocuments`, object storage | Available |
| Parsing | Worker and source parsing flow | BullMQ jobs, document parsers, source parse endpoint | Partial; extraction coverage remains limited |
| Knowledge retrieval | Evidence services | `EvidenceRetrievalService`, knowledge module | Available for evidence search |
| Answer generation | Tender AI services | `AnswerGenerationService`, `TenderAiService`, `ModelRouter` | Available; provider-backed with non-production fallback |
| Evidence selection | Tender evidence services | ranking, retrieval, and selection services | Available |
| Risk/readiness | Tender analysis and validation | answer analysis, validation snapshot, readiness fields | Available but some values remain derived/seeded |
| Human review | Tender review flow | `tenderAnswerReviews`, review create/update endpoints | Available |
| Finalization | Tender lifecycle and answer rules | answer status rules and approval checks | Available |
| Submission | Tender service | approve, submit, validation, export methods | Backend available; UI coverage needs verification |
| Audit/activity | Platform services | `AuditService`, `ActivityService` | Available |
| Tenant security | Global API security | `AuthContext`, auth guard, permissions guard, policies | Required on every new endpoint |

## Model Relationship

There is no foreign-key relationship from `tenders` to `rfps` or from `rfps` to
`tenders`. They have overlapping concepts but different ownership, status
vocabularies, fields, and child tables.

The active model is `tenders` because:

- The active UI routes are `/tenders`, `/apply/:id`, `/reviews`, and related
  tender workspace routes.
- The active client calls `/api/v1/tenders/...` for questions, requirements,
  answers, sources, reviews, analysis, validation, and submission.
- `TendersModule` contains the active controllers and services.
- The old RFP controllers are not registered in `apps/api/src/app.module.ts`.

The old RFP model is compatibility-only until its data and worker dependencies
are migrated.

## Reuse Matrix

RFP Apply must orchestrate these existing components instead of duplicating
them:

| Responsibility | Reuse |
| --- | --- |
| Authentication | `AuthGuard`, `AuthContext`, existing Firebase/Better Auth integration |
| Authorization | `PermissionsGuard`, permission catalog, `PolicyService` |
| Tender access | `TendersService` and tender DTO validation |
| Lifecycle | Tender state machine and `TendersService.transition` |
| Sources and storage | Tender source methods, `ObjectStorage`, source DTOs |
| Parsing jobs | `packages/jobs`, BullMQ, `apps/worker` document processors |
| Knowledge | `KnowledgeService` and knowledge APIs |
| Retrieval/ranking | `EvidenceRetrievalService`, `EvidenceRankingService`, `EvidenceSelectionService` |
| AI | `TenderAiService`, `AnswerGenerationService`, `ModelRouter` |
| Reviews | Tender review methods and `tenderAnswerReviews` |
| Validation | Tender validation methods and `tenderValidationRuns` |
| Submission | Tender approval, submit, and export methods |
| Audit | `AuditService` |
| Activity/events | `ActivityService`, event publisher, queue infrastructure |

## Orchestration Decision

A future `rfp-apply` module is justified only as a thin coordination layer. It
should use `tenderId` as its primary identifier and should not introduce
parallel question, answer, evidence, review, submission, or document tables.

Its responsibility should be limited to:

- Coordinating multi-step operations across existing tender services
- Returning aggregate progress for the Apply UI
- Enforcing idempotency for retried orchestration requests
- Recording orchestration-level audit/activity events
- Dispatching long-running work to existing queues
- Reporting partial failure and resumable progress

It must not own AI generation, evidence retrieval, authorization, storage,
database access from controllers, or independent lifecycle semantics.

### Progress state decision

Do not add a workflow table initially. Progress can be derived from the tender,
source, question, requirement, answer, review, validation, and submission
records already stored.

A workflow table should be introduced only if a later requirement needs durable
execution state that cannot be reconstructed, such as resumable bulk generation,
per-step retry history, or external submission callbacks. That table should be
an orchestration job record keyed by `tenderId`, not a replacement domain model.

### Initial Foundation Implemented

The first tender-based foundation is registered at `/api/v1/rfp-apply`:

- `GET /:tenderId/progress` derives intake, analysis readiness, response, review,
  validation, approval, and submission progress from the existing tender overview.
- `POST /:tenderId/run` coordinates analysis, bounded answer generation, and validation.
  Generation is capped at ten requirements per request and reports item-level failures.
- `FULL` stops after validation and explicitly leaves human review and approval to the
  existing canonical `/tenders/:id/approve` and `/tenders/:id/submit` endpoints.
- No new tables, queues, AI provider contracts, or duplicate lifecycle endpoints were
  added. All tenant, policy, and phase-specific permission checks remain in
  `TendersService`.

This first implementation intentionally derives progress from current records. It does
not claim durable cross-instance idempotency; a workflow table should be added only when
durable retries, external callbacks, or long-running asynchronous orchestration require
that state.

## Cutoff Inventory

### Delete after deployment verification

- `apps/legacy-web`
- `apps/legacy-api`
- Legacy Docker/deployment entries and package metadata
- Legacy-only environment and port documentation
- Historical documentation that presents the legacy stack as active

### Retire after migration and data verification

- `apps/api/src/modules/rfp`
- `apps/api/src/modules/documents`
- `packages/db/src/schema/rfp.ts`
- `packages/db/src/schema/rfp-lifecycle.ts`
- RFP-specific relations and extraction dependencies
- RFP-only migrations, only after production export and reference checks

### Retain

- `apps/web`, `apps/api`, and `apps/worker`
- Tender schema, service, controllers, AI, evidence, validation, and lifecycle
- Organizations, workspaces, teams, roles, policies, onboarding, auth, audit,
  activity, jobs, storage, validation, types, and observability packages
- Existing additive migrations and regression tests

### Alter

- Replace RFP terminology with tender terminology in active UI/API contracts
- Keep legacy terminology only in migration and compatibility documentation
- Add dedicated UI/API coverage for submission, assignment, extraction, and
  online questionnaire workflows when those features are product requirements
- Keep deterministic AI fallback limited to development/test behavior

### Investigate before implementing

- Whether `/reviews`, `/submissions`, and `/analytics` require dedicated APIs
  instead of dashboard aggregates
- Tender-level assignment APIs for requirement ownership and reviewers
- Online questionnaire intake and browser/portal integration
- Durable bulk analysis/generation progress
- Migration of worker extraction from `rfp_documents` to tender sources
- Final authentication ownership between Firebase browser sessions and backend
  Better Auth/dev-login paths

## Security Requirements

Every future Apply endpoint must:

- Resolve organization and workspace from authenticated context
- Ignore client-supplied organization ownership claims
- Scope every tender and child-resource lookup to the authenticated tenant
- Use existing permission decorators and policy checks
- Record state-changing operations in audit/activity services
- Prevent generation, review, evidence access, and submission across tenants

## Validation Findings

- The active monorepo typecheck passes across all workspace packages.
- Focused tender AI, answer-generation, evidence, lifecycle, and grounding tests
  pass.
- Live database tests cannot complete when PostgreSQL is unavailable.
- The broad Bun/Nest controller test suite still has an existing decorator
  loading error and should be isolated or corrected before relying on it as an
  end-to-end gate.
- Legacy applications remain in the workspace and therefore still participate
  in the root typecheck graph.
- Worker and database extraction code still directly references legacy RFP
  document tables, blocking safe schema deletion.

## Next Implementation Phase

The smallest safe implementation is a tender-based Apply foundation that adds
only orchestration/progress behavior if the UI needs it. It should be built
after confirming the required submission and online questionnaire flows, with
contract tests for tenant isolation, idempotency, partial failure, and resume
behavior.
