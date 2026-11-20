import { FastifyReply, FastifyRequest } from 'fastify';

import { env } from '@/env';
import { getMaybeBearerToken } from '@/routes/utils';

export function validateAdminApiKey(request: FastifyRequest, reply: FastifyReply) {
  const authorizationHeader = getMaybeBearerToken(request.headers.authorization);

  if (!authorizationHeader) {
    reply.status(401).send({ error: 'No Bearer token found.' });
    return { isValid: false };
  }

  if (authorizationHeader !== env.apiKey) {
    reply.status(401).send({ error: 'Api key is not valid' });
    return { isValid: false };
  }

  return { isValid: true };
}
