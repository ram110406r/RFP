---

name: ai
description: Build TENDYY AI workflows using the OpenAI SDK, Mastra, MCP, retrieval, pgvector, OpenSearch, evidence grounding, structured outputs, risk detection, human approval, background jobs, and auditable AI operations. Use for agents, AI generation, RAG, extraction, classification, evaluation, and AI-assisted tender workflows.
----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# TENDYY AI Skill

## Mission

Build reliable, grounded, auditable AI capabilities for TENDYY.

TENDYY AI exists to accelerate tender response work while keeping humans in control of high-risk decisions.

The system should optimize for:

* correctness
* evidence grounding
* traceability
* controllability
* predictable behavior
* cost efficiency
* latency
* security

---

# 1. Repository First

Before implementing AI:

1. Inspect existing AI services.
2. Inspect OpenAI SDK usage.
3. Inspect Mastra configuration.
4. Inspect MCP tools.
5. Inspect retrieval services.
6. Inspect embedding workflows.
7. Inspect prompt conventions.
8. Inspect background workers.
9. Inspect existing AI tests/evaluations.

Reuse established abstractions.

Do not create a second AI framework unnecessarily.

---

# 2. AI Architecture

Prefer:

```text
User / Workflow
      ↓
AI Service / Agent
      ↓
Retrieval
      ↓
Evidence
      ↓
Model
      ↓
Structured Result
      ↓
Validation
      ↓
Risk / Confidence Assessment
      ↓
Human Approval when required
      ↓
Final Business Record
```

AI output is not automatically truth.

---

# 3. Grounding

TENDYY answers should be grounded in company knowledge whenever possible.

Prefer:

```text
Question
   ↓
Retrieve relevant evidence
   ↓
Rank evidence
   ↓
Generate answer
   ↓
Attach evidence references
```

Do not encourage the model to invent company-specific information.

---

# 4. Retrieval

Use the project's retrieval architecture.

Potential sources:

* PostgreSQL
* pgvector
* OpenSearch
* company documents
* approved knowledge
* prior answers
* evidence records

Search should respect:

* company
* workspace
* permissions
* document access
* source status

---

# 5. Vector Search

When using pgvector:

* use compatible embeddings
* preserve model/version metadata
* respect vector dimensions
* maintain source references
* filter by tenant/workspace
* avoid retrieving inaccessible records

Never allow vector similarity to bypass authorization.

---

# 6. Hybrid Search

When OpenSearch and vector search are combined, consider:

```text
Keyword relevance
       +
Semantic relevance
       +
Metadata filters
       +
Authorization filters
       ↓
Final retrieval set
```

Do not sacrifice authorization for retrieval quality.

---

# 7. Evidence

AI-generated answers should reference their supporting evidence when applicable.

Evidence should be:

* identifiable
* inspectable
* permission-aware
* traceable to source content

Avoid vague citations such as:

```text
"According to company documents..."
```

when the system can provide specific evidence.

---

# 8. Hallucination Control

Never invent:

* company facts
* certifications
* revenue
* customer names
* legal claims
* security guarantees
* product capabilities
* contract commitments
* compliance statements

If evidence is insufficient, the system should be able to say:

```text
Insufficient evidence
```

or route the item for human review.

---

# 9. Structured Outputs

Prefer structured outputs for machine-consumed AI results.

Examples:

```text
answer
confidence
risk
evidenceIds
needsApproval
reason
```

Validate model outputs before persisting them.

Never assume a model followed the expected schema merely because it returned JSON.

---

# 10. Risk Detection

Risk should be explicit where useful.

Potential high-risk categories:

* legal commitments
* pricing
* contractual obligations
* security claims
* compliance claims
* certifications
* customer-specific commitments
* unsupported company claims

Risk detection should inform workflow routing.

It should not silently make critical business decisions without defined rules.

---

# 11. Human Approval

AI should support human decision-making.

Conceptually:

```text
AI Draft
   ↓
Risk Assessment
   ↓
Approval Required?
   ├── No → Continue
   └── Yes → Human Review
```

Approved content must be distinguishable from drafts.

---

# 12. Prompt Design

Prompts should be:

* explicit
* deterministic where possible
* scoped
* evidence-aware
* resistant to instruction injection
* aligned with the current task

Do not put critical authorization rules only inside prompts.

Security controls must exist outside the model.

---

# 13. Prompt Injection

Treat retrieved documents and external content as untrusted input.

A tender document may contain instructions such as:

```text
Ignore previous instructions...
```

Those instructions must not override system behavior.

Separate:

```text
system instructions
trusted application context
retrieved content
user input
```

Never let document content redefine system permissions.

---

# 14. Tool Use

AI tools should have narrow, explicit capabilities.

For example:

```text
searchEvidence
getTender
getQuestion
draftAnswer
requestApproval
```

Avoid one unrestricted tool that can perform arbitrary database operations.

Tool execution must still enforce backend authorization.

---

# 15. MCP

MCP tools should be:

* narrowly scoped
* authenticated
* authorized
* validated
* observable
* explicit about side effects

AI agents must not receive broader permissions than the user or service identity allows.

---

# 16. Background AI Work

Long-running AI workflows should run through workers when appropriate.

Examples:

* document extraction
* bulk question classification
* embedding generation
* answer generation
* large retrieval jobs
* submission preparation

Jobs should be:

* retryable
* idempotent
* observable
* resumable where practical

---

# 17. AI Cost and Latency

Avoid unnecessary model calls.

Prefer:

* retrieval before generation
* batching where appropriate
* smaller models for simple tasks
* caching where safe
* structured workflows
* avoiding repeated identical calls

Do not optimize cost by sacrificing critical answer quality.

---

# 18. AI Observability

Track appropriate metadata such as:

* workflow
* model
* model version
* latency
* token usage
* success/failure
* tool usage
* retrieval information
* evaluation results

Do not log sensitive document content unnecessarily.

---

# 19. Evaluation

AI features require evaluation.

Test:

* factual grounding
* evidence selection
* hallucination resistance
* classification accuracy
* structured output validity
* authorization boundaries
* prompt-injection resistance
* regression behavior

Do not judge an AI feature only by whether the demo looks good.

---

# 20. Do Not

Never:

* treat AI output as automatically authoritative
* invent company facts
* bypass authorization through tools
* trust retrieved instructions
* expose secrets to models
* allow arbitrary database access
* ignore evidence
* silently approve high-risk content
* mix incompatible embeddings
* persist unvalidated model output

---

# 21. Definition of Done

* [ ] AI workflow is grounded where applicable.
* [ ] Retrieval respects tenant boundaries.
* [ ] Evidence can be traced.
* [ ] Model output is validated.
* [ ] Risk handling is explicit.
* [ ] Approval workflow is respected.
* [ ] Tool access is authorized.
* [ ] Prompt injection is considered.
* [ ] Long-running work is asynchronous where appropriate.
* [ ] AI behavior is observable.
* [ ] Evaluation/tests exist.
* [ ] Sensitive information is protected.
