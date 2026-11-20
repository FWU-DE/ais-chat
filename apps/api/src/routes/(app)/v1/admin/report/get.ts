import { dbGetProjectsWithApiKeys } from '@ais-chat/api-database';
import { FastifyReply, FastifyRequest } from 'fastify';
import z from 'zod';

import { convertToCSV, createMonthlyCostReports } from '@/routes/(app)/v1/admin/report/utils';

import { validateAdminApiKey } from '../utils';

export async function handler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const validationResult = validateAdminApiKey(request, reply);

  if (!validationResult.isValid) return;

  const { year } = z.object({ year: z.coerce.number() }).parse(request.params);

  const { format } = z
    .object({ format: z.enum(['csv', 'json']).default('json') })
    .parse(request.query);

  const projects = await dbGetProjectsWithApiKeys();

  const report = await createMonthlyCostReports({ projects, year });

  if (format === 'csv') {
    const csvString = convertToCSV(report);
    reply.status(200).send(csvString);
    return;
  }

  return reply.status(200).send({ report });
}
