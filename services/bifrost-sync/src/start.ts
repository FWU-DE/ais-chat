import type { FastifyInstance } from 'fastify';

export type Recoverable = { recover: () => Promise<void> };

/**
 * Recovers the state of an interrupted run before the port opens. Otherwise a request could start
 * a run next to an unfinished one, and a failed recovery would leave a live `/healthz`.
 */
export async function start(
  orchestrator: Recoverable,
  server: Pick<FastifyInstance, 'listen'>,
  listen: { port: number; host: string },
): Promise<void> {
  await orchestrator.recover();
  await server.listen(listen);
}
