# Lifecycle Test Matrix

| Flow | Initial state | Action | Expected API state | Expected route |
| --- | --- | --- | --- | --- |
| Owner signup | No account | Create and verify Firebase account | `COMPANY_SETUP_REQUIRED` | `/onboarding` |
| First workspace | Verified owner | Create company and workspace | `ACTIVE_MEMBER` | `/` |
| Owner repeat login | Active owner | Sign in again | `ACTIVE_MEMBER` | `/` |
| Employee invitation | Verified invited user | Accept matching invite | `PROFILE_REQUIRED` | `/onboarding` |
| Employee profile | Invited member | Complete profile | `ACTIVE_MEMBER` | `/` |
| Suspended member | Suspended membership | Sign in | no active organization membership | `/access` |
| No workspace access | Active company member | Remove final workspace membership | `NO_WORKSPACE_ACCESS` | `/access` |

Run browser tests only with `PLAYWRIGHT_E2E=1`, Firebase Auth Emulator, a disposable PostgreSQL database, and an isolated API/web environment. Production Firebase credentials and production databases are forbidden in E2E configuration.
