import { env } from './env';
import { createKubeRequest, inClusterConfig } from './kube-client';
import { KubernetesDeploymentRestarter } from './kubernetes-deployment-restarter';
import { logger } from './logger';
import { Orchestrator } from './orchestrator';
import { createServer } from './server';
import { start } from './start';
import { ConfigMapStateStore } from './state-store';

const kube = inClusterConfig(env.namespace);
const request = createKubeRequest(kube);

const orchestrator = new Orchestrator(
  new KubernetesDeploymentRestarter(request, {
    namespace: kube.namespace,
    deployment: env.deploymentName,
    selector: env.podSelector,
    port: env.podPort,
    pollMs: env.pollMs,
  }),
  new ConfigMapStateStore(request, kube.namespace, env.stateConfigMap),
  {
    adminUsername: env.bifrostAdminUsername,
    adminPassword: env.bifrostAdminPassword,
    rolloutTimeoutMs: env.rolloutTimeoutMs,
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
  logger.info({ deployment: env.deploymentName }, 'listening');
} catch (error) {
  logger.error({ error: error instanceof Error ? error.message : 'unknown' }, 'startup failed');
  process.exitCode = 1;
}
