import { Orchestrator, type OrchestratorOptions } from '../orchestrator';
import type { SyncRequest } from '../schemas';
import { createServer } from '../server';
import { keyOf } from './fake-bifrost';
import { FakeCluster } from './fake-cluster';
import { MemoryStateStore } from './memory-state-store';

export const TOKEN = 'test-token-0123456789';

// Test strings only, never real provider keys.
export const SECRET = {
  a1: 'sk-test-a-1',
  a2: 'sk-test-a-2',
  b1: 'sk-test-b-1',
  b2: 'sk-test-b-2',
  c1: 'sk-test-c-1',
  d1: 'sk-test-d-1',
};

type Providers = SyncRequest['providers'];

export const baselineProviders = (): Providers => [
  { provider: 'pa', keys: [keyOf('ka', SECRET.a1, ['fast'])] },
  { provider: 'pb', keys: [keyOf('kb', SECRET.b1, ['fast']), keyOf('kb2', SECRET.b2, ['only2'])] },
  { provider: 'pc', keys: [keyOf('kc', SECRET.c1, ['fast'])] },
];

/** Changes `pa`, deletes `kb2` and `pc`, adds `pd`. */
export const targetProviders = (): Providers => [
  { provider: 'pa', keys: [keyOf('ka', SECRET.a2, ['fast', 'extra'])] },
  { provider: 'pb', keys: [keyOf('kb', SECRET.b1, ['fast'])] },
  { provider: 'pd', keys: [keyOf('kd', SECRET.d1, ['fast'])] },
];

export const syncRequest = (
  overrides: Partial<SyncRequest> = {},
): SyncRequest & Record<string, unknown> => ({
  contentHash: 'hash-target',
  providers: targetProviders(),
  baseline: { contentHash: 'hash-base', providers: baselineProviders() },
  ...overrides,
});

export type LogLine = { level: 'info' | 'error'; obj: Record<string, unknown>; msg: string };

export async function createHarness(
  options: Partial<OrchestratorOptions> & { replicas?: number } = {},
) {
  const { replicas = 2, ...overrides } = options;
  const cluster = new FakeCluster(replicas);
  await cluster.init();
  const store = new MemoryStateStore();
  const logs: LogLine[] = [];
  const fatalErrors: unknown[] = [];
  const logger = {
    info: (obj: Record<string, unknown>, msg: string) => logs.push({ level: 'info', obj, msg }),
    error: (obj: Record<string, unknown>, msg: string) => logs.push({ level: 'error', obj, msg }),
  };
  const orchestratorOptions: OrchestratorOptions = {
    adminUsername: 'admin',
    adminPassword: 'admin-test-password',
    rolloutTimeoutMs: 5000,
    onFatal: (error) => fatalErrors.push(error),
    restartRetryDelayMs: 1,
    ...overrides,
  };
  const makeOrchestrator = () => new Orchestrator(cluster, store, orchestratorOptions, logger);
  const orchestrator = makeOrchestrator();
  const app = createServer(orchestrator, { token: TOKEN });

  /** Puts the baseline into the DB and all pods, as if an earlier sync had run. */
  const seedBaseline = () => {
    for (const config of baselineProviders()) {
      cluster.db.providers.set(config.provider, {
        name: config.provider,
        extra: {},
        keys: config.keys.map((key, index) => ({
          id: `${config.provider}-${key.name}-${index}`,
          name: key.name,
          value: key.value as string,
          models: key.models,
          weight: key.weight,
        })),
      });
    }
    for (let i = 0; i < replicas; i++) {
      const name = `bifrost-${String.fromCharCode(97 + i)}`;
      cluster.podByName(name).reload();
    }
  };

  const auth = { authorization: `Bearer ${TOKEN}` };
  const post = (payload: unknown) =>
    app.inject({ method: 'POST', url: '/v1/syncs', headers: auth, payload: payload as object });
  const status = async () =>
    (await app.inject({ method: 'GET', url: '/v1/status', headers: auth })).json<{
      phase: string;
      lastRun?: {
        result: string;
        errors: { provider: string; step: string; message: string }[];
        rollbackErrors: { message: string }[];
        note?: string;
      };
      lastSyncedHash?: string;
      writerUnavailable?: boolean;
    }>();

  return {
    cluster,
    store,
    logs,
    fatalErrors,
    orchestrator,
    makeOrchestrator,
    app,
    auth,
    post,
    status,
    seedBaseline,
    runToEnd: async () => orchestrator.whenIdle(),
    close: async () => {
      await app.close();
      await cluster.close();
    },
  };
}

export type Harness = Awaited<ReturnType<typeof createHarness>>;
