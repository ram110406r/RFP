FROM oven/bun:1.3.13-slim AS build

WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile

FROM oven/bun:1.3.13-slim AS runtime

WORKDIR /repo
COPY --from=build /repo/package.json /repo/package.json
COPY --from=build /repo/bun.lock /repo/bun.lock
COPY --from=build /repo/node_modules /repo/node_modules
COPY --from=build /repo/packages /repo/packages
COPY --from=build /repo/apps/worker/node_modules /repo/apps/worker/node_modules
COPY --from=build /repo/apps/worker/package.json /repo/apps/worker/package.json
COPY --from=build /repo/apps/worker/src /repo/apps/worker/src

WORKDIR /repo/apps/worker
ENV NODE_ENV=production

CMD ["bun", "src/index.ts"]
