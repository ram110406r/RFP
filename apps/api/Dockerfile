# Production image for the updated Nest API.
#
# The API depends on workspace packages from the monorepo, so the image is
# built from the repository root. Bun installs the workspace graph, Nest builds
# the API into dist/, and the runtime image keeps the copied workspace source so
# Bun can still resolve `@rfp-os/*` packages at runtime.
FROM oven/bun:1.3.13-slim AS build

WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile

WORKDIR /repo/apps/api
RUN bun run build

FROM oven/bun:1.3.13-slim AS runtime

WORKDIR /repo
ENV NODE_ENV=production
ENV API_PORT=4000

COPY --from=build /repo /repo

WORKDIR /repo/apps/api
EXPOSE 4000

USER bun

CMD ["bun", "dist/main.js"]
