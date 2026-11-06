/**
 * @description Cleanup services without authorization checks.
 */
import { cleanupAssistants } from '@shared/assistants/assistant-admin-service';
import { cleanupCharacters } from '@shared/characters/character-admin-service';
import { dbDeleteOutdatedConversations } from '@shared/db/functions/conversation';
import {
  dbDeleteDanglingFiles,
  dbDeleteFileAndDetachFromConversation,
  dbGetAllS3FileKeys,
  dbGetDanglingConversationFileIds,
} from '@shared/db/functions/files';
import { cleanupWebChunks } from '@shared/files/cleanupWebChunks';
import { cleanupLearningScenarios } from '@shared/learning-scenarios/learning-scenario-admin-service';
import { logError, logInfo } from '@shared/logging';
import { deleteFilesFromS3, listFilesFromS3 } from '@shared/s3';
import { cleanupExpiredSharedChatFiles } from '@shared/shared-chat/shared-chat-cleanup-service';
import { getErrorMessage } from '@shared/utils/error';

/**
 * Deletes conversations past their retention time and files that are no longer referenced.
 *
 * CAUTION: This is an admin function that does not check any authorization!
 */
export async function deleteOutdatedConversations({
  deleteUnusedS3Files,
}: {
  deleteUnusedS3Files: boolean;
}) {
  const countDeletedConversations = await dbDeleteOutdatedConversations();
  const danglingConversationFiles = await dbGetDanglingConversationFileIds();
  await dbDeleteFileAndDetachFromConversation(danglingConversationFiles);
  // from other entities: character, assistant, learning scenario
  const danglingFiles = await dbDeleteDanglingFiles();
  const unusedS3Files = await getUnusedS3Files();
  if (deleteUnusedS3Files) {
    await deleteFilesFromS3(unusedS3Files);
  }
  await deleteFilesFromS3([...danglingConversationFiles, ...danglingFiles]);
  const response = {
    message: 'Ok',
    countDeletedConversations,
    danglingConversationFiles,
    danglingFiles,
    unusedS3Files,
  };

  logInfo('Deleted old conversations:', response);

  return response;
}

type FailedStep = { step: string; error: string };

// Waits for all steps to settle, so one rejection doesn't leave the others running.
// Failed steps are logged and returned instead of thrown, the results of the other steps are kept.
async function settleAll<T extends Record<string, Promise<unknown>>>(
  steps: T,
): Promise<{ results: { [K in keyof T]?: Awaited<T[K]> }; failedSteps: FailedStep[] }> {
  const entries = Object.entries(steps);
  const settled = await Promise.allSettled(entries.map(([, promise]) => promise));

  const results: Record<string, unknown> = {};
  const failedSteps: FailedStep[] = [];
  settled.forEach((result, index) => {
    const step = entries[index]![0];
    if (result.status === 'fulfilled') {
      results[step] = result.value;
    } else {
      logError(`Cleanup step ${step} failed`, result.reason);
      failedSteps.push({ step, error: getErrorMessage(result.reason) });
    }
  });
  return { results: results as { [K in keyof T]?: Awaited<T[K]> }, failedSteps };
}

async function getUnusedS3Files() {
  const s3Files = await listFilesFromS3({
    // delete unused files from S3 after the files are at least a day old to prevent accidental deletions during file upload
    minAgeInSeconds: 24 * 60 * 60,
  });
  const filesFromDb = new Set(await dbGetAllS3FileKeys());
  return s3Files.filter((file) => !filesFromDb.has(file));
}

/**
 * Deletes empty entities, old web chunks and files of expired shared chats.
 * Failed steps are listed in `failedSteps`, the other steps still run.
 *
 * CAUTION: This is an admin function that does not check any authorization!
 */
export async function cleanupResources() {
  const { results, failedSteps } = await settleAll({
    deletedCharacters: cleanupCharacters(),
    deletedLearningScenarios: cleanupLearningScenarios(),
    deletedAssistants: cleanupAssistants(),
    deletedWebChunks: cleanupWebChunks(),
    deletedExpiredSharedChatFiles: cleanupExpiredSharedChatFiles(),
  });

  const message = {
    message: failedSteps.length === 0 ? 'Cleanup finished!' : 'Cleanup finished with failed steps!',
    ...results,
    failedSteps,
  };
  logInfo('Cleanup finished:', message);
  return message;
}
