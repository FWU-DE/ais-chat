ARG CI=true

FROM node:24.22.3-trixie-slim@sha256:af02d57b57719b9657a45199a79264a9437940cd55b3c7b3fc99615654f124a0 AS base
ENV TURBO_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

FROM base AS builder-base
ENV PNPM_STORE_DIR=/pnpm/store

FROM builder-base AS pruner
WORKDIR /app
COPY . .
RUN corepack enable && corepack prepare
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --filter . --frozen-lockfile --dev --prefer-offline
ARG CI
# A stale `out/` from a local prune would be merged into the new one.
RUN rm -rf out && CI=${CI} pnpm turbo prune @ais-chat/bifrost-sync-service --docker

FROM builder-base AS builder
WORKDIR /app
COPY --from=pruner /app/out/pnpm-lock.yaml .
COPY --from=pruner /app/out/pnpm-workspace.yaml .
COPY --from=pruner /app/out/json/ .
RUN corepack enable && corepack prepare
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline
COPY --from=pruner /app/out/full/ .

# tsup bundles the workspace packages (@ais-chat/*, TypeScript sources) into dist/index.js.
RUN pnpm --filter @ais-chat/bifrost-sync-service build

# Production dependencies only. Bundled workspace packages are dev dependencies of the service.
RUN rm -rf node_modules services/bifrost-sync/node_modules
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --prefer-offline --filter @ais-chat/bifrost-sync-service...

# Distroless runtime image: no shell, package manager or busybox
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:6abfcb367ebc291572c774c1592a986be2ab26a2486f73093401327495a5962a AS runner

# distroless has no node on PATH; keeps `node` resolvable for exec hooks
ENV PATH=/nodejs/bin:$PATH

WORKDIR /app/services/bifrost-sync

COPY --from=builder --chown=nonroot:nonroot /app/services/bifrost-sync/dist dist
COPY --from=builder --chown=nonroot:nonroot /app/services/bifrost-sync/package.json package.json
COPY --from=builder --chown=nonroot:nonroot /app/services/bifrost-sync/node_modules node_modules
COPY --from=builder --chown=nonroot:nonroot /app/node_modules /app/node_modules

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080

EXPOSE 8080
HEALTHCHECK --timeout=10s --start-period=5s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["dist/index.js"]
