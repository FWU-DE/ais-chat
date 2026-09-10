FROM node:24.20.0-alpine
WORKDIR /app
COPY server.mjs .
EXPOSE 6556
HEALTHCHECK --interval=1s --timeout=2s --retries=3 --start-period=1s \
  CMD wget -qO- http://127.0.0.1:6556/health || exit 1
CMD ["node", "server.mjs"]
