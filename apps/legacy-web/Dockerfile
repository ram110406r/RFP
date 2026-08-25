# TanStack Start builds through nitro. The default preset in this repo's shared
# vite config targets Cloudflare; NITRO_PRESET pins it to a plain Node server so
# the build produces .output/server/index.mjs, which we can run in a container.
#
# Built from the monorepo root as context (see docker-compose.prod.yml).
FROM oven/bun:1.3.13-slim AS build

WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile

# No VITE_API_URL is baked in on purpose: the browser bundle falls back to the
# page's own origin (see src/lib/api-base.ts), so one image works on any
# hostname. The SSR server gets API_INTERNAL_URL at runtime instead.
ENV NITRO_PRESET=node-server
WORKDIR /repo/apps/legacy-web
RUN bun run build

# The built output is self-contained, so the runtime stage needs only Node —
# no bun, no node_modules, no source.
FROM node:22-alpine AS runtime

WORKDIR /app
COPY --from=build /repo/apps/legacy-web/.output ./.output

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

USER node

CMD ["node", "./.output/server/index.mjs"]
