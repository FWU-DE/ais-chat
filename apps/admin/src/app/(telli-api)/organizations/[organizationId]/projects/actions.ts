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

export async function getProjectsAction(organizationId: string) {
  await requireAdminAuth();

  return getProjects(organizationId);
}

export async function getProjectByIdAction(organizationId: string, projectId: string) {
  await requireAdminAuth();

  return getSingleProject(organizationId, projectId);
}

export async function createProjectAction(
  organizationId: string,
  id: string,
  name: string,
): Promise<Project> {
  await requireAdminAuth();

  if (!id.trim()) {
    throw new Error('Projekt-ID ist erforderlich');
  }

  if (!name.trim()) {
    throw new Error('Projektname ist erforderlich');
  }

  try {
    return await createProject(organizationId, { id: id.trim(), name: name.trim() });
  } catch {
    throw new Error('Fehler beim Erstellen des Projekts');
  }
}

export async function getApiKeysAction(
  organizationId: string,
  projectId: string,
): Promise<ApiKey[]> {
  await requireAdminAuth();

  return getApiKeys(organizationId, projectId);
}

export async function deleteProjectAction(organizationId: string, projectId: string) {
  await requireAdminAuth();
  return runServerAction('deleteProjectAction', deleteProject)(organizationId, projectId);
}
