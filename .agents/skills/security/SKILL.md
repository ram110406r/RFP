---

name: security
description: Secure the TENDYY platform across frontend, backend, APIs, authentication, authorization, database, AI, MCP, file handling, object storage, secrets, logging, tenant isolation, and external integrations. Use for security reviews, threat modeling, hardening, vulnerability fixes, and secure implementation.
-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# TENDYY Security Skill

## Mission

Treat security as a system-wide property.

TENDYY handles:

* company information
* tender documents
* confidential business knowledge
* AI-generated answers
* credentials
* integrations
* potentially sensitive commercial information

Security must exist at every layer.

---

# 1. Repository First

Before security changes:

1. Inspect architecture.
2. Inspect authentication.
3. Inspect authorization.
4. Inspect API boundaries.
5. Inspect database access.
6. Inspect object storage.
7. Inspect AI tools.
8. Inspect MCP tools.
9. Inspect secrets/configuration.
10. Inspect logging.
11. Inspect existing security tests.

Fix the actual architecture rather than adding superficial checks.

---

# 2. Threat Model

For important features identify:

```text
Assets
 ↓
Threats
 ↓
Attack Surface
 ↓
Controls
 ↓
Verification
```

Consider:

* malicious users
* compromised accounts
* malicious documents
* prompt injection
* cross-tenant access
* leaked credentials
* insecure integrations
* accidental data exposure

---

# 3. Tenant Isolation

Tenant isolation is a critical security boundary.

Verify isolation at:

* API
* service
* repository
* database query
* search
* object storage
* AI retrieval
* MCP tools
* exports

Never rely only on UI restrictions.

---

# 4. Authentication

Use the established authentication framework.

Never:

* implement custom password cryptography unnecessarily
* store plaintext passwords
* expose session secrets
* log authentication tokens

Protect account recovery and credential-management flows.

---

# 5. Authorization

Every protected operation must verify authorization.

Check:

```text
Identity
+
Company
+
Workspace
+
Role
+
Permission
+
Resource
+
Action
```

Do not assume internal services are automatically safe.

---

# 6. API Security

Validate all external inputs.

Protect against:

* injection
* unauthorized access
* excessive resource consumption
* malformed input
* insecure file uploads
* replayed operations
* enumeration

Use appropriate rate limiting where required.

---

# 7. Injection

Defend against:

* SQL injection
* command injection
* XSS
* HTML injection
* template injection
* prompt injection
* path traversal

Use parameterized database queries and safe output handling.

Never construct shell commands directly from untrusted input.

---

# 8. File Security

Uploaded documents are untrusted.

Consider:

* file type validation
* size limits
* filename sanitization
* malware scanning where required
* path traversal
* parser vulnerabilities
* decompression bombs
* dangerous embedded content

Do not trust file extensions alone.

---

# 9. Object Storage

MinIO/S3 objects must have appropriate access controls.

Never expose private company documents publicly unless explicitly intended.

Prefer controlled access through:

* signed URLs
* authenticated APIs
* server-side authorization

Do not allow a user to access an object merely by knowing its object key.

---

# 10. Secrets

Never commit:

* API keys
* database passwords
* session secrets
* private credentials
* cloud credentials
* production tokens

Use environment/configuration management.

Never print secrets during debugging.

---

# 11. Logging

Logs must be useful without becoming a data-leak channel.

Avoid logging:

* passwords
* session tokens
* API keys
* full confidential documents
* sensitive customer information

Use request IDs and structured metadata where appropriate.

---

# 12. AI Security

AI systems must treat external content as untrusted.

Tender documents may contain adversarial instructions.

Separate:

```text
System instructions
Trusted application data
User request
Retrieved content
```

Retrieved content must never gain system-level authority.

---

# 13. AI Data Exposure

Only retrieve documents the current actor is authorized to access.

Never send unrelated tenant data to a model.

Do not include unnecessary confidential content in prompts.

Minimize sensitive context.

---

# 14. MCP Security

MCP tools must enforce the same authorization as REST APIs.

Never expose unrestricted tools such as:

```text
executeAnySQL
runAnyCommand
accessAnyFile
```

Prefer narrow tools with explicit capabilities.

---

# 15. External Integrations

Protect credentials used for:

* tender portals
* email
* cloud services
* document providers
* CRM systems
* other third-party services

Use least privilege.

Rotate/revoke credentials when supported.

---

# 16. Rate Limiting

Protect expensive or abuse-prone operations.

Potential targets:

* authentication
* API keys
* document uploads
* AI generation
* search
* submission
* webhook endpoints

Rate limits should consider tenant and identity where appropriate.

---

# 17. Data Protection

Collect and store only what is necessary.

Avoid unnecessary duplication of sensitive data.

Apply appropriate retention and deletion policies.

Do not create additional copies of confidential documents without a reason.

---

# 18. Security Headers and Browser Security

Use appropriate browser security protections according to the deployed architecture.

Consider:

* CSP
* secure cookies
* SameSite
* CSRF protection where applicable
* frame protections
* content type protections
* HTTPS

Follow the project's deployment architecture rather than blindly adding headers.

---

# 19. Dependency Security

Before adding a dependency:

* verify necessity
* inspect maintenance status
* check known vulnerabilities
* prefer established packages
* avoid unnecessary packages

Keep dependencies updated according to project policy.

---

# 20. Security Testing

Test:

* authentication bypass
* authorization bypass
* cross-tenant access
* object-storage access
* API abuse
* injection
* file upload abuse
* prompt injection
* MCP authorization
* secret exposure

Security tests should attempt realistic attack paths.

---

# 21. Incident Thinking

For serious security failures consider:

```text
Detect
 ↓
Contain
 ↓
Investigate
 ↓
Recover
 ↓
Prevent recurrence
```

Important security events should be auditable.

---

# 22. Do Not

Never:

* trust frontend authorization
* trust tenant IDs from clients
* expose private files
* log secrets
* execute arbitrary user commands
* allow unrestricted MCP tools
* send unauthorized data to AI models
* assume uploaded files are safe
* commit credentials
* disable security controls just to make development easier

---

# 23. Definition of Done

* [ ] Threat model considered.
* [ ] Authentication verified.
* [ ] Authorization verified.
* [ ] Tenant isolation verified.
* [ ] Inputs validated.
* [ ] File handling reviewed.
* [ ] Object storage access reviewed.
* [ ] AI security reviewed.
* [ ] MCP security reviewed.
* [ ] Secrets protected.
* [ ] Logging reviewed.
* [ ] Rate limiting considered.
* [ ] Security tests added.
