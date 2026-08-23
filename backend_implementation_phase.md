Yes. Below is the **updated backend implementation plan as a single Markdown copy-paste template**, with **Phases 1–4 marked complete** and the remaining work consolidated into **Phases 5–11**.

````md
# RFP OS — Backend Implementation Plan

## Project Status

**Current Status:** Phases 1–5 Complete  
**Next Phase:** Phase 6 — Document Processing & Requirement Intelligence  
**Total Phases:** 11  
**Remaining Phases:** 6

---

# 1. Architecture Goal

Build RFP OS as a modular, multi-tenant, API-first backend supporting the complete RFP lifecycle:

```text
RFP Intake
    ↓
Document Processing
    ↓
Requirement Intelligence
    ↓
Knowledge Retrieval
    ↓
AI Answer Generation
    ↓
Evidence
    ↓
Risk Detection
    ↓
Human Review
    ↓
Validation
    ↓
Submission
    ↓
Outcome
    ↓
Learning
````

The backend must be built around the **RFP domain model**, not individual frontend screens or AI agents.

---

# 2. Confirmed Technology Stack

## Application

```text
Frontend
Next.js App Router
React
TypeScript

Backend
NestJS
TypeScript
Bun runtime

API
REST
MCP
```

## Data

```text
PostgreSQL
Drizzle ORM
pgvector
OpenSearch
```

## Infrastructure

```text
MinIO / S3
Redis
BullMQ
Docker
Dokploy
GitHub Actions
```

## AI

```text
OpenAI
Anthropic
Gemini
Provider Abstraction
Model Router
RAG
Embeddings
pgvector
OpenSearch
```

## Security

```text
Better Auth
RBAC
ABAC
Audit Logs
Multi-tenant Isolation
```

## Platform

```text
Turborepo
Bun
GitHub
```

## Observability

```text
OpenTelemetry
Sentry
PostHog
```

## Testing

```text
Vitest
Playwright
```

## Browser

```text
Plasmo
TypeScript
```

---

# 3. Target Monorepo

```text
rfp-os/

├── apps/
│   ├── web/
│   │   └── Next.js application
│   │
│   ├── api/
│   │   └── NestJS API
│   │
│   ├── worker/
│   │   └── Bun + BullMQ workers
│   │
│   ├── mcp/
│   │   └── MCP Server
│   │
│   └── extension/
│       └── Plasmo browser extension
│
├── packages/
│   ├── ui/
│   ├── types/
│   ├── config/
│   ├── db/
│   ├── ai/
│   ├── validation/
│   └── observability/
│
├── infrastructure/
│   ├── docker/
│   ├── postgres/
│   ├── redis/
│   ├── minio/
│   └── opensearch/
│
├── docs/
│
├── turbo.json
├── package.json
└── README.md
```

---

# 4. Implementation Status

| Phase    | Name                                           | Status   |
| -------- | ---------------------------------------------- | -------- |
| Phase 1  | Monorepo & Runtime Foundation                  | COMPLETE |
| Phase 2  | NestJS API Foundation                          | COMPLETE |
| Phase 3  | Database Foundation                            | COMPLETE |
| Phase 4  | Authentication & Organization                  | COMPLETE |
| Phase 5  | RFP Core & Lifecycle                           | COMPLETE |
| Phase 6  | Document Processing & Requirement Intelligence | NEXT     |
| Phase 7  | Knowledge, Search & Evidence                   | PENDING  |
| Phase 8  | AI Response & RFP Intelligence                 | PENDING  |
| Phase 9  | Review, Validation & Submission                | PENDING  |
| Phase 10 | Events, MCP & Browser Automation               | PENDING  |
| Phase 11 | Production Engineering                         | PENDING  |

---

# PHASE 1 — Monorepo & Runtime Foundation

## Status

**COMPLETE**

## Delivered

* Turborepo
* Bun
* TypeScript
* Workspace configuration
* Environment management
* Shared package configuration
* Docker development environment
* Web application
* API application
* Worker application
* MCP application
* Browser extension

## Completion

```text
✓ bun install
✓ turbo dev
✓ API starts
✓ Web starts
✓ Worker starts
✓ Shared packages resolve
✓ Docker infrastructure starts
```

Do not rebuild this phase.

---

# PHASE 2 — NestJS API Foundation

## Status

**COMPLETE**

## Delivered

* NestJS
* REST API
* API versioning
* Global validation
* Error handling
* Request IDs
* Structured logging
* CORS
* Rate limiting foundation
* Health checks
* Common guards
* Common interceptors
* Common filters
* Common decorators
* Common pipes

## Existing endpoints

```http
GET /health
GET /ready
GET /api/v1/health
```

Do not rebuild this phase.

---

# PHASE 3 — Database Foundation

## Status

**COMPLETE**

## Delivered

```text
PostgreSQL
    ↓
Drizzle ORM
```

Existing database foundation includes:

```text
packages/db/

├── schema/
├── migrations/
├── relations/
└── client.ts
```

Existing database domains include:

```text
identity
organization
audit
files
knowledge
rfp
```

## Delivered

* Database connection
* Drizzle configuration
* Migration system
* Relations
* Indexes
* Transactions
* Seed system

## Important

Migrations must remain additive.

Never drop or recreate existing production data.

Do not create a second users system.

---

# PHASE 4 — Authentication & Organization

## Status

**COMPLETE**

This phase has already been implemented and verified against the running API.

## Delivered

### Better Auth

```text
sessions
accounts
verifications
```

Better Auth uses the existing `users` table.

There is no second user identity system.

### Organization

```text
organization_members
invitations
access_policies
```

### Authorization

Implemented:

```text
RBAC
ABAC
AuthGuard
PermissionsGuard
PolicyService
```

### Roles

```text
OWNER
ADMIN
RFP_MANAGER
CONTRIBUTOR
REVIEWER
SME
VIEWER
```

### RFP permissions

```text
rfp:create
rfp:read
rfp:update
rfp:delete
rfp:assign
rfp:review
rfp:approve
rfp:submit
rfp:export
rfp:manage
```

Additional organization/member permissions exist for the Phase 4 organization APIs.

### Important identity decisions

`users.email` is globally unique.

Reason:

```text
Authentication identity = global
Organization membership = organization-scoped
```

`users.organization_id` is nullable.

A newly registered user may exist without an organization until they create or join one.

### Security requirements

Every organization-scoped query must be tenant scoped.

```text
organization_id
```

must come from authenticated organization context.

Never trust a tenant ID supplied by an unauthenticated request.

### Verified

```text
✓ Sign-up
✓ Tenant-less user handling
✓ Organization creation
✓ OWNER permissions
✓ Invitations
✓ Invitation acceptance
✓ Wrong-account invitation rejection
✓ Non-member organization rejection
✓ Self-role modification rejection
✓ RBAC
✓ ABAC
✓ Tenant isolation
```

### Existing verification

```text
Typecheck: 13/13
Lint: 5/5
Tests: 119 passing
Failures: 0
API boot: clean
```

Do not rebuild or replace Phase 4.

---

# PHASE 5 — RFP Core & Lifecycle

## Status

**COMPLETE**

## Objective

Build the transactional RFP domain and lifecycle on top of the completed foundation.

Phase 5 must establish the core domain that all future:

```text
Documents
Requirements
Knowledge
AI
Evidence
Risk
Review
Validation
Submission
Learning
```

will depend on.

---

## 5.1 RFP Domain

### Main entity

```text
RFP
```

### Relationships

```text
RFP
├── Documents          [Phase 6]
├── Requirements       [Phase 6]
├── Answers            [Phase 8]
├── Evidence           [Phase 7/8]
├── Reviews            [Phase 9]
├── Risks              [Phase 8]
├── Assignments        [Phase 5]
├── Submissions        [Phase 9]
└── Outcome            [Phase 9]
```

### RFP fields

```text
id
organization_id
client_id
project_id
title
description
status
deadline
estimated_value
owner_id
created_by
created_at
updated_at
```

---

## 5.2 RFP Assignments

Create an RFP assignment model.

```text
RFPAssignment

id
organization_id
rfp_id
user_id
role
assigned_by
created_at
updated_at
```

### Assignment roles

```text
OWNER
CONTRIBUTOR
REVIEWER
SME
```

Assignments must never bypass organization membership.

A user assigned to an RFP must belong to the same organization.

---

# 5.3 RFP Lifecycle

Implement the RFP state machine.

```text
DRAFT
  ↓
INTAKE
  ↓
PARSING
  ↓
ANALYZING
  ↓
QUALIFICATION
  ↓
RESPONSE
  ↓
REVIEW
  ↓
VALIDATION
  ↓
READY_FOR_SUBMISSION
  ↓
SUBMITTED
  ↓
OUTCOME_RECORDED
  ↓
CLOSED
```

Failure states:

```text
PARSING_FAILED
ANALYSIS_FAILED
VALIDATION_FAILED
```

Recovery:

```text
PARSING_FAILED
    ↓
PARSING

ANALYSIS_FAILED
    ↓
ANALYZING

VALIDATION_FAILED
    ↓
VALIDATION
```

---

# 5.4 State Transition Rules

A client must never arbitrarily update:

```text
status
```

through normal RFP update operations.

Lifecycle transitions must go through a domain/state-machine service.

Every transition must:

```text
Validate
    ↓
Authorize
    ↓
Persist
    ↓
Record History
    ↓
Audit
    ↓
Publish Domain Event
```

Invalid transitions must fail with a clear domain error.

---

# 5.5 RFP Status History

Create:

```text
RFPStatusHistory
```

Fields:

```text
id
organization_id
rfp_id
from_status
to_status
actor_id
reason
metadata
created_at
```

The current status lives on the RFP.

Historical transitions live in the status history.

---

# 5.6 RFP API

Base path:

```text
/api/v1/rfps
```

### Create

```http
POST /api/v1/rfps
```

Permission:

```text
rfp:create
```

### List

```http
GET /api/v1/rfps
```

Permission:

```text
rfp:read
```

### Get

```http
GET /api/v1/rfps/:id
```

Permission:

```text
rfp:read
```

### Update

```http
PATCH /api/v1/rfps/:id
```

Permission:

```text
rfp:update
```

The update endpoint must not allow arbitrary status changes.

### Delete/archive

```http
DELETE /api/v1/rfps/:id
```

Permission:

```text
rfp:delete
```

Use the existing project's deletion/archive convention.

### Assign

```http
POST /api/v1/rfps/:id/assignments
```

Permission:

```text
rfp:assign
```

### List assignments

```http
GET /api/v1/rfps/:id/assignments
```

Permission:

```text
rfp:read
```

### Remove assignment

```http
DELETE /api/v1/rfps/:id/assignments/:userId
```

Permission:

```text
rfp:assign
```

### Lifecycle transition

```http
POST /api/v1/rfps/:id/transitions
```

Permission:

```text
rfp:update
```

### Status history

```http
GET /api/v1/rfps/:id/history
```

Permission:

```text
rfp:read
```

---

# 5.7 Authorization

Reuse the Phase 4 authorization system.

Do not create another authorization system.

```text
Authentication
      ↓
Organization Membership
      ↓
RBAC
      ↓
ABAC
      ↓
RFP Access
      ↓
Business Operation
```

## Tenant isolation

Every RFP query must include:

```text
organization_id
```

Never trust:

```text
organization_id
```

from a client request as the sole authorization mechanism.

The authenticated organization context must be authoritative.

## Cross-tenant access

Organization A must never access:

```text
Organization B RFP
```

even if the user knows the RFP ID.

Do not leak whether another organization's RFP exists.

---

# 5.8 ABAC

Reuse:

```text
PolicyService
```

Potential contextual rules:

```text
Organization membership
RFP ownership
RFP assignment
Role
RFP lifecycle state
```

Do not duplicate policy logic inside individual controllers.

---

# 5.9 Validation

## Create RFP

Validate:

```text
title
description
deadline
estimated_value
owner_id
```

Rules:

```text
title:
  required
  non-empty
  reasonable max length

description:
  optional
  reasonable max length

deadline:
  optional
  valid datetime

estimated_value:
  optional
  non-negative

owner_id:
  optional
  must belong to same organization
```

## Update RFP

Never allow direct updates to:

```text
organization_id
created_by
created_at
status
```

Status changes must use the lifecycle transition system.

---

# 5.10 Audit

Reuse the existing audit infrastructure.

Do not create a second audit system.

Track at minimum:

```text
RFP_CREATED
RFP_UPDATED
RFP_ARCHIVED
RFP_DELETED
RFP_STATUS_CHANGED
RFP_ASSIGNMENT_CREATED
RFP_ASSIGNMENT_REMOVED
```

Where supported, record:

```text
before
after
metadata
actor
organization
timestamp
```

Never log secrets or authentication credentials.

---

# 5.11 Domain Events

Establish clean domain event contracts.

Events:

```text
RFP_CREATED
RFP_UPDATED
RFP_ARCHIVED
RFP_DELETED
RFP_STATUS_CHANGED
RFP_ASSIGNMENT_CHANGED
```

Architecture:

```text
API
 ↓
Domain Service
 ↓
Database Transaction
 ↓
Domain Event
```

Do not prematurely build the entire asynchronous event infrastructure if it is not yet required.

Phase 6+ will consume these events.

---

# 5.12 Suggested API Module Structure

Use the existing project conventions where possible.

Suggested structure:

```text
apps/api/src/modules/rfp/

├── rfp.module.ts
│
├── controllers/
│   ├── rfp.controller.ts
│   ├── rfp-assignment.controller.ts
│   └── rfp-lifecycle.controller.ts
│
├── services/
│   ├── rfp.service.ts
│   ├── rfp-assignment.service.ts
│   └── rfp-lifecycle.service.ts
│
├── domain/
│   ├── rfp-state-machine.ts
│   ├── rfp-transitions.ts
│   └── rfp.errors.ts
│
├── dto/
│   ├── create-rfp.dto.ts
│   ├── update-rfp.dto.ts
│   ├── assign-rfp.dto.ts
│   ├── transition-rfp.dto.ts
│   └── list-rfps.dto.ts
│
├── repositories/
│   └── rfp.repository.ts
│
└── events/
    └── rfp.events.ts
```

Do not introduce this structure if the existing codebase has an established convention that should be followed.

---

# 5.13 Database Requirements

Use:

```text
Drizzle ORM
PostgreSQL
```

Create additive migrations only.

Potential tables:

```text
rfps
rfp_assignments
rfp_status_history
```

Use existing:

```text
users
organizations
organization_members
audit_logs
```

Do not duplicate them.

Recommended indexes:

```text
organization_id
owner_id
status
deadline
created_at
rfp_id
user_id
```

All important RFP operations should be organization-scoped.

---

# 5.14 Phase 5 Testing

## Unit tests

Test:

```text
State transitions
Invalid transitions
Failure state recovery
Assignment rules
Validation
Authorization rules
```

## Integration tests

Test:

```text
Create RFP
List RFPs
Get RFP
Update RFP
Archive/Delete RFP
Assign user
Remove assignment
Transition RFP
Read status history
Audit integration
```

## Security tests

Explicitly test:

```text
OWNER can manage RFP

Authorized roles can read RFP

Unauthorized role receives 403

Non-member cannot access RFP

Organization A cannot access Organization B RFP

Cross-org assignment is rejected

organization_id cannot bypass tenant isolation

status cannot be modified through PATCH
```

## Full lifecycle test

```text
DRAFT
 → INTAKE
 → PARSING
 → ANALYZING
 → QUALIFICATION
 → RESPONSE
 → REVIEW
 → VALIDATION
 → READY_FOR_SUBMISSION
 → SUBMITTED
 → OUTCOME_RECORDED
 → CLOSED
```

Failure recovery:

```text
PARSING_FAILED → PARSING
ANALYSIS_FAILED → ANALYZING
VALIDATION_FAILED → VALIDATION
```

---

# PHASE 5 Definition of Done

```text
✓ RFP database schema implemented
✓ RFP migration created
✓ RFP CRUD implemented
✓ RFP assignments implemented
✓ RFP status history implemented
✓ State machine implemented
✓ Valid transitions work
✓ Invalid transitions rejected
✓ Failure states recover correctly
✓ RBAC enforced
✓ ABAC enforced
✓ Organization isolation verified
✓ Cross-tenant access rejected
✓ Audit events integrated
✓ Domain events defined
✓ API endpoints tested
✓ Integration tests pass
✓ Security tests pass
✓ Existing tests remain green
✓ Typecheck passes
✓ Lint passes
✓ Database migration succeeds
✓ API boots cleanly
✓ Real HTTP flow verified
```

---

# PHASE 6 — Document Processing & Requirement Intelligence

## Status

**IN PROGRESS** — delivered in slices:

| Slice | Scope                                                        | Status   |
| ----- | ------------------------------------------------------------ | -------- |
| 6A    | Queue infrastructure (producer, worker, retries, DLQ)          | COMPLETE |
| 6B    | Extracted-content storage                                      | COMPLETE |
| 6C    | Text & table extraction                                        | PENDING  |
| 6D    | Requirements schema alignment                                  | PENDING  |
| 6E    | Requirement extraction + CRUD                                  | PENDING  |
| 6F    | Requirement graph                                              | PENDING  |

Document Management (uploads, storage, versioning, MIME/size/checksum) was
already delivered ahead of this phase and is not repeated in the slices above.

### Decisions taken

- **Extraction stack:** `unpdf` (PDF), `mammoth` (DOCX), `exceljs` (XLSX),
  `node-html-parser` (HTML). PPTX and OCR are explicitly unsupported for now
  and fail with a clear reason rather than being half-built.
- **Requirement extraction is deterministic** (structure + modal verbs),
  behind an interface Phase 8 can swap for a model-backed implementation.
- **Enums are extended additively.** `requirement_status` and
  `requirement_category` have 35 references across legacy-api and legacy-web,
  which are what the deployed demo runs on; renaming them is deferred to the
  legacy-to-apps/web migration.

## Objective

Build the complete pipeline that transforms uploaded RFP documents into structured requirements.

```text
Upload
   ↓
Object Storage
   ↓
Queue
   ↓
Document Processing
   ↓
Text / Table Extraction
   ↓
Normalization
   ↓
Requirement Extraction
   ↓
Requirement Graph
```

## Document Management

Support:

```text
PDF
DOCX
XLSX
PPTX
ZIP
HTML
```

Entities:

```text
File
RFPDocument
DocumentVersion
```

Implement:

```text
Secure uploads
MIME validation
File size limits
Checksums
Object storage
Versioning
Secure downloads
Delete/archive
```

## Processing

```text
NestJS API
    ↓
Redis
    ↓
BullMQ
    ↓
Bun Worker
```

Jobs:

```text
DOCUMENT_PARSE
DOCUMENT_OCR
TABLE_EXTRACTION
DOCUMENT_NORMALIZATION
```

Include:

```text
Retries
Idempotency
Job status
Failure handling
Dead-letter handling
Worker recovery
```

## Requirement Intelligence

Entity:

```text
RFPRequirement
```

Fields:

```text
id
rfp_id
requirement
question
category
mandatory
risk
source_location
owner_id
reviewer_id
status
metadata
```

Categories:

```text
PRODUCT
TECHNICAL
SECURITY
LEGAL
COMMERCIAL
COMPLIANCE
IMPLEMENTATION
SUPPORT
GENERAL
```

Statuses:

```text
UNANSWERED
AI_DRAFT
NEEDS_REVIEW
IN_REVIEW
APPROVED
REJECTED
FINAL
```

## Requirement Graph

```text
Requirement
├── Answer
├── Evidence
├── Capability
├── Risk
├── Owner
├── Reviewer
├── Approval
└── Contract
```

Implement:

```text
Parent/child requirements
Dependencies
Duplicate detection
Cross-document references
Source locations
Traceability
```

## Definition of Done

```text
Upload RFP
    ↓
Process documents
    ↓
Extract content
    ↓
Extract requirements
    ↓
Store requirements
    ↓
Link requirements to source
```

---

# PHASE 7 — Knowledge, Search & Evidence

## Objective

Build the shared organizational knowledge and evidence retrieval layer.

Do NOT create a separate RFP knowledge base.

```text
Knowledge Source
      ↓
Knowledge Version
      ↓
Knowledge Chunk
      ↓
Embedding
      ↓
pgvector
```

And:

```text
Knowledge
    ↓
OpenSearch
```

## Source Types

```text
PRODUCT_DOCUMENTATION
SECURITY_DOCUMENTATION
ARCHITECTURE
SLA
POLICY
CONTRACT
COMMERCIAL_POLICY
APPROVED_RFP
HISTORICAL_RFP
```

## Search

Implement:

```text
Semantic search
Keyword search
Full-text search
Filters
Hybrid retrieval
Ranking
Reranking
```

Architecture:

```text
User / Agent
     ↓
Retrieval Service
     ↓
┌───────────────┬───────────────┐
↓               ↓
pgvector      OpenSearch
↓               ↓
Semantic       Keyword
Search         Search
└───────┬───────┘
        ↓
     Rerank
        ↓
Best Evidence
```

## Evidence

```text
RFPEvidence

answer_id
source_id
source_version
relevance
freshness
confidence
verified_at
verified_by
```

Every important answer must eventually support:

```text
Answer
 ↓
Evidence
 ↓
Source
 ↓
Version
 ↓
Freshness
 ↓
Confidence
```

---

# PHASE 8 — AI Response & RFP Intelligence

## Objective

Build the AI intelligence layer.

```text
Requirement
     ↓
Knowledge Retrieval
     ↓
Historical RFP Retrieval
     ↓
Evidence Ranking
     ↓
AI Generation
     ↓
Confidence
     ↓
Risk
     ↓
SME Routing
     ↓
Go / No-Go
```

## AI Provider Abstraction

```text
RFP AI Service
       ↓
Model Router
       ↓
Provider Interface
   ┌───┼────┐
   ↓   ↓    ↓
OpenAI Anthropic Gemini
```

Support:

```text
generate()
stream()
embed()
classify()
structuredOutput()
```

Router factors:

```text
Task
Quality
Latency
Cost
Context length
Availability
Risk
```

## Answer Generation

```text
Requirement
    ↓
Retrieve Knowledge
    ↓
Retrieve Historical RFPs
    ↓
Rank Evidence
    ↓
Generate Answer
    ↓
Confidence
    ↓
Risk
```

## SME Workflow

```text
AI Draft
   ↓
Assignment
   ↓
SME Review
   ↓
Approve / Reject
   ↓
Final
```

Routing:

```text
Security       → Security
Legal          → Legal
Pricing        → Sales
Architecture   → Engineering
Product        → Product
Implementation → Delivery
Compliance     → Compliance
```

## Risk Engine

Detect:

```text
Capability Gap
Security Risk
Legal Risk
Commercial Risk
Compliance Risk
Unsupported Claim
Stale Evidence
Conflicting Evidence
Missing Evidence
```

Severity:

```text
LOW
MEDIUM
HIGH
CRITICAL
```

Autonomy:

```text
LOW
→ AI answer

MEDIUM
→ AI + evidence

HIGH
→ Human review

CRITICAL
→ Specialist approval
```

## Conflict & Freshness

Authority:

```text
Current signed contract
        ↓
Current approved policies
        ↓
Current product documentation
        ↓
Current architecture/SLA
        ↓
Approved commercial policies
        ↓
Historical RFPs
        ↓
Archived information
```

Detect:

```text
STALE
AGING
CONFLICTING
UNVERIFIED
```

## Go / No-Go

Evaluate:

```text
Product Fit
Technical Fit
Security Fit
Commercial Fit
Timeline Fit
Strategic Fit
Competitive Position
```

Return:

```text
GO
GO_WITH_CONDITIONS
REVIEW
NO_GO
```

Human users must be able to override the recommendation.

---

# PHASE 9 — Review, Validation & Submission

## Objective

Complete the final RFP business workflow.

```text
AI Answers
    ↓
Review
    ↓
Validation
    ↓
Approval
    ↓
Submission
    ↓
Outcome
    ↓
RFP Memory
```

## Validation

```text
Requirement Validation
        ↓
Compliance Validation
        ↓
Evidence Validation
        ↓
Conflict Validation
        ↓
Risk Validation
        ↓
Approval Validation
        ↓
Submission Validation
```

Validate:

```text
All mandatory requirements answered
High-risk answers reviewed
Critical answers approved
Evidence attached
Evidence sufficiently fresh
Conflicts resolved
Required approvals completed
Submission package complete
```

## Submission

```text
RFPSubmission

rfp_id
version
status
submitted_at
submitted_by
metadata
```

Package:

```text
Completed Questionnaire
Executive Summary
Requirement Matrix
Compliance Matrix
Risk Report
Evidence Report
Pricing
Exceptions
Approval History
Submission Record
```

## Outcome

```text
WON
LOST
CANCELLED
NO_DECISION
```

Store:

```text
Question
Answer
Customer
Industry
Deal
Outcome
Reviewer
Evidence
Human Edits
```

Future retrieval:

```text
New Question
     ↓
Historical Search
     ↓
Approved Responses
     ↓
Evidence
     ↓
Win/Loss Context
     ↓
Candidate Answer
```

Historical answers remain contextual.

Current authoritative knowledge remains the source of truth.

---

# PHASE 10 — Events, MCP & Browser Automation

## Objective

Expose the RFP backend through events, MCP and browser workflows.

## Event Architecture

```text
API
 ↓
Domain Service
 ↓
Database Transaction
 ↓
Domain Event
 ↓
BullMQ
 ↓
Worker
 ↓
Result
```

Events:

```text
RFP_CREATED
RFP_UPDATED
DOCUMENT_UPLOADED
DOCUMENT_PARSED
DOCUMENT_PARSE_FAILED
REQUIREMENTS_EXTRACTED
QUALIFICATION_COMPLETED
ANSWER_GENERATED
EVIDENCE_RETRIEVED
RISK_DETECTED
CONFLICT_DETECTED
REVIEW_ASSIGNED
ANSWER_APPROVED
ANSWER_REJECTED
VALIDATION_COMPLETED
SUBMISSION_CREATED
RFP_SUBMITTED
OUTCOME_RECORDED
```

## MCP

Expose:

```text
create_rfp
get_rfp
search_requirements
get_requirement
search_knowledge
retrieve_evidence
generate_answer
get_answer
assign_requirement
review_answer
approve_answer
validate_rfp
generate_submission
record_outcome
```

MCP must respect:

```text
Authentication
Authorization
Organization Isolation
Audit
Risk Policies
```

## Browser Extension

```text
Browser
   ↓
Plasmo Extension
   ↓
RFP API
   ↓
Knowledge
   ↓
AI
   ↓
Evidence
   ↓
Risk
   ↓
Answer
```

Backend APIs:

```http
POST /api/v1/rfp-agent/questions/analyze
POST /api/v1/rfp-agent/questions/answer
POST /api/v1/rfp-agent/questions/evidence
```

The extension must not contain its own:

```text
RAG
AI business logic
Knowledge retrieval logic
Risk policy logic
```

## Safe Autofill

```text
LOW
→ Auto-fill allowed

MEDIUM
→ Generate + Review

HIGH
→ Review required

CRITICAL
→ Approval required
→ Auto-fill prohibited
```

Backend policy is authoritative.

---

# PHASE 11 — Production Engineering

## Objective

Make the RFP OS production-ready.

## Observability

Use:

```text
OpenTelemetry
Sentry
PostHog
```

Trace:

```text
Request
 ↓
NestJS
 ↓
Database
 ↓
Redis
 ↓
Worker
 ↓
AI Provider
```

AI telemetry:

```text
Model
Model Version
Prompt Version
Latency
Tokens
Cost
Confidence
Result
```

## Testing

### Unit

```text
State transitions
Authorization
Requirement logic
Risk logic
Evidence freshness
Conflict resolution
Validation
Model routing
```

### E2E

```text
Login
 ↓
Create RFP
 ↓
Upload document
 ↓
Process RFP
 ↓
Review answers
 ↓
Approve
 ↓
Validate
 ↓
Export
```

### AI Evaluation

Dataset:

```text
Question
Expected Answer
Required Evidence
Risk
Expected Confidence
```

## Security Hardening

```text
Authentication
Authorization
RBAC
ABAC
Tenant isolation
Rate limiting
Input validation
File validation
Audit
Secrets management
Encryption
```

## Reliability

```text
Retries
Dead-letter queues
Idempotency
Backups
Worker recovery
Job recovery
Graceful shutdown
Health checks
```

## Performance

```text
Database indexes
Pagination
Batch processing
Caching
Parallel workers
Queue processing
Search optimization
```

---

# 5. Consolidated Development Flow

The backend should now be implemented in this order:

```text
PHASE 1–4
FOUNDATION
✓ COMPLETE
       ↓
PHASE 5
RFP CORE + LIFECYCLE
       ↓
PHASE 6
DOCUMENTS + REQUIREMENTS
       ↓
PHASE 7
KNOWLEDGE + SEARCH + EVIDENCE
       ↓
PHASE 8
AI + RISK + INTELLIGENCE
       ↓
PHASE 9
REVIEW + VALIDATION + SUBMISSION
       ↓
PHASE 10
EVENTS + MCP + BROWSER
       ↓
PHASE 11
PRODUCTION ENGINEERING
```

---

# 6. MVP Target

Do not implement all phases before validating the product.

The first usable RFP backend should reach:

```text
Organization
      ↓
RFP Creation
      ↓
Document Upload
      ↓
Document Processing
      ↓
Requirement Extraction
      ↓
Knowledge Retrieval
      ↓
AI Answer
      ↓
Evidence
      ↓
Human Review
      ↓
Validation
      ↓
Export
```

The MVP should primarily cover:

```text
Phase 5
Phase 6
Phase 7
Phase 8
Phase 9
```

Phase 10 and Phase 11 can follow once the core RFP workflow is proven.

---

# 7. Engineering Rules

## Rule 1 — Reuse Existing Infrastructure

Do not create separate RFP versions of:

```text
Users
Organizations
Permissions
RBAC
ABAC
Audit
Knowledge
Search
Memory
Agent Framework
Files
Authentication
```

Consume existing platform capabilities.

---

## Rule 2 — Tenant Isolation Is Mandatory

Every organization-owned RFP entity must be scoped by:

```text
organization_id
```

Never rely only on:

```text
user_id
```

Never trust an organization ID supplied by the client without validating it against authenticated membership.

---

## Rule 3 — Domain Before AI

Build:

```text
RFP
 ↓
Lifecycle
 ↓
Requirements
 ↓
Knowledge
 ↓
Evidence
```

before building advanced AI agents.

AI must operate on the domain model rather than define it.

---

## Rule 4 — State Changes Are Controlled

Never allow:

```http
PATCH /rfps/:id
```

to arbitrarily modify:

```text
status
```

Use the state machine.

Every transition must:

```text
Validate
Authorize
Persist
Audit
Publish Event
```

---

## Rule 5 — Evidence Before Autonomous Answers

AI answers must eventually be grounded in:

```text
Knowledge
Evidence
Source
Version
Freshness
Confidence
```

---

## Rule 6 — Risk Determines Autonomy

```text
LOW
→ Autonomous

MEDIUM
→ Evidence-backed AI

HIGH
→ Human review

CRITICAL
→ Specialist approval
```

---

## Rule 7 — Historical Knowledge Is Context

Historical RFP answers can help generate answers but must never automatically override current authoritative sources.

Authority hierarchy:

```text
Current Contract
      ↓
Approved Policy
      ↓
Current Product Documentation
      ↓
Architecture / SLA
      ↓
Commercial Policy
      ↓
Historical RFP
      ↓
Archived Information
```

---

## Rule 8 — Additive Migrations

Database changes must be:

```text
Additive
Backward compatible
Reviewable
Reversible where practical
```

Never casually drop existing data.

---

## Rule 9 — Test the Running System

Do not consider a phase complete because:

```text
TypeScript compiles
```

A phase is complete only after:

```text
Typecheck
+
Lint
+
Unit Tests
+
Integration Tests
+
Database Verification
+
Running API Verification
```

---

## Rule 10 — Do Not Expand Scope

If a task belongs to a future phase:

```text
Document Processing
RAG
AI
Risk
MCP
Browser
Production Hardening
```

do not silently implement it early.

Document it as:

```text
DEFERRED TO PHASE X
```

---

# 8. Phase Completion Standard

Every phase must finish with:

```text
IMPLEMENTED
    ↓
TYPECHECKED
    ↓
LINTED
    ↓
UNIT TESTED
    ↓
INTEGRATION TESTED
    ↓
DATABASE VERIFIED
    ↓
RUNNING API VERIFIED
    ↓
DOCUMENTED
```

The final report for every phase must contain:

```text
1. Files changed
2. Database changes
3. API changes
4. Domain changes
5. Authorization changes
6. Audit changes
7. Events added
8. Tests added
9. Test results
10. Typecheck result
11. Lint result
12. Runtime verification
13. Issues discovered
14. Deferred work
15. Final completion status
```

Use explicit statuses:

```text
IMPLEMENTED
VERIFIED
DEFERRED
BLOCKED
```

Never claim something is complete unless it has actually been verified.

---

# 9. North-Star Architecture

```text
                         RFP OS
                           │
                           ↓
                         RFP
                           ↓
                      Understand
                           ↓
                       Qualify
                           ↓
                         Map
                           ↓
                       Retrieve
                           ↓
                        Answer
                           ↓
                       Evidence
                           ↓
                         Risk
                           ↓
                        Review
                           ↓
                       Validate
                           ↓
                        Submit
                           ↓
                        Outcome
                           ↓
                         Learn
                           ↓
                  Better Next RFP
```

---

# 10. Final Engineering Principle

**Build the foundation first. Build intelligence on top of the foundation, not the other way around.**

The RFP domain is the source of truth.

AI is an intelligence layer operating on top of:

```text
RFP
Requirements
Knowledge
Evidence
Risk
Workflow
Authorization
Audit
```

The final system should evolve from:

```text
RFP Management
```

into:

```text
RFP Operating System
```

without creating duplicated platform infrastructure.

```
```
