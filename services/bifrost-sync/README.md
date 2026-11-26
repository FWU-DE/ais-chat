# bifrost-sync

Applies the desired provider config to Bifrost through one pod, then restarts all Bifrost pods with a rolling update of the Deployment. Bifrost reads its config only at start, and a sync on a stale pod deletes keys.

## Run

1. Lock: `phase=syncing` in the ConfigMap, `resourceVersion` is the lock. `409` if a run is active, the last rollout is not complete (`kubectl rollout status` would still wait), a pod started before the last write, or not all pods are Ready. Ready is not enough: after a rollout that hung, an old pod can be Ready and hold old key IDs, and a sync on it would delete keys.
2. Sync on the first Ready pod through its IP: providers, keys, stale providers, virtual key access.
3. Read back from the same pod and compare with the desired state. Any difference is a sync error (`step: verify`).
4. On an error: roll back to `baseline` on the same pod, then read back again.
5. Always roll out, also after a rollback and after a failed rollback: set `kubectl.kubernetes.io/restartedAt` in the pod template and wait until `kubectl rollout status` would finish (`observedGeneration`, `updatedReplicas`, `replicas`, `availableReplicas`). Timeout: 10 minutes.
6. Check `GET /api/providers` on every pod. A 500 ends the run `failed`.

`ok`: all steps worked. `rolled_back`: the sync failed, the rollback worked. `failed`: the rollback failed, the rollout hung or a pod answered 500. `lastSyncedHash` changes only on `ok`.

After a crash, `recover()` runs before the port opens. `restarting` waits for the running rollout in the background, so the probes of the service pass meanwhile, and patches only if `restartedAt` is not set yet. `syncing` and `rolling_back` end `failed` and restart all pods. If the state cannot be saved, the process exits and the next start runs `recover()` again.

Run the service as a single replica with `strategy: Recreate`. During a rolling update of the service itself, a second process would treat the `syncing` state of the first as a crash and restart Bifrost while the first still writes. The `resourceVersion` of the ConfigMap fences state writes, not the calls to Bifrost.

## API

All calls except `/healthz` need `Authorization: Bearer <BIFROST_SYNC_TOKEN>`. Request bodies contain provider keys in clear text and are never logged.

| Call             | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/syncs` | `{ contentHash, providers, baseline: { contentHash, providers } }`. `202 { runId }`, `409` while a run is active, a rollout is unfinished, a pod is older than the last write or pods are not Ready, `422` for an invalid body (also duplicate provider ids, or key names that differ only in case within a provider) or when `providers` and `baseline.providers` are both empty. An empty `providers` with a non-empty baseline is valid: it removes the last provider. telli-admin should ask for confirmation before it sends one. |
| `GET /v1/status` | `phase`, `run`, `lastRun`, `lastSyncedHash`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `GET /healthz`   | No token. Probe only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `GET /metrics`   | `bifrost_sync_phase{phase}` and `bifrost_sync_last_success_timestamp_seconds`, both from the persisted state.                                                                                                                                                                                                                                                                                                                                                                                                                          |

## What the read back catches

It compares what the sync sets: provider name, `network_config` (if given), `prompt_cache` (if given), `custom_provider_config` including `allowed_requests` (absent means unrestricted on both sides), key name, `models`, `weight`, `enabled`, `aliases`, virtual key access, and of the Azure and Vertex key configs the readable parts (`azure_key_config.endpoint`, `vertex_key_config.region`). It ignores fields that Bifrost sets itself. Key values, the Vertex project and the Vertex credentials are not compared, Bifrost returns them masked.

It catches a write that Bifrost accepted but stored differently. It does **not** catch wrong provider credentials, wrong model names at the provider, an unreachable provider, or a wrong `BIFROST_ENCRYPTION_KEY`: the pod that wrote runs with the right key in memory, only restarted pods load with the wrong one.

## Known consequences

- **A pod without a working encryption key stays Ready.** `/health` answers 200 while `GET /api/providers` answers 500. The rolling update then replaces both pods, and Bifrost is down (measured in kind: 64 s). The probe that would have stopped this was left out on purpose (gitops PR "Enable Bifrost encryption key on stage"). Every Deployment has the same risk, it does not come from this service. The service only reports it afterwards: `result=failed`, log on error level. It cannot prevent it.
- **After a failed rollback all pods load a possibly half-written DB state.** No pod is bound to a writer: a sync on a stale pod would delete keys. The run ends `failed`, the log has the provider and step (no keys), and an alert on `phase=failed` has to reach a person.
- **Pods that started before the last write block the next sync.** The service stores when it last wrote to Bifrost (`lastWriteAt`, set before the writes end and after a crash). A sync starts only if every pod was created after that moment: an older pod can be Ready and still hold the key IDs from before the write, and a sync through it would delete keys. This also covers a restart patch that Kubernetes rejected and a rollout that hung. `POST /v1/syncs` then answers `409` with the names of the old pods.
- **What an operator does after that.** The run ended `failed` (alert on `phase=failed`), and `lastRun.note` names the cause, for example `kube PATCH … -> 403` (missing right to patch the Deployment) or `rollout not complete after … ms`. Fix the cause and restart Bifrost by hand: `kubectl rollout restart deployment/<bifrost> -n <namespace>`. When the new pods are up, the next sync works. There is no call to the service for this, the block lifts itself. An admin in telli-admin cannot do it: they see `failed` and have to ask whoever runs the cluster.
- **The restart patch is retried.** Up to 3 attempts, `RESTART_RETRY_DELAY_MS` apart, for network errors, `429` and `5xx`. A `4xx` such as `403` or `404` fails at once, retrying will not fix it.
- **Every sync restarts all pods, also after a rollback.** Requests that run longer than 60 s after the restart begins are cut without an HTTP error (grace period 60 s, `preStop` 15 s).
- **A rollback cannot remove a `custom_provider_config`.** Bifrost answers 400 `cannot be removed after creation`. The read back reports it as a rollback error.
- **`network_config` in a rollback.** A `PUT` without it resets timeouts and retries to 0. The sync keeps the current value when the config omits it. This is correct as long as one provider id never comes with and without `network_config`, which a test in `packages/api-database` checks.

## Configuration

| Variable                                                  | Default                               | Meaning                                       |
| --------------------------------------------------------- | ------------------------------------- | --------------------------------------------- |
| `BIFROST_SYNC_TOKEN`                                      | required, min. 16 chars               | Bearer token.                                 |
| `BIFROST_ADMIN_USERNAME`, `BIFROST_ADMIN_PASSWORD`        | required                              | Bifrost admin access.                         |
| `DEPLOYMENT_NAME`                                         | required                              | Bifrost Deployment to restart.                |
| `POD_SELECTOR`                                            | required                              | Label selector of the Bifrost pods.           |
| `POD_PORT`                                                | `8080`                                | Bifrost port on the pod IP.                   |
| `NAMESPACE`, `STATE_CONFIGMAP`                            | service account, `bifrost-sync-state` | Namespace and state ConfigMap.                |
| `ROLLOUT_TIMEOUT_MS`, `POLL_MS`, `RESTART_RETRY_DELAY_MS` | `600000`, `2000`, `2000`              | Rollout wait and wait between patch attempts. |
| `PORT`, `HOST`, `LOG_LEVEL`                               | `8080`, `0.0.0.0`, `info`             |                                               |

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
