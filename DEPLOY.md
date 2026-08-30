# Deploying the legacy production stack

This deploys `apps/legacy-web` and `apps/legacy-api` together with Postgres.
The web service is the public entrypoint. It proxies `/api` requests to the API
service over the internal Docker network, so no separate reverse proxy service
is needed.

## Read this first

This stack is still the legacy demo flow:

- The frontend auto-logs in with a seeded user.
- The API is not a full multi-user auth system yet.
- Do not use real customer data in this deployment.

That said, the deployment is now self-contained: the web service is public, the
API stays private, and the browser talks to the API through the web server.

## What runs

| Service | Purpose | Exposed |
|---|---|---|
| `web` | TanStack Start SSR frontend and `/api` proxy | public |
| `api` | Elysia REST API | internal only |
| `postgres` | pgvector database | internal only |
| `migrate` | one-shot, applies migrations then exits | - |
| `seed` | one-shot, seeds demo data then exits | - |

No Redis, OpenSearch, or object storage: the legacy API does not use them.

## Compose files

Use `docker-compose.prod.yml` for a plain Docker host.

Use `docker-compose.dokploy.yml` for Dokploy. In that variant, point the domain
at the `web` service on port `3000`.

## Prerequisites

- Docker Engine and the Compose plugin.
- A server or platform where port `3000` is reachable, or an ingress pointing
  at the `web` service.
- A database password and a public URL for the web app.

## Configure environment

Copy the example file:

```bash
cp .env.production.example .env.production
```

Then fill in the values:

```ini
PUBLIC_URL=http://localhost:3000
POSTGRES_USER=rfpos
POSTGRES_PASSWORD=<strong secret>
POSTGRES_DB=rfpos
```

`PUBLIC_URL` must match the URL users will actually open. For a raw Docker
host, use `http://localhost:3000` or `http://server-ip:3000`. For an ingress or
load balancer, use the public domain.

## Deploying with Dokploy

1. Create a Compose application in Dokploy and point it at
   `docker-compose.dokploy.yml`.
2. Set the environment variables from `.env.production`.
3. Add one domain and target the `web` service on port `3000`.
4. Deploy.
5. Seed the demo data once:

```bash
docker compose -f docker-compose.dokploy.yml run --rm -w /repo/packages/db migrate \
  bun run src/seed/index.ts
```

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

Set `PUBLIC_URL=http://localhost:3000` in `.env.production`, then run:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Browse to `http://localhost:3000`.

## Before this becomes a real public launch

1. Replace the dev auth boundary with Better Auth in `apps/api`.
2. Remove the `dev-login` flow and the frontend auto-login.
3. Finish the `apps/web` + `apps/api` migration and deploy that instead.
4. Add rate limiting, off-box backups, and error monitoring.
