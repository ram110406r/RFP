# Legacy Removal

## Pending Removal

- `apps/legacy-web` remains available for rollback only.
- `apps/legacy-api` remains available for rollback only.

## What remains

- The active TENDYY product in `apps/web`
- The active backend in `apps/api`
- Shared packages used by the active stack
- The cleanup and audit documentation in `docs/`

## Why anything remains

- The active NestJS stack no longer registers the legacy `rfp` or document controllers.
- The legacy code is transitional and duplicated the current product surface.
- Shared schema and package references remain only where they support the active stack or historical migration context.

## Removal Gate

- Confirm no deployment references either legacy service.
- Export and verify legacy database rows before removing their tables.
- Remove the two legacy apps, workspace metadata, Dockerfiles, and lockfile entries.
- Remove stale references in docs, comments, and historical notes.
