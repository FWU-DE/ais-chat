FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:6abfcb367ebc291572c774c1592a986be2ab26a2486f73093401327495a5962a
# distroless has no node on PATH; keeps `node` resolvable for exec hooks like preStop
ENV PATH=/nodejs/bin:$PATH
WORKDIR /app
COPY server.mjs .
EXPOSE 6556
HEALTHCHECK --interval=1s --timeout=2s --retries=3 --start-period=1s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:6556/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["server.mjs"]
