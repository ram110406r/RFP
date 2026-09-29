# Removed Prototype Applications

## Removed

- The previous TanStack Start frontend has been removed.
- The previous Bun + Elysia API has been removed.

## What remains

- The active TENDYY product in `apps/web`
- The active backend in `apps/api`
- Shared packages used by the active stack
- The cleanup and audit documentation in `docs/`

## Why Shared Code Remains

- The active NestJS stack no longer registers the old `rfp` or document controllers.
- The removed code duplicated the current product surface.
- Shared schema and package references remain only where they support the active stack or historical migration context.

## Completed Gate

- Confirm no deployment references either legacy service.
- Export and verify legacy database rows before removing their tables.
- Removed the two legacy apps, workspace metadata, Dockerfiles, and lockfile entries.
- Remove stale references in docs, comments, and historical notes.
