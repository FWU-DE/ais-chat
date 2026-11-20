import { dbGetProjectsWithApiKeys } from '@ais-chat/api-database';

export async function getProjectsWithApiKey() {
  const projects = await dbGetProjectsWithApiKeys();

  return projects.flatMap(({ project, apiKeys: [apiKey] }) =>
    apiKey ? [{ projectId: project.id, apiKeyId: apiKey.id }] : [],
  );
}
