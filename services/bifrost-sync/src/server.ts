import { createHash, timingSafeEqual } from 'node:crypto';

import fastify, { type FastifyInstance } from 'fastify';

import type { Orchestrator } from './orchestrator';
import { parseSyncRequest } from './schemas';
import { ConflictError } from './types';

export type ServerOptions = { token: string };

// Providers with keys and models stay far below this. The cap bounds memory per request.
const BODY_LIMIT_BYTES = 10 * 1024 * 1024;

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Compares digests, so the comparison takes the same time for every input length. */
export function isValidToken(header: string | undefined, token: string): boolean {
  const given = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  return timingSafeEqual(digest(given), digest(token));
}

/**
 * Requests carry provider keys in clear text. No code path here logs bodies, headers or
 * parser error messages (Fastify's JSON error echoes a snippet of the body).
 */
export function createServer(orchestrator: Orchestrator, options: ServerOptions): FastifyInstance {
  const app = fastify({ logger: false, bodyLimit: BODY_LIMIT_BYTES });

  app.setErrorHandler((error: { statusCode?: number; code?: string }, _request, reply) => {
    if (error instanceof ConflictError) {
      return reply.code(409).send({ error: error.message, ...error.details });
    }
    if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.code(413).send({ error: 'body too large' });
    }
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(400).send({ error: 'invalid request' });
    }
    return reply.code(500).send({ error: 'internal error' });
  });

  app.get('/healthz', () => ({ status: 'ok' }));

  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/healthz') return;
    if (!isValidToken(request.headers.authorization, options.token)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  });

  app.post('/v1/syncs', async (request, reply) => {
    const parsed = parseSyncRequest(request.body);
    if (!parsed.ok)
      return reply.code(422).send({ error: 'invalid request', issues: parsed.issues });
    if (parsed.request.providers.length === 0) {
      return reply.code(422).send({ error: 'providers must not be empty' });
    }
    return reply.code(202).send(await orchestrator.start(parsed.request));
  });

  app.get('/v1/status', async () => orchestrator.status());

  app.post('/v1/resume', async (_request, reply) =>
    reply.code(202).send(await orchestrator.resume()),
  );

  app.post('/v1/restart-all', async (_request, reply) =>
    reply.code(202).send(await orchestrator.restartAll()),
  );

  app.get('/metrics', async (_request, reply) => {
    const { state } = await orchestrator.readState();
    const { counters } = orchestrator;
    const phases = ['idle', 'syncing', 'rolling_back', 'restarting', 'failed'] as const;
    const lines: string[] = [
      '# TYPE bifrost_sync_phase gauge',
      ...phases.map((p) => `bifrost_sync_phase{phase="${p}"} ${state.phase === p ? 1 : 0}`),
    ];
    if (state.run && state.phase !== 'idle' && state.phase !== 'failed') {
      const seconds = (Date.now() - Date.parse(state.run.startedAt)) / 1000;
      lines.push(
        '# TYPE bifrost_sync_run_duration_seconds gauge',
        `bifrost_sync_run_duration_seconds ${seconds.toFixed(1)}`,
      );
    } else if (state.lastRun?.startedAt) {
      const seconds =
        (Date.parse(state.lastRun.finishedAt) - Date.parse(state.lastRun.startedAt)) / 1000;
      lines.push(
        '# TYPE bifrost_sync_run_duration_seconds gauge',
        `bifrost_sync_run_duration_seconds ${seconds.toFixed(1)}`,
      );
    }
    if (state.lastSuccessAt) {
      lines.push(
        '# TYPE bifrost_sync_last_success_timestamp_seconds gauge',
        `bifrost_sync_last_success_timestamp_seconds ${Math.floor(Date.parse(state.lastSuccessAt) / 1000)}`,
      );
    }
    lines.push(
      '# TYPE bifrost_sync_runs_total counter',
      ...(['ok', 'rolled_back', 'failed'] as const).map(
        (r) => `bifrost_sync_runs_total{result="${r}"} ${counters.runs[r]}`,
      ),
      '# TYPE bifrost_sync_rollback_failures_total counter',
      `bifrost_sync_rollback_failures_total ${counters.rollbackFailures}`,
      '# TYPE bifrost_sync_evictions_refused_total counter',
      `bifrost_sync_evictions_refused_total ${counters.evictions429}`,
    );
    return reply.type('text/plain; version=0.0.4').send(`${lines.join('\n')}\n`);
  });

  return app;
}
