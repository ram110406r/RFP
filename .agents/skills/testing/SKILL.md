---

name: testing
description: Test TENDYY across frontend, backend, APIs, database, authentication, AI workflows, security boundaries, workers, and integrations. Use for unit tests, integration tests, end-to-end tests, regression tests, fixtures, mocks, test data, and quality verification.
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# TENDYY Testing Skill

## Mission

Ensure TENDYY changes are correct, secure, maintainable, and regression-resistant.

Tests should provide confidence in real behavior rather than merely increasing coverage numbers.

---

# 1. Repository First

Before adding tests:

1. Inspect existing test framework.
2. Inspect test commands.
3. Inspect existing test structure.
4. Inspect fixtures.
5. Inspect factories.
6. Inspect mocks.
7. Inspect integration-test infrastructure.
8. Inspect E2E setup.

Use existing testing infrastructure.

Do not introduce another testing framework unnecessarily.

---

# 2. Test Pyramid

Prefer an appropriate mix:

```text
        E2E
       /   \
 Integration
     /       \
    Unit Tests
```

Use unit tests for isolated logic.

Use integration tests for real component interactions.

Use E2E tests for critical user workflows.

---

# 3. Unit Tests

Use unit tests for:

* pure functions
* validators
* business rules
* state transitions
* permission logic
* formatting
* parsers
* deterministic transformations

Tests should be focused and fast.

---

# 4. Integration Tests

Use integration tests for:

* database repositories
* API routes
* authentication
* authorization
* external service adapters
* background jobs
* search workflows

Prefer realistic boundaries over excessive mocking.

---

# 5. E2E Tests

Use E2E tests for critical workflows.

TENDYY examples:

```text
Login
  ↓
Create Tender
  ↓
Upload Document
  ↓
Extract Questionnaire
  ↓
Generate Answer
  ↓
Review Evidence
  ↓
Approve
  ↓
Submit
```

Not every small feature needs an E2E test.

---

# 6. Security Tests

Every protected feature should include negative tests.

Examples:

```text
User A → User B's workspace
User A → User B's tender
Viewer → approval action
Member → admin action
Unauthenticated → protected endpoint
```

These tests are essential.

---

# 7. Tenant Isolation Tests

Explicitly test:

```text
Workspace A cannot access Workspace B.
Company A cannot access Company B.
```

Test:

* reads
* writes
* updates
* deletes
* searches
* exports
* AI retrieval
* MCP tools

---

# 8. API Tests

Test:

* validation
* authentication
* authorization
* success responses
* error responses
* pagination
* filters
* conflicts
* idempotency
* asynchronous operations

Verify both status code and response structure.

---

# 9. Database Tests

Test:

* constraints
* relationships
* repository behavior
* migrations
* tenant filtering
* transactions
* pagination
* uniqueness

Do not test only application-level validation when database constraints are important.

---

# 10. Frontend Tests

Test important UI behavior:

* forms
* validation
* loading states
* error states
* empty states
* permissions
* keyboard accessibility
* critical user interactions

Do not write brittle tests that depend heavily on implementation details.

---

# 11. AI Tests

AI tests should evaluate behavior rather than exact wording.

Test:

* evidence grounding
* structured output
* hallucination resistance
* risk classification
* approval routing
* prompt injection
* tenant isolation
* retrieval quality where measurable

Avoid asserting that an LLM must produce one exact sentence.

---

# 12. Determinism

Tests should be deterministic.

Avoid:

* real external APIs unless specifically testing integrations
* uncontrolled randomness
* timing assumptions
* shared mutable state
* production data

Use controlled fixtures or mocks where appropriate.

---

# 13. Test Data

Test data should be:

* minimal
* realistic
* isolated
* disposable
* clearly named

Do not use real customer secrets or sensitive production data.

---

# 14. Regression Tests

When fixing a bug:

```text
Bug found
   ↓
Reproduce
   ↓
Write failing test
   ↓
Fix
   ↓
Verify
```

A bug fix should normally leave behind a regression test.

---

# 15. Background Jobs

Test:

* successful execution
* retry behavior
* duplicate execution
* failure handling
* idempotency
* partial failures
* state transitions

Workers must not silently corrupt workflow state.

---

# 16. External Integrations

Use integration-specific tests for:

* authentication
* request construction
* response parsing
* timeout behavior
* retries
* rate limits
* failure responses

Keep external integration tests separate from normal unit tests when appropriate.

---

# 17. Test Naming

Test names should explain behavior.

Prefer:

```text
allows workspace members to read their tender
```

over:

```text
testTender()
```

A test should make failures understandable.

---

# 18. Before Completion

Run the appropriate:

```text
typecheck
lint
unit tests
integration tests
E2E tests
build
```

Use the repository's actual commands.

Do not invent commands if package scripts already exist.

---

# 19. Do Not

Never:

* delete failing tests just to make CI pass
* weaken assertions unnecessarily
* test implementation details instead of behavior
* skip tenant-isolation tests
* use production secrets
* depend on uncontrolled external services
* ignore flaky tests
* claim success without actually running relevant tests

---

# 20. Definition of Done

* [ ] Relevant unit tests exist.
* [ ] Integration tests exist where needed.
* [ ] Critical workflows have E2E coverage where appropriate.
* [ ] Negative authorization cases are tested.
* [ ] Tenant isolation is tested.
* [ ] Regression coverage exists for bugs.
* [ ] AI behavior is evaluated where applicable.
* [ ] Tests are deterministic.
* [ ] Type checks pass.
* [ ] Lint passes.
* [ ] Relevant build/tests pass.
