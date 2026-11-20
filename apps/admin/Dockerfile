# This Dockerfile uses a multi-stage build to create a minimal production image.
# https://docs.docker.com/build/building/multi-stage/

# Global build args must be declared before the first FROM to be explicit about
# accepted inputs. They still need to be re-declared in each stage that uses them.
ARG APP_VERSION
ARG CI=true

# Debian (glibc) build image, matching the distroless runtime
FROM node:24.22.3-trixie-slim@sha256:af02d57b57719b9657a45199a79264a9437940cd55b3c7b3fc99615654f124a0 AS base

ENV NEXT_TELEMETRY_DISABLED=1
ENV TURBO_TELEMETRY_DISABLED=1

FROM base AS builder-base
ENV PNPM_STORE_DIR=/pnpm/store

# Prune projects
FROM builder-base AS pruner
WORKDIR /app

COPY . .

# setup pnpm and pnpm install in order to install turbo in the correct version
RUN corepack enable && corepack prepare
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --filter . --frozen-lockfile --dev --prefer-offline

ARG CI
RUN CI=${CI} \
    pnpm turbo prune ais-chat-admin --docker

# Build the project
FROM builder-base AS builder
WORKDIR /app

# Git is required for sentry
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy lockfile and package.json's of isolated subworkspace
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /app/out/json/ .

# First install the dependencies (as they change less often)
RUN corepack enable && corepack prepare
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prefer-offline

# Copy source code of isolated subworkspace
COPY --from=pruner /app/out/full/ .

# Copy git history, required for sentry to determine release name
COPY .git ./.git

ARG CI
ARG APP_VERSION

RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN \
    --mount=type=secret,id=SENTRY_ORG,env=SENTRY_ORG \
    --mount=type=secret,id=SENTRY_PROJECT,env=SENTRY_PROJECT \
    --mount=type=secret,id=SENTRY_URL,env=SENTRY_URL \
    --mount=type=secret,id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
    CI=${CI} \
    APP_VERSION=${APP_VERSION} \
    pnpm turbo build:envless

# Final image: distroless, no shell, package manager or busybox
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:6abfcb367ebc291572c774c1592a986be2ab26a2486f73093401327495a5962a AS runner

# distroless has no node on PATH; keeps `node` resolvable for exec hooks like preStop
ENV PATH=/nodejs/bin:$PATH

WORKDIR /app

# copy nextjs application 
COPY --from=builder --chown=nonroot:nonroot /app/apps/admin/.next/standalone ./
COPY --from=builder --chown=nonroot:nonroot /app/apps/admin/.next/static ./apps/admin/.next/static
# `public` folder is not needed, as admin app does not have any static assets
# COPY --from=builder --chown=nonroot:nonroot /app/apps/admin/public ./apps/admin/public

ARG APP_VERSION
ARG PORT=3000

ENV APP_VERSION=${APP_VERSION}
ENV PORT=${PORT}
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

EXPOSE ${PORT}

HEALTHCHECK --timeout=10s --start-period=5s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/api/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

# https://nextjs.org/docs/pages/api-reference/config/next-config-js/output
CMD ["./apps/admin/server.js"]
