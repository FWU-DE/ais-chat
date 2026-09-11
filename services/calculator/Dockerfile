FROM node:24.21.0-alpine AS service-builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /app

# The calculator is part of the root workspace, so install from the root lockfile
# and let pnpm deploy a self-contained production dependency tree below.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/calculator/package.json services/calculator/tsconfig.json services/calculator/tsconfig.build.json ./services/calculator/
COPY services/calculator/src ./services/calculator/src
COPY packages/typescript-config/package.json packages/typescript-config/base.json ./packages/typescript-config/
RUN corepack enable && corepack prepare \
  && pnpm install --filter @ais-chat/calculator-service... --frozen-lockfile --prefer-offline \
  && pnpm --filter @ais-chat/calculator-service build \
  && pnpm deploy --legacy --filter @ais-chat/calculator-service --prod /prod \
  && cp -r services/calculator/dist /prod/dist

FROM node:24.21.0-alpine AS runtime

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    QALCULATE_DATA_DIR=/usr/share/qalculate

RUN apk add --no-cache qalc \
    && addgroup --system --gid 10001 qalc \
    && adduser --system --uid 10001 --ingroup qalc --home /nonexistent --no-create-home qalc

WORKDIR /service
COPY --from=service-builder --chown=qalc:qalc /prod/dist ./dist
COPY --from=service-builder --chown=qalc:qalc /prod/node_modules ./node_modules

USER qalc:qalc
EXPOSE 8080
ENTRYPOINT ["node", "dist/index.js"]
