import {
  dbGetAllApiKeysByProjectId,
  dbGetAllProjects,
  dbGetModelsByApiKeyId,
} from '@ais-chat/api-database';

export async function getProjectsWithActiveApiKey() {
  const projects = await dbGetAllProjects();

  return Promise.all(
    projects.map(async (project) => {
      const apiKeys = await dbGetAllApiKeysByProjectId(project.id);
      const apiKey = apiKeys.find((key) => key.state === 'active');
      return { projectId: project.id, apiKeyId: apiKey?.id };
    }),
  );
}

export async function getModelsByApiKeyId(apiKeyId: string) {
  const models = await dbGetModelsByApiKeyId({ apiKeyId });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return models.map(({ setting, ...model }) => model);
}
