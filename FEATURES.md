# RFP OS — Feature Reference

Every feature in the codebase, what it is for, and whether it actually does the
thing its label implies.

- 46 database tables
- 49 demo API routes, 32 platform API routes
- 16 screens
- 7 roles, 19 permissions

---

## 00 — How to read this

Most confusion about this project comes from one thing: a screen can look
finished while the logic behind it is a placeholder. Every entry below carries
a status so you never have to guess which is which.

| Status | Meaning |
| --- | --- |
| **Live** | Works end to end against the real database. What you see is what happened. |
| **Simulated** | The screen and the data are real, but the intelligence behind it is canned. It writes to the database, so it *looks* genuine — the reasoning is not. |
| **Scaffold** | The file exists and compiles. It does nothing yet. |
| **Planned** | Specified in the implementation plan. No code. |

> **The single most important thing in this document**
>
> There is **no AI in this product yet**. Nothing calls a language model. Every
> feature labelled "AI" — answer drafting, confidence scores, risk
> classification — is a **Simulated** placeholder that produces plausible-looking
> output by rule. Section 21 lists them all in one place.

---

## 01 — What the product is

RFP OS is a workspace for answering enterprise Requests for Proposal. A customer
sends a long questionnaire; a bid team has to answer every question accurately,
back the answers with evidence, get them reviewed by the right specialists, and
submit before a deadline.

The product exists because that work is currently done in spreadsheets and
shared documents, where three things go wrong: the same question gets answered
differently by different people, answers go stale without anyone noticing, and
nobody can tell how close to done the response actually is.

Every feature serves one of those three problems. The spine of the product is a
single pipeline a document travels along:

```
Upload → Parse → Extract requirements → Draft answers → Attach evidence
      → Review → Validate → Submit → Record outcome
```

Steps 1 and 2 are being built now (Phase 6). Steps 3 onward exist as working
screens fed by seeded data.

---

## 02 — Why there are two systems

This is the structural fact that explains most of the repository.

| System | What it is | Status |
| --- | --- | --- |
| `apps/legacy-web` | Previous TanStack frontend retained for rollback only. | Pending removal |
| `apps/legacy-api` | Previous Elysia API retained for rollback only. | Pending removal |
| `apps/api` | Active NestJS backend with auth, permissions, audit, lifecycle, tender, knowledge, and workspace APIs. | Live |
| `apps/web` | Active Next.js frontend for the current product surface. | Live |

The `legacy-*` pair is the previous prototype retained temporarily for rollback
and data migration checks. It is no longer registered by the active NestJS API
and should not receive new feature work.

`apps/api` is the active backend. It provides genuine multi-tenant isolation,
role-based permissions, an audit trail, lifecycle control, and the canonical
tender APIs used by the current UI.

The active UI calls the NestJS API through `/api/v1`; the legacy applications
remain only until deployment usage and legacy database rows have been verified.

---

## 03 — Shell & navigation

The frame around every screen. Small features, but they are what makes a
multi-screen tool feel like one product rather than a set of pages.

### App sidebar — Live
Primary navigation, grouped into Dashboard / Pipeline (RFPs, Reviews,
Submissions) / Intelligence (Knowledge, Analytics), with Settings pinned to the
footer. Collapsible to icons.

*Why grouped that way:* the groups mirror who uses what. A bid manager lives in
Pipeline all day; Intelligence is consulted occasionally. Flattening them would
give equal weight to daily and rare destinations.

### Top bar — Live
Holds search entry, the notification bell, and the current user.

### Breadcrumbs — Live
Shows the path back up from any nested screen — a requirement sits four levels
deep (Dashboard → RFPs → an RFP → a requirement).

*Why it matters here:* people arrive at a requirement from a notification or a
review queue, not by navigating down. Without breadcrumbs they have no idea
which RFP they are inside.

### Command palette — Live
Keyboard-driven jump to any RFP, customer, requirement, knowledge source, or
person, plus quick actions.

*Why:* a large RFP has hundreds of requirements. Clicking through filters to
reach a known one is slower than typing its name.

### Notification centre — Live
A dropdown of unread notifications with relative timestamps, mark-one-read and
mark-all-read. Six categories: Reviews, Assignments, Risks, Deadlines,
Knowledge, Submissions.

*Why categories:* they map to the notification preferences in Settings, so a
reviewer can silence Deadlines without losing Reviews.

### Activity timeline — Live
A chronological feed of what happened on an RFP — assignments, approvals,
evidence added, comments, risk changes, submissions, AI generations, rejections.

*Why:* bid work is handed between people over weeks. The timeline is how someone
picking up a requirement learns what was already tried.

---

## 04 — Dashboard

The landing screen. Its job is to answer "what needs me today?" in one glance.

### Greeting header — Live
Time-of-day greeting with the user's first name.

*Worth knowing:* this was the source of a React hydration error in production,
because the server renders in UTC and the browser in local time. It now renders
a neutral string on the server and switches after mount.

### Metric tiles — Live
Headline counts — active RFPs, requirements outstanding, reviews waiting,
deadlines approaching.

### Attention list — Live
Ranked items needing action: overdue reviews, unanswered mandatory requirements,
elevated risk.

*Why ranked rather than listed:* everything on a bid is urgent near the
deadline. Ordering by consequence is the only way the list stays useful in the
last week.

---

## 05 — RFPs

The central object. An RFP is one customer questionnaire with a deadline, an
owner, a team, documents, requirements, and eventually an outcome.

### RFP list — Live
All RFPs with status, customer, owner, deadline, and completion. Filterable and
sortable.

### New RFP wizard — Live
Four steps — **Details** (title, customer, deadline, value), **Documents**
(upload the questionnaire), **Configure** (team, tone, reuse settings),
**Analyze** (kick off processing).

*Why a wizard and not a form:* the four steps are genuinely sequential — you
cannot configure extraction before knowing which documents exist. The stepper
also sets the expectation that Analyze takes time.

### RFP workspace — Live
The main working screen for one RFP, with three tabs: Workspace, Validation,
Submission.

### Intelligence panel — Simulated
A side panel offering suggestions and observations about the current RFP.

*Read carefully:* real UI over rule-based output. A placeholder for the Phase 8
model-backed version.

### Progress strip — Live
A compact bar showing mandatory-complete versus total, plus risk counts.

*Why mandatory separately:* a bid can be 90% answered and still disqualified for
one missed mandatory question. Overall completion hides exactly the number that
matters.

### Soft delete & restore — Live
Archiving an RFP hides it without destroying it; it can be restored.

*Why never a hard delete:* answers cite evidence, and evidence cites documents.
Destroying an RFP would break the provenance chain of answers reused elsewhere.

---

## 06 — Requirements

A requirement is one question from the customer's questionnaire. It is the unit
of work: assigned, answered, evidenced, reviewed, and approved individually. A
large RFP has hundreds.

### Requirement table — Live
The working list — code, question, category, mandatory flag, risk, status,
owner, reviewer, due date.

### Filters — Live
By category, status, risk level, owner, mandatory, and missing-evidence.

### Saved views — Live
Six preset filter combinations: All, My Requirements, High Risk, Needs Review,
Missing Evidence, Critical.

*Why these six:* each corresponds to a real question someone asks daily —
"what's mine", "what could sink us", "what's blocking sign-off". They are
shortcuts to habitual filters, not arbitrary presets.

### Bulk action bar — Live
Select many requirements and move them all to one status: Unanswered, Drafted,
Needs review, Changes requested, Approved, Rejected.

*Why:* after a review meeting someone has forty decisions to record. One at a
time is the difference between a five-minute task and an hour.

### Requirement detail sheet — Live
A slide-over with the full question, current answer, evidence, risk rationale,
and history — without leaving the table.

*Why a sheet, not a page:* requirements are worked in sequence. Losing table
position and scroll on every inspection would make a hundred-row pass painful.

### Categories — Live
Seven: Security, Commercial, Compliance, Product, Legal, Architecture, Support.

*Why they matter:* category routes a question to the specialist who can answer
it, and the same taxonomy classifies knowledge sources — which is what will make
automatic retrieval possible.

### Risk levels — Simulated
Four: low, medium, high, critical — each with a written rationale.

*Read carefully:* risk is seeded data, not assessed. Nothing currently computes
it. Phase 8 is where classification arrives.

---

## 07 — Answers & evidence

The most important section to read closely, because it is where the gap between
appearance and reality is widest.

### Answer history — Live
Every edit inserts a new answer row and marks the previous one superseded.
Nothing is overwritten.

*Why:* an answer that was approved and later changed is a compliance question.
Keeping the chain means you can always show what was approved and when it
changed.

### Answer editor — Live
Write or edit the response, see confidence, attach evidence, submit for review.

### Answer sources — Live
Each answer records how it was produced: `ai_draft`, `human_edited`, or `reused`.

*Why:* reviewers treat a machine draft and a specialist's wording differently,
and the analytics screen reports on how often drafts survive review.

### AI answer generation — Simulated
The "regenerate" button produces a new draft and raises the confidence score.

**What it actually does:** it prepends one of three rotating phrases —
`"Based on our current documentation, "`, `"Drawing on the latest verified
sources, "`, `"Per our most recent internal review, "` — to the previous answer,
and adds a flat `0.04` to the confidence. There is no model call and no
reasoning. It is a convincing demo of a feature that does not exist.

Source: `apps/legacy-api/src/modules/requirements.ts`

### Confidence meter — Simulated
A 0–1 score shown against each answer.

**What it actually is:** a stored number that increments on regeneration. It
measures nothing.

### Evidence links — Live
An answer can cite knowledge sources. The evidence card shows the source, its
freshness, and its authority.

*Why this is the product's real value:* anyone can write an answer. Being able to
show the customer *which* certified document it came from, and that the document
is current, is what wins security reviews.

### Freshness badge — Live
Flags evidence older than the configured threshold.

*Why:* citing last year's SOC 2 report is worse than citing nothing — it looks
like diligence while being wrong.

---

## 08 — Reviews

The sign-off layer. Specialists check answers in their domain before anything
reaches the customer.

### Review queue — Live
Everything waiting on the current user, across all RFPs.

*Why cross-RFP:* a security specialist reviews security questions on every live
bid. Organising their queue by RFP would force them to check six places.

### Review actions — Live
Five recorded actions: `APPROVED`, `REJECTED`, `REQUEST_CHANGES`, `COMMENT`,
`ASSIGNED`.

*Why "request changes" is separate from "reject":* rejection ends the answer;
requesting changes keeps it alive with feedback. Collapsing them would lose the
difference between "wrong" and "nearly right".

### Review panel — Live
In-context approve / reject / request-changes with a comment, beside the answer
being judged.

### Assignments — Live
Requirements are assigned to an owner and a reviewer. Assignment status runs
pending → in review → approved / rejected / changes requested.

---

## 09 — Validation

A pre-submission gate. It answers one question: is this bid safe to send? Six
checks run against the live data, each returning a count, a total, and a
severity tone. **Live** — all six compute from real data.

| Check | What it measures | Why it can block a bid |
| --- | --- | --- |
| Mandatory requirements answered | Approved mandatory questions vs total | One unanswered mandatory question disqualifies the entire submission |
| High & critical risk resolved | Elevated-risk answers with evidence or sign-off | An unresolved high-risk claim is a commitment nobody approved |
| Answers backed by evidence | Share of answers citing a source; warns below 85% | Unevidenced answers are the ones that fail a customer audit |
| Reviews outstanding | Requirements still in review or with changes requested | Submitting mid-review sends text nobody signed off |
| Legal clauses approved | Legal-category requirements approved | Legal terms bind the company contractually |
| Commercial terms approved | Commercial-category requirements approved | Pricing errors are expensive and hard to retract |

*Why a checklist rather than a single score:* a percentage tells you how close
you are but not what to fix. Each check names a specific, actionable gap and the
person who can close it.

---

## 10 — Submissions

### Submission versions — Live
Each generation creates a labelled version — "Version 3 (current draft)" or
"(submitted)" — with an optional note.

*Why versioned:* bids are often resubmitted after clarification rounds. You need
to know exactly which package the customer holds.

### Submission checklist — Live
A per-submission checklist, auto-ticked from the validation state — mandatory
complete, risk cleared, and so on.

### Package generation — Simulated
"Generate submission package" produces a version record and checklist.

**What it does not do:** produce a file. No document is assembled, rendered, or
exported. The artifact table exists; nothing writes bytes to it.

### Outcome recording — Live
A closed RFP is marked `won` or `lost`.

*Why it matters beyond reporting:* won bids are the highest-quality source of
reusable answers. Outcome is what will let the system prefer language that has
actually succeeded.

---

## 11 — Knowledge

The organisation's shared answer library. Deliberately not RFP-specific: one
source serves every bid rather than being copied per deal.

### Knowledge sources — Live
Documents and records the company answers from — a security whitepaper, a
completed CAIQ, a SOC 2 report.

### Claims — Live
Discrete assertions extracted from a source — "RPO: 4 hours", "encryption at
rest: AES-256".

*Why break sources into claims:* a question asks about one fact, not a document.
Claims are what make an answer citable down to the specific assertion.

### Versions — Live
Sources are versioned, so an answer cites the version it was written against.

### Authority levels — Live
Every source carries high, medium, or low authority.

*Why:* when a certified audit report and an internal wiki page disagree, the
tie-break has to be principled rather than whichever was found first.

### Conflict detection — Simulated
Flags where two sources give different answers to the same topic, with the
competing variants side by side.

*Status:* the tables and the screen are real; the detection is seeded. Automatic
conflict finding is a later phase.

### Search & retrieval — Planned
Semantic search over knowledge to suggest evidence for a requirement.

*Status:* pgvector is installed and the schema anticipates embeddings, but
nothing is indexed or embedded. Phase 7.

---

## 12 — Analytics

Reporting across all bids. **Live** — computed from real rows, though the rows
themselves are seeded.

| Report | What it answers |
| --- | --- |
| KPI row | Headline totals with period-over-period deltas |
| Win / loss | How many bids were won versus lost |
| Volume by month | RFPs received versus submitted — capacity planning |
| Risk distribution | Spread across low / medium / high / critical |
| AI acceptance | Share of drafts accepted as-is versus edited |
| SME performance | Review throughput and turnaround by specialist |
| Completion time | Days from receipt to submission |

*Why AI acceptance is the interesting one:* it is the metric that tells you
whether the drafting feature is worth its cost. If every draft is rewritten, the
feature is theatre. It cannot mean anything until real generation exists.

---

## 13 — Settings

Ten tabs. All **Live** for reading; most support editing.

| Tab | Purpose |
| --- | --- |
| Organisation | Name, domain, industry, plan, seat usage |
| Profile | The current user's own details |
| Members | Who is in the organisation, their role and status |
| Roles | What each role may do — the permission matrix, human-readable |
| API keys | Programmatic access credentials |
| Integrations | Salesforce, SharePoint, DocuSign connections |
| Notifications | Per-category delivery preferences |
| MCP | Registered Model Context Protocol servers |
| Security | MFA enforcement, encryption at rest, audit period |
| Toggles | Behaviour switches — see below |

### Config toggles

Three kinds — a switch, a select, or a slider — covering: auto-draft new
requirements, minimum confidence to auto-draft, preferred drafting tone, reuse
prior won RFP answers, auto-regenerate on source update, flag low-evidence
answers for review, auto-detect conflicting claims, require owner sign-off on
new sources, and the freshness warning threshold.

*Why these are settings rather than fixed behaviour:* every one of them trades
speed against caution, and the right point differs by industry. A defence
supplier wants sign-off on every source; a SaaS vendor answering forty
questionnaires a quarter does not.

The toggles are stored and editable. Because the behaviour they govern is itself
simulated, changing them currently has no downstream effect.

---

## 14 — Identity & access

Two entirely different stories depending on which backend you mean.

### Demo auth (legacy-api) — Simulated
A dev-login endpoint takes an email and returns a token.

**What that means:** the token *is* the user id, handed out for an email with no
password. Everyone who reaches the deployed demo is the same seeded user. This
is why the site sits behind an HTTP password gate — that gate is the only real
access control in front of it.

### Better Auth (apps/api) — Live
Real sessions, accounts, and verification, with organisation membership and
invitations.

### Roles — Live
Seven: `OWNER`, `ADMIN`, `RFP_MANAGER`, `CONTRIBUTOR`, `REVIEWER`, `SME`,
`VIEWER`.

*Why REVIEWER and SME are distinct:* a reviewer approves within a process; a
subject-matter expert supplies knowledge but does not sign off. Merging them
would grant approval rights to people whose job is to advise.

### Permissions — Live
Nineteen fine-grained permissions across four families:

- `rfp:*` — read, create, update, delete, assign, review, approve, submit, export, manage
- `document:*` — read, upload, delete
- `member:*` — read, invite, update, remove
- `org:*` — read, update

Every endpoint declares which it requires.

### Tenant isolation — Live
Every query is scoped by organisation, derived server-side from the session and
never from anything the client sends.

**The detail that matters:** asking for another organisation's RFP returns
**404, not 403**. A 403 would confirm the record exists. This is tested
explicitly.

### Policy service (ABAC) — Live
Attribute-based rules layered on top of roles — ownership, assignment, and
lifecycle state can all affect what is permitted.

*Why on top of roles:* "a contributor may edit an answer" is not enough. They may
edit answers on RFPs they are assigned to, before review closes. That is an
attribute question, not a role question.

### Invitations — Live
Invite by email with a role, expiring after a configured window; the invitee
accepts to join.

---

## 15 — Lifecycle engine

A formal state machine governing an RFP's progress. Twelve states plus three
failure states. **Live** in `apps/api`, fully tested.

```
DRAFT → INTAKE → PARSING → ANALYZING → QUALIFICATION → RESPONSE
      → REVIEW → VALIDATION → READY_FOR_SUBMISSION → SUBMITTED
      → OUTCOME_RECORDED → CLOSED

PARSING_FAILED    → PARSING
ANALYSIS_FAILED   → ANALYZING
VALIDATION_FAILED → VALIDATION
```

### Guarded transitions — Live
Status cannot be set through an ordinary update. It changes only through a
transition endpoint that validates, authorises, persists, records history,
audits, and publishes an event — in that order.

*Why locked down:* if a client could PATCH status directly it could mark an
unreviewed bid ready for submission. The state machine is what makes every other
gate meaningful.

### Status history — Live
Every transition is recorded with who, when, from, to, and why. Current status
lives on the RFP; the trail lives beside it.

### Failure recovery — Live
Each failure state has exactly one route back to the step that failed — no
skipping forward from a failure.

### Team assignments — Live
People are attached to an RFP as `OWNER`, `CONTRIBUTOR`, `REVIEWER`, or `SME`.
Cross-organisation assignment is rejected.

---

## 16 — Documents & storage

### Two-phase upload — Live
The client asks for an upload intent, receives a presigned URL, sends the bytes
straight to object storage, then calls complete.

*Why not upload through the API:* buffering documents through the request
pipeline would make upload throughput a function of API memory, and put large
files under the global request timeout.

### Completion verification — Live
On completion the API checks the object really exists and matches the declared
size.

*Why:* the size limit is enforced at intent. Without this check a client could
declare 1 MB and upload 1 GB.

### Content sniffing — Live
The parse job reads the first bytes and rejects a file whose real format
contradicts its declared type.

*Why it's needed:* because uploads bypass the API, the MIME type is an unverified
client claim. Only a positive contradiction fails — unrecognised content passes,
since the sniffer knows a handful of formats and reads only a prefix.

### Versioning — Live
Replacing a document adds a version pointing at its own stored object; earlier
bytes are never overwritten.

*Why:* evidence cites a document version. Overwriting would silently change what
an approved answer was based on.

### Archive, not delete — Live
Removing a document hides it; the stored file survives.

### Supported types — Live
PDF, DOCX, XLSX, PPTX, ZIP, HTML — accepted for upload today. Only PDF, DOCX,
XLSX and HTML are scheduled for extraction; PPTX and scanned-image OCR will fail
with a clear reason rather than be half-supported.

---

## 17 — Processing pipeline

The newest work, and the part that will turn uploaded documents into answerable
requirements. Built in slices.

### Job queue — Live
Redis and BullMQ between the API and a separate worker process. The API enqueues
after the database commit, never inside it.

*Why after commit:* a worker can pick up a job before an open transaction lands,
and would read a document that does not yet exist.

### Idempotency — Live
Job ids are derived from document plus version, so a repeated submission
collapses to one job while a new version queues separately.

*Belt and braces:* the processor also re-reads the row and skips work already
done, because a worker that dies mid-job gets its work redelivered after its
side effects landed.

### Retries & dead-lettering — Live
Three attempts with exponential backoff. Permanent failures — a missing object, a
contradicted type — stop retrying immediately. Exhausted jobs write their reason
onto the document.

*Why the document row is the dead letter:* the queue's failed set is capped and
the product cannot read it. The row is where the UI already looks.

### Degraded mode — Live
Without Redis the API still serves every request; jobs are dropped with a
warning and the document stays queued.

*Why not fail the upload:* the bytes are stored and the row committed. The upload
genuinely succeeded — only the follow-up work is unavailable.

### Extracted-content storage — Live
Three tables holding an extraction run, its page text, and its tables —
addressed by document *and version*.

*Why versioned:* evidence cited against version 1 must keep resolving after
version 2 is uploaded. Re-parsing replaces content for that version outright
rather than merging, because a re-parse is a new reading of the same bytes.

### Text & table extraction — Planned
Real parsers per format. Next slice. The queue runs and content has somewhere to
live; nothing reads a PDF yet.

### Requirement extraction — Planned
Turning extracted text into structured requirements. Deterministic to begin with
— document structure plus modal verbs ("shall", "must") — behind an interface a
model can replace later.

### Requirement graph — Planned
Parent/child requirements, dependencies, duplicate detection, cross-document
references, traceability back to source spans.

---

## 18 — Platform services

Cross-cutting infrastructure in `apps/api`. Invisible to users, but most of the
guarantees above rest on them.

### Audit log — Live
Records actor, organisation, action, entity, before and after, and timestamp —
written inside the same transaction as the change.

*Why in the transaction:* an audit entry for a change that rolled back would be a
lie, and a change with no entry would be invisible.

### Domain events — Live
Past-tense notifications — created, updated, archived, status changed —
published after commit, behind an interface.

*Why the interface matters:* the current implementation just logs. Swapping it
for a durable transport is a one-class change, because every domain service
already publishes through the seam.

### Structured logging — Live
One Pino instance for both framework and application logs, with request ids
threaded through.

### Request id middleware — Live
Every request gets an id, returned in error responses.

*Why:* it turns "it broke" into a single log lookup.

### Error envelope — Live
Every failure returns the same shape — code, message, request id — with internal
detail stripped.

### Rate limiting — Live
A configurable throttle guard.

### Schema validation — Live
Zod pipes and interceptors validate input and environment at the boundary; the
app refuses to boot on bad configuration.

*Why fail at boot:* a missing secret discovered at boot is a restart. Discovered
on first use, it is an outage.

### Health endpoint — Live
A readiness probe for the container platform.

---

## 19 — Packages & side apps

| Package | Purpose | Status |
| --- | --- | --- |
| `@rfp-os/db` | Schema, relations, migrations, seed — one source of truth for every app | Live |
| `@rfp-os/types` | Cross-cutting platform types: roles, permissions, auth context | Live |
| `@rfp-os/storage` | S3-compatible object storage; no framework coupling, so API and worker share it | Live |
| `@rfp-os/jobs` | Job names, payload shapes and retry policy shared by producer and consumer | Live |
| `@rfp-os/observability` | The shared Pino logger | Live |
| `@rfp-os/validation` | Shared Zod schemas — pagination, id params | Live |
| `@rfp-os/config` | Shared TypeScript config | Live |
| `@rfp-os/ui` | Shared component library for the future frontend | Scaffold |
| `@rfp-os/ai` | Provider abstraction for completions and embeddings | Scaffold |

**About `@rfp-os/ai`:** it defines the interfaces and a router that throws when
no provider is registered. **No provider is registered.** It is the shape of the
future AI layer, not the layer.

### Worker app — Live
A separate Bun process running BullMQ workers — a platform health queue and the
document queue. Drains in-flight jobs on shutdown rather than killing them.

*Why a separate process:* parsing a 200-page PDF should never compete with
serving a request.

### MCP server — Scaffold
Intended to expose RFP capabilities — search knowledge, check status — to Model
Context Protocol clients. Currently one tool: `ping`, which returns "pong".

### Browser extension — Scaffold
Intended for answering questionnaires hosted on customer portals, where the
questions never arrive as a file. Currently a popup reading "Extension scaffold
— Phase 1".

---

## 20 — Data model

46 tables. Every organisation-scoped table carries `organization_id` — enforced
by a schema test, because a table missing it cannot be isolated at all.

| Group | Tables |
| --- | --- |
| Organisation | `organizations`, `customers`, `projects`, `roles`, `permissions`, `role_permissions` |
| Identity | `users`, `accounts`, `sessions`, `verifications` |
| Membership | `organization_members`, `invitations`, `access_policies` |
| Files | `files`, `document_versions` |
| Knowledge | `knowledge_sources`, `knowledge_claims`, `knowledge_versions`, `knowledge_conflicts`, `knowledge_conflict_variants` |
| RFP core | `rfps`, `rfp_collaborators`, `rfp_documents`, `rfp_requirements`, `rfp_answers`, `rfp_evidence`, `rfp_risks`, `rfp_reviews`, `rfp_assignments` |
| Submission | `rfp_submissions`, `rfp_submission_checklist_items`, `rfp_submission_artifacts`, `rfp_outcomes` |
| Lifecycle | `rfp_team_assignments`, `rfp_status_history` |
| Extraction | `document_extractions`, `document_pages`, `document_tables` |
| Audit | `activities`, `audit_logs` |
| Platform | `notifications`, `notification_preferences`, `api_keys`, `integrations`, `mcp_connections`, `config_toggles` |

> **One known inconsistency**
>
> `rfp_requirements` is the only organisation-scoped table *without* an
> `organization_id` column — it is scoped indirectly through its RFP. That works,
> but it breaks the pattern every other table follows and is on the list to fix
> in the next schema slice.

---

## 21 — What isn't real yet

Collected in one place, so nothing on this list surprises you in a demo.

### Looks real, isn't

| Feature | What actually happens |
| --- | --- |
| AI answer generation | Uses the configured provider; deterministic fallback is limited to development/test environments. |
| Confidence scores | Provider output is normalized, but confidence still requires product evaluation. |
| Risk classification | Provider output is normalized; seeded records remain for existing data. |
| Intelligence panel | Rule-based output presented as insight. |
| Conflict detection | Seeded conflicts. Nothing detects them. |
| Package generation | Creates a version record and checklist. Produces no file. |
| Demo authentication | Token is the user id, issued for an email with no password. |
| Config toggles | Saved and editable, but govern behaviour that is itself simulated. |

### Honestly empty

- `apps/web` — the replacement frontend. Zero files.
- `@rfp-os/ai` — provider abstraction used by the active tender AI services.
- `@rfp-os/ui` — scaffold.
- MCP server — one `ping` tool.
- Browser extension — a placeholder popup.
- Document text extraction — queue and storage ready, no parsers.
- Requirement extraction, requirement graph, semantic search — planned.

### Genuinely solid

- The data model, and multi-tenant isolation enforced by tests that check a
  wrong tenant gets 404 rather than 403.
- The RFP lifecycle state machine, including failure recovery, with status
  changes impossible through ordinary updates.
- Roles, permissions, and attribute-based policy in `apps/api`.
- Two-phase document upload with size verification, content sniffing, and
  versioning.
- The job queue: idempotent, retrying, dead-lettering, and degrading safely
  without Redis.
- Audit logging written inside the transaction it describes.
- Validation checks and analytics — real computation, over seeded rows.

### The honest summary

What exists is a well-built *skeleton* with a convincing *demonstration* draped
over it. The foundations — data model, isolation, permissions, lifecycle,
ingestion — are real and tested. The intelligence the product is named for has
not been built. The plan sequences it for Phase 8, after documents can actually
be read.
