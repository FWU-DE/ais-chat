# Container images

Runtime images (`api`, `admin`, `chat-bot`, `mock-llm`) ship without shell, package manager or busybox, and
can be pulled anonymously (no Docker account).

## Options

<!-- prettier-ignore -->
| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Distroless (`gcr.io/distroless/nodejs24-debian13:nonroot`) | No shell/package manager/busybox, anonymous pulls, versioned tags, OS libs visible to Trivy/Dependabot, cosign-signed | glibc, so build stages must be Debian too | Chosen |
| Docker Hardened Images | Minimal, maintained | Needs a Docker account for CI, Dependabot and local pulls | Rejected |
| Chainguard free tier | Minimal | Only `latest`, Node 24 can't be pinned | Rejected |
| Alpine `node` on `scratch` | Smallest | Own copy list for binaries and libs, OS libs invisible to scanners/Dependabot | Rejected |
| Plain Alpine | Small, familiar | busybox, `sh` and `apk` stay in the image | Rejected |

Measured base image sizes: Alpine 172 MB, distroless 155 MB, `scratch` 139 MB.

## Rules

- Pin the runner by digest (`:nonroot@sha256:…`); Dependabot's `docker` entry bumps it. Re-resolve with
  `docker buildx imagetools inspect <image>:nonroot`.
- Distroless has no `node` on `PATH`: set `ENV PATH=/nodejs/bin:$PATH` in every runner. This keeps `node` resolvable for
  exec hooks like `preStop`. The base entrypoint is `node`, so `CMD` holds only its arguments (`CMD ["server.js"]`).
- The `:nonroot` tag runs as `65532`; use `COPY --chown=nonroot:nonroot`, no `addgroup`/`adduser`/`USER`.
- Build stages use `node:<.nvmrc version>-trixie-slim` (glibc), so native modules such as `sharp` match the runtime.
  The tag must equal `.nvmrc` (`checks.yml` enforces it).
- Re-declare runtime `ENV`s (e.g. `NODE_ENV=production`) in the runner, it doesn't inherit from the build stage.
- Healthchecks use `node -e fetch(…)` in exec form, there is no `wget`/`curl`.
- `docker.yml` verifies the base image signature with cosign before building.

## Exception

`services/calculator` stays on Alpine: it needs `qalc` (47 shared libs on Debian).

## Debugging

Distroless images have no shell.

### Local Docker Compose

- Node one-offs: `docker compose -f devops/docker/docker-compose.yml exec ais-chat-app node -e "<js>"`.
- Shell: sidecar sharing the PID and network namespace, with the same uid as the app:

  ```sh
  docker run --rm -it --pid=container:<container> --network=container:<container> --user 65532:65532 \
    --entrypoint sh gcr.io/distroless/nodejs24-debian13:debug-nonroot
  ```

  Inside: `ps`, app files under `/proc/1/root/app`, `wget -qO- http://127.0.0.1:$PORT/...`.

- Copy files out: `docker cp <container>:/app/<path> .`.

### Kubernetes

- `kubectl exec <pod> -- node -e "<js>"`.
- Shell: `kubectl debug -it <pod> --target=<container> --image=gcr.io/distroless/nodejs24-debian13:debug-nonroot -- sh`.
