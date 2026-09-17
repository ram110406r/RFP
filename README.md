# TENDYY RFP Operating System

TENDYY is a modular, multi-tenant platform for running the RFP lifecycle:
intake, document processing, requirement intelligence, knowledge retrieval,
AI-assisted answer generation, evidence, review, validation, submission, and
outcome learning.

The same source code runs in local, staging, and production. Environment
configuration determines which infrastructure it uses.

## Stack

- Bun, TypeScript, Turborepo
- Next.js App Router frontend in `apps/web`
- NestJS REST API in `apps/api`
- BullMQ worker in `apps/worker`
- PostgreSQL + pgvector with Drizzle in `packages/db`
- Redis, MinIO/S3, OpenSearch
- Firebase browser auth with API-side token verification

## Local Setup

```bash
bun install
cp .env.example .env.local
bun dev
```

`bun dev` starts local infrastructure, applies migrations, ensures seed data,
then starts the API, worker, and web app in watch mode.

Local URLs:

- Web: `http://localhost:3000`
- API: `http://localhost:4100`
- MinIO API: `http://localhost:59000`
- MinIO Console: `http://localhost:59001`
- OpenSearch: `http://localhost:45200`

## Commands

```bash
bun dev              # infra + migrate + seed + hot-reload API/worker/web
bun dev:apps         # hot-reload API/worker/web only

bun infra:up         # start PostgreSQL, Redis, MinIO, OpenSearch
bun infra:down       # stop local infrastructure
bun infra:logs       # follow local infrastructure logs
bun infra:reset      # local-only: destroy volumes and recreate infra

bun db:migrate       # apply Drizzle migrations
bun db:ensure-seed   # seed only when demo data is missing
bun db:seed          # explicitly seed development data
bun db:reset         # local-only: drop/recreate DB schema and rerun migrations

bun doctor           # verify local tooling, infra, env, DB, and seed data
bun build            # production build
bun test             # tests
bun lint             # lint
bun typecheck        # TypeScript checks
```

`db:reset` and `infra:reset` refuse to run unless `APP_ENV=local`.

## Environment Model

Do not edit source code when moving between local, staging, and production.
Change only environment values.

| Configuration | Local | Staging | Production |
| --- | --- | --- | --- |
| Web | `localhost:3000` | staging URL | production URL |
| API | `localhost:4100` | staging API/internal URL | production API/internal URL |
| PostgreSQL | Docker `localhost:55432` | staging DB | production DB |
| Redis | Docker `localhost:56379` | staging Redis | production Redis |
| Storage | MinIO `localhost:59000` | staging S3/MinIO | production S3/MinIO |
| Search | OpenSearch `localhost:45200` | staging search | production search |
| AI | `AI_PROVIDER=mock` or configured provider | configured provider | configured provider, never mock |
| Auth | Firebase dev/project config | staging Firebase config | production Firebase config |

Important variables:

- `APP_ENV=local|staging|production`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_API_URL`
- `API_INTERNAL_URL`
- `DATABASE_URL`
- `REDIS_URL`
- `STORAGE_ENDPOINT`
- `STORAGE_PUBLIC_ENDPOINT`
- `STORAGE_BUCKET`
- `OPENSEARCH_URL`
- `CORS_ORIGIN`
- `AI_PROVIDER`
- `FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_*`

`.env.local`, `.env`, `.env.production`, and other real env files are ignored.
Only example files are committed.

## Local Infrastructure

`docker-compose.yml` runs the local dependencies:

- PostgreSQL with pgvector on host port `55432`
- Redis on host port `56379`
- MinIO on host ports `59000` and `59001`
- OpenSearch on host port `45200`

The MinIO bucket is initialized automatically by `minio-init`.

Application code runs directly on the host for fast hot reload:

```text
Host:   Next.js, NestJS API, Worker
Docker: PostgreSQL, Redis, MinIO, OpenSearch
```

## Health Checks

- `GET /health` checks API liveness.
- `GET /ready` checks readiness for deployment probes.
- `GET /health/dependencies` reports database, Redis, storage, and OpenSearch.

## Production Build

Run locally before deployment:

```bash
bun typecheck
bun lint
bun build
```

Production must provide environment variables through the deployment platform.
There should be no step that changes localhost URLs or source files before
deployment.

Local Windows development sets `NEXT_OUTPUT_STANDALONE=false` in `.env.local`
to avoid standalone trace symlink permission issues. Staging and production can
omit it and keep Next's standalone output enabled.

## Troubleshooting

- Port already in use: change the host port in `.env.local` and compose only if
  needed, then restart with `bun infra:down && bun infra:up`.
- Docker not running: start Docker Desktop, then run `bun infra:up`.
- Database unavailable: run `bun infra:up`, then `bun doctor`.
- Redis unavailable: run `bun infra:logs` and check the `redis` service.
- MinIO upload fails: verify `minio-init` completed, `STORAGE_PUBLIC_ENDPOINT`
  is browser reachable, and the web service is proxying `/<STORAGE_BUCKET>/...`
  to MinIO.
- OpenSearch unavailable: check memory limits and `bun infra:logs`.
- Missing env variable: copy `.env.example` to `.env.local` and rerun.
- CORS error: ensure `CORS_ORIGIN` matches the web origin exactly.
- Auth error: verify `FIREBASE_PROJECT_ID` and `NEXT_PUBLIC_FIREBASE_*`.
- Worker unavailable: ensure `REDIS_URL` is set and `bun dev:apps` is running.
- Migration error: run `bun db:migrate`; for local-only rebuilds use
  `APP_ENV=local bun db:reset && bun db:ensure-seed`.
