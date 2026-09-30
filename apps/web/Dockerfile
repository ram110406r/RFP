# Next.js production image for the updated dashboard frontend.
#
# The app is built from the monorepo root so workspace packages resolve cleanly.
# The runtime image only needs the standalone Next server output.
FROM oven/bun:1.3.13-slim AS build

WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile

ARG API_INTERNAL_URL
ARG STORAGE_ENDPOINT
ARG STORAGE_BUCKET
ARG NEXT_PUBLIC_APP_COMMIT_SHA
ARG NEXT_PUBLIC_APP_BUILD_TIME

ENV NODE_ENV=production
ENV API_INTERNAL_URL=${API_INTERNAL_URL}
ENV STORAGE_ENDPOINT=${STORAGE_ENDPOINT}
ENV STORAGE_BUCKET=${STORAGE_BUCKET}
ENV NEXT_PUBLIC_APP_COMMIT_SHA=${NEXT_PUBLIC_APP_COMMIT_SHA}
ENV NEXT_PUBLIC_APP_BUILD_TIME=${NEXT_PUBLIC_APP_BUILD_TIME}

WORKDIR /repo/apps/web
RUN bun run build

FROM node:22-alpine AS runtime

WORKDIR /app
ARG NEXT_PUBLIC_APP_COMMIT_SHA
ARG NEXT_PUBLIC_APP_BUILD_TIME
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV API_INTERNAL_URL=http://api:4000
ENV STORAGE_ENDPOINT=http://minio:9000
ENV STORAGE_BUCKET=rfp-os-documents
ENV NEXT_PUBLIC_APP_COMMIT_SHA=${NEXT_PUBLIC_APP_COMMIT_SHA}
ENV NEXT_PUBLIC_APP_BUILD_TIME=${NEXT_PUBLIC_APP_BUILD_TIME}

COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000

USER node

CMD ["node", "apps/web/server.js"]
