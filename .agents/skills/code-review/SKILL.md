---

name: code-review
description: Review TENDYY code for correctness, architecture, security, tenant isolation, maintainability, performance, API compatibility, database safety, AI reliability, testing quality, and adherence to project conventions. Use for pull requests, feature reviews, refactoring reviews, and final implementation validation.
-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# TENDYY Code Review Skill

## Mission

Review code like a production engineer responsible for TENDYY's reliability and security.

Prioritize:

1. correctness
2. security
3. data integrity
4. tenant isolation
5. maintainability
6. performance
7. test coverage
8. architectural consistency

Do not focus only on formatting.

---

# 1. Review Repository Context

Before reviewing:

1. Understand the feature.
2. Inspect surrounding architecture.
3. Inspect related services.
4. Inspect database schema.
5. Inspect API contracts.
6. Inspect authentication/authorization.
7. Inspect tests.
8. Search for similar implementations.

Review the change within the actual repository context.

---

# 2. Correctness

Ask:

* Does the implementation satisfy the requirement?
* Are edge cases handled?
* Are failure paths handled?
* Are state transitions valid?
* Can concurrent requests break behavior?
* Can retries create duplicates?
* Does the code preserve existing behavior?

Look for real functional bugs before stylistic issues.

---

# 3. Security

Check:

* authentication
* authorization
* tenant isolation
* input validation
* injection risks
* secrets
* file handling
* object storage
* AI data exposure
* MCP tools
* external integrations

Any security boundary bypass is high priority.

---

# 4. Tenant Isolation

Explicitly ask:

> Can a user manipulate an ID, filter, search term, or tool argument to access another company's data?

Check:

* API queries
* repositories
* search
* vector retrieval
* object storage
* exports
* background jobs
* AI tools

Tenant isolation bugs are critical.

---

# 5. Architecture

Check whether responsibilities are placed correctly.

Prefer:

```text
Route
 ↓
Service
 ↓
Repository
```

Avoid:

```text
Route
 ↓
500 lines of business logic
 ↓
Database
```

Look for:

* duplicated logic
* unnecessary abstractions
* circular dependencies
* leaking infrastructure details
* incorrect layer boundaries

---

# 6. Database Review

Check:

* migrations
* constraints
* foreign keys
* indexes
* query performance
* pagination
* transactions
* tenant filters
* concurrency
* destructive changes

Ask:

> What happens to existing production data?

---

# 7. API Review

Check:

* request validation
* response contracts
* status codes
* errors
* pagination
* idempotency
* backwards compatibility
* authentication
* authorization

Search for consumers before flagging contract changes.

---

# 8. Frontend Review

Check:

* Server vs Client Components
* accessibility
* responsive behavior
* loading states
* error states
* empty states
* form validation
* API error handling
* permission-aware UX
* unnecessary client-side state
* unnecessary dependencies

Never treat frontend permission checks as security.

---

# 9. AI Review

Check:

* evidence grounding
* hallucination risk
* prompt injection
* authorization
* structured outputs
* model errors
* retry behavior
* human approval
* auditability
* cost
* latency

Ask:

> What happens if the model is wrong?

The answer should be explicit.

---

# 10. Background Jobs

Check:

* idempotency
* retries
* failure handling
* duplicate execution
* state transitions
* observability
* partial failures

A worker that can run twice must not corrupt business state.

---

# 11. Performance

Look for:

* N+1 queries
* unbounded queries
* unnecessary API calls
* unnecessary model calls
* large payloads
* synchronous expensive operations
* excessive database queries
* missing indexes

Do not optimize prematurely, but flag obvious production risks.

---

# 12. Testing

Check whether the change has appropriate tests.

Ask:

```text
Happy path?
Failure path?
Authorization?
Tenant isolation?
Edge cases?
Regression?
```

A feature touching security or business-critical workflows should have corresponding negative tests.

---

# 13. Error Handling

Check that errors:

* are handled intentionally
* use project conventions
* do not expose secrets
* do not leak infrastructure details
* provide actionable information
* preserve correct state

Avoid broad silent catches.

---

# 14. Observability

For important workflows, verify appropriate:

* logs
* request IDs
* job IDs
* audit events
* error reporting
* metrics

Do not log sensitive payloads unnecessarily.

---

# 15. Maintainability

Ask:

* Is the code easy to understand?
* Are names meaningful?
* Is complexity justified?
* Is duplication reasonable?
* Are abstractions actually useful?
* Does this follow repository conventions?

Prefer simple code over clever code.

---

# 16. Backwards Compatibility

Before approving changes to:

* APIs
* database schemas
* events
* MCP tools
* shared types
* configuration

check existing consumers.

Breaking changes must be intentional.

---

# 17. Review Priority

Classify findings by impact.

### Critical

Security vulnerability, cross-tenant data exposure, destructive data corruption, authentication bypass.

### High

Major functional bug, authorization flaw, broken production workflow, unsafe migration.

### Medium

Performance problem, missing important validation, significant maintainability issue.

### Low

Minor cleanup, readability issue, non-critical optimization.

Do not inflate minor style issues into high-priority findings.

---

# 18. Review Output

When reviewing code, prioritize actionable findings.

For each important finding provide:

```text
Severity
Location
Problem
Why it matters
Recommended fix
```

Focus on issues that materially affect correctness, security, reliability, or maintainability.

---

# 19. Do Not

Never:

* approve code without understanding surrounding architecture
* ignore tenant isolation
* ignore authorization
* focus only on formatting
* request unnecessary rewrites
* invent problems unsupported by the code
* ignore migration safety
* ignore AI-specific failure modes
* assume tests passing means the design is correct

---

# 20. Final Review Checklist

### Architecture

* [ ] Correct layer
* [ ] Existing patterns followed
* [ ] No unnecessary abstraction
* [ ] No duplicated architecture

### Security

* [ ] Authentication
* [ ] Authorization
* [ ] Tenant isolation
* [ ] Input validation
* [ ] Secret protection
* [ ] File security
* [ ] AI/MCP security

### Database

* [ ] Safe migration
* [ ] Correct relationships
* [ ] Constraints
* [ ] Indexes
* [ ] Transactions
* [ ] Query performance

### API

* [ ] Stable contract
* [ ] Correct status codes
* [ ] Consistent errors
* [ ] Pagination
* [ ] Idempotency

### AI

* [ ] Evidence grounding
* [ ] Structured output
* [ ] Prompt injection considered
* [ ] Human approval where needed
* [ ] Authorization enforced

### Testing

* [ ] Happy path
* [ ] Failure path
* [ ] Authorization
* [ ] Tenant isolation
* [ ] Regression coverage

### Production Readiness

* [ ] Observability
* [ ] Performance
* [ ] Failure handling
* [ ] Backwards compatibility
* [ ] No secrets exposed
