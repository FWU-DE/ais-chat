'use server';

import { runServerAction } from '@shared/actions/run-server-action';
import { cleanupResources, deleteOutdatedConversations } from '@shared/cleanup/cleanup-service';
import { BusinessError } from '@shared/error';
import { logError, logInfo } from '@shared/logging';
import { refreshEntityPopularity } from '@shared/popularity/popularity-service';
import { getErrorMessage } from '@shared/utils/error';
import z from 'zod';

import { requireAdminAuth } from '@/auth/requireAdminAuth';

const cleanupInputSchema = z.object({ deleteUnusedS3Files: z.boolean() });

class TaskError extends BusinessError {
  constructor(message: string) {
    super(`${message} Details stehen in den Logs.`, 500);
    this.name = 'TaskError';
  }
}

async function runCleanup(input: z.infer<typeof cleanupInputSchema>) {
  const { deleteUnusedS3Files } = cleanupInputSchema.parse(input);

  let deletedConversations;
  try {
    deletedConversations = await deleteOutdatedConversations({ deleteUnusedS3Files });
  } catch (error) {
    logError('Cleanup step deleteOutdatedConversations failed', error);
    throw new TaskError(
      `Schritt "deleteOutdatedConversations" ist fehlgeschlagen: ${getErrorMessage(error)}.`,
    );
  }

  let cleanedResources;
  try {
    cleanedResources = await cleanupResources();
  } catch (error) {
    logError('Cleanup step cleanupResources failed', error);
    throw new TaskError(
      `Schritt "cleanupResources" ist fehlgeschlagen: ${getErrorMessage(error)}.`,
    );
  }

  if (cleanedResources.failedSteps.length > 0) {
    const steps = cleanedResources.failedSteps.map(({ step }) => `"${step}"`).join(', ');
    throw new TaskError(`Schritte ${steps} sind fehlgeschlagen.`);
  }

  return {
    deleteUnusedS3Files,
    deleteOutdatedConversations: deletedConversations,
    cleanupResources: cleanedResources,
  };
}

async function runPopularityRefresh() {
  try {
    return await refreshEntityPopularity();
  } catch (error) {
    logError('Popularity refresh failed', error);
    throw new TaskError(`Berechnung fehlgeschlagen: ${getErrorMessage(error)}.`);
  }
}

export async function runCleanupAction(input: { deleteUnusedS3Files: boolean }) {
  await requireAdminAuth();
  logInfo('Admin triggered cleanup', { deleteUnusedS3Files: input.deleteUnusedS3Files });
  return runServerAction('runCleanupAction', runCleanup)(input);
}

export async function refreshPopularityAction() {
  await requireAdminAuth();
  logInfo('Admin triggered popularity refresh');
  return runServerAction('refreshPopularityAction', runPopularityRefresh)();
}
