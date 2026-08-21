# RFP OS — Backend Implementation Plan v2

## 1. Architecture Goal

Build the RFP OS as a modular, multi-tenant, API-first backend that supports:

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
```

The backend must be built around the **RFP domain model**, not around individual frontend screens or AI agents.

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
Multi-tenant isolation
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
│
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

# PHASE 1 — Monorepo & Runtime Foundation

## Objective

Create the development foundation.

### Implement

* Turborepo
* Bun
* TypeScript
* Workspace configuration
* Environment management
* Shared package configuration
* Docker development environment

### Applications

```text
apps/web
apps/api
apps/worker
apps/mcp
apps/extension
```

### Completion criteria

```text
✓ bun install
✓ turbo dev
✓ API starts
✓ Web starts
✓ Worker starts
✓ Shared packages resolve
✓ Docker infrastructure starts
```

---

# PHASE 2 — NestJS API Foundation

## Objective

Build the production API foundation.

### Structure

```text
apps/api/src/

├── main.ts
├── app.module.ts
│
├── common/
│   ├── guards/
│   ├── interceptors/
│   ├── filters/
│   ├── decorators/
│   └── pipes/
│
├── modules/
│
└── infrastructure/
```

### Implement

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

### Endpoints

```http
GET /health
GET /ready
GET /api/v1/health
```

---

# PHASE 3 — Database Foundation

## Objective

Establish PostgreSQL as the transactional source of truth.

### Stack

```text
PostgreSQL
     ↓
Drizzle ORM
```

### Create

```text
packages/db/
├── schema/
├── migrations/
├── relations/
└── client.ts
```

### Initial database domains

```text
identity
organization
audit
files
knowledge
rfp
```

### Requirements

* Database connection
* Drizzle configuration
* Migration system
* Relations
* Indexes
* Transactions
* Seed system

---

# PHASE 4 — Authentication & Organization

## Objective

Implement multi-tenancy before building RFP functionality.

### Core entities

```text
User
Organization
OrganizationMember
Role
Permission
AccessPolicy
```

### Authentication

Use:

```text
Better Auth
```

### Authorization

Use:

```text
RBAC + ABAC
```

### Example roles

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

### Critical requirement

Every RFP query must be scoped to:

```text
organization_id
```

---

# PHASE 5 — Audit & Security

## Objective

Make every important business action traceable.

### Audit model

```text
AuditLog

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
```

### Track

```text
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
```

---

# PHASE 6 — Core RFP Domain

## Objective

Build the core RFP business model.

### Main entity

```text
RFP
```

### RFP relationships

```text
RFP
├── Documents
├── Requirements
├── Answers
├── Evidence
├── Reviews
├── Risks
├── Assignments
├── Submissions
└── Outcome
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

# PHASE 7 — RFP State Machine

## Objective

Make RFP lifecycle explicit and enforceable.

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

Every transition must:

```text
Validate
↓
Authorize
↓
Persist
↓
Audit
↓
Publish Event
```

---

# PHASE 8 — Document Management

## Objective

Build secure RFP document ingestion.

### Storage

```text
NestJS API
     ↓
MinIO / S3
```

### Supported formats

```text
PDF
DOCX
XLSX
PPTX
ZIP
HTML
```

### Entities

```text
File
RFPDocument
DocumentVersion
```

### Processing status

```text
UPLOADED
QUEUED
PROCESSING
PARSED
FAILED
```

### Implement

* Secure uploads
* MIME validation
* File size limits
* Checksums
* Object storage
* Versioning
* Secure downloads
* Delete/archive

---

# PHASE 9 — Document Processing Workers

## Objective

Move heavy document processing outside the API.

### Architecture

```text
NestJS API
    ↓
Redis
    ↓
BullMQ
    ↓
Bun Worker
```

### Jobs

```text
DOCUMENT_PARSE
DOCUMENT_OCR
TABLE_EXTRACTION
DOCUMENT_NORMALIZATION
```

### Pipeline

```text
Upload
 ↓
Queue
 ↓
Detect Type
 ↓
Extract Text
 ↓
Extract Tables
 ↓
Normalize
 ↓
Store Parsed Content
 ↓
Trigger Requirement Extraction
```

### Requirements

* Retries
* Idempotency
* Job status
* Failure handling
* Dead-letter handling
* Worker recovery

---

# PHASE 10 — Requirement Intelligence

## Objective

Transform documents into structured requirements.

### Entity

```text
RFPRequirement
```

### Fields

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

### Categories

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

### Status

```text
UNANSWERED
AI_DRAFT
NEEDS_REVIEW
IN_REVIEW
APPROVED
REJECTED
FINAL
```

---

# PHASE 11 — Requirement Graph

## Objective

Create traceability between every important requirement and its associated objects.

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

### Implement

* Parent/child requirements
* Dependencies
* Duplicate detection
* Cross-document references
* Source locations
* Traceability

---

# PHASE 12 — Knowledge Architecture

## Objective

Connect RFP to the organization's shared knowledge layer.

Do NOT create a separate RFP knowledge base.

### Architecture

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

for hybrid retrieval.

### Source types

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

---

# PHASE 13 — Search & RAG

## Objective

Implement hybrid retrieval.

### Architecture

```text
User / Agent
     ↓
Retrieval Service
     ↓
┌───────────────┬───────────────┐
↓               ↓
pgvector      OpenSearch
↓               ↓
Semantic       Keyword /
Search         Full Text
└───────┬───────┘
        ↓
   Rank / Rerank
        ↓
   Best Evidence
```

### pgvector

Used for:

```text
Semantic similarity
Embeddings
RAG retrieval
```

### OpenSearch

Used for:

```text
Keyword search
Full-text search
Filters
Hybrid retrieval
```

---

# PHASE 14 — Evidence Engine

## Objective

Make every important answer traceable.

### Evidence model

```text
RFPEvidence
├── answer_id
├── source_id
├── source_version
├── relevance
├── freshness
├── confidence
├── verified_at
└── verified_by
```

### Every answer should support:

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

# PHASE 15 — AI Provider Abstraction

## Objective

Prevent vendor lock-in.

Never directly embed OpenAI/Anthropic/Gemini calls throughout the RFP code.

### Architecture

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

### Provider abstraction should support

```text
generate()
stream()
embed()
classify()
structuredOutput()
```

### Model router factors

```text
Task
Quality
Latency
Cost
Context length
Availability
Risk
```

---

# PHASE 16 — Answer Generation

## Objective

Generate evidence-backed answers.

### Pipeline

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
    ↓
Human Review
```

### Answer fields

```text
answer
confidence
status
generated_by
generated_at
approved_by
approved_at
```

---

# PHASE 17 — SME Workflow

## Objective

Route work to the correct people.

```text
Security       → Security
Legal          → Legal
Pricing        → Sales
Architecture   → Engineering
Product        → Product
Implementation → Delivery
Compliance     → Compliance
```

### Workflow

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

---

# PHASE 18 — Risk Engine

## Objective

Detect risk before answers become final.

### Risk types

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

### Severity

```text
LOW
MEDIUM
HIGH
CRITICAL
```

### Autonomy policy

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

---

# PHASE 19 — Conflict & Freshness Engine

## Objective

Prevent outdated knowledge from becoming authoritative answers.

### Authority hierarchy

```text
1. Current signed contract
2. Current approved policies
3. Current product documentation
4. Current architecture/SLA
5. Approved commercial policies
6. Historical RFPs
7. Archived information
```

### Freshness

Track:

```text
Created
Updated
Verified
Expires
Owner
Version
```

### Detect

```text
STALE
AGING
CONFLICTING
UNVERIFIED
```

---

# PHASE 20 — Go / No-Go Intelligence

## Objective

Evaluate whether an RFP should be pursued.

### Factors

```text
Product Fit
Technical Fit
Security Fit
Commercial Fit
Timeline Fit
Strategic Fit
Competitive Position
```

### Result

```text
GO
GO_WITH_CONDITIONS
REVIEW
NO_GO
```

Human users must be able to override the AI recommendation.

---

# PHASE 21 — Validation Engine

## Objective

Perform final RFP validation.

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

### Validate

* All mandatory requirements answered
* High-risk answers reviewed
* Critical answers approved
* Evidence attached
* Evidence sufficiently fresh
* Conflicts resolved
* Required approvals completed
* Submission package complete

---

# PHASE 22 — Submission System

## Objective

Create and manage final submission packages.

### Submission

```text
RFPSubmission
├── rfp_id
├── version
├── status
├── submitted_at
├── submitted_by
└── metadata
```

### Package

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

---

# PHASE 23 — Outcome & RFP Memory

## Objective

Capture the result and learn from it.

### Outcomes

```text
WON
LOST
CANCELLED
NO_DECISION
```

### Store

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

### Future retrieval

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

Historical answers remain contextual; current authoritative knowledge remains the source of truth.

---

# PHASE 24 — Event Architecture

## Objective

Make the system event-driven.

### Events

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

### Flow

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

---

# PHASE 25 — MCP Server

## Objective

Expose RFP capabilities to AI agents and external agent systems through MCP.

### MCP tools

Potential tools:

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

### Important

MCP must respect the same:

```text
Authentication
Authorization
Organization isolation
Audit
Risk policies
```

as the REST API.

---

# PHASE 26 — Browser Extension Backend

## Objective

Prepare APIs for the Plasmo extension.

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

### APIs

```http
POST /api/v1/rfp-agent/questions/analyze
POST /api/v1/rfp-agent/questions/answer
POST /api/v1/rfp-agent/questions/evidence
```

The extension must not contain its own RAG or AI business logic.

---

# PHASE 27 — Safe Autofill

## Objective

Backend-enforced risk-based autofill.

```text
LOW
→ Auto-fill allowed

MEDIUM
→ Generate + review

HIGH
→ Review required

CRITICAL
→ Approval required
→ Auto-fill prohibited
```

The backend is authoritative.

---

# PHASE 28 — Observability

## Objective

Make every backend and AI workflow observable.

### OpenTelemetry

Track:

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

### AI telemetry

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

### Sentry

Use for:

```text
Exceptions
Worker failures
API errors
Frontend errors
```

### PostHog

Use for:

```text
Feature usage
Workflow completion
RFP lifecycle analytics
User behavior
Product analytics
```

---

# PHASE 29 — Testing

## Unit testing

Use:

```text
Vitest
```

Test:

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

## End-to-end

Use:

```text
Playwright
```

Test:

```text
Login
Create RFP
Upload document
Process RFP
Review answers
Approve
Validate
Export
```

## AI evaluation

Build a dedicated evaluation dataset:

```text
Question
Expected Answer
Required Evidence
Risk
Expected Confidence
```

---

# PHASE 30 — Production Hardening

## Security

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

# 4 Major Development Milestones

## Milestone 1 — Foundation

```text
Phase 1
Phase 2
Phase 3
Phase 4
Phase 5
Phase 6
Phase 7
```

Result:

```text
Secure multi-tenant RFP backend
+
Database
+
Authentication
+
Authorization
+
Audit
+
RFP lifecycle
```

---

## Milestone 2 — Intelligence Foundation

```text
Phase 8
Phase 9
Phase 10
Phase 11
Phase 12
Phase 13
Phase 14
```

Result:

```text
Upload
 ↓
Parse
 ↓
Understand
 ↓
Requirement Graph
 ↓
Knowledge
 ↓
Search
 ↓
Evidence
```

---

## Milestone 3 — AI & Workflow

```text
Phase 15
Phase 16
Phase 17
Phase 18
Phase 19
Phase 20
```

Result:

```text
Knowledge
 ↓
AI
 ↓
Answer
 ↓
Evidence
 ↓
Risk
 ↓
SME Review
 ↓
Go / No-Go
```

---

## Milestone 4 — Production RFP OS

```text
Phase 21
Phase 22
Phase 23
Phase 24
Phase 25
Phase 26
Phase 27
Phase 28
Phase 29
Phase 30
```

Result:

```text
Validate
 ↓
Submit
 ↓
Learn
 ↓
MCP
 ↓
Extension
 ↓
Observability
 ↓
Production
```

---

# MVP Scope

Do not implement all 30 phases before testing the product.

The first usable RFP backend should be:

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

The first production milestone should therefore focus on:

```text
NestJS
+
PostgreSQL
+
Drizzle
+
Better Auth
+
RBAC/ABAC
+
MinIO
+
Redis/BullMQ
+
Document Processing
+
pgvector
+
OpenSearch
+
AI Provider Abstraction
+
RFP Domain
```

Then add advanced intelligence.

---

# Final Architecture

```text
                         RFP OS
                           │
             ┌─────────────┴─────────────┐
             │                           │
         Next.js                     MCP Server
             │                           │
             └─────────────┬─────────────┘
                           ↓
                       NestJS API
                           │
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                  ↓
   PostgreSQL          OpenSearch           MinIO
   + pgvector              │                  │
        │                  │                  │
        └──────────────────┼──────────────────┘
                           ↓
                     RAG / AI Layer
                           │
                 ┌─────────┼─────────┐
                 ↓         ↓         ↓
              OpenAI   Anthropic   Gemini
                 │         │         │
                 └─────────┼─────────┘
                           ↓
                      Model Router
                           │
                     Redis + BullMQ
                           │
                           ↓
                     Bun Workers
                           │
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                  ↓
 Document Processing   AI Processing     Validation
```

# Core Engineering Principle

The backend should ultimately make this chain possible:

```text
                  RFP OS

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

**Build the foundation first. Build AI on top of the foundation, not the other way around.**
