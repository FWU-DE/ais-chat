import { llmModelSelectSchema } from '@shared/db/schema';
import { z } from 'zod';

import { env } from '../env';

export async function fetchLlmModels({ apiKey }: { apiKey: string }) {
  // Todo: replace when api administration is moved to this repo
  const response = await fetch(`${env.apiUrl}/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    // Todo RL: Does not exist
    //    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error('Could not fetch the llm models');
  }

  const json = await response.json();
  const models = z.array(llmModelSelectSchema).parse(json);

  return models;
}
