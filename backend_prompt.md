# RFP OS — Phase-by-Phase Coding Agent Prompts

## Global Rules — Apply to Every Phase

Before executing any phase, the coding agent MUST follow these rules:

```text
You are implementing the RFP OS production codebase.

IMPORTANT:
1. Inspect the existing repository before changing anything.
2. Do NOT blindly rewrite existing code.
3. Preserve all working functionality from previous phases.
4. Follow the existing architecture and coding conventions.
5. Use TypeScript throughout the application.
6. Use Bun as the runtime.
7. Backend framework is NestJS.
8. Database is PostgreSQL.
9. ORM is Drizzle ORM.
10. Use Turborepo for the monorepo.
11. Use REST APIs for application APIs.
12. MCP is implemented as a separate MCP server.
13. Use Redis + BullMQ for asynchronous jobs.
14. Use MinIO/S3 for object storage.
15. Use pgvector for vector search.
16. Use OpenSearch for hybrid search.
17. AI providers must go through a provider abstraction and model router.
18. Never hard-code OpenAI/Anthropic/Gemini calls inside business logic.
19. Authentication uses Better Auth.
20. Authorization uses RBAC + ABAC.
21. All organization-owned resources must enforce organization isolation.
22. Important mutations must create audit records.
23. Long-running operations must use background jobs.
24. Use Zod/shared validation where appropriate.
25. Write tests for all important business logic.
26. Do not introduce unnecessary dependencies.
27. Do not create duplicate platform infrastructure.
28. Do not create a second knowledge base, authentication system, user system, permission system, or audit system specifically for RFP.
29. RFP is a domain module that consumes shared platform services.
30. Never remove functionality simply to make the current phase easier.

For every phase:
- Inspect first.
- Plan briefly.
- Implement.
- Run type checking.
- Run linting.
- Run relevant tests.
- Run database migrations if applicable.
- Fix errors.
- Verify the implementation.
- Provide a concise implementation report.
```

---

# PHASE 1 — Monorepo & Runtime Foundation

## Prompt

```text
Implement PHASE 1 of the RFP OS backend.

Goal:
Create the production monorepo and runtime foundation.

Technology:
- Turborepo
- Bun
- TypeScript
- Next.js App Router
- NestJS
- Plasmo
- Docker

Required applications:

apps/
├── web
├── api
├── worker
├── mcp
└── extension

Required packages:

packages/
├── ui
├── types
├── config
├── db
├── ai
├── validation
└── observability

Tasks:

1. Inspect the existing repository.
2. Preserve existing functionality.
3. Configure Turborepo.
4. Configure Bun workspaces.
5. Configure TypeScript.
6. Configure shared tsconfig.
7. Configure environment management.
8. Create the Next.js web application if missing.
9. Create the NestJS API application if missing.
10. Create the Bun worker application.
11. Create the MCP server application.
12. Create the Plasmo extension application.
13. Create shared packages.
14. Configure Docker development infrastructure.
15. Add root scripts for:
   - dev
   - build
   - test
   - lint
   - typecheck
16. Add .env.example files.
17. Add proper .gitignore.
18. Add README describing the architecture.

Do NOT implement RFP business logic yet.

Acceptance criteria:

- bun install works
- turbo dev works
- web starts
- NestJS API starts
- worker starts
- MCP server starts
- extension builds
- shared packages resolve
- TypeScript passes
- lint passes
- tests execute
```

---

# PHASE 2 — NestJS API Foundation

```text
Implement PHASE 2 of the RFP OS backend.

Goal:
Create a production-grade NestJS API foundation running on Bun.

Inspect the repository and preserve Phase 1.

Implement:

1. NestJS application architecture.
2. Modular module structure.
3. API versioning using /api/v1.
4. Global validation.
5. Global exception handling.
6. Structured API error format.
7. Request ID middleware/interceptor.
8. Structured logging.
9. CORS configuration.
10. Security headers where appropriate.
11. Health endpoint.
12. Readiness endpoint.
13. Configuration module.
14. Environment validation.
15. Graceful shutdown.
16. Basic rate-limiting foundation.

Expected endpoints:

GET /health
GET /ready
GET /api/v1/health

Create:

src/common/
├── guards
├── interceptors
├── filters
├── decorators
├── pipes
└── middleware

Do not implement authentication or RFP logic yet.

Run:
- typecheck
- lint
- tests
- build

Fix all errors before finishing.
```

---

# PHASE 3 — PostgreSQL + Drizzle

```text
Implement PHASE 3.

Goal:
Establish PostgreSQL + Drizzle ORM as the transactional database layer.

Technology:
- PostgreSQL
- Drizzle ORM
- Bun

Tasks:

1. Inspect existing database code.
2. Create packages/db.
3. Configure Drizzle.
4. Configure PostgreSQL connection.
5. Create migration system.
6. Create schema organization by domain.
7. Create database client.
8. Create transaction helpers.
9. Create seed infrastructure.
10. Configure Docker PostgreSQL.
11. Add database health check.

Schema structure:

packages/db/
├── schema/
│   ├── identity
│   ├── organization
│   ├── audit
│   ├── files
│   ├── knowledge
│   └── rfp
├── migrations
├── relations
└── client.ts

Do not implement all RFP tables yet.

Create only the foundation necessary for future phases.

Acceptance:
- PostgreSQL starts
- Drizzle connects
- migration runs
- rollback/development workflow works
- API can perform a test DB query
- typecheck/lint/tests pass
```

---

# PHASE 4 — Authentication & Organizations

```text
Implement PHASE 4.

Goal:
Implement multi-tenant authentication and organization management.

Technology:
Better Auth + PostgreSQL + Drizzle.

Implement:

1. Better Auth.
2. User model.
3. Organization model.
4. Organization membership.
5. Roles.
6. Permissions.
7. Invitations.
8. Member lifecycle.
9. Authentication guards.
10. Organization context.
11. RBAC.
12. ABAC foundation.

Roles:

OWNER
ADMIN
RFP_MANAGER
CONTRIBUTOR
REVIEWER
SME
VIEWER

Permissions:

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

Requirements:

- Every organization-owned request must resolve organization context.
- Prevent cross-organization access.
- Authorization must happen server-side.
- Do not rely on frontend permissions.

Create reusable authorization guards/decorators.

Add tests for:
- authentication
- authorization
- tenant isolation
- role permissions
- forbidden actions
```

---

# PHASE 5 — Audit & Security

```text
Implement PHASE 5.

Goal:
Create the organization-wide audit and security foundation.

Create AuditLog:

id
organization_id
actor_id
action
entity_type
entity_id
before
after
metadata
ip_address
user_agent
created_at

Implement:

- Audit service
- Audit interceptor/helper
- Audit event creation
- Before/after tracking
- Organization scoping
- Sensitive-field filtering
- Security logging

Track:

RFP_CREATED
RFP_UPDATED
RFP_DELETED
DOCUMENT_UPLOADED
DOCUMENT_DELETED
REQUIREMENT_CREATED
REQUIREMENT_UPDATED
ANSWER_GENERATED
ANSWER_UPDATED
ANSWER_APPROVED
ANSWER_REJECTED
EVIDENCE_ATTACHED
REVIEW_ASSIGNED
RFP_VALIDATED
RFP_SUBMITTED
OUTCOME_RECORDED

Do not expose secrets or sensitive credentials in audit records.

Add tests.
```

---

# PHASE 6 — RFP Domain Model

```text
Implement PHASE 6.

Goal:
Create the core RFP domain model.

Create:

RFP
RFPDocument
RFPRequirement
RFPAnswer
RFPEvidence
RFPReview
RFPRisk
RFPAssignment
RFPSubmission
RFPOutcome

Start with the core RFP table and relations required by future phases.

RFP fields:

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

Implement:

- Drizzle schemas
- Relations
- Indexes
- Repository
- Service
- DTOs
- Zod validation
- REST routes

Endpoints:

POST /api/v1/rfps
GET /api/v1/rfps
GET /api/v1/rfps/:id
PATCH /api/v1/rfps/:id
DELETE /api/v1/rfps/:id

Requirements:

- Tenant isolation
- Authorization
- Audit
- Validation
- Pagination
- Filtering
- Sorting

Do not implement AI yet.
```

---

# PHASE 7 — RFP State Machine

```text
Implement PHASE 7.

Goal:
Create a strict RFP lifecycle state machine.

States:

DRAFT
INTAKE
PARSING
ANALYZING
QUALIFICATION
RESPONSE
REVIEW
VALIDATION
READY_FOR_SUBMISSION
SUBMITTED
OUTCOME_RECORDED
CLOSED

Failure states:

PARSING_FAILED
ANALYSIS_FAILED
VALIDATION_FAILED

Implement:

- State transition service
- Allowed transitions
- Invalid transition protection
- Authorization per transition
- Audit event
- Domain event
- Transaction safety

Every transition must:

Validate
→ Authorize
→ Persist
→ Audit
→ Publish Event

Add tests covering every valid and invalid transition.

Do not allow arbitrary status updates through PATCH.
```

---

# PHASE 8 — Document Management

```text
Implement PHASE 8.

Goal:
Build secure RFP document management.

Technology:
MinIO/S3.

Supported:

PDF
DOCX
XLSX
PPTX
ZIP
HTML

Create:

File
RFPDocument
DocumentVersion

Implement:

- Upload
- Secure object storage
- MIME validation
- File-size validation
- SHA-256 checksum
- Versioning
- Metadata
- Secure download
- Delete/archive
- Organization isolation

Statuses:

UPLOADED
QUEUED
PROCESSING
PARSED
FAILED

Endpoints:

POST /api/v1/rfps/:id/documents
GET /api/v1/rfps/:id/documents
GET /api/v1/rfps/:id/documents/:documentId
DELETE /api/v1/rfps/:id/documents/:documentId

Do not process documents synchronously inside the API.
Prepare the document for BullMQ processing.
```

---

# PHASE 9 — Document Processing Workers

```text
Implement PHASE 9.

Goal:
Create the asynchronous document-processing system.

Technology:

Redis
BullMQ
Bun Worker

Jobs:

DOCUMENT_PARSE
DOCUMENT_OCR
TABLE_EXTRACTION
DOCUMENT_NORMALIZATION

Pipeline:

Upload
→ Queue
→ Detect Type
→ Extract Text
→ Extract Tables
→ Normalize
→ Store Parsed Content
→ Trigger Requirement Extraction

Implement:

- Queue definitions
- Worker processors
- Job IDs
- Job status
- Retry policy
- Exponential backoff
- Idempotency
- Dead-letter handling
- Failure handling
- Worker logging
- Job audit events

Do not implement requirement extraction yet.

Create a clean interface so Phase 10 can consume normalized document content.
```

---

# PHASE 10 — Requirement Intelligence

```text
Implement PHASE 10.

Goal:
Transform parsed RFP documents into structured requirements.

Create RFPRequirement.

Fields:

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

Categories:

PRODUCT
TECHNICAL
SECURITY
LEGAL
COMMERCIAL
COMPLIANCE
IMPLEMENTATION
SUPPORT
GENERAL

Statuses:

UNANSWERED
AI_DRAFT
NEEDS_REVIEW
IN_REVIEW
APPROVED
REJECTED
FINAL

Implement a Requirement Extraction service.

Pipeline:

Parsed Document
→ Question Detection
→ Requirement Extraction
→ Classification
→ Mandatory Detection
→ Risk Classification
→ Persist Requirements

The extraction engine must be replaceable and must not be tightly coupled to one AI provider.

Store exact source location/provenance.

Add tests with representative sample requirements.
```

---

# PHASE 11 — Requirement Graph

```text
Implement PHASE 11.

Goal:
Create traceability relationships around requirements.

Requirement must be able to connect to:

Answer
Evidence
Capability
Risk
Owner
Reviewer
Approval
Contract

Implement:

- Parent/child requirements
- Requirement dependencies
- Duplicate detection
- Cross-document references
- Source references
- Traceability queries

Add APIs for retrieving the complete requirement graph.

Example:

GET /api/v1/rfps/:id/requirements/:requirementId/graph

Do not duplicate evidence or knowledge data.
Use references to shared platform entities.
```

---

# PHASE 12 — Knowledge Architecture

```text
Implement PHASE 12.

Goal:
Create the shared organizational knowledge layer consumed by RFP.

Do NOT build a separate RFP knowledge base.

Create/extend:

KnowledgeSource
KnowledgeVersion
KnowledgeChunk

Support source types:

PRODUCT_DOCUMENTATION
SECURITY_DOCUMENTATION
ARCHITECTURE
SLA
POLICY
CONTRACT
COMMERCIAL_POLICY
APPROVED_RFP
HISTORICAL_RFP

Track:

source
version
authority
owner
created_at
updated_at
verified_at
expires_at

Implement knowledge ingestion and versioning.

Important authority order:

1. Current signed contract
2. Current approved policies
3. Current product documentation
4. Current architecture/SLA
5. Approved commercial policies
6. Historical RFPs
7. Archived information

Do not implement vector retrieval yet.
Prepare normalized knowledge chunks for Phase 13.
```

---

# PHASE 13 — pgvector + OpenSearch RAG

```text
Implement PHASE 13.

Goal:
Build hybrid knowledge retrieval.

Technology:

PostgreSQL
pgvector
OpenSearch
Embeddings

Architecture:

Query
→ Retrieval Service
→ pgvector semantic search
+
OpenSearch keyword/full-text search
→ Merge
→ Rank/Rerank
→ Evidence candidates

Implement:

- Embedding generation interface
- pgvector schema
- OpenSearch index
- Indexing pipeline
- Semantic search
- Keyword search
- Hybrid retrieval
- Filtering
- Metadata filtering
- Source authority weighting
- Freshness weighting

Do not hard-code one embedding provider.

Create:

packages/ai/retrieval/

The retrieval service must return provenance for every result.
```

---

# PHASE 14 — Evidence Engine

```text
Implement PHASE 14.

Goal:
Make evidence a first-class part of every RFP answer.

RFPEvidence:

id
answer_id
source_id
source_version
relevance
freshness
confidence
verified_at
verified_by
metadata

Implement:

- Evidence linking
- Evidence verification
- Evidence confidence
- Evidence freshness
- Source version tracking
- Evidence citations
- Unsupported-answer detection

Required relationship:

Answer
→ Evidence
→ Knowledge Source
→ Knowledge Version

Create APIs:

GET /api/v1/answers/:answerId/evidence
POST /api/v1/answers/:answerId/evidence
DELETE /api/v1/answers/:answerId/evidence/:evidenceId

Every evidence record must preserve provenance.
```

---

# PHASE 15 — AI Provider Abstraction

```text
Implement PHASE 15.

Goal:
Create provider-independent AI infrastructure.

Providers:

OpenAI
Anthropic
Gemini

Architecture:

RFP AI Service
→ Model Router
→ Provider Interface
→ Provider Adapter

Required operations:

generate()
stream()
embed()
classify()
structuredOutput()

Model router must consider:

- task
- quality
- latency
- cost
- context length
- provider availability
- risk

Requirements:

1. Never call OpenAI directly from RFP business logic.
2. Never call Anthropic directly from RFP business logic.
3. Never call Gemini directly from RFP business logic.
4. Provider adapters must be replaceable.
5. Log model/version/prompt metadata.
6. Do not log sensitive prompt content by default.

Add provider mocking for tests.
```

---

# PHASE 16 — AI Answer Generation

```text
Implement PHASE 16.

Goal:
Generate evidence-backed RFP answers.

Pipeline:

Requirement
→ Knowledge Retrieval
→ Historical RFP Retrieval
→ Evidence Ranking
→ Answer Generation
→ Confidence
→ Risk
→ Review

Implement:

- Answer generation service
- Structured AI output
- Evidence references
- Confidence scoring
- Generation metadata
- Prompt versioning
- Answer versioning
- Regeneration

Answer fields:

answer
confidence
status
generated_by
generated_at
approved_by
approved_at

API:

POST /api/v1/rfps/:id/answers/:answerId/regenerate

AI output must never automatically become FINAL.

Default generated status:

AI_DRAFT
```

---

# PHASE 17 — SME Workflow

```text
Implement PHASE 17.

Goal:
Create human review and SME assignment.

Routing:

Security → Security
Legal → Legal
Pricing → Sales
Architecture → Engineering
Product → Product
Implementation → Delivery
Compliance → Compliance

Create RFPAssignment.

Fields:

id
requirement_id
user_id
role
deadline
status
created_at

Implement:

- Assignment
- Reassignment
- Review
- Comments
- Approval
- Rejection
- Escalation
- Deadline tracking

Workflow:

AI_DRAFT
→ ASSIGNED
→ IN_REVIEW
→ APPROVED

or:

IN_REVIEW
→ REJECTED
→ AI_DRAFT

All actions must be authorized and audited.
```

---

# PHASE 18 — Risk Engine

```text
Implement PHASE 18.

Goal:
Build the RFP risk engine.

Risk types:

CAPABILITY_GAP
SECURITY_RISK
LEGAL_RISK
COMMERCIAL_RISK
COMPLIANCE_RISK
UNSUPPORTED_CLAIM
STALE_EVIDENCE
CONFLICTING_EVIDENCE
MISSING_EVIDENCE

Severity:

LOW
MEDIUM
HIGH
CRITICAL

Implement:

- Risk detection
- Risk scoring
- Risk persistence
- Risk ownership
- Risk mitigation
- Risk status
- Risk escalation

Autonomy policy:

LOW:
AI may answer.

MEDIUM:
AI answer + evidence.

HIGH:
Human review required.

CRITICAL:
Specialist approval required.

Backend must enforce the policy.
```

---

# PHASE 19 — Conflict + Freshness

```text
Implement PHASE 19.

Goal:
Prevent outdated or contradictory knowledge from being used as authoritative truth.

Implement:

- Source authority ranking
- Freshness calculation
- Expiration detection
- Conflict detection
- Claim comparison
- Conflict resolution recommendations
- Stale-answer detection

Track:

created
updated
verified
expires
owner
version

Statuses:

VERIFIED
AGING
STALE
CONFLICTING
UNVERIFIED

Authority:

1. Current signed contract
2. Current approved policies
3. Current product documentation
4. Current architecture/SLA
5. Approved commercial policies
6. Historical RFPs
7. Archived information

Create APIs for knowledge health and answer provenance.
```

---

# PHASE 20 — Go / No-Go Intelligence

```text
Implement PHASE 20.

Goal:
Evaluate whether an organization should pursue an RFP.

Factors:

Product Fit
Technical Fit
Security Fit
Commercial Fit
Timeline Fit
Strategic Fit
Competitive Position

Outcomes:

GO
GO_WITH_CONDITIONS
REVIEW
NO_GO

Implement:

- Qualification model
- Scoring
- Capability gaps
- Risk factors
- Recommendation
- Human override
- Audit trail

The AI recommendation must never prevent a human from overriding the result.

Expose:

POST /api/v1/rfps/:id/qualify
GET /api/v1/rfps/:id/qualification
```

---

# PHASE 21 — Validation Engine

```text
Implement PHASE 21.

Goal:
Create final RFP validation.

Pipeline:

Requirement Validation
→ Compliance Validation
→ Evidence Validation
→ Conflict Validation
→ Risk Validation
→ Approval Validation
→ Submission Validation

Rules:

1. All mandatory requirements must be answered.
2. Critical requirements must be reviewed.
3. High-risk requirements require approval.
4. Required evidence must exist.
5. Evidence must meet freshness requirements.
6. Conflicts must be resolved.
7. Required approvals must be complete.
8. Submission package must be complete.

Return a structured validation report:

total_requirements
answered
incomplete
high_risk
critical
evidence_backed
unsupported
conflicts
approved
ready_for_submission

Implement:

POST /api/v1/rfps/:id/validate
GET /api/v1/rfps/:id/validation
```

---

# PHASE 22 — Submission System

```text
Implement PHASE 22.

Goal:
Create the final submission package system.

Create RFPSubmission:

id
rfp_id
version
status
submitted_at
submitted_by
metadata

Statuses:

DRAFT
VALIDATING
READY
SUBMITTED
FAILED

Package:

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

Implement:

- Submission versioning
- Package generation
- Validation before submission
- Submission record
- Submission audit
- Immutable submitted version

A submitted version must not be silently modified.
```

---

# PHASE 23 — Outcome + RFP Memory

```text
Implement PHASE 23.

Goal:
Capture RFP outcomes and create institutional RFP memory.

Outcome:

WON
LOST
CANCELLED
NO_DECISION

Store:

Question
Answer
Customer
Industry
Deal
Outcome
Reviewer
Evidence
Human Edits

Implement:

- Outcome recording
- Historical response storage
- Semantic retrieval
- Approved-answer filtering
- Win/loss context
- Human-edit history

Important:

Historical answers are contextual knowledge.

They must NOT override current authoritative organizational knowledge.

Add:

POST /api/v1/rfps/:id/outcome
GET /api/v1/rfps/:id/outcome
```

---

# PHASE 24 — Event Architecture

```text
Implement PHASE 24.

Goal:
Create domain events and asynchronous workflow integration.

Events:

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

Architecture:

API
→ Domain Service
→ DB Transaction
→ Domain Event
→ BullMQ
→ Worker
→ Result

Requirements:

- Typed events
- Event versioning
- Idempotent consumers
- Retry
- Dead-letter handling
- Event logging
```

---

# PHASE 25 — MCP Server

```text
Implement PHASE 25.

Goal:
Expose RFP capabilities through MCP.

Create MCP tools:

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

All MCP operations must use the same backend services as REST.

Do NOT duplicate business logic inside the MCP server.

MCP must enforce:

Authentication
Authorization
Organization isolation
Audit
Risk policies

Add MCP integration tests.
```

---

# PHASE 26 — Browser Extension Backend

```text
Implement PHASE 26.

Goal:
Prepare backend APIs for the Plasmo browser extension.

Architecture:

Browser
→ Plasmo Extension
→ RFP API
→ Knowledge
→ AI
→ Evidence
→ Risk
→ Answer

Endpoints:

POST /api/v1/rfp-agent/questions/analyze
POST /api/v1/rfp-agent/questions/answer
POST /api/v1/rfp-agent/questions/evidence

Requirements:

- Authentication
- Organization context
- RFP context
- Requirement context
- Evidence references
- Confidence
- Risk
- Safe response policy

The extension must NOT implement its own RAG or AI business logic.
```

---

# PHASE 27 — Safe Autofill Policy

```text
Implement PHASE 27.

Goal:
Create backend-controlled autonomy policies for browser questionnaire workflows.

Policy:

LOW:
Auto-fill allowed.

MEDIUM:
Generate + review.

HIGH:
Review required.

CRITICAL:
Approval required.
Auto-fill prohibited.

Implement:

- Policy evaluation service
- Risk-based decision
- Permission checks
- User role checks
- Organization policy override
- Audit

The frontend/extension must never be trusted as the final enforcement layer.

Return:

allowed
requires_review
requires_approval
blocked
reason
```

---

# PHASE 28 — Observability

```text
Implement PHASE 28.

Goal:
Add complete backend and AI observability.

Technology:

OpenTelemetry
Sentry
PostHog

OpenTelemetry:

Trace:

Request
→ NestJS
→ Database
→ Redis
→ Worker
→ AI
→ Search

Track:

request_id
organization_id
user_id
rfp_id
requirement_id
job_id
model
model_version
prompt_version
latency
tokens
cost
result

Sentry:

- API errors
- Worker errors
- AI failures
- Search failures
- Document failures

PostHog:

- Feature usage
- RFP lifecycle
- Workflow completion
- User behavior
- Product analytics

Do not leak sensitive RFP content into analytics.
```

---

# PHASE 29 — Testing & Evaluation

```text
Implement PHASE 29.

Goal:
Create comprehensive automated testing.

Use:

Vitest
Playwright

Unit tests:

- State machine
- Authorization
- Tenant isolation
- Requirement logic
- Risk logic
- Evidence freshness
- Conflict resolution
- Validation
- Model routing

Integration tests:

- RFP creation
- Document upload
- Document processing
- Requirement extraction
- Knowledge retrieval
- Answer generation
- Evidence
- Review
- Validation
- Submission
- Outcome

E2E:

Login
→ Create RFP
→ Upload document
→ Process
→ Review
→ Approve
→ Validate
→ Export

AI evaluation dataset:

Question
Expected Answer
Required Evidence
Risk
Expected Confidence

Ensure tests are deterministic by mocking AI providers where appropriate.
```

---

# PHASE 30 — Production Hardening

```text
Implement PHASE 30.

Goal:
Prepare the RFP OS backend for production deployment.

Security:

- Authentication
- Authorization
- RBAC
- ABAC
- Tenant isolation
- Rate limiting
- Input validation
- File validation
- Audit
- Secret management
- Encryption
- Security headers

Reliability:

- Retries
- Dead-letter queues
- Idempotency
- Database backups
- Worker recovery
- Job recovery
- Graceful shutdown
- Health checks

Performance:

- Database indexes
- Pagination
- Batch processing
- Caching
- Parallel workers
- Search optimization
- Queue optimization

Deployment:

Docker
→ Dokploy

CI/CD:

GitHub
→ GitHub Actions
→ Test
→ Build
→ Deploy

Create production deployment documentation.

Run:

- tests
- typecheck
- lint
- build
- security checks

Do not declare production-ready until all critical checks pass.
```

---

# MASTER EXECUTION RULE

After completing every phase, the coding agent must produce this report:

```text
PHASE COMPLETED

Phase:
<phase number>

Implemented:
- ...
- ...
- ...

Files Created:
- ...

Files Modified:
- ...

Database Changes:
- ...

API Changes:
- ...

Tests:
- ...

Typecheck:
PASS / FAIL

Lint:
PASS / FAIL

Build:
PASS / FAIL

Migration:
PASS / FAIL

Known Issues:
- ...

Next Recommended Phase:
Phase X
```

---

# IMPORTANT — DO NOT SKIP PHASES

The implementation order is intentional:

```text
1  Monorepo
↓
2  NestJS
↓
3  PostgreSQL/Drizzle
↓
4  Auth/Organization
↓
5  Audit/Security
↓
6  RFP Domain
↓
7  State Machine
↓
8  Documents
↓
9  Workers
↓
10 Requirements
↓
11 Requirement Graph
↓
12 Knowledge
↓
13 RAG/Search
↓
14 Evidence
↓
15 AI Providers
↓
16 AI Answers
↓
17 SME Workflow
↓
18 Risk
↓
19 Conflict/Freshness
↓
20 Go/No-Go
↓
21 Validation
↓
22 Submission
↓
23 Outcome/Memory
↓
24 Events
↓
25 MCP
↓
26 Extension API
↓
27 Safe Autofill
↓
28 Observability
↓
29 Testing
↓
30 Production
```

# Critical Architectural Rule

Never allow the AI layer to become the foundation of the application.

The correct dependency direction is:

```text
                    UI
                     ↓
                   API
                     ↓
                RFP Domain
                     ↓
              Platform Services
             /        |        \
         Files     Knowledge    Audit
                     ↓
                   Search
                     ↓
                    AI
                     ↓
                  Workers
```

Not:

```text
AI Agent
   ↓
Everything
```

The RFP domain model remains the source of truth.

# Final MVP Target

Before implementing advanced autonomous behavior, the system must be capable of:

```text
Create RFP
    ↓
Upload RFP
    ↓
Parse RFP
    ↓
Extract Requirements
    ↓
Search Company Knowledge
    ↓
Generate Evidence-backed Answers
    ↓
Assign SME
    ↓
Review
    ↓
Validate
    ↓
Export Response
```

Once this workflow works reliably, the advanced layers can be added:

```text
Go/No-Go
Risk Intelligence
Conflict Detection
Knowledge Freshness
MCP
Browser Extension
Outcome Learning
Autonomous RFP Planning
```

# Final Product Architecture

```text
                         RFP OS
                           │
          ┌────────────────┴────────────────┐
          ↓                                 ↓
      Next.js Web                       MCP Server
          │                                 │
          └────────────────┬────────────────┘
                           ↓
                       NestJS API
                           │
       ┌───────────────────┼───────────────────┐
       ↓                   ↓                   ↓
 PostgreSQL            OpenSearch           MinIO
 + pgvector                                  S3
       │                   │                   │
       └───────────────────┼───────────────────┘
                           ↓
                      RAG Layer
                           │
                     Model Router
                    /      |      \
                   ↓       ↓       ↓
                OpenAI Anthropic Gemini
                           │
                           ↓
                    Redis + BullMQ
                           │
                           ↓
                       Bun Workers
                           │
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                  ↓
 Document Processing    AI Jobs          Validation
        │                  │                  │
        └──────────────────┼──────────────────┘
                           ↓
                    Audit + Telemetry
                           │
                ┌──────────┴──────────┐
                ↓                     ↓
             Sentry                PostHog
```

# North Star

The completed backend should enable:

```text
RFP
 ↓
UNDERSTAND
 ↓
QUALIFY
 ↓
MAP
 ↓
RETRIEVE
 ↓
ANSWER
 ↓
EVIDENCE
 ↓
RISK
 ↓
REVIEW
 ↓
VALIDATE
 ↓
SUBMIT
 ↓
OUTCOME
 ↓
LEARN
 ↓
BETTER NEXT RFP
```
