import { getCurrentUsageInCentByApiKeyIdWithResult } from '@ais-chat/api-database';
import { getEndOfCurrentMonth, getStartOfCurrentMonth } from '@ais-chat/api-database/utils';
import { FastifyReply, FastifyRequest } from 'fastify';

import { validateApiKey } from '@/routes/utils';

export async function handler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const apiKey = await validateApiKey(request, reply);

  if (apiKey === undefined) return;

  const startDate = getStartOfCurrentMonth();
  const endDate = getEndOfCurrentMonth();
  const [error, result] = await getCurrentUsageInCentByApiKeyIdWithResult({
    apiKeyId: apiKey.id,
    startDate,
    endDate,
  });

  if (error !== null) {
    reply.status(500).send({
      error: 'Something went wrong while calculating the usage',
      details: error.message,
    });
    return;
  }

  const _remainingLimitInCent = apiKey.limitInCent - result.actualPrice;
  const remainingLimitInCent = _remainingLimitInCent > 0 ? _remainingLimitInCent : 0;

  reply.status(200).send({ remainingLimitInCent, limitInCent: apiKey.limitInCent });
  return;
}
