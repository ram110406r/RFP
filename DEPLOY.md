# Deploying the production stack

This deploys `apps/web` and `apps/api` together with Postgres, Redis, and
MinIO. The web service is the public entrypoint. It proxies `/api/v1`
requests to the API service over the internal Docker network, so no separate
reverse proxy service is needed.

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

## Compose files

Use `docker-compose.prod.yml` for a plain Docker host.

Use `docker-compose.dokploy.yml` for Dokploy. In that variant, point the
domain at the `web` service on port `3000`.

## Prerequisites

- Docker Engine and the Compose plugin.
- A server or platform where port `3000` is reachable, or an ingress pointing
  at the `web` service.
- A database password, a Better Auth secret, and storage credentials.

## Configure environment

Copy the example file:

```bash
cp .env.production.example .env.production
```

Then fill in the values:

```ini
PUBLIC_URL=http://localhost:3000
API_INTERNAL_URL=http://api:4000
POSTGRES_USER=rfpos
POSTGRES_PASSWORD=<strong secret>
POSTGRES_DB=rfpos
BETTER_AUTH_SECRET=<strong secret>
STORAGE_ACCESS_KEY_ID=<strong storage key>
STORAGE_SECRET_ACCESS_KEY=<strong storage secret>

# Firebase public config used by apps/web
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=tendyy.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=tendyy
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=tendyy.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=980605439539
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
NEXT_PUBLIC_FIREBASE_USE_EMULATORS=false
```

`PUBLIC_URL` must match the URL users will actually open. For a raw Docker
host, use `http://localhost:3000` or `http://server-ip:3000`. For an ingress or
load balancer, use the public domain.

`API_INTERNAL_URL` is the address the Next.js server uses to reach the API
container. In Dokploy and the bundled Docker compose files, leave it as
`http://api:4000`.

`BETTER_AUTH_SECRET` signs the session cookies. The compose files now fall back
to a 32+ character local-safe default if Dokploy does not provide one, but you
should still set a real secret in production as soon as the deploy is stable.

`STORAGE_ACCESS_KEY_ID` and `STORAGE_SECRET_ACCESS_KEY` are the credentials the
API uses to talk to MinIO. In the bundled compose files, the same pair also
boots the MinIO container. If Dokploy does not have these set yet, the compose
files fall back to local-safe defaults so the deploy can start, but you should
override them with real secrets in production.

## Deploying with Dokploy

1. Create a Compose application in Dokploy and point it at
   `docker-compose.dokploy.yml`.
2. Set the environment variables from `.env.production`.
3. Add one domain and target the `web` service on port `3000`.
4. Deploy.

## Deploying with plain Docker

1. Get the code onto the server.

```bash
git clone <your-repo-url> rfp-os && cd rfp-os
```

2. Create the environment file as shown above.

3. Bring it up:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

4. Seed the demo data:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  run --rm -w /repo/packages/db migrate bun run src/seed/index.ts
```

5. Open the public web URL.

## Operations

```bash
# Logs
docker compose -f docker-compose.prod.yml logs -f web api

# Deploy an update
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# Back up the database
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U rfpos rfpos | gzip > backup-$(date +%F).sql.gz
```

## Testing locally without a domain

Set `PUBLIC_URL=http://localhost:3000` and `API_INTERNAL_URL=http://api:4000`
in `.env.production`, then run:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Browse to `http://localhost:3000`.
