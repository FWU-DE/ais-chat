FROM node:24.19.0-alpine

RUN addgroup --system --gid 10001 mock-llm \
  && adduser --system --uid 10001 --ingroup mock-llm --home /nonexistent --no-create-home mock-llm

WORKDIR /app
COPY --chown=mock-llm:mock-llm services/mock-llm/server.mjs .
USER mock-llm:mock-llm
EXPOSE 6556
HEALTHCHECK --interval=1s --timeout=2s --retries=3 --start-period=1s \
  CMD wget -qO- http://127.0.0.1:6556/health || exit 1
CMD ["node", "server.mjs"]
