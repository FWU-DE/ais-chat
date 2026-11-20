import * as http from 'node:http';

import fastifyMultipart from '@fastify/multipart';
import fastify, { FastifyHttpOptions } from 'fastify';
import fastifyGracefulShutdown from 'fastify-graceful-shutdown';

import { initSwagger } from '@/swagger';

import { constructHandlers } from './handlers';

async function buildApp(opts?: FastifyHttpOptions<http.Server>) {
  const app = fastify({ trustProxy: true, ...opts });

  app.register(fastifyGracefulShutdown);

  app.register(fastifyMultipart, {
    throwFileSizeLimit: true,
    limits: {
      fileSize: 20_000_000,
    },
  });

  app.setSerializerCompiler(() => {
    return (data) => JSON.stringify(data);
  });

  // This disables fastify's implicit logic validating and coercing the request body, because this is very error prone on complex schemas
  // the validation is instead always done by the Zod schema
  app.setValidatorCompiler(() => {
    return () => true;
  });

  // swagger needs to be initialized before route handlers are registered
  await initSwagger(app);

  constructHandlers(app);

  return app;
}

export default buildApp;
