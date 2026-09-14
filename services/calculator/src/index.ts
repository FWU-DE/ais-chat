import { createCalculatorServer } from './server.js';

// Standalone HTTP entry point for the deliberately isolated calculator service.
const server = createCalculatorServer();

let shuttingDown = false;
const shutdown = async (): Promise<void> => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  await server.close();
};

process.once('SIGTERM', () => {
  void shutdown();
});
process.once('SIGINT', () => {
  void shutdown();
});

void server
  .listen({ port: Number(process.env.PORT ?? 8080), host: process.env.HOST ?? '0.0.0.0' })
  .catch(() => {
    process.stderr.write('calculator server failed to start\n');
    process.exitCode = 1;
  });
