import { DockerRestarter } from './docker-restarter';
import { env } from './env';
import { inClusterConfig } from './kube-client';
import { KubernetesRestarter } from './kubernetes-restarter';
import { logger } from './logger';
import { Orchestrator } from './orchestrator';
import type { Restarter } from './restarter';
import { createServer } from './server';
import { start } from './start';
import { ConfigMapStateStore, FileStateStore, type StateStore } from './state-store';

function createRestarter(): { restarter: Restarter; store: StateStore } {
  if (env.restarter === 'docker') {
    return {
      restarter: new DockerRestarter({
        socketPath: env.dockerSocket,
        selector: env.podSelector,
        port: env.podPort,
        expectedReplicas: env.expectedReplicas,
        stopTimeoutSeconds: env.dockerStopTimeoutSeconds,
        pollMs: env.pollMs,
      }),
      store: new FileStateStore(env.stateFile),
    };
  }
  const kube = inClusterConfig(env.namespace);
  return {
    restarter: new KubernetesRestarter(kube, {
      selector: env.podSelector,
      port: env.podPort,
      expectedReplicas: env.expectedReplicas,
      pollMs: env.pollMs,
    }),
    store: new ConfigMapStateStore(kube, env.stateConfigMap),
  };
}

const { restarter, store } = createRestarter();
const orchestrator = new Orchestrator(
  restarter,
  store,
  {
    adminUsername: env.bifrostAdminUsername,
    adminPassword: env.bifrostAdminPassword,
    expectedReplicas: env.expectedReplicas,
    rolloutTimeoutMs: env.rolloutTimeoutMs,
    evictBackoffMs: env.evictBackoffMs,
    pollMs: env.pollMs,
    verifyProviders: env.verifyProviders,
  },
  logger,
);
const server = createServer(orchestrator, { token: env.bifrostSyncToken });

let shuttingDown = false;
const shutdown = async (): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;
  await server.close();
};
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());

try {
  await start(orchestrator, server, { port: env.port, host: env.host });
  logger.info({ restarter: env.restarter, expectedReplicas: env.expectedReplicas }, 'listening');
} catch (error) {
  logger.error({ error: error instanceof Error ? error.message : 'unknown' }, 'startup failed');
  process.exitCode = 1;
}
