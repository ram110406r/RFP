---

name: database
description: Design and modify the TENDYY data layer using PostgreSQL, Drizzle ORM, pgvector, OpenSearch, Redis-backed workflows, migrations, relationships, indexes, tenant isolation, embeddings, and search synchronization. Use for schema changes, database queries, migrations, data modeling, indexing, vector search, and persistence-layer refactoring.
----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# TENDYY Database Skill

## Mission

Build a reliable, scalable, auditable, and tenant-safe data layer for TENDYY.

The database layer is the source of truth for persistent business data. Database changes must preserve:

* data integrity
* tenant isolation
* referential integrity
* query performance
* auditability
* migration safety
* compatibility with existing application code
* future scalability

Prefer simple relational designs over unnecessary abstraction.

---

# 1. Repository First

Before changing the database:

1. Inspect the existing repository.
2. Find the current database configuration.
3. Find the Drizzle schema.
4. Inspect existing migrations.
5. Inspect existing naming conventions.
6. Inspect existing repositories/data-access code.
7. Search for existing tables before creating new ones.
8. Search for existing enums/status values before adding new ones.
9. Check how IDs, timestamps, foreign keys, and indexes are currently implemented.

Do not invent a parallel database architecture when the repository already has an established pattern.

Use the existing conventions unless there is a strong reason to change them.

---

# 2. PostgreSQL as the Source of Truth

TENDYY uses PostgreSQL as the authoritative persistent datastore.

Use PostgreSQL for:

* companies
* workspaces
* members
* users
* tenders
* tender documents
* questionnaires
* questions
* answers
* evidence
* AI drafts
* approvals
* submissions
* activity records
* audit events
* integrations
* workflow state
* metadata requiring relational integrity

Do not move relational business state into Redis, OpenSearch, object storage, or application memory merely because it is convenient.

Search indexes and caches are derived systems.

---

# 3. Drizzle ORM

Use the project's established Drizzle ORM conventions.

Before adding schema:

* inspect existing schema files
* inspect existing table definitions
* inspect existing relations
* inspect existing migration structure
* follow existing naming conventions

Prefer explicit schemas.

Example conceptual structure:

```text
companies
    ↓
workspaces
    ↓
members
    ↓
tenders
    ↓
questionnaires
    ↓
questions
    ↓
answers
```

Do not blindly copy this structure into the repository. Adapt it to the actual existing schema.

---

# 4. Multi-Tenancy

TENDYY is a multi-tenant application.

Tenant isolation is a security boundary.

Whenever a resource belongs to a company or workspace, ensure the data-access layer properly scopes queries.

Never rely on the frontend to provide correct tenant boundaries.

Never trust a client-provided:

* company ID
* workspace ID
* member ID
* owner ID
* tenant ID

Derive tenant/workspace context from authenticated server-side context whenever possible.

Every relevant query must enforce the appropriate ownership boundary.

Bad:

```ts
db.select()
  .from(tenders)
  .where(eq(tenders.id, tenderId));
```

when the request also requires workspace isolation.

Prefer a query pattern that validates both resource identity and authorized workspace/tenant scope.

---

# 5. Data Modeling

Model actual business relationships explicitly.

Prefer:

* foreign keys
* unique constraints
* check constraints where appropriate
* enums where stable domain states justify them
* normalized relational data
* explicit join tables for many-to-many relationships

Avoid putting relational business data into large JSON blobs.

JSON/JSONB is appropriate for:

* flexible metadata
* provider-specific payloads
* configuration
* external API responses
* structured data whose shape legitimately varies

Do not use JSONB to avoid designing a proper relational model.

---

# 6. IDs

Follow the repository's established ID strategy.

Do not introduce a new ID system for one table without a clear architectural reason.

IDs should be:

* unique
* stable
* non-semantic
* safe to expose where appropriate

Do not encode business meaning into IDs.

Do not use sequential IDs when the existing architecture intentionally uses another strategy.

---

# 7. Timestamps

Persistent entities should have appropriate lifecycle timestamps according to existing project conventions.

Common examples:

```text
createdAt
updatedAt
```

Additional timestamps may be appropriate for lifecycle events:

```text
submittedAt
approvedAt
completedAt
archivedAt
```

Do not add timestamps merely because they look useful.

Every timestamp should represent a meaningful domain event or lifecycle state.

---

# 8. Relationships and Foreign Keys

Use database-level relationships wherever appropriate.

Foreign keys should protect against invalid references.

For example:

```text
workspace
    ├── members
    ├── tenders
    ├── documents
    └── questionnaires
```

When deleting records, explicitly determine the intended behavior:

* cascade
* restrict
* set null
* archive

Never casually add cascading deletes to important business data.

A tender deletion must not accidentally destroy unrelated audit or compliance information.

---

# 9. TENDYY Core Domain

The database should support the core TENDYY workflow:

```text
Tender
   ↓
Tender Documents
   ↓
Questionnaire
   ↓
Questions
   ↓
Knowledge / Evidence Retrieval
   ↓
AI Answer Draft
   ↓
Risk Detection
   ↓
Approval
   ↓
Final Answer
   ↓
Submission
```

Important domain concepts include:

* Company
* Workspace
* Member
* Tender
* Tender Document
* Questionnaire
* Question
* Answer
* Evidence
* AI Draft
* Risk
* Approval
* Submission
* Activity
* Audit Event

Do not collapse distinct business concepts into a single generic table unless the existing architecture intentionally uses that model.

---

# 10. Auditability

TENDYY operates on business information that may require traceability.

Important actions should be capable of being audited.

Examples:

* tender created
* tender updated
* document uploaded
* question imported
* answer generated
* answer edited
* evidence attached
* approval requested
* approval granted
* approval rejected
* submission completed

Audit data should preserve enough information to answer:

```text
Who?
What?
When?
Which entity?
What changed?
Why, when applicable?
```

Do not rely exclusively on application logs for durable audit history.

Use the project's established audit/event model when one exists.

---

# 11. AI and Vector Data

TENDYY may use pgvector for semantic retrieval.

Vector records must remain associated with their source entity.

Conceptually:

```text
Source Document / Evidence
        ↓
Chunk
        ↓
Embedding
```

Vector-related data should retain enough metadata to identify:

* source entity
* source document
* chunk
* embedding model
* embedding version
* vector dimension
* relevant tenant/workspace
* creation/update information where required

Do not treat an embedding as the canonical business record.

The source content remains authoritative.

---

# 12. Embedding Compatibility

Embedding models and vector dimensions must remain compatible.

Before changing an embedding model:

1. Determine the existing vector dimension.
2. Determine which records use the existing model.
3. Determine whether the new model has a different dimension.
4. Plan migration/re-embedding.
5. Avoid silently mixing incompatible vectors.
6. Version embeddings when appropriate.

Never assume vectors generated by different models are interchangeable.

---

# 13. OpenSearch

OpenSearch is a search/indexing system, not the primary source of truth.

Use it for:

* full-text search
* hybrid retrieval
* indexed document content
* search ranking
* retrieval-oriented metadata

Database state should remain authoritative.

A typical flow is:

```text
PostgreSQL
    ↓
Indexing Worker
    ↓
OpenSearch
```

Do not make a write depend unnecessarily on synchronous OpenSearch availability.

Prefer asynchronous indexing when appropriate.

---

# 14. Search Index Consistency

When database records change:

1. Persist the authoritative database change.
2. Trigger the appropriate indexing/update workflow.
3. Update OpenSearch asynchronously when possible.
4. Handle indexing failures.
5. Make indexing retryable.
6. Avoid silently losing indexing events.

Search indexes may temporarily lag behind PostgreSQL.

Design the system so eventual consistency is explicit and safe.

---

# 15. Tenant Filtering in Search

OpenSearch queries must enforce tenant/workspace boundaries.

Never allow a search query to return documents from another company or workspace.

Tenant filtering must be applied server-side.

Do not trust filters supplied by the browser.

Search security is part of application authorization.

---

# 16. Indexes

Add indexes based on actual access patterns.

Common candidates may include:

* foreign keys
* workspace/tenant identifiers
* status fields frequently filtered
* timestamps used for sorting
* unique lookup fields
* composite query patterns

Do not add indexes blindly.

Every index has a storage and write-performance cost.

For composite indexes, consider the actual query pattern and column ordering.

---

# 17. Query Performance

Avoid:

* N+1 queries
* unbounded queries
* loading entire tables
* unnecessary joins
* repeated identical queries
* fetching columns that are not needed

Use:

* pagination
* selective column retrieval
* appropriate indexes
* batch operations
* joins where appropriate
* query-level filtering

For large datasets, never assume a table will remain small.

---

# 18. Pagination

For user-facing lists, follow the repository's established pagination strategy.

Prefer cursor-based pagination for large or continuously changing datasets when appropriate.

Offset pagination can be acceptable for smaller datasets or established project patterns.

Do not introduce a new pagination mechanism unnecessarily.

Pagination must have deterministic ordering.

---

# 19. Transactions

Use database transactions when multiple operations must succeed or fail together.

Examples:

```text
Create tender
    +
Create associated records
```

or:

```text
Approve answer
    +
Update answer state
    +
Create audit event
```

Do not use transactions merely for every individual query.

Keep transaction boundaries aligned with business invariants.

---

# 20. Concurrency

Consider concurrent updates to important resources.

Potential examples:

* two users editing the same answer
* simultaneous approvals
* duplicate submissions
* repeated webhook processing
* concurrent document processing

Use appropriate:

* unique constraints
* transactions
* optimistic concurrency
* row locking
* idempotency
* state validation

Do not assume only one request can modify a record.

---

# 21. State Machines

Business lifecycle states should be explicit.

Example conceptual answer lifecycle:

```text
DRAFT
   ↓
AI_GENERATED
   ↓
REVIEW
   ↓
APPROVED
   ↓
SUBMITTED
```

Actual states must follow the project's domain model.

Prevent invalid transitions at the appropriate application/database boundary.

Do not allow arbitrary strings to represent critical workflow state when a controlled representation is appropriate.

---

# 22. Migrations

Every schema change must have a safe migration strategy.

Before migration:

1. Inspect the current schema.
2. Understand existing production data.
3. Determine whether the change is backward compatible.
4. Identify affected queries/services.
5. Consider deployment ordering.

Prefer safe staged migrations.

For example:

```text
1. Add nullable column
2. Deploy application support
3. Backfill data
4. Add constraint
5. Remove obsolete field later
```

Avoid destructive migrations when existing data may depend on them.

Never casually drop:

* tables
* columns
* indexes
* constraints

without understanding their usage.

---

# 23. Zero-Downtime Thinking

For production schema changes, consider:

```text
Old Application
      ↓
Migration
      ↓
New Application
```

Avoid migrations that require old application versions to stop working unexpectedly.

When a migration changes a live contract, use compatibility phases where appropriate.

---

# 24. Data Lifecycle

For important business records, determine whether the system needs:

* active
* archived
* deleted
* permanently retained

Do not introduce soft deletion automatically.

If the existing application uses archival or soft-delete conventions, follow them consistently.

Audit/compliance records may require different retention behavior from ordinary application data.

---

# 25. Documents and Object Storage

Large files should not normally be stored directly in PostgreSQL.

Use MinIO/S3-compatible object storage for:

* tender documents
* attachments
* uploaded files
* generated files

PostgreSQL should store the metadata required to reference and manage those objects.

Conceptually:

```text
PostgreSQL
    ↓
Document Metadata
    ↓
Object Storage
```

Do not duplicate large binary content unnecessarily.

---

# 26. Redis

Redis is not the authoritative datastore for persistent business entities.

Use Redis for appropriate transient workloads such as:

* caching
* rate limiting
* job coordination
* temporary state
* distributed locks where justified

Important business data should remain recoverable from PostgreSQL.

---

# 27. Background Processing

Database changes that trigger expensive work should generally integrate with background workers.

Examples:

```text
Document Upload
      ↓
Database Record
      ↓
Processing Job
      ↓
Text Extraction
      ↓
Chunking
      ↓
Embedding
      ↓
OpenSearch Index
```

Do not perform expensive embedding, indexing, document processing, or AI workflows inside a normal HTTP transaction unless there is a strong reason.

---

# 28. Idempotency

Database workflows that may be retried must be safe to execute more than once.

Examples:

* webhook processing
* document indexing
* embedding generation
* submission workflows
* background jobs

Use appropriate unique keys, status checks, or idempotency records.

A retry should not create duplicate business records.

---

# 29. Security

Never store:

* plaintext passwords
* API secrets
* access tokens
* private credentials

unless the established architecture explicitly provides secure encrypted storage.

Sensitive values must be handled according to the project's authentication/security architecture.

Database access must always respect authorization boundaries.

---

# 30. Testing

Database-related changes should include appropriate tests.

Test:

* schema behavior
* constraints
* relationships
* tenant isolation
* migrations
* repository queries
* state transitions
* transaction behavior
* pagination
* search synchronization where relevant

Include negative cases.

For example:

```text
Workspace A cannot retrieve Workspace B's tender.
```

This is a critical test, not an edge case.

---

# 31. Implementation Workflow

For database work:

```text
1. Understand the feature
2. Inspect existing schema
3. Search for related tables
4. Inspect existing queries
5. Identify required data relationships
6. Design the smallest correct schema change
7. Add constraints and indexes
8. Create migration
9. Update repositories/services
10. Update search/indexing workflows if needed
11. Add tests
12. Run type checks
13. Run database tests
14. Review tenant isolation
15. Review migration safety
16. Review query performance
```

Do not start by immediately creating tables.

---

# 32. Do Not

Never:

* create duplicate tables for existing concepts
* bypass Drizzle conventions
* trust client-provided tenant IDs
* expose database credentials
* use OpenSearch as the source of truth
* store large files unnecessarily in PostgreSQL
* put all business data into JSONB
* create unbounded queries
* ignore foreign-key relationships
* add indexes without understanding query patterns
* perform unsafe destructive migrations
* silently mix incompatible embeddings
* allow cross-tenant search results
* assume concurrent updates cannot happen
* rely on application code alone for basic data integrity when PostgreSQL constraints are appropriate

---

# 33. Definition of Done

A database change is complete when:

* [ ] Existing schema was inspected first.
* [ ] Existing conventions are followed.
* [ ] Data relationships are correct.
* [ ] Tenant isolation is enforced.
* [ ] Appropriate constraints exist.
* [ ] Appropriate indexes exist.
* [ ] Migration is safe.
* [ ] Existing data is considered.
* [ ] Queries are bounded and performant.
* [ ] Transactions are used where required.
* [ ] Search synchronization is handled when applicable.
* [ ] Vector metadata is compatible when applicable.
* [ ] Tests cover important behavior.
* [ ] No secrets are exposed.
* [ ] No unnecessary dependencies or infrastructure were introduced.
* [ ] Existing functionality remains compatible.
* [ ] Type checks and relevant tests pass.
