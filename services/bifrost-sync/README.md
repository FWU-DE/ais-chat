# bifrost-sync

Applies the desired provider config to Bifrost through one pod, then restarts all Bifrost pods one after another. Bifrost reads its config only at start, and a sync on a stale pod deletes keys.

## API

All calls except `/healthz` need `Authorization: Bearer <BIFROST_SYNC_TOKEN>`. Request bodies contain provider keys in clear text and are never logged.

| Call                   | Purpose                                                                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/syncs`       | `{ contentHash, providers, baseline: { contentHash, providers } }`. `202 { runId }`, `409` while a run is active or pods are not Ready, `422` for an invalid body or empty `providers`. |
| `GET /v1/status`       | `phase`, `run`, `lastRun` (`ok`, `rolled_back`, `failed`), `lastSyncedHash`, `writerUnavailable`.                                                                                       |
| `POST /v1/resume`      | Continues a rollout that ended `failed`.                                                                                                                                                |
| `POST /v1/restart-all` | Restarts all pods and clears the writer binding. Use it when `writerUnavailable` is set.                                                                                                |
| `GET /healthz`         | No token. Probe only.                                                                                                                                                                   |
| `GET /metrics`         | Phase, run duration, last success, run counters.                                                                                                                                        |

On a sync error the service rolls back to `baseline` on the same pod, without restart. If the rollback fails, it evicts that pod and retries once on the replacement. After a rollback that recreated keys, or after `failed`, the next run must use that pod (`409` and `writerUnavailable` if it is gone).

## Configuration

| Variable                                                     | Default                                          | Meaning                                                                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BIFROST_SYNC_TOKEN`                                         | required, min. 16 chars                          | Bearer token.                                                                                                                                         |
| `BIFROST_ADMIN_USERNAME`, `BIFROST_ADMIN_PASSWORD`           | required                                         | Bifrost admin access.                                                                                                                                 |
| `POD_SELECTOR`                                               | required                                         | Kubernetes label selector, or comma-separated Docker labels.                                                                                          |
| `EXPECTED_REPLICAS`                                          | required                                         | Number of Bifrost pods. See below.                                                                                                                    |
| `POD_PORT`                                                   | `8080`                                           | Bifrost port on the pod IP.                                                                                                                           |
| `RESTARTER`                                                  | `kubernetes`                                     | `kubernetes` (Eviction API) or `docker` (local Compose only).                                                                                         |
| `NAMESPACE`, `STATE_CONFIGMAP`                               | service account, `bifrost-sync-state`            | Kubernetes state. The ConfigMap's `resourceVersion` is the lock.                                                                                      |
| `STATE_FILE`, `DOCKER_SOCKET`, `DOCKER_STOP_TIMEOUT_SECONDS` | `/data/state.json`, `/var/run/docker.sock`, `60` | Docker restarter.                                                                                                                                     |
| `VERIFY_PROVIDERS`                                           | `fail`                                           | `off`, `warn`, `fail`. Calls `GET /api/providers` on each new pod before the next eviction. A pod without encryption key stays Ready but answers 500. |
| `ROLLOUT_TIMEOUT_MS`, `EVICT_BACKOFF_MS`, `POLL_MS`          | `360000`, `2000`, `1000`                         | Rollout timing.                                                                                                                                       |
| `PORT`, `HOST`, `LOG_LEVEL`                                  | `8080`, `0.0.0.0`, `info`                        |                                                                                                                                                       |

`EXPECTED_REPLICAS` replaces a lookup of the Deployment, so the service needs no `deployments get` permission. **Change it together with `replicaCount` of the Bifrost chart.** A mismatch makes every sync fail with `409`.

Use `POD_PORT`, not `BIFROST_PORT`: a Kubernetes service named `bifrost` injects `BIFROST_PORT=tcp://…` into every pod in the namespace. Set `enableServiceLinks: false` in the Deployment.

## Kubernetes requirements

- Role: `pods` get/list/watch, `pods/eviction` create, `configmaps` get/update on `bifrost-sync-state` only.
- PodDisruptionBudget on the Bifrost pods with `maxUnavailable: 1`. With `minAvailable: 1` and three pods, two evictions run at once.
- Bifrost grace period 60 s: requests running longer than 60 s after the eviction are cut without an HTTP error.

## Local

`docker compose -f devops/docker/docker-compose.local.yml up -d bifrost bifrost-sync` starts the service with the `docker` restarter on `127.0.0.1:8082`. This is the only place that mounts the Docker socket.
