# Onboarding and Workspace Verification

## Scope

This verification covers the active `apps/web -> apps/api -> packages/db`
onboarding, Firebase authentication, organization membership, workspace access,
and invitation paths. It does not verify the currently deployed Dokploy instance.

## Verified Behavior

### Authentication and routing

- Firebase browser authentication is the active production browser session.
- The API verifies Firebase bearer tokens and provisions the application user.
- Email verification is required before organization-owned access, company setup,
  and invitation acceptance.
- The web authentication gate uses `GET /onboarding/status` to route users:
  unverified users go to `/verify-email`; users requiring onboarding go to
  `/onboarding`; members without an active workspace go to `/access`; active
  workspace members go to the dashboard.
- Invitation tokens are accepted through `/join#token=...`; the fragment keeps
  the token out of the initial HTTP request URL.

### Company onboarding

- A new verified user starts the company journey.
- Creating the first workspace transactionally creates the organization, an
  active owner organization membership, and an active owner workspace
  membership.
- First-workspace creation marks company onboarding complete, so later logins
  should route the owner to the dashboard rather than onboarding.

### Employee onboarding

- An invitation is tied to one organization, one required workspace, and one
  fixed role.
- Acceptance validates the signed-in, verified identity and creates the
  organization and workspace memberships through the organization service.
- Employee profile completion marks employee onboarding complete.
- Reopening the same consumed invitation after profile completion is now an
  idempotent no-op. It no longer resets the employee to onboarding.

### Workspace and people management

- The Organization page contains `Manage Workspaces`, `Invite Members`, and an
  `Add or remove members` control for every active workspace.
- Workspace membership changes are limited to members in the active
  organization and are enforced server-side.
- Workspace listing only returns active workspaces. Users without organization
  workspace-management permission see only their own active workspaces.
- Owner and Admin retain workspace creation, update, archive, and membership
  management permissions. RFP Manager no longer has those management
  permissions.

## Corrective Changes Applied

1. Made employee invitation re-acceptance idempotent after profile completion.
2. Required `FIREBASE_PROJECT_ID` in API production configuration and supplied
   it to all Dokploy/production API compose services from
   `NEXT_PUBLIC_FIREBASE_PROJECT_ID`.
3. Removed `workspace:create`, `workspace:update`, and
   `workspace:member:manage` from the RFP Manager permission set.
4. Made database-backed onboarding and workspace tests skip cleanly when a
   disposable `DATABASE_URL` is not present, rather than throwing during test
   setup.

## Verification Results

| Check | Result |
| --- | --- |
| `bun run typecheck` | Passed: 16 packages |
| Auth guard unit tests | Passed: 7 tests |
| Onboarding and workspace database tests | Skipped: 5 tests without `DATABASE_URL` |
| Formatting safety (`git diff --check`) | Passed |
| Browser end-to-end tests | Not present in this repository |
| Deployed Dokploy behavior | Not verified from this workspace |

## Remaining Gaps

- The owner onboarding page still contains legacy profile, team, RFP-context,
  and review step code even though first-workspace creation now completes the
  company journey. This is dormant UI/API debt and should be removed or
  reconciled in a focused follow-up.
- Organization action buttons are rendered without a client-side permission
  visibility check. The API is authoritative and rejects unauthorized calls,
  but hiding unavailable actions would make the UI clearer.
- The workspace interface lists active workspaces only. It has no explicit
  archived-workspace inventory or restore workflow.
- No browser tests cover owner setup, invitation acceptance, workspace member
  add/remove, permission denial, or sign-out/sign-in routing.
- The repository has no deployment build/version endpoint, so the public site
  cannot be confirmed as running the current commit from application code.

## Required Deployment Smoke Test

Set `FIREBASE_PROJECT_ID` (through `NEXT_PUBLIC_FIREBASE_PROJECT_ID` in the
Dokploy compose environment) and redeploy the API and web service. Then test:

1. A verified new owner creates a company and first workspace, signs out, and
   signs in again. The destination must be the dashboard.
2. An owner or admin invites an employee and copies the join link.
3. The invited, verified email accepts the link and completes its profile.
4. The employee can view only the assigned workspace.
5. An owner adds and removes an existing company member from a workspace.
6. An RFP Manager cannot create, archive, or manage workspace members.

Run the database-backed tests with an isolated disposable database before
releasing a migration or permissions change.
