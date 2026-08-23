# Deploying the private demo

This deploys **`apps/legacy-web` + `apps/legacy-api`** — the prototype stack,
which is the only part of the repo with a working UI. `apps/web` is still a
placeholder page and `apps/api` has no frontend, so neither can be demoed yet.

## Read this first

**The application has no authentication.** `apps/legacy-api/src/lib/auth.ts`
uses the user's database id as the bearer token, and the frontend auto-logs-in
as a fixed seeded user. Anyone who reaches the app is signed in as that user.

The only thing making this deployment safe is the **password gate in Caddy**.
So:

- Never publish the `api` or `web` container ports on the host. Only Caddy is
  exposed. `docker-compose.prod.yml` is already set up this way — keep it that way.
- Never put real customer data in this database. The demo dataset is seeded.
- Everyone who logs in shares one identity. This is a demo, not multi-user.

This is a temporary arrangement until Better Auth lands in `apps/api`.

## What runs

| Service | Purpose | Exposed |
|---|---|---|
| `caddy` | TLS + password gate + reverse proxy | **80, 443** |
| `web` | TanStack Start SSR frontend | internal only |
| `api` | Elysia REST API | internal only |
| `postgres` | pgvector database | internal only |
| `migrate` | one-shot, applies migrations then exits | — |

No Redis, OpenSearch, or object storage: the legacy API doesn't use them.

There are two compose files. Use **`docker-compose.dokploy.yml`** if you are
deploying through Dokploy, and `docker-compose.prod.yml` for a plain Docker
host where Caddy also handles TLS.

## Prerequisites

- A Linux server with Docker Engine and the Compose plugin (or a Dokploy
  instance already installed on one).
- A domain with an **A record already pointing at the server's IP** — this must
  resolve before a TLS certificate can be issued.
- Ports 80 and 443 open.

## Deploying with Dokploy

Use **`docker-compose.dokploy.yml`**, not `docker-compose.prod.yml`. Dokploy's
Traefik already owns ports 80/443, so the standalone file's Caddy would fail to
bind them.

In the Dokploy variant, Caddy stays in the stack but as an *internal* proxy: it
enforces the password gate and the `/api`-vs-`/` split, while Traefik terminates
TLS in front of it. Only Caddy joins `dokploy-network` — postgres, the API, and
the SSR server stay on a private network where the ingress cannot reach them
even by accident.

**1. Create the application**

In Dokploy: **Create Application → Compose**. Point it at your Git repository
and set the compose path to `docker-compose.dokploy.yml`.

**2. Set the environment variables**

In the application's **Environment** tab:

```
PUBLIC_URL=https://demo.example.com
DEMO_USER=demo
DEMO_PASSWORD_HASH=<bcrypt hash, see below>
POSTGRES_USER=rfpos
POSTGRES_PASSWORD=<openssl rand -base64 32>
POSTGRES_DB=rfpos
```

Generate the hash with:

```bash
docker run --rm caddy caddy hash-password --plaintext 'your-strong-password'
```

Double every `$` in the hash (`$2a$14$...` becomes `$$2a$$14$$...`) so compose
does not interpolate it.

Do **not** set `ACME_EMAIL` — Traefik handles certificates here, and an empty
value overrides the Caddyfile default and crashloops the container.

**3. Add the domain**

In the **Domains** tab, add your domain and target the **`caddy`** service on
**port 80**. Dokploy wires up Traefik and the certificate. Do not add domains
for `web` or `api` — routing between them is Caddy's job, and exposing them
directly would bypass the password gate.

**4. Deploy, then seed**

Deploy. Migrations run automatically before the API starts. Then seed once,
from the Dokploy terminal or over SSH:

```bash
docker compose -f docker-compose.dokploy.yml run --rm   -w /repo/packages/db migrate bun run src/seed/index.ts
```

**5. Check it**

Visit your domain. You should get a browser password prompt, then the app.

---

## Steps (standalone Docker, without Dokploy)

These steps use `docker-compose.prod.yml`, which brings its own Caddy for TLS.
Skip this section if you are using Dokploy.

**1. Get the code onto the server**

```bash
git clone <your-repo-url> rfp-os && cd rfp-os
```

**2. Create the environment file**

```bash
cp .env.production.example .env.production
```

Generate the two secrets and put them in `.env.production`:

```bash
# Database password
openssl rand -base64 32

# Password-gate hash. Double any $ characters in the output before pasting,
# so docker compose doesn't interpolate them.
docker run --rm caddy caddy hash-password --plaintext 'your-strong-password'
```

Then set `SITE_ADDRESS`, `PUBLIC_URL`, and `ACME_EMAIL` to your domain and email.

**3. Bring it up**

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Migrations run automatically before the API starts. If a migration fails the
API will not boot — check `docker compose -f docker-compose.prod.yml logs migrate`.

**4. Seed the demo data**

The app expects a seeded organization and user; without this the frontend's
session bootstrap fails on load.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  run --rm -w /repo/packages/db migrate bun run src/seed/index.ts
```

**5. Check it**

Visit `https://your-domain`. The browser prompts for the demo credentials,
then the app loads.

## Operations

```bash
# Logs
docker compose -f docker-compose.prod.yml logs -f api web

# Deploy an update
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# Back up the database
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U rfpos rfpos | gzip > backup-$(date +%F).sql.gz
```

Set up that backup on a cron job before you let anyone put work into the demo —
the database lives in a Docker volume and nothing else is protecting it.

## Testing locally without a domain

Set `SITE_ADDRESS=:80` and `PUBLIC_URL=http://localhost` in `.env.production`,
then browse to `http://localhost`. Caddy skips TLS and the password gate still
applies.

On **Windows with Git Bash**, prefix any compose command that passes a
container path with `MSYS_NO_PATHCONV=1`, or the shell rewrites `/repo/...`
into a Windows path and the command fails:

```bash
MSYS_NO_PATHCONV=1 docker compose -f docker-compose.prod.yml --env-file .env.production   run --rm -w /repo/packages/db migrate bun run src/seed/index.ts
```

This does not apply on the Linux server.

## Before this can become a real public launch

1. Replace the dev auth boundary with Better Auth (already a dependency in
   `apps/api`) — real passwords, sessions, org invites.
2. Remove the `dev-login` endpoint and the frontend's auto-login.
3. Finish the `apps/web` + `apps/api` migration and deploy that instead.
4. Add rate limiting, database backups off-box, and error monitoring.
