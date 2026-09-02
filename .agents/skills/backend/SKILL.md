---

name: backend
description: Build and modify the TENDYY backend using Bun, Elysia, TypeScript, REST APIs, MCP, PostgreSQL, Drizzle ORM, Redis, MinIO/S3, background workers, and the project's established service architecture. Use for backend features, services, routes, jobs, integrations, business logic, and server-side refactoring.
------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# TENDYY Backend Engineering Skill

## 1. Mission

Build production-grade backend systems for TENDYY.

The backend is responsible for:

* business logic
* authentication enforcement
* authorization
* tenant isolation
* data access
* API behavior
* background processing
* AI orchestration
* file processing
* external integrations
* auditability
* system reliability

Prioritize:

1. Correctness
2. Security
3. Tenant isolation
4. Data integrity
5. Reliability
6. Maintainability
7. Performance

Always inspect the existing backend architecture before implementing anything.

---

# 2. Technology Stack

Use the project's established stack:

* Bun
* TypeScript
* Elysia
* REST APIs
* MCP APIs
* PostgreSQL
* Drizzle ORM
* pgvector
* OpenSearch
* Redis
* MinIO/S3
* Background workers
* OpenAI SDK
* Mastra where appropriate

Use the versions already installed in the repository.

Do not introduce another backend framework without explicit justification.

---

# 3. Repository First

Before changing backend code, inspect:

* monorepo structure
* backend application
* package boundaries
* existing routes
* services
* repositories
* database layer
* schemas
* middleware
* authentication
* authorization
* queues/jobs
* storage
* AI integrations
* logging
* error handling
* configuration

Search before creating.

Reuse existing architecture whenever possible.

---

# 4. Backend Architecture

Prefer this logical flow:

```text
HTTP / MCP Request
        ↓
Authentication
        ↓
Tenant / Workspace Context
        ↓
Authorization
        ↓
Input Validation
        ↓
Controller / Route
        ↓
Service
        ↓
Repository / Data Access
        ↓
Database / External Service
```

Routes should remain thin.

Business logic belongs in services.

Database logic should remain in the appropriate data-access layer.

---

# 5. Routes

Routes should primarily handle:

* request parsing
* validation
* authentication context
* authorization invocation
* service invocation
* response formatting

Do not put complex business logic directly inside routes.

Bad:

```text
Route
 ├── database queries
 ├── business rules
 ├── AI calls
 ├── permission checks
 └── response formatting
```

Prefer:

```text
Route
 ↓
Service
 ↓
Repository / Integration
```

---

# 6. Services

Services represent business operations.

Examples:

```text
TenderService
QuestionnaireService
QuestionService
AnswerService
EvidenceService
ApprovalService
SubmissionService
WorkspaceService
MemberService
DocumentService
```

Use the project's actual naming conventions.

Services should:

* enforce business rules
* coordinate multiple repositories
* coordinate external systems
* manage transactions where required
* trigger background work where appropriate

Avoid "god services."

Keep responsibilities cohesive.

---

# 7. Validation

All external input is untrusted.

Validate:

* request bodies
* query parameters
* path parameters
* headers where relevant
* uploaded files
* webhooks
* external API responses where appropriate

Never assume the frontend has validated the request.

Use the project's established validation/schema system.

Validation should occur before business logic executes.

---

# 8. Authentication

Authentication must be enforced server-side.

For protected operations determine:

```text
Who is the user?
Which company/workspace are they operating in?
Is their session/API credential valid?
```

Do not trust:

* user IDs from request bodies
* workspace IDs from the client
* roles supplied by the client
* frontend state
* hidden UI controls

---

# 9. Authorization

Authentication is not authorization.

Every protected operation must establish:

```text
User
 ↓
Membership
 ↓
Company / Workspace
 ↓
Permission
 ↓
Resource
```

Authorization must happen on the backend.

Consider both:

### RBAC

Role-based permissions.

### ABAC

Resource/context-based permissions.

Examples:

* resource ownership
* workspace membership
* role
* project
* department
* resource sensitivity
* approval authority

---

# 10. Multi-Tenancy

TENDYY is multi-tenant.

Tenant isolation is a security boundary.

Every tenant-owned query must be scoped correctly.

Never perform:

```text
SELECT resource WHERE id = ?
```

when access depends on tenant context.

Prefer conceptually:

```text
SELECT resource
WHERE id = ?
AND workspace_id = current_workspace
```

Use the actual project's data-access patterns.

Never trust a client-provided tenant ID without verifying membership/access.

---

# 11. Database Access

Use the established PostgreSQL + Drizzle architecture.

Do not access the database directly from route handlers if the project uses repositories/data-access modules.

Avoid:

* N+1 queries
* unbounded queries
* unnecessary SELECT *
* duplicate queries
* database logic duplicated across services

Use transactions when multiple related operations must succeed or fail together.

---

# 12. Data Integrity

Business invariants should be protected at the appropriate layer.

Use:

* database constraints
* transactions
* service-level validation
* authorization
* state-transition rules

Do not rely exclusively on frontend validation.

---

# 13. API Design

Use conventional HTTP semantics.

Examples:

```text
GET     /tenders
GET     /tenders/:id
POST    /tenders
PATCH   /tenders/:id
DELETE  /tenders/:id
```

Follow existing TENDYY API conventions.

Keep request/response contracts explicit.

Do not expose internal database structures unnecessarily.

---

# 14. API Errors

Use consistent application errors.

Differentiate where appropriate:

```text
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Validation Error
429 Rate Limited
500 Internal Server Error
```

Use the project's existing error-handling implementation.

Never expose:

* stack traces
* SQL statements
* database credentials
* internal infrastructure details
* secrets

---

# 15. Idempotency

Consider idempotency whenever an operation causes side effects.

Important examples:

* tender submission
* external API calls
* webhook processing
* document ingestion
* AI job creation
* embedding generation
* indexing
* background jobs

Retries must not accidentally duplicate irreversible operations.

---

# 16. Background Jobs

Do not perform long-running operations inside normal HTTP requests when they can be asynchronous.

Use background workers for:

* document processing
* text extraction
* OCR
* chunking
* embeddings
* vector indexing
* OpenSearch indexing
* AI generation
* bulk processing
* external integrations
* notifications

Prefer jobs that are:

* retryable
* observable
* idempotent
* resumable where practical

---

# 17. Job Design

A job should have:

```text
Job
 ├── Input
 ├── Validation
 ├── Execution
 ├── Retry behavior
 ├── Failure handling
 └── Completion state
```

Avoid jobs that cannot safely be retried.

Track meaningful job states.

Example:

```text
queued
processing
completed
failed
cancelled
```

Use existing project terminology if defined.

---

# 18. Redis

Use Redis according to the project's established patterns.

Potential uses include:

* queues
* caching
* rate limiting
* distributed coordination
* temporary state

Do not use Redis as the permanent source of truth for business data unless explicitly designed that way.

---

# 19. Object Storage

Use MinIO/S3 through the project's storage abstraction.

Do not scatter storage-provider-specific logic across services.

Consider:

* object ownership
* tenant isolation
* file access permissions
* content type
* file size
* lifecycle
* secure download
* deletion

Never assume an object key is authorization.

---

# 20. File Processing

Uploaded files are untrusted.

Validate:

* size
* type
* extension
* content where appropriate

Use safe processing pipelines.

Never execute uploaded files.

Do not expose arbitrary filesystem access through APIs.

---

# 21. Search

TENDYY may use:

```text
PostgreSQL
pgvector
OpenSearch
```

Choose the appropriate search mechanism based on the use case.

For hybrid retrieval, consider combining:

* keyword relevance
* semantic similarity
* metadata filtering
* tenant filtering
* permissions

Search results must respect authorization.

---

# 22. AI Backend Integration

AI operations belong on the server.

Do not expose model API keys to the frontend.

AI workflows should be:

```text
Request
 ↓
Authorization
 ↓
Context preparation
 ↓
Evidence retrieval
 ↓
AI execution
 ↓
Validation
 ↓
Persistence
 ↓
Review / approval if required
```

Never allow AI output to bypass normal authorization.

---

# 23. External Integrations

Wrap external providers behind clear interfaces.

Examples:

```text
StorageService
SearchService
AIService
EmailService
NotificationService
```

Do not scatter vendor-specific SDK calls throughout business logic.

Handle:

* timeouts
* retries
* rate limits
* provider errors
* partial failures

appropriately.

---

# 24. Logging

Use structured logs.

Useful context may include:

* request ID
* operation
* workspace/company ID
* user ID where appropriate
* resource ID
* job ID
* error category
* duration

Never log:

* passwords
* API keys
* access tokens
* secrets
* private credentials
* unnecessary document contents

---

# 25. Observability

Important operations should be traceable.

For asynchronous workflows, track:

```text
Request
 ↓
Job
 ↓
Processing
 ↓
External calls
 ↓
Database changes
 ↓
Final state
```

Use existing observability infrastructure rather than creating a separate logging system.

---

# 26. Transactions

Use transactions when multiple database operations represent one atomic business operation.

Example:

```text
Create approval
+
Update answer status
+
Create audit event
```

If these must remain consistent, consider a transaction.

Do not use transactions blindly for long-running external operations.

---

# 27. Concurrency

Consider concurrent requests for operations involving:

* approvals
* submissions
* answer editing
* membership changes
* status transitions
* job processing

Prevent invalid state transitions.

Use appropriate:

* database constraints
* transactions
* locking
* idempotency
* optimistic concurrency

according to the actual use case.

---

# 28. State Machines

For workflows with meaningful lifecycle states, make transitions explicit.

For example:

```text
Draft
 ↓
In Review
 ↓
Approved
 ↓
Submitted
```

Do not allow arbitrary state changes.

Validate transitions server-side.

---

# 29. Auditability

Important business actions should produce audit information.

Potential events include:

* tender created
* tender updated
* document uploaded
* answer generated
* answer edited
* answer approved
* answer rejected
* submission completed
* member added
* role changed

Audit records should identify:

* actor
* action
* entity
* timestamp
* relevant before/after information where appropriate

Do not store unnecessary sensitive information.

---

# 30. Configuration

Configuration should come from the project's established environment/configuration system.

Never hard-code:

* credentials
* production URLs
* API keys
* database passwords
* secrets

Validate required configuration during application startup where appropriate.

---

# 31. Performance

Watch for:

* N+1 queries
* unbounded database queries
* unnecessary external API calls
* excessive serialization
* large payloads
* repeated AI calls
* unnecessary indexing
* blocking HTTP handlers

Use pagination and asynchronous processing appropriately.

Do not optimize without understanding the actual bottleneck.

---

# 32. Testing

Backend changes should include appropriate tests.

Consider:

* unit tests
* service tests
* repository/database tests
* API tests
* authorization tests
* tenant isolation tests
* job tests
* integration tests

Every security-sensitive change should test negative cases.

---

# 33. Implementation Workflow

For every backend task:

## Step 1 — Understand

Read the relevant existing modules.

## Step 2 — Search

Find:

* similar services
* existing routes
* existing schemas
* existing repositories
* existing middleware
* existing error handling
* existing jobs
* existing integrations

## Step 3 — Plan

Identify:

* API changes
* database changes
* authorization
* tenant boundaries
* transactions
* background jobs
* external integrations
* tests

## Step 4 — Implement

Follow existing project architecture.

Make the smallest clean change that fully solves the problem.

## Step 5 — Verify

Run relevant:

* typecheck
* lint
* tests
* build

Use repository-defined scripts.

## Step 6 — Security Review

Explicitly verify:

* authentication
* authorization
* tenant isolation
* input validation
* secret handling
* file handling
* external requests
* logging

---

# 34. Do Not

Do not:

* put business logic directly into routes
* trust frontend authorization
* trust client-provided tenant IDs
* expose secrets
* perform unrestricted database queries
* create duplicate services
* introduce another backend framework unnecessarily
* perform long-running jobs synchronously
* ignore transaction requirements
* ignore concurrency
* silently change API contracts
* bypass existing architecture
* expose internal errors to clients

---

# 35. Definition of Done

A backend feature is complete when:

* requirements are implemented
* existing architecture is respected
* input is validated
* authentication is enforced
* authorization is enforced
* tenant isolation is verified
* database changes are correct
* transactions are used where necessary
* background work is handled appropriately
* errors are handled consistently
* secrets are protected
* relevant tests pass
* typecheck passes
* lint passes where applicable
* build passes where applicable
