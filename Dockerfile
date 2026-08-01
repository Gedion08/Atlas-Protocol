FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

ARG PNPM_FLAGS=--network-concurrency\ 3\ --fetch-retries\ 10\ --fetch-timeout\ 120000

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/frontend/package.json apps/frontend/package.json
COPY apps/backend/package.json apps/backend/package.json
COPY packages/types/package.json packages/types/package.json
RUN pnpm install --frozen-lockfile $PNPM_FLAGS --filter atlas-frontend --filter atlas-backend --filter atlas-types

FROM deps AS types-builder
COPY packages/types packages/types
RUN pnpm --filter atlas-types build

FROM types-builder AS frontend-builder
ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ARG NEXT_PUBLIC_RPC_URL=https://api.mainnet-beta.solana.com
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_RPC_URL=$NEXT_PUBLIC_RPC_URL
COPY apps/frontend apps/frontend
RUN pnpm --filter atlas-frontend build

FROM deps AS frontend
ENV NODE_ENV=production
WORKDIR /app
COPY --from=frontend-builder /app/apps/frontend/.next/standalone ./
COPY --from=frontend-builder /app/apps/frontend/.next/static ./apps/frontend/.next/static
COPY --from=frontend-builder /app/apps/frontend/public ./apps/frontend/public
EXPOSE 3000
USER node
CMD ["node", "apps/frontend/server.js"]

FROM types-builder AS backend
ENV NODE_ENV=production
WORKDIR /app
COPY apps/backend apps/backend
RUN pnpm --filter atlas-backend build
RUN pnpm install --prod --frozen-lockfile $PNPM_FLAGS --filter atlas-backend --ignore-scripts
EXPOSE 8080
USER node
CMD ["node", "apps/backend/dist/index.js"]
