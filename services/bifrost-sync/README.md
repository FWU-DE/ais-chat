# bifrost-sync

Applies the desired provider config to Bifrost through one pod, then restarts all Bifrost pods with a rolling update of the Deployment. Bifrost reads its config only at start, and a sync on a stale pod deletes keys.

## Run

1. Lock: `phase=syncing` in the ConfigMap, `resourceVersion` is the lock. `409` if a run is active or not all pods are Ready.
2. Sync on the first Ready pod through its IP: providers, keys, stale providers, virtual key access.
3. Read back from the same pod and compare with the desired state. Any difference is a sync error (`step: verify`).
4. On an error: roll back to `baseline` on the same pod, then read back again.
5. Always roll out, also after a rollback and after a failed rollback: set `kubectl.kubernetes.io/restartedAt` in the pod template and wait until `kubectl rollout status` would finish (`observedGeneration`, `updatedReplicas`, `replicas`, `availableReplicas`). Timeout: 10 minutes.
6. Check `GET /api/providers` on every pod. A 500 ends the run `failed`.

`ok`: all steps worked. `rolled_back`: the sync failed, the rollback worked. `failed`: the rollback failed, the rollout hung or a pod answered 500. `lastSyncedHash` changes only on `ok`.

After a crash, `recover()` runs before the port opens. `restarting` waits for the running rollout and patches only if `restartedAt` is not set yet. `syncing` and `rolling_back` end `failed` and restart all pods. If `recover()` fails, the process exits.

## API

All calls except `/healthz` need `Authorization: Bearer <BIFROST_SYNC_TOKEN>`. Request bodies contain provider keys in clear text and are never logged.

| Call             | Purpose                                                                                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/syncs` | `{ contentHash, providers, baseline: { contentHash, providers } }`. `202 { runId }`, `409` while a run is active or pods are not Ready, `422` for an invalid body or empty `providers`. |
| `GET /v1/status` | `phase`, `run`, `lastRun`, `lastSyncedHash`.                                                                                                                                            |
| `GET /healthz`   | No token. Probe only.                                                                                                                                                                   |
| `GET /metrics`   | `bifrost_sync_phase{phase}` and `bifrost_sync_last_success_timestamp_seconds`, both from the persisted state.                                                                           |

## What the read back catches

It compares what the sync sets: provider name, `network_config` (if given), `custom_provider_config`, key name, `models`, `weight`, `enabled`, virtual key access. It ignores fields that Bifrost sets itself. Key values are not compared, Bifrost returns them masked.

It catches a write that Bifrost accepted but stored differently. It does **not** catch wrong provider credentials, wrong model names at the provider, an unreachable provider, or a wrong `BIFROST_ENCRYPTION_KEY`: the pod that wrote runs with the right key in memory, only restarted pods load with the wrong one.

## Known consequences

- **A pod without a working encryption key stays Ready.** `/health` answers 200 while `GET /api/providers` answers 500. The rolling update then replaces both pods, and Bifrost is down (measured in kind: 64 s). The probe that would have stopped this was left out on purpose (gitops PR "Enable Bifrost encryption key on stage"). Every Deployment has the same risk, it does not come from this service. The service only reports it afterwards: `result=failed`, log on error level. It cannot prevent it.
- **After a failed rollback all pods load a possibly half-written DB state.** No pod is bound to a writer: a sync on a stale pod would delete keys. The run ends `failed`, the log has the provider and step (no keys), and an alert on `phase=failed` has to reach a person.
- **Every sync restarts all pods, also after a rollback.** Requests that run longer than 60 s after the restart begins are cut without an HTTP error (grace period 60 s, `preStop` 15 s).
- **A rollback cannot remove a `custom_provider_config`.** Bifrost answers 400 `cannot be removed after creation`. The read back reports it as a rollback error.
- **`network_config` in a rollback.** A `PUT` without it resets timeouts and retries to 0. The sync keeps the current value when the config omits it. This is correct as long as one provider id never comes with and without `network_config`, which a test in `packages/api-database` checks.

## Configuration

| Variable                                           | Default                               | Meaning                             |
| -------------------------------------------------- | ------------------------------------- | ----------------------------------- |
| `BIFROST_SYNC_TOKEN`                               | required, min. 16 chars               | Bearer token.                       |
| `BIFROST_ADMIN_USERNAME`, `BIFROST_ADMIN_PASSWORD` | required                              | Bifrost admin access.               |
| `DEPLOYMENT_NAME`                                  | required                              | Bifrost Deployment to restart.      |
| `POD_SELECTOR`                                     | required                              | Label selector of the Bifrost pods. |
| `POD_PORT`                                         | `8080`                                | Bifrost port on the pod IP.         |
| `NAMESPACE`, `STATE_CONFIGMAP`                     | service account, `bifrost-sync-state` | Namespace and state ConfigMap.      |
| `ROLLOUT_TIMEOUT_MS`, `POLL_MS`                    | `600000`, `2000`                      | Rollout wait.                       |
| `PORT`, `HOST`, `LOG_LEVEL`                        | `8080`, `0.0.0.0`, `info`             |                                     |

The number of pods comes from the Deployment (`spec.replicas`), not from the configuration.

Use `POD_PORT`, not `BIFROST_PORT`: a Kubernetes service named `bifrost` injects `BIFROST_PORT=tcp://…` into every pod in the namespace. Set `enableServiceLinks: false` in the Deployment.

## Kubernetes

Role in the namespace of the Bifrost Deployment:

| Resource      | Verbs       | Restriction                              |
| ------------- | ----------- | ---------------------------------------- |
| `pods`        | get, list   |                                          |
| `deployments` | get, patch  | the Bifrost Deployment (`resourceNames`) |
| `configmaps`  | get, update | the state ConfigMap (`resourceNames`)    |

No `pods/eviction`, no PodDisruptionBudget needed. `deployments patch` allows changing the whole pod template, not only the annotation, and RBAC cannot narrow it to a field. Argo CD with `selfHeal` reverts such changes.

The Bifrost chart renders `maxSurge: 25%`, `maxUnavailable: 25%`. With two replicas Kubernetes rounds this to 1 and 0, so at least two pods stay Ready (measured). More replicas are not measured.

## Local

There is no local setup. Without `BIFROST_SYNC_URL`, telli-admin writes to Bifrost directly, without restart. This is the path for Compose and single-server installations with one Bifrost instance.

Running several Bifrost instances outside Kubernetes (for example Compose with `replicas: 2`) is not supported. The service restarts pods through the Kubernetes API only, and without it the instances diverge after a config change.
