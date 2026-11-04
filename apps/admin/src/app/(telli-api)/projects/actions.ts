'use server';
import { requireAdminAuth } from '@/auth/requireAdminAuth';
import {
  getProjects,
  getSingleProject,
  createProject,
  deleteProject,
} from '@/services/project-service';
import { getApiKeys } from '@/services/api-key-service';
import { Project } from '@/types/project';
import { ApiKey } from '@/types/api-key';
import { runServerAction } from '@shared/actions/run-server-action';

export async function getProjectsAction() {
  await requireAdminAuth();

  return getProjects();
}

export async function getProjectByIdAction(projectId: string) {
  await requireAdminAuth();

  return getSingleProject(projectId);
}

export async function createProjectAction(id: string, name: string): Promise<Project> {
  await requireAdminAuth();

  if (!id.trim()) {
    throw new Error('Projekt-ID ist erforderlich');
  }

  if (!name.trim()) {
    throw new Error('Projektname ist erforderlich');
  }

  try {
    return await createProject({ id: id.trim(), name: name.trim() });
  } catch {
    throw new Error('Fehler beim Erstellen des Projekts');
  }
}

export async function getApiKeysAction(projectId: string): Promise<ApiKey[]> {
  await requireAdminAuth();

  return getApiKeys(projectId);
}

export async function deleteProjectAction(projectId: string) {
  await requireAdminAuth();
  return runServerAction('deleteProjectAction', deleteProject)(projectId);
}
