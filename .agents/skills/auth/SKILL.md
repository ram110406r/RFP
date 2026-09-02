---

name: auth
description: Implement TENDYY authentication and authorization using better-auth, passkeys, API keys, sessions, RBAC, ABAC, company/workspace membership, permissions, tenant isolation, and secure identity handling. Use for login, sessions, users, members, roles, permissions, access policies, and authentication security.
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

# TENDYY Auth Skill

## Mission

Build secure authentication and authorization for TENDYY.

Authentication establishes identity.

Authorization determines what that identity is allowed to do.

Never treat authentication and authorization as the same problem.

---

# 1. Repository First

Before modifying auth:

1. Inspect better-auth configuration.
2. Inspect user/session models.
3. Inspect organization/company/workspace models.
4. Inspect membership logic.
5. Inspect roles and permissions.
6. Inspect auth middleware.
7. Inspect frontend auth flows.
8. Inspect API authorization.
9. Inspect existing security tests.

Do not replace the existing authentication architecture without a clear reason.

---

# 2. Authentication

TENDYY may support:

* passwordless authentication
* passkeys
* sessions
* API keys
* other provider integrations supported by the project

Use the existing better-auth architecture.

Never implement custom password/session handling if the authentication framework already provides it.

---

# 3. Identity

The authenticated identity should come from trusted server-side authentication context.

Never trust identity values supplied by:

* request bodies
* query parameters
* hidden form fields
* frontend state
* cookies that are not validated
* MCP tool arguments

The server must resolve the authenticated actor.

---

# 4. Session Security

Sessions should be:

* securely created
* securely validated
* revocable
* appropriately expired
* protected against session fixation
* protected against unauthorized reuse

Never expose raw session secrets unnecessarily.

Do not log session tokens.

---

# 5. Company and Workspace Model

TENDYY uses company/workspace concepts.

Conceptually:

```text
Company
   ↓
Workspace
   ↓
Members
   ↓
Permissions
```

The exact hierarchy must follow the repository's actual implementation.

A user may belong to multiple workspaces or organizations depending on product rules.

Always resolve the active context explicitly.

---

# 6. Membership

Membership should determine whether an authenticated user belongs to the relevant company/workspace.

Do not assume:

```text
authenticated user = authorized workspace member
```

Always verify membership before accessing workspace-scoped data.

---

# 7. RBAC

Use Role-Based Access Control where appropriate.

Example conceptual roles:

```text
Owner
Admin
Manager
Member
Reviewer
Viewer
```

Do not invent roles if the project already has an established role model.

Permissions should represent actions, not arbitrary UI states.

Examples:

```text
tender.read
tender.create
tender.update
tender.delete
answer.generate
answer.approve
submission.execute
member.manage
audit.read
```

---

# 8. ABAC

Use Attribute-Based Access Control when role alone is insufficient.

Relevant attributes may include:

* company
* workspace
* membership
* resource ownership
* department
* assigned reviewer
* approval authority
* resource sensitivity
* workflow state

RBAC answers:

> What can this role normally do?

ABAC can answer:

> Can this specific person perform this action on this specific resource right now?

---

# 9. Authorization Architecture

Prefer:

```text
Request
  ↓
Authenticated Identity
  ↓
Company / Workspace Context
  ↓
Membership
  ↓
Permission
  ↓
Resource Policy
  ↓
Action
```

Authorization should happen server-side.

Never rely on hidden UI controls as authorization.

---

# 10. Resource-Level Authorization

Checking a permission alone may not be enough.

Example:

```text
user has tender.read
```

does not automatically mean:

```text
user can read every tender in the database
```

The tender must also belong to an accessible company/workspace.

---

# 11. API Keys

API keys are machine credentials.

Treat them as secrets.

Store only what is necessary to identify/revoke a key securely.

Never expose the full secret after creation unless the product explicitly requires one-time display.

Support:

* revocation
* expiration where appropriate
* scopes/permissions where appropriate
* auditability

Never log API keys.

---

# 12. Passkeys

Use the authentication framework's implementation for passkeys.

Do not implement WebAuthn cryptography manually unless absolutely necessary.

Passkey operations should respect:

* origin
* challenge
* credential verification
* session creation
* account recovery policy

---

# 13. Account Recovery

Account recovery is a security-sensitive workflow.

Do not weaken authentication requirements simply to make recovery easier.

Recovery actions should be:

* authenticated where possible
* time-limited
* auditable
* revocable where appropriate

---

# 14. Sensitive Operations

Require appropriate authorization for sensitive actions such as:

* deleting company data
* managing members
* changing permissions
* approving answers
* executing submissions
* modifying integrations
* managing API keys

Additional confirmation or step-up authentication may be appropriate.

---

# 15. Audit Events

Security-sensitive actions should be auditable.

Record appropriate events for:

* login
* logout
* credential changes
* passkey registration/removal
* API key creation/revocation
* role changes
* membership changes
* permission changes
* sensitive administrative actions

Do not log authentication secrets.

---

# 16. Frontend Auth UX

Frontend authorization is for user experience.

It can:

* hide unavailable actions
* disable buttons
* redirect users
* show permission messages

But it must never be the actual security boundary.

The backend must independently authorize every protected operation.

---

# 17. Unauthorized vs Forbidden

Use the appropriate distinction:

```text
401 = not authenticated
403 = authenticated but not authorized
```

Do not use one interchangeably with the other without following project conventions.

---

# 18. Testing

Auth tests must include:

* unauthenticated access
* authenticated access
* wrong workspace
* wrong company
* insufficient role
* insufficient permission
* resource-level denial
* revoked session
* revoked API key
* expired credentials
* cross-tenant access attempts

Always test negative authorization paths.

---

# 19. Do Not

Never:

* trust client-provided user IDs
* trust client-provided tenant IDs
* trust frontend permission checks
* expose session secrets
* log credentials
* roll your own cryptography
* store plaintext passwords
* bypass authorization for internal APIs
* assume MCP clients are trusted
* give admins unrestricted access without explicit product requirements

---

# 20. Definition of Done

* [ ] Authentication uses the established framework.
* [ ] Identity comes from trusted server context.
* [ ] Company/workspace membership is checked.
* [ ] Permissions are enforced server-side.
* [ ] Resource-level authorization is handled.
* [ ] API keys are protected.
* [ ] Sensitive operations are protected.
* [ ] Security events are auditable.
* [ ] Unauthorized and forbidden states are correct.
* [ ] Cross-tenant access tests exist.
* [ ] Secrets are not logged or exposed.
