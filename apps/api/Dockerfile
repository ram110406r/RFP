# Production image for the Nest API and database one-shot jobs.
#
# The API depends on workspace packages from the monorepo. Build from the repo
# root, then copy only runtime dependencies, workspace packages, and API output
# into the final image.
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

COPY --from=build /repo/package.json /repo/package.json
COPY --from=build /repo/bun.lock /repo/bun.lock
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/packages /repo/packages
COPY --from=build /repo/apps/api/node_modules /repo/apps/api/node_modules
COPY --from=build /repo/apps/api/package.json /repo/apps/api/package.json
COPY --from=build /repo/apps/api/dist /repo/apps/api/dist

WORKDIR /repo/apps/api
EXPOSE 4000

USER bun

CMD ["bun", "dist/main.js"]
