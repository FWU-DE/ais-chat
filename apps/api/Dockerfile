# Global build args must be declared before the first FROM to be explicit about
# accepted inputs. They still need to be re-declared in each stage that uses them.
ARG APP_VERSION
ARG CI=true

FROM node:24.20.0-alpine AS base
ENV TURBO_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

FROM base AS builder-base

# Use a fixed pnpm store dir and mount a docker cache there to speed up installs across builds
ENV PNPM_STORE_DIR=/pnpm/store

FROM builder-base AS pruner

# Set working directory
WORKDIR /app
COPY . .
# setup pnpm and pnpm install in order to install turbo in the correct version
RUN corepack enable && corepack prepare
# Use a hoisted node_modules layout so runtime resolution works with our build output:
# - tsup bundles internal workspace packages (e.g. @ais-chat/*) into the API bundle
# - any third‑party deps imported by those bundled packages (e.g. drizzle-orm) must be resolvable
#   from the API's module resolution paths, i.e. /app/node_modules when running in the container
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --dev --shamefully-hoist --prefer-offline

ARG CI=true
RUN CI=${CI} \
    pnpm turbo prune ais-chat-api --docker

FROM builder-base AS builder
WORKDIR /app

# Git is required for sentry
RUN apk add --no-cache git

# Copy lockfile and package.json's of isolated subworkspace
COPY --from=pruner /app/out/pnpm-lock.yaml .
COPY --from=pruner /app/out/pnpm-workspace.yaml .
COPY --from=pruner /app/out/json/ .

# First install the dependencies (as they change less often)
RUN corepack enable && corepack prepare
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --shamefully-hoist --prefer-offline

# Copy source code of isolated subworkspace
COPY --from=pruner /app/out/full/ .

# Copy git history, required for sentry to determine release name
COPY .git ./.git

ARG CI=true

RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN \
    --mount=type=secret,id=SENTRY_ORG,env=SENTRY_ORG \
    --mount=type=secret,id=SENTRY_PROJECT,env=SENTRY_PROJECT \
    --mount=type=secret,id=SENTRY_URL,env=SENTRY_URL \
    CI=${CI} \
    pnpm build

# Recreate node_modules as production-only
# `pnpm prune --prod` would leave broken symlinks to dev packages in node_modules
RUN rm -rf node_modules
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --shamefully-hoist --prefer-offline

FROM base AS runner

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs
USER nodejs

WORKDIR /app

COPY --from=builder --chown=nodejs:nodejs /app/apps/api/dist apps/api
COPY --from=builder --chown=nodejs:nodejs /app/packages/api-database/migrations packages/api-database/migrations
COPY --from=builder --chown=nodejs:nodejs /app/node_modules node_modules

ARG APP_VERSION
ARG PORT=3000

ENV APP_VERSION=${APP_VERSION}
ENV PORT=${PORT}

EXPOSE ${PORT}

WORKDIR /app/apps/api
HEALTHCHECK --timeout=10s --start-period=5s \
  CMD wget http://127.0.0.1:${PORT}/health -qO-
CMD ["node", "index.cjs"]
