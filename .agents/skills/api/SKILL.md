---

name: api
description: Design and modify TENDYY REST and MCP APIs using Elysia, TypeScript, validation, authentication context, authorization, tenant isolation, consistent errors, pagination, idempotency, and stable API contracts. Use for API routes, endpoints, request/response schemas, integrations, and API refactoring.
------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# TENDYY API Skill

## Mission

Build stable, secure, predictable, and developer-friendly APIs for TENDYY.

The API layer is the contract between:

* frontend applications
* backend services
* workers
* AI agents
* MCP clients
* external integrations

APIs must enforce security boundaries and preserve clear contracts.

---

# 1. Repository First

Before changing an API:

1. Inspect existing routes.
2. Inspect route registration.
3. Inspect request validation.
4. Inspect response conventions.
5. Inspect authentication middleware.
6. Inspect authorization middleware.
7. Inspect error handling.
8. Search for similar endpoints.
9. Inspect frontend consumers.
10. Inspect tests.

Follow established project conventions.

Do not create a second API pattern when an existing one already works.

---

# 2. API Architecture

Prefer:

```text
Request
  ↓
Authentication
  ↓
Tenant / Workspace Context
  ↓
Authorization
  ↓
Validation
  ↓
Route / Controller
  ↓
Service
  ↓
Repository
  ↓
Database / External Service
```

Routes should coordinate requests.

Business logic belongs in services.

Database logic belongs in repositories/data-access layers.

---

# 3. Elysia

Use the project's established Elysia conventions.

Routes should be:

* explicit
* small
* validated
* typed
* easy to test
* easy to understand

Do not place large business workflows directly inside route handlers.

---

# 4. Request Validation

Validate all external input.

Validate:

* path parameters
* query parameters
* request bodies
* headers when relevant
* pagination
* filters
* sorting
* uploaded-file metadata

Never assume frontend validation is sufficient.

The server is the final validation boundary.

Use the project's established validation system, such as TypeBox/Elysia schemas or Zod where appropriate.

---

# 5. Authentication

Authentication answers:

> Who is making this request?

API routes must establish authenticated identity before accessing protected resources.

Never trust:

* user IDs from request bodies
* workspace IDs from untrusted clients
* company IDs supplied by clients
* role values supplied by clients

Derive identity from authenticated server-side context.

---

# 6. Authorization

Authorization answers:

> Is this authenticated actor allowed to perform this action?

Check:

* user identity
* company membership
* workspace membership
* role
* permissions
* resource ownership
* applicable policies

Authentication alone is not authorization.

---

# 7. Tenant Isolation

Every tenant-scoped endpoint must enforce tenant boundaries.

Bad:

```text
GET /tenders/:id
```

with a database lookup that only checks `id`.

Prefer:

```text
authenticated user
    ↓
workspace membership
    ↓
tender belongs to workspace
    ↓
return tender
```

A valid resource ID must never bypass tenant authorization.

---

# 8. REST Design

Use predictable resource-oriented routes.

Conceptually:

```text
GET    /tenders
POST   /tenders
GET    /tenders/:id
PATCH  /tenders/:id
DELETE /tenders/:id
```

Nested resources should be used when the relationship is meaningful.

Avoid unnecessarily deep nesting.

---

# 9. HTTP Semantics

Use appropriate HTTP methods and status codes.

Typical patterns:

```text
200 OK
201 Created
202 Accepted
204 No Content
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests
500 Internal Server Error
```

Do not return `200` for every situation.

Use `202 Accepted` when work has been accepted for asynchronous processing.

---

# 10. Errors

Errors should be predictable and machine-readable.

Prefer a consistent structure such as:

```json
{
  "error": {
    "code": "TENDER_NOT_FOUND",
    "message": "Tender was not found."
  }
}
```

Do not expose:

* stack traces
* SQL errors
* internal service details
* secrets
* infrastructure information

Production errors should provide useful information without revealing implementation details.

---

# 11. API Contracts

API contracts must remain stable.

Before changing an endpoint:

1. Search all consumers.
2. Check frontend usage.
3. Check workers.
4. Check integrations.
5. Check tests.
6. Determine whether the change is breaking.

Prefer additive changes where possible.

Do not silently rename or remove response fields used by existing consumers.

---

# 12. Pagination

List endpoints should support appropriate pagination.

Examples:

```text
?page=1&limit=50
```

or cursor-based:

```text
?cursor=abc123&limit=50
```

Follow the repository's established approach.

Do not return unbounded collections.

Always use deterministic ordering.

---

# 13. Filtering and Sorting

Support filtering only where useful.

Example:

```text
/tenders?status=active
```

Sorting must use an explicit allowlist.

Never directly interpolate arbitrary client-provided column names into database queries.

---

# 14. Idempotency

Important write operations should be safe against accidental retries.

Especially:

* submissions
* webhook processing
* external API actions
* document processing
* AI generation jobs
* approval actions

Where appropriate, support idempotency keys.

A network retry must not create duplicate business actions.

---

# 15. Long-Running Operations

Do not keep HTTP requests open unnecessarily for expensive work.

Examples:

* document extraction
* embeddings
* large indexing operations
* AI workflows
* external submission workflows

Prefer:

```text
POST /documents
      ↓
202 Accepted
      ↓
background job
      ↓
status updated
```

The client can then query or subscribe to status.

---

# 16. File Uploads

Large files should use the project's object-storage architecture.

Prefer:

```text
Client
  ↓
Upload / Presigned URL
  ↓
MinIO / S3
  ↓
Metadata in PostgreSQL
```

Do not unnecessarily stream large files through the application server.

---

# 17. MCP APIs

MCP tools must follow the same security principles as REST APIs.

Every MCP operation must establish:

* authenticated identity
* tenant/workspace context
* authorization
* validated input

Never assume an MCP client is trusted merely because it is an AI client.

Tool descriptions should clearly communicate:

* purpose
* inputs
* outputs
* limitations
* permissions
* side effects

---

# 18. AI API Boundaries

AI-generated results must be distinguishable from finalized business data.

For example:

```text
AI Draft
   ↓
Human Review
   ↓
Approved Answer
```

Do not automatically mark AI output as approved unless the product explicitly defines that behavior.

Risk-sensitive operations should expose approval requirements.

---

# 19. External Integrations

External APIs must be isolated behind services/adapters.

Prefer:

```text
API Route
   ↓
Service
   ↓
Integration Adapter
   ↓
External API
```

Do not scatter provider-specific logic throughout route handlers.

Handle:

* timeouts
* retries
* rate limits
* authentication
* malformed responses
* provider outages

---

# 20. API Observability

Important API requests should be observable.

Capture appropriate:

* request ID
* authenticated actor
* workspace context
* endpoint
* latency
* status
* error code

Never log secrets or sensitive payloads unnecessarily.

---

# 21. Testing

API tests should cover:

* successful requests
* validation failures
* authentication failures
* authorization failures
* tenant isolation
* not-found behavior
* conflicts
* pagination
* idempotency
* asynchronous operations
* error responses

Security tests must attempt unauthorized resource access.

---

# 22. Do Not

Never:

* trust client authorization
* trust client tenant IDs
* put business logic in routes
* expose database errors
* return unbounded datasets
* create inconsistent error formats
* silently break API contracts
* perform expensive workflows synchronously without justification
* expose internal infrastructure details
* assume MCP clients are trusted
* log secrets

---

# 23. Definition of Done

* [ ] Existing API patterns inspected.
* [ ] Authentication enforced.
* [ ] Authorization enforced.
* [ ] Tenant isolation verified.
* [ ] Inputs validated.
* [ ] HTTP semantics are correct.
* [ ] Errors follow project conventions.
* [ ] API contract is stable.
* [ ] Pagination is bounded.
* [ ] Long-running work is asynchronous where appropriate.
* [ ] Idempotency considered.
* [ ] Tests added.
* [ ] No secrets or internal errors exposed.
