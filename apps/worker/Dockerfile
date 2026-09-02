FROM oven/bun:1.3.13-slim

WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile

WORKDIR /repo/apps/worker
ENV NODE_ENV=production

CMD ["bun", "src/index.ts"]
