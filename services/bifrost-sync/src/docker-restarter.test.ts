import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { DockerRestarter } from './docker-restarter';
import { RestartRefusedError, RolloutTimeoutError } from './restarter';

type FakeContainer = {
  id: string;
  name: string;
  startedAt: string;
  ip: string;
  health?: string;
  running: boolean;
};

let dir: string;
let server: Server;
let containers: FakeContainer[];
let calls: string[];
let restartStatus: number;
let restarter: DockerRestarter;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'docker-restarter-'));
  const socketPath = join(dir, 'docker.sock');
  calls = [];
  restartStatus = 204;
  containers = [
    {
      id: 'c1',
      name: '/ais-chat-bifrost-1',
      startedAt: '2026-01-01T00:00:00Z',
      ip: '172.20.0.2',
      health: 'healthy',
      running: true,
    },
  ];
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://docker');
    calls.push(`${req.method} ${url.pathname}${url.search}`);
    const send = (status: number, body?: unknown) =>
      res
        .writeHead(status, { 'content-type': 'application/json' })
        .end(body === undefined ? undefined : JSON.stringify(body));
    if (url.pathname === '/containers/json') {
      return send(
        200,
        containers.map((c) => ({ Id: c.id })),
      );
    }
    const inspect = /^\/containers\/(\w+)\/json$/.exec(url.pathname);
    if (inspect) {
      const c = containers.find((x) => x.id === inspect[1]);
      if (!c) return send(404, { message: 'no such container' });
      return send(200, {
        Id: c.id,
        Name: c.name,
        State: {
          Running: c.running,
          Restarting: false,
          StartedAt: c.startedAt,
          Health: c.health ? { Status: c.health } : undefined,
        },
        NetworkSettings: { Networks: { default: { IPAddress: c.ip } } },
      });
    }
    const restart = /^\/containers\/(\w+)\/restart$/.exec(url.pathname);
    if (restart && req.method === 'POST') {
      if (restartStatus === 204) {
        const c = containers.find((x) => x.id === restart[1])!;
        c.startedAt = '2026-01-01T00:05:00Z';
      }
      return send(restartStatus);
    }
    return send(404);
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));
  restarter = new DockerRestarter({
    socketPath,
    selector: 'com.docker.compose.project=ais-chat,com.docker.compose.service=bifrost',
    port: 8080,
    expectedReplicas: 1,
    stopTimeoutSeconds: 60,
    pollMs: 1,
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dir, { recursive: true, force: true });
});

describe('DockerRestarter', () => {
  test('lists containers by label with their IP and readiness', async () => {
    const [instance] = await restarter.listInstances();

    expect(instance).toMatchObject({
      name: 'ais-chat-bifrost-1',
      baseUrl: 'http://172.20.0.2:8080',
      ready: true,
      terminating: false,
    });
    const listCall = calls.find((c) => c.startsWith('GET /containers/json'))!;
    expect(decodeURIComponent(listCall)).toContain(
      '{"label":["com.docker.compose.project=ais-chat","com.docker.compose.service=bifrost"]}',
    );
  });

  test('is not ready while the healthcheck is starting or the container is stopped', async () => {
    containers[0]!.health = 'starting';
    expect((await restarter.listInstances())[0]!.ready).toBe(false);
    containers[0]!.health = 'healthy';
    containers[0]!.running = false;
    expect((await restarter.listInstances())[0]!.ready).toBe(false);
  });

  test('restart changes the instance ID, so old and new instances differ', async () => {
    const [before] = await restarter.listInstances();
    await restarter.restart(before!.id);
    const [after] = await restarter.listInstances();

    expect(after!.id).not.toBe(before!.id);
    expect(calls).toContain('POST /containers/c1/restart?t=60');
  });

  test('restart of an unknown or already replaced instance does nothing', async () => {
    const [before] = await restarter.listInstances();
    await restarter.restart(before!.id);
    calls.length = 0;
    await restarter.restart(before!.id);

    expect(calls.some((c) => c.startsWith('POST'))).toBe(false);
  });

  test('maps a conflict to RestartRefusedError', async () => {
    restartStatus = 409;
    const [instance] = await restarter.listInstances();
    await expect(restarter.restart(instance!.id)).rejects.toBeInstanceOf(RestartRefusedError);
  });

  test('waitUntilAllReady resolves once the old instance is gone and the new one is healthy', async () => {
    const [before] = await restarter.listInstances();
    await restarter.restart(before!.id);
    await expect(restarter.waitUntilAllReady([before!.id], 1000)).resolves.toBeUndefined();
  });

  test('waitUntilAllReady times out while the old instance is still there', async () => {
    const [before] = await restarter.listInstances();
    await expect(restarter.waitUntilAllReady([before!.id], 30)).rejects.toBeInstanceOf(
      RolloutTimeoutError,
    );
  });
});
