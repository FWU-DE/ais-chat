import { cleanupAssistants } from '@shared/assistants/assistant-admin-service';
import { cleanupCharacters } from '@shared/characters/character-admin-service';
import { cleanupLearningScenarios } from '@shared/learning-scenarios/learning-scenario-admin-service';
import { logError, logInfo } from '@shared/logging';
import { NextRequest, NextResponse } from 'next/server';

import { cleanupWebChunks } from '@/app/api/rag/cleanupWebChunks';
import { cleanupExpiredSharedChatFiles } from '@/app/api/shared-chat/shared-chat-cleanup-service';
import { validateApiKeyByHeadersWithResult } from '@/utils/validation';

export async function DELETE(req: NextRequest) {
  const [error] = validateApiKeyByHeadersWithResult(req.headers);

  if (error !== null) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  try {
    const [
      deletedCharacters,
      deletedLearningScenarios,
      deletedAssistants,
      deletedWebChunks,
      deletedExpiredSharedChatFiles,
    ] = await Promise.all([
      cleanupCharacters(),
      cleanupLearningScenarios(),
      cleanupAssistants(),
      cleanupWebChunks(),
      cleanupExpiredSharedChatFiles(),
    ]);
    const message = {
      message: 'Cleanup finished!',
      deletedCharacters,
      deletedLearningScenarios,
      deletedAssistants,
      deletedWebChunks,
      deletedExpiredSharedChatFiles,
    };
    logInfo('Cleanup finished:', message);
    return NextResponse.json(message, { status: 200 });
  } catch (error) {
    logError('Error during cleanup', error);
    return NextResponse.json({ error: 'Error during cleanup' }, { status: 500 });
  }
}
