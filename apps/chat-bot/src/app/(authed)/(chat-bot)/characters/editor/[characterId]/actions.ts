'use server';

import { AccessLevel } from '@shared/db/schema';
import { getCommunityTemplateRequestWithEvents } from '@shared/community-templates/community-template-service';
import { ShareWithLearnersLimitParams } from '@/components/custom-chat/share-with-learners/custom-chat-share-with-learners-limit-params';
import { requireAuth } from '@/auth/requireAuth';
import {
  deleteCharacter,
  deleteFileMappingAndEntity,
  downloadFileFromCharacter,
  extendCharacterShareExpiration,
  getActiveCharacterShareData,
  linkFileToCharacter,
  shareCharacter,
  unshareCharacter,
  updateCharacterShareTokenPointsLimit,
  updateCharacter,
  updateCharacterAccessLevel,
  UpdateCharacterActionModel,
  uploadAvatarPictureForCharacter,
} from '@shared/characters/character-service';
import {
  cancelCommunityTemplateRequest,
  createCommunityTemplateRequest,
} from '@shared/community-templates/community-template-service';
import { runServerAction } from '@shared/actions/run-server-action';

export async function getCommunityTemplateRequestWithEventsAction({
  characterId,
}: {
  characterId: string;
}) {
  const { user } = await requireAuth();

  return runServerAction(
    'getCommunityTemplateRequestWithEventsAction',
    getCommunityTemplateRequestWithEvents,
  )({
    characterId,
    user,
  });
}

export async function createCommunityTemplateRequestAction({
  characterId,
}: {
  characterId: string;
}) {
  const { user } = await requireAuth();

  return runServerAction(
    'createCommunityTemplateRequestAction',
    createCommunityTemplateRequest,
  )({
    characterId,
    user,
  });
}

export async function cancelCommunityTemplateRequestAction({
  characterId,
}: {
  characterId: string;
}) {
  const { user } = await requireAuth();

  return runServerAction(
    'cancelCommunityTemplateRequestAction',
    cancelCommunityTemplateRequest,
  )({
    characterId,
    user,
  });
}

export async function updateCharacterAccessLevelAction({
  characterId,
  accessLevel,
}: {
  characterId: string;
  accessLevel: AccessLevel;
}) {
  const { user } = await requireAuth();

  return runServerAction(
    'updateCharacterAccessLevelAction',
    updateCharacterAccessLevel,
  )({
    characterId,
    accessLevel,
    user,
  });
}

export async function updateCharacterAction(character: UpdateCharacterActionModel) {
  const { user } = await requireAuth();

  return runServerAction(
    'updateCharacterAction',
    updateCharacter,
  )({
    user,
    ...character,
  });
}

export async function deleteCharacterAction({ characterId }: { characterId: string }) {
  const { user } = await requireAuth();

  return runServerAction(
    'deleteCharacterAction',
    deleteCharacter,
  )({
    characterId,
    user,
  });
}

export async function shareCharacterAction({
  id,
  tokenPointsPercentageLimit,
  usageTimeLimit,
}: { id: string } & ShareWithLearnersLimitParams) {
  const { user } = await requireAuth();

  return runServerAction(
    'shareCharacterAction',
    shareCharacter,
  )({
    characterId: id,
    tokenPointsPercentageLimit,
    usageTimeLimitMinutes: usageTimeLimit,
    user,
  });
}

export async function unshareCharacterAction({ characterId }: { characterId: string }) {
  const { user } = await requireAuth();

  return runServerAction(
    'unshareCharacterAction',
    unshareCharacter,
  )({
    characterId,
    user: user,
  });
}

export async function extendCharacterShareExpirationAction({
  characterId,
  additionalTimeInMinutes,
}: {
  characterId: string;
  additionalTimeInMinutes: number;
}) {
  const { user } = await requireAuth();

  return runServerAction(
    'extendCharacterShareExpirationAction',
    extendCharacterShareExpiration,
  )({
    characterId,
    additionalTimeInMinutes,
    user,
  });
}

export async function updateCharacterShareTokenPointsLimitAction({
  characterId,
  tokenPointsPercentageLimit,
}: {
  characterId: string;
  tokenPointsPercentageLimit: number;
}) {
  const { user } = await requireAuth();

  return runServerAction(
    'updateCharacterShareTokenPointsLimitAction',
    updateCharacterShareTokenPointsLimit,
  )({
    characterId,
    tokenPointsPercentageLimit,
    user,
  });
}

export async function getCharacterShareDataAction({ characterId }: { characterId: string }) {
  const { user, federalState } = await requireAuth();

  return runServerAction(
    'getCharacterShareDataAction',
    getActiveCharacterShareData,
  )({
    characterId,
    user,
    federalState,
  });
}

export async function deleteFileMappingAndEntityAction({
  characterId,
  fileId,
}: {
  characterId: string;
  fileId: string;
}) {
  const { user } = await requireAuth();

  return runServerAction(
    'deleteFileMappingAndEntityAction',
    deleteFileMappingAndEntity,
  )({
    characterId,
    fileId,
    user,
  });
}

export async function linkFileToCharacterAction({
  fileId,
  characterId,
}: {
  fileId: string;
  characterId: string;
}) {
  const { user } = await requireAuth();

  return runServerAction(
    'linkFileToCharacterAction',
    linkFileToCharacter,
  )({
    fileId,
    characterId,
    user,
  });
}

export async function uploadAvatarPictureForCharacterAction({
  characterId,
  croppedImageBlob,
}: {
  characterId: string;
  croppedImageBlob: Blob;
}) {
  const { user } = await requireAuth();

  return runServerAction(
    'uploadAvatarPictureForCharacterAction',
    uploadAvatarPictureForCharacter,
  )({
    characterId,
    croppedImageBlob,
    user,
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
