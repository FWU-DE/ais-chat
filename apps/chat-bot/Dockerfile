# This Dockerfile uses a multi-stage build to create a minimal production image.
# https://docs.docker.com/build/building/multi-stage/

# Global build args must be declared before the first FROM to be explicit about
# accepted inputs. They still need to be re-declared in each stage that uses them.
ARG APP_VERSION
ARG CI=true

# Alpine image
FROM node:24.20.0-alpine AS base

ENV NEXT_TELEMETRY_DISABLED=1
ENV TURBO_TELEMETRY_DISABLED=1

# Prune projects
FROM base AS pruner
WORKDIR /app

COPY . .

# setup pnpm and pnpm install in order to install turbo in the correct version
RUN corepack enable && corepack prepare
RUN pnpm install --frozen-lockfile --dev

ARG CI=true
RUN CI=${CI} \
    pnpm turbo prune ais-chat-app --docker

# Build the project
FROM base AS builder
WORKDIR /app

# Git is required for sentry
RUN apk add --no-cache git

# Copy lockfile and package.json's of isolated subworkspace
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /app/out/json/ .

# First install the dependencies (as they change less often)
RUN corepack enable && corepack prepare
RUN pnpm install --frozen-lockfile

# Copy source code of isolated subworkspace
COPY --from=pruner /app/out/full/ .

# Copy git history, required for sentry to determine release name
COPY .git ./.git

ARG CI=true
ARG APP_VERSION

RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN \
    --mount=type=secret,id=SENTRY_ORG,env=SENTRY_ORG \
    --mount=type=secret,id=SENTRY_PROJECT,env=SENTRY_PROJECT \
    --mount=type=secret,id=SENTRY_URL,env=SENTRY_URL \
    --mount=type=secret,id=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY,env=NEXT_SERVER_ACTIONS_ENCRYPTION_KEY \
    CI=${CI} \
    APP_VERSION=${APP_VERSION} \
    pnpm turbo build:envless

# Final image
FROM base AS runner

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodejs
USER nodejs

WORKDIR /app

# copy nextjs application
COPY --from=builder --chown=nodejs:nodejs /app/apps/chat-bot/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/apps/chat-bot/.next/static ./apps/chat-bot/.next/static
COPY --from=builder --chown=nodejs:nodejs /app/apps/chat-bot/public ./apps/chat-bot/public

ARG APP_VERSION
ARG PORT=3000

ENV APP_VERSION=${APP_VERSION}
ENV PORT=${PORT}
ENV NODE_ENV=production

EXPOSE ${PORT}

HEALTHCHECK --timeout=10s --start-period=5s \
  CMD wget http://127.0.0.1:${PORT}/api/healthz -qO-

# https://nextjs.org/docs/pages/api-reference/config/next-config-js/output
CMD ["node", "./apps/chat-bot/server.js"]
