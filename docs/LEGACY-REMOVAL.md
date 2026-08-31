# Legacy Removal

## Removed

- `apps/legacy-web`
- `apps/legacy-api`

## What remains

- The active TENDYY product in `apps/web`
- The active backend in `apps/api`
- Shared packages used by the active stack
- The cleanup and audit documentation in `docs/`

## Why anything remains

- The active stack does not import or depend on the legacy apps.
- The legacy code was transitional and duplicated the current product surface.
- Shared schema and package references remain only where they support the active stack or historical migration context.

## What can be removed later

- Stale references in docs, comments, and historical notes
- Legacy package metadata entries if the repository is fully re-baselined and lockfiles are regenerated
- Any remaining migration-era comments that only describe the deleted legacy apps
