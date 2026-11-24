import { request } from 'node:http';

import { type Restarter, RestartRefusedError, waitForInstances } from './restarter';
import type { Instance } from './types';

type DockerContainer = { Id: string };
type DockerInspect = {
  Id: string;
  Name: string;
  State: {
    Running: boolean;
    Restarting: boolean;
    StartedAt: string;
    Health?: { Status: string };
  };
  NetworkSettings: { Networks: Record<string, { IPAddress: string }> };
};

export type DockerRestarterOptions = {
  socketPath: string;
  /** Comma-separated Docker label filters, all must match, e.g. `com.docker.compose.service=bifrost`. */
  selector: string;
  port: number;
  expectedReplicas: number;
  stopTimeoutSeconds: number;
  pollMs?: number;
};

export class DockerError extends Error {
  constructor(
    readonly status: number,
    method: string,
    path: string,
  ) {
    super(`docker ${method} ${path} -> ${status}`);
    this.name = 'DockerError';
  }
}

function dockerRequest(
  socketPath: string,
  method: string,
  path: string,
  timeoutMs: number,
): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const req = request({ socketPath, method, path, timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json: unknown;
        try {
          json = text ? (JSON.parse(text) as unknown) : undefined;
        } catch {
          json = undefined;
        }
        resolve({ status: res.statusCode ?? 0, json });
      });
    });
    req.on('timeout', () => req.destroy(new Error(`docker ${method} ${path} timed out`)));
    req.on('error', reject);
    req.end();
  });
}

/**
 * Local Compose only. Restarts containers through the Docker API on the mounted socket.
 *
 * A restarted container keeps its ID, so the instance ID is `<container id>@<StartedAt>`. A restart
 * changes it, which lets the rollout tell old from new instances like Kubernetes pod UIDs.
 */
export class DockerRestarter implements Restarter {
  private readonly pollMs: number;

  constructor(private readonly options: DockerRestarterOptions) {
    this.pollMs = options.pollMs ?? 1000;
  }

  private call(method: string, path: string, timeoutMs = 15_000) {
    return dockerRequest(this.options.socketPath, method, path, timeoutMs);
  }

  async listInstances(): Promise<Instance[]> {
    const filters = encodeURIComponent(JSON.stringify({ label: this.options.selector.split(',') }));
    const listPath = `/containers/json?all=1&filters=${filters}`;
    const list = await this.call('GET', listPath);
    if (list.status !== 200) throw new DockerError(list.status, 'GET', listPath);

    const instances: Instance[] = [];
    for (const { Id } of list.json as DockerContainer[]) {
      const path = `/containers/${Id}/json`;
      const inspect = await this.call('GET', path);
      if (inspect.status === 404) continue;
      if (inspect.status !== 200) throw new DockerError(inspect.status, 'GET', path);
      const container = inspect.json as DockerInspect;
      const { State } = container;
      const ip = Object.values(container.NetworkSettings.Networks).find(
        (n) => n.IPAddress,
      )?.IPAddress;
      const healthy = State.Health ? State.Health.Status === 'healthy' : true;
      instances.push({
        id: `${container.Id}@${State.StartedAt}`,
        name: container.Name.replace(/^\//, ''),
        baseUrl: ip ? `http://${ip}:${this.options.port}` : '',
        ready: State.Running && !State.Restarting && healthy && !!ip,
        terminating: State.Restarting,
      });
    }
    return instances.sort((a, b) => a.name.localeCompare(b.name));
  }

  async restart(id: string): Promise<void> {
    const current = (await this.listInstances()).find((instance) => instance.id === id);
    if (!current) return;
    const containerId = id.split('@')[0]!;
    const timeout = this.options.stopTimeoutSeconds;
    const path = `/containers/${containerId}/restart?t=${timeout}`;
    const { status } = await this.call('POST', path, (timeout + 30) * 1000);
    if (status === 204 || status === 404) return;
    if (status === 409) throw new RestartRefusedError(current.name);
    throw new DockerError(status, 'POST', path);
  }

  waitUntilAllReady(oldIds: string[], timeoutMs: number): Promise<void> {
    return waitForInstances(
      () => this.listInstances(),
      oldIds,
      this.options.expectedReplicas,
      timeoutMs,
      this.pollMs,
    );
  }
}
