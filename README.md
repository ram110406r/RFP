# RFP OS

RFP OS is a modular, multi-tenant, API-first platform for running the RFP
lifecycle — intake, document processing, requirement intelligence, knowledge
retrieval, AI-assisted answer generation, evidence, risk detection, human
review, validation, submission, and outcome learning.

This is a Turborepo monorepo built on Bun and TypeScript.

## Architecture

```text
apps/
  web         Next.js App Router — the product frontend
  api         NestJS — the REST API
  worker      Bun + BullMQ — background/async job processing
  mcp         Model Context Protocol server — exposes RFP OS to MCP clients
  extension   Plasmo — browser extension

packages/
  ui              Shared React component library (consumed by apps/web)
  types           Shared cross-cutting TypeScript types
  config          Shared tsconfig bases and ESLint config
  db              Drizzle ORM schema, migrations, and DB client (Postgres + pgvector)
  ai              AI provider abstraction and model router — business logic
                  never calls an AI vendor SDK directly, it goes through here
  validation      Shared Zod schemas
  observability   Shared structured logging
```

### Technology

- **Runtime**: Bun
- **Language**: TypeScript throughout
- **Monorepo**: Turborepo + Bun workspaces
- **Frontend**: Next.js (App Router)
- **API**: NestJS, REST
- **Database**: PostgreSQL + pgvector (vector search), via Drizzle ORM
- **Search**: OpenSearch (hybrid search)
- **Jobs**: Redis + BullMQ
- **Object storage**: MinIO (S3-compatible)
- **AI**: provider-agnostic abstraction + model router in `packages/ai`
- **Auth**: Better Auth
- **Authorization**: RBAC + ABAC, with organization isolation enforced on
  every organization-owned resource
- **MCP**: separate server app (`apps/mcp`), not embedded in the API

The active target architecture is `apps/web` + `apps/api`; obsolete prototype
applications have been removed from the workspace.

## Getting started

```bash
bun install
cp .env.example .env
docker compose up -d      # Postgres (pgvector), Redis, MinIO, OpenSearch
bun run dev                # runs every app via Turborepo
```

Root scripts (each fans out to every app via Turborepo):

```bash
bun run dev         # start all apps in watch mode
bun run build        # build all apps/packages
bun run test          # run all tests
bun run lint           # lint all apps/packages
bun run typecheck       # typecheck all apps/packages
bun run db:generate      # generate a Drizzle migration (packages/db)
bun run db:migrate        # apply Drizzle migrations (packages/db)
```

Each app also has its own `.env.example` where its configuration differs
from the shared root `.env.example`.

## Status

Phase 1 (this phase): monorepo, runtime, and app/package scaffolding only —
no RFP business logic in `apps/web` / `apps/api` / `apps/worker` / `apps/mcp`
yet. See `backend_implementation_phase.md` and `backend_prompt.md` for the
full phased plan.
