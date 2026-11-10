'use server';

import { runServerAction } from '@shared/actions/run-server-action';
import {
  createNewCharacter,
  downloadFileFromCharacter,
} from '@shared/characters/character-service';

import { requireAuth } from '@/auth/requireAuth';

export async function createNewCharacterAction({
  modelId,
  templateId,
  duplicateCharacterName,
}: {
  modelId?: string;
  templateId?: string;
  duplicateCharacterName?: string;
}) {
  const { user, federalState } = await requireAuth();

  return runServerAction(
    'createNewCharacterAction',
    createNewCharacter,
  )({
    federalStateId: federalState.id,
    modelId,
    user,
    templateId,
    duplicateCharacterName,
  });
}

export async function downloadFileFromCharacterAction({
  characterId,
  fileId,
}: {
  characterId: string;
  fileId: string;
}) {
  const { user } = await requireAuth();

  return runServerAction(
    'downloadFileFromCharacterAction',
    downloadFileFromCharacter,
  )({
    characterId,
    fileId,
    user,
  });
}
