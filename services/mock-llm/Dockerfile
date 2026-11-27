FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:675c532423b908f9e56f9d60a4e62309b63cd2a3175acb90a46b96f7ee68e121
# distroless has no node on PATH; keeps `node` resolvable for exec hooks like preStop
ENV PATH=/nodejs/bin:$PATH
WORKDIR /app
COPY server.mjs .
EXPOSE 6556
HEALTHCHECK --interval=1s --timeout=2s --retries=3 --start-period=1s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:6556/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["server.mjs"]
