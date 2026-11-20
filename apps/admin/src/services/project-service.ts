import {
  dbCreateProject,
  dbDeleteProject,
  dbGetAllProjects,
  dbGetProjectById,
} from '@ais-chat/api-database';
import { logInfo } from '@shared/logging';

import { runDeleteOrThrowError } from '@/utils/run-delete-or-throw-error';

export async function getProjects() {
  return dbGetAllProjects();
}

export async function getSingleProject(projectId: string) {
  const project = await dbGetProjectById(projectId);
  if (!project) throw new Error('Project not found');
  return project;
}

export async function createProject(projectData: { id: string; name: string }) {
  const project = await dbCreateProject({
    id: projectData.id,
    name: projectData.name,
  });

  logInfo('Project was created successfully', { projectData });

  if (!project) throw new Error('Failed to create project');
  return project;
}

export async function deleteProject(projectId: string) {
  const deleted = await runDeleteOrThrowError(
    () => dbDeleteProject(projectId),
    'Projekt kann nicht gelöscht werden, da noch Daten damit verknüpft sind.',
  );
  if (!deleted) throw new Error('Project not found');

  logInfo('Project was deleted successfully', { projectId });
}
