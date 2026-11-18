FROM node:24.22.2-alpine
WORKDIR /app
COPY server.mjs .
EXPOSE 6556
HEALTHCHECK --interval=1s --timeout=2s --retries=3 --start-period=1s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:6556/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "server.mjs"]
