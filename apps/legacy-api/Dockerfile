# The API is Bun + Elysia and imports @rfp-os/db from the workspace, so the
# image is built from the monorepo root as context (see docker-compose.prod.yml).
# Bun executes TypeScript directly — there is no compile step to stage.
FROM oven/bun:1.3.14-slim

WORKDIR /repo

# Install with the full workspace present: apps/* and packages/* are globbed by
# the root package.json's "workspaces", so a partial copy would resolve the
# workspace graph incorrectly.
COPY . .
RUN bun install --frozen-lockfile

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# Run as the unprivileged user the base image already provides.
USER bun

WORKDIR /repo/apps/legacy-api
CMD ["bun", "run", "src/index.ts"]
