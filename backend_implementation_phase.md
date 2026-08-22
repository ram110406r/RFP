## Recommended roadmap

```text
PHASE 1 — Monorepo & Runtime Foundation        ✓ DONE
PHASE 2 — NestJS API Foundation                ✓ DONE
PHASE 3 — Database Foundation                  ✓ DONE
PHASE 4 — Authentication & Organization        ✓ DONE

────────────────────────────────────────────────────────

PHASE 5 — RFP Core & Lifecycle
PHASE 6 — Document Processing & Requirements
PHASE 7 — Knowledge, Search & Evidence
PHASE 8 — AI Response & RFP Intelligence
PHASE 9 — Review, Validation & Submission
PHASE 10 — Events, MCP & Browser Automation
PHASE 11 — Production Engineering
```

So you now have **7 remaining phases**, not 26.

---

# PHASE 5 — RFP Core & Lifecycle

**Combines original Phases 5, 6 and 7**

> Note: Your original Phase 5 Audit & Security should be incorporated into the already-completed security foundation rather than treated as a standalone implementation phase. Audit hooks should be added as each business capability is implemented.

### Objective

Build the actual RFP domain and its complete lifecycle.

### Core domain

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

### RFP model

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

### Lifecycle

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

Every transition:

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

### Build

* RFP CRUD
* RFP lifecycle
* State machine
* RFP assignments
* Client/project association
* Organization isolation
* Authorization
* Audit integration
* Domain events

### Done when

```text
Create RFP
   ↓
Move through lifecycle
   ↓
Authorization enforced
   ↓
Every important action audited
   ↓
Events emitted
```

---

# PHASE 6 — Document Processing & Requirement Intelligence

**Combines original Phases 8, 9, 10 and 11**

These should be **one pipeline**.

```text
DOCUMENT UPLOAD
      ↓
OBJECT STORAGE
      ↓
QUEUE
      ↓
DOCUMENT PROCESSING
      ↓
TEXT / TABLE EXTRACTION
      ↓
NORMALIZATION
      ↓
REQUIREMENT EXTRACTION
      ↓
REQUIREMENT GRAPH
```

### Document management

Support:

```text
PDF
DOCX
XLSX
PPTX
ZIP
HTML
```

Build:

* File
* RFPDocument
* DocumentVersion
* Secure upload/download
* MIME validation
* Size limits
* Checksums
* Versioning
* Archive/delete

### Processing infrastructure

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

* Retries
* Idempotency
* Job status
* Failure handling
* Dead-letter handling
* Worker recovery

### Requirement intelligence

```text
RFPRequirement
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

### Requirement graph

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

Support:

* Parent/child requirements
* Dependencies
* Duplicate detection
* Cross-document references
* Source locations
* Traceability

### Done when

You can do:

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

This is the first major **RFP intelligence milestone**.

---

# PHASE 7 — Knowledge, Search & Evidence

**Combines original Phases 12, 13 and 14**

These are really one subsystem.

```text
                    KNOWLEDGE
                        ↓
                  Chunk / Version
                        ↓
                 ┌──────┴──────┐
                 ↓             ↓
             pgvector      OpenSearch
                 ↓             ↓
              Semantic      Keyword
                 └──────┬──────┘
                        ↓
                 Hybrid Retrieval
                        ↓
                     Rerank
                        ↓
                    Evidence
```

### Knowledge architecture

Do **not** create a separate RFP knowledge base.

Use the organization's shared knowledge layer.

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

### Search

Implement:

* Semantic search
* Keyword search
* Full-text search
* Filters
* Hybrid search
* Ranking
* Reranking

### Evidence

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

Every answer should eventually have:

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

### Done when

A requirement can be searched against the organization's knowledge and return **ranked, traceable evidence**.

---

# PHASE 8 — AI Response & RFP Intelligence

**Combines original Phases 15, 16, 17, 18, 19 and 20**

This becomes the main **AI intelligence phase**.

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

## AI provider abstraction

```text
RFP AI Service
       ↓
Model Router
       ↓
Provider Interface
    ┌──┼──┐
    ↓  ↓  ↓
 OpenAI
 Anthropic
 Gemini
```

Support:

```text
generate()
stream()
embed()
classify()
structuredOutput()
```

Router considers:

```text
Task
Quality
Latency
Cost
Context Length
Availability
Risk
```

## Answer generation

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

## SME workflow

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

## Risk engine

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
→ AI Answer

MEDIUM
→ AI + Evidence

HIGH
→ Human Review

CRITICAL
→ Specialist Approval
```

## Conflict & freshness

Authority:

```text
Current Signed Contract
        ↓
Current Approved Policies
        ↓
Current Product Documentation
        ↓
Current Architecture / SLA
        ↓
Commercial Policies
        ↓
Historical RFPs
        ↓
Archived Information
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

Human override is mandatory.

---

# PHASE 9 — Review, Validation & Submission

**Combines original Phases 21, 22 and 23**

These represent the final business workflow.

```text
AI ANSWERS
    ↓
REVIEW
    ↓
VALIDATION
    ↓
APPROVAL
    ↓
SUBMISSION
    ↓
OUTCOME
    ↓
RFP MEMORY
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

* All mandatory requirements answered
* High-risk answers reviewed
* Critical answers approved
* Evidence attached
* Evidence sufficiently fresh
* Conflicts resolved
* Required approvals completed
* Submission package complete

## Submission

```text
RFPSubmission
├── rfp_id
├── version
├── status
├── submitted_at
├── submitted_by
└── metadata
```

Generate:

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

## Outcome & memory

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

Historical answers remain **context**, not authoritative truth.

---

# PHASE 10 — Events, MCP & Browser Automation

**Combines original Phases 24, 25, 26 and 27**

These are all ways of exposing/automating the same backend capabilities.

## Event architecture

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

Events include:

```text
RFP_CREATED
RFP_UPDATED
DOCUMENT_UPLOADED
DOCUMENT_PARSED
REQUIREMENTS_EXTRACTED
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

MCP must use the **same authorization, tenant isolation, audit and risk policies** as REST.

## Browser extension

```text
Browser
   ↓
Plasmo
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

The extension must **not** implement its own RAG or AI business logic.

## Safe autofill

```text
LOW
→ Auto-fill

MEDIUM
→ Generate + Review

HIGH
→ Review Required

CRITICAL
→ Approval Required
→ Auto-fill Prohibited
```

---

# PHASE 11 — Production Engineering

**Combines original Phases 28, 29 and 30**

This is where you make the system production-ready.

## Observability

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
Upload
 ↓
Process
 ↓
Generate Answers
 ↓
Review
 ↓
Approve
 ↓
Validate
 ↓
Export
```

### AI evaluation

```text
Question
Expected Answer
Required Evidence
Risk
Expected Confidence
```

## Production hardening

### Security

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

### Reliability

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

### Performance

```text
Database indexes
Pagination
Batch processing
Caching
Parallel workers
Queue optimization
Search optimization
```

---

# Final Roadmap

Your backend should now be tracked like this:

```text
┌─────────────────────────────────────────────┐
│ PHASE 1 — Foundation                 ✓      │
├─────────────────────────────────────────────┤
│ PHASE 2 — NestJS API                 ✓      │
├─────────────────────────────────────────────┤
│ PHASE 3 — Database                   ✓      │
├─────────────────────────────────────────────┤
│ PHASE 4 — Auth + Organization        ✓      │
├─────────────────────────────────────────────┤
│                                             │
│ PHASE 5 — RFP Core + Lifecycle               │
│                                             │
│ PHASE 6 — Documents + Requirements           │
│                                             │
│ PHASE 7 — Knowledge + Search + Evidence     │
│                                             │
│ PHASE 8 — AI + Risk + Intelligence          │
│                                             │
│ PHASE 9 — Review + Validation + Submission  │
│                                             │
│ PHASE 10 — Events + MCP + Browser           │
│                                             │
│ PHASE 11 — Production Engineering            │
└─────────────────────────────────────────────┘
```

### And the actual product progression becomes:

```text
PHASE 5
RFP CORE
   ↓
PHASE 6
UNDERSTAND RFP
   ↓
PHASE 7
KNOWLEDGE + EVIDENCE
   ↓
PHASE 8
AI + RISK + QUALIFICATION
   ↓
PHASE 9
REVIEW + VALIDATE + SUBMIT
   ↓
PHASE 10
AUTOMATE + MCP + EXTENSION
   ↓
PHASE 11
PRODUCTION
```

### Most importantly: don't treat these as separate projects

For example, **Document Management → Workers → Requirement Intelligence → Requirement Graph** is one continuous pipeline:

```text
UPLOAD
  ↓
PROCESS
  ↓
UNDERSTAND
  ↓
STRUCTURE
```

Likewise:

```text
KNOWLEDGE
  ↓
SEARCH
  ↓
EVIDENCE
```

is one retrieval subsystem.

And:

```text
AI
 ↓
ANSWER
 ↓
RISK
 ↓
SME
 ↓
GO/NO-GO
```

is one intelligence subsystem.

