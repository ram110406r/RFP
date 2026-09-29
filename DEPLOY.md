# Deploying with Dokploy

Dokploy is the supported production deployment path for this repository. The
web service is the public entrypoint. It proxies `/api/v1` requests to the API
service over the internal Docker network. It also proxies the storage bucket
path to MinIO, so no separate storage domain is needed.

## What runs

| Service | Purpose | Exposed |
|---|---|---|
| `web` | Next.js frontend and `/api/v1` proxy | public |
| `api` | Nest REST API | internal only |
| `postgres` | pgvector database | internal only |
| `redis` | queue backend | internal only |
| `minio` | S3-compatible document storage | internal only |
| `migrate` | one-shot, applies migrations then exits | - |
| `seed` | one-shot, seeds demo data then exits | - |

## Compose profiles

This repository has one canonical Compose file: `docker-compose.yml`.

- `local`: local infrastructure only. Used by `bun infra:up`,
  `bun infra:down`, `bun infra:logs`, and `bun infra:reset`.
- `dokploy-bundled`: app containers plus bundled Postgres, Redis, and MinIO.

Dokploy should point at `docker-compose.yml`. Set
`COMPOSE_PROFILES=dokploy-bundled` in the deployment environment.

## Prerequisites

- Docker Engine and Docker Compose plugin v2.20 or newer.
- A Dokploy application domain targeting the `web` service on port `3000`.
- A database password, a Better Auth secret, storage credentials, Firebase
  public config, and a non-mock AI provider.

## Configure environment

Copy the example file:

```bash
cp .env.production.example .env.production
```

Then fill in the values:

```ini
PUBLIC_URL=https://app.example.com
API_INTERNAL_URL=http://api:4000
BETTER_AUTH_URL=https://app.example.com
BETTER_AUTH_SECRET=<strong secret>

# Bundled Postgres
POSTGRES_USER=rfpos
POSTGRES_PASSWORD=<strong-url-safe-secret>
POSTGRES_DB=rfpos

STORAGE_ACCESS_KEY_ID=<strong storage key>
STORAGE_SECRET_ACCESS_KEY=<strong storage secret>
STORAGE_PUBLIC_ENDPOINT=https://app.example.com

NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=tendyy.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=tendyy
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=tendyy.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=980605439539
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
NEXT_PUBLIC_FIREBASE_USE_EMULATORS=false
```

`PUBLIC_URL` must match the URL users will actually open. `API_INTERNAL_URL`
should stay `http://api:4000` in Docker/Dokploy deployments.

The bundled profile derives `DATABASE_URL` from `POSTGRES_USER`,
`POSTGRES_PASSWORD`, and `POSTGRES_DB`. If the password contains URL-reserved
characters, URL-encode it or set `DATABASE_URL` explicitly.

`STORAGE_BUCKET` is created automatically when the bundled MinIO volume is
initialized. `STORAGE_PUBLIC_ENDPOINT` should usually match `PUBLIC_URL`.
Signed URLs use the bucket as the route, for example
`https://app.example.com/rfp-os-documents/...`; the web service forwards that
route to MinIO over the internal Docker network.

## Deploying

1. Create a Compose application in Dokploy and point it at `docker-compose.yml`.
2. Set `COMPOSE_PROFILES=dokploy-bundled`.
3. Set the environment variables from `.env.production`.
4. Add the application domain and target the `web` service on port `3000`.
5. Deploy.

From a shell:

```bash
COMPOSE_PROFILES=dokploy-bundled docker compose --env-file .env.production up -d --build
```

## Migrating an existing Dokploy database

If production currently uses a separate Dokploy Postgres service, migrate it
before retiring that service.

1. Back up the current database from the existing Dokploy Postgres service:

```bash
pg_dump "$OLD_DATABASE_URL" | gzip > rfp-os-backup-$(date +%F).sql.gz
```

2. Deploy the single Compose stack with bundled Postgres:

```bash
COMPOSE_PROFILES=dokploy-bundled docker compose --env-file .env.production up -d --build postgres
```

3. Restore the dump into the new Compose-managed Postgres service:

```bash
gunzip -c rfp-os-backup-YYYY-MM-DD.sql.gz | \
  COMPOSE_PROFILES=dokploy-bundled docker compose --env-file .env.production exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

4. Start or redeploy the full stack so migrations and seed checks run:

```bash
COMPOSE_PROFILES=dokploy-bundled docker compose --env-file .env.production up -d --build
```

5. Confirm the runtime services are healthy:

```bash
COMPOSE_PROFILES=dokploy-bundled docker compose --env-file .env.production ps web api worker postgres redis minio
```

## Operations

```bash
# Logs
COMPOSE_PROFILES=dokploy-bundled docker compose --env-file .env.production logs -f web api

# Deploy an update
git pull
COMPOSE_PROFILES=dokploy-bundled docker compose --env-file .env.production up -d --build

# Back up a bundled database
COMPOSE_PROFILES=dokploy-bundled docker compose --env-file .env.production exec -T postgres \
  pg_dump -U rfpos rfpos | gzip > backup-$(date +%F).sql.gz
```
