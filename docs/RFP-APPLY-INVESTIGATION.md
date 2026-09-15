# TENDYY RFP Apply implementation

Updated: 2026-09-07. This document supersedes the earlier foundation investigation.

## Current workflow

Tender intake -> PDF/DOCX parsing -> requirement candidates -> human acceptance ->
queued preparation -> answer review -> validation -> package creation -> package
approval -> external submission acknowledgement.

The tender domain remains canonical. Legacy `rfps` and `rfp_documents` are retained
for existing worker/data compatibility; Apply does not create duplicate response tables.

## Preparation execution

`POST /api/v1/rfp-apply/:tenderId/runs` persists a QUEUED run and returns without
waiting for AI generation. `FULL` on the compatibility `/run` endpoint also schedules
work and preserves its requested generation limit. Other explicit phases remain synchronous.

`ApplyRunnerService` runs in the API process and polls PostgreSQL every two seconds.
It claims one run per instance with `FOR UPDATE SKIP LOCKED`, a random ownership token,
and a two-minute lease renewed every fifteen seconds. Expired RUNNING leases (including
legacy rows with no lease) are eligible for recovery. Restart the API normally; no
manual status repair or Redis preparation job is required.

Requesting-user permissions are resolved from current membership before execution.
Execution checks role/workspace permissions and resource policies. No session credentials
or permission snapshots are persisted. Cancelled or expired executions cannot commit an
answer through the guarded write transaction. Evidence and SME assignment writes also
use the guard. A provider call already in flight may finish, but its result is discarded
if the execution no longer owns the run. Concurrent human answer edits are preserved.

Run list responses include steps and item outcomes. The UI polls active runs, displays
partial failures, allows cancellation, and refreshes response data when execution ends.
Creation is serialized per tender. Reusing a completed idempotency key returns that run;
reusing a key with different configuration is rejected. Recovery skips successful items.

## Review and submission invariants

- Ordinary answer create/update calls cannot set APPROVED. FINAL requires an explicit,
  current approved review. Reviews bind a server-generated digest of answer text and source.
- Changed answer content or evidence invalidates review/package approval. Comment-only
  review edits never rebind approval. Required answers with missing/stale approval block validation.
- Review and response writes serialize with package approval/submission using the tender lock.
  Lifecycle transitions recheck the locked state to prevent reopening a concurrently submitted tender.
- Generic transitions to APPROVED or SUBMITTED, including the older `/approve` and `/submit`
  paths, require use of the package workflow. They return `PACKAGE_WORKFLOW_REQUIRED`
  when reached; callers must migrate to the package endpoints below.
- Approve through `POST /tenders/:id/packages/:packageId/approve` from REVIEW.
  The current digest, validation and reviews are checked before package and tender state
  change together. Reviewed FINAL answers are accepted.
- Record an external submission through `POST /tenders/:id/submissions`, providing
  package ID, portal, acknowledgement reference and submission time. This records a receipt;
  it does not send anything to a buyer portal. Submitted response content is not editable.

## Package integrity

Generator version `tendyy-package@2` exports every question (including standalone questions),
all linked requirement titles, and uncovered requirements. Same-named attachments receive
unique ZIP paths. Missing attachments or checksum mismatches fail generation. Content
identity includes question/requirement relationships and the generator version. Package
listing projects staleness without mutating tender status. Concurrent package creation
serializes version allocation. Existing v1 packages require rebuilding and approval.
Artifact records and completion commit together under a package row lock. Retrying an
interrupted GENERATING package recovers it, and concurrent builders share the result.

## Intake and milestones

Intake accepts PDF and DOCX; scanned documents requiring OCR remain unsupported.
Extraction creates deterministic candidates that require human acceptance in Apply.
The wizard reports pending confirmation rather than claiming canonical requirements exist.

Milestone offsets are recalculated when the tender deadline changes. Removing the deadline
cancels pending milestones. Reminder jobs use a fifteen-minute time window, and notification
deduplication includes the deadline so postponed milestones can notify again. Reminder
workers skip completed/cancelled milestones and submitted/closed tenders.

Preparation runs in the API; reminders require `apps/worker` plus Redis. Both full-stack
production Compose definitions and the application-only definition include the worker.

## Migration and verification

Apply additive migration `0031_apply_execution_and_review` before starting the updated API.
It adds execution leases and review content digests. Legacy reviews have no proven content
binding and must be explicitly reviewed again before a new package can be approved.
No production migration or deployment was performed during implementation.

Regression tests:

- `bun --no-env-file test apps/api/src/modules/rfp-apply apps/api/src/modules/tenders/domain`
- For database tests, use a disposable migrated PostgreSQL database, set `DATABASE_URL`,
  `RFP_APPLY_INTEGRATION=1`, and `NODE_ENV=test`, then run
  `bun --no-env-file test --timeout 30000 apps/api/src/modules/rfp-apply/apply-automation.integration.test.ts`.
- Run API, web, worker and affected shared-package type checks and lint the changed modules.

Database regressions cover approval bypasses, changed reviews, FINAL answers, complete
package export, stale submission rejection, resource policies, missing attachments,
concurrent creation, idempotency, lease recovery, cancellation, deadline updates,
concurrent human edits, interrupted package recovery, and stale lifecycle transitions.

Implementation verification: 241 isolated tests passed, and all 16 opt-in database
regressions passed against a disposable PostgreSQL instance after applying the full
migration chain. API, web, worker and database type checks passed. Both updated
Compose files validate. Changed-module lint has no errors (two existing unused-import
warnings remain in tender/assignment services).

The older `tenders.integration.test.ts` suite could not initialize its Nest test module:
its provider list omits `TenderAiService`. That suite also still expects approval and
submission through the legacy endpoints and needs its fixtures/contracts updated.
It is not included in the passing results above.

Live AI providers, buyer portals and authenticated browser interactions require their own
configured integration environment; database tests use controlled provider/storage substitutes.
