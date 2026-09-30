'use server';

import { LearningScenarioSelectModel } from '@shared/db/schema';
import { ShareWithLearnersLimitParams } from '@/components/custom-chat/share-with-learners/custom-chat-share-with-learners-limit-params';
import { runServerAction } from '@shared/actions/run-server-action';
import {
  extendLearningScenarioShareExpiration,
  getActiveLearningScenarioShareData,
  removeFileFromLearningScenario,
  shareLearningScenario,
  unshareLearningScenario,
  updateLearningScenarioShareTokenPointsLimit,
  updateLearningScenario,
  updateLearningScenarioSchoolSharing,
  uploadAvatarPictureForLearningScenario,
} from '@shared/learning-scenarios/learning-scenario-service';
import {
  cancelCommunityTemplateRequest,
  createCommunityTemplateRequest,
  getCommunityTemplateRequestWithEvents,
  getEntitySharingState,
} from '@shared/community-templates/community-template-service';
import { requireAuth } from '@/auth/requireAuth';

export async function getCommunityTemplateRequestWithEventsAction({
  learningScenarioId,
}: {
  learningScenarioId: string;
}) {
  const { user } = await requireAuth();

  return runServerAction(
    'getCommunityTemplateRequestWithEventsAction',
    getCommunityTemplateRequestWithEvents,
  )({
    entityRef: { entityType: 'learningScenario', entityId: learningScenarioId },
    user,
  });
}

export async function createCommunityTemplateRequestAction({
  learningScenarioId,
}: {
  learningScenarioId: string;
}) {
  const { user } = await requireAuth();

  return runServerAction(
    'createCommunityTemplateRequestAction',
    createCommunityTemplateRequest,
  )({
    entityRef: { entityType: 'learningScenario', entityId: learningScenarioId },
    user,
  });
}

export async function cancelCommunityTemplateRequestAction({
  learningScenarioId,
}: {
  learningScenarioId: string;
}) {
  const { user } = await requireAuth();

  return runServerAction(
    'cancelCommunityTemplateRequestAction',
    cancelCommunityTemplateRequest,
  )({
    entityRef: { entityType: 'learningScenario', entityId: learningScenarioId },
    user,
  });
}

export async function getLearningScenarioSharingStateAction({
  learningScenarioId,
}: {
  learningScenarioId: string;
}) {
  const { user } = await requireAuth();

  return runServerAction(
    'getLearningScenarioSharingStateAction',
    getEntitySharingState,
  )({
    entityRef: { entityType: 'learningScenario', entityId: learningScenarioId },
    user,
  });
}

export async function updateLearningScenarioSchoolSharingAction({
  learningScenarioId,
  isSchoolShared,
}: {
  learningScenarioId: string;
  isSchoolShared: boolean;
}) {
  const { user } = await requireAuth();

  return runServerAction(
    'updateLearningScenarioSchoolSharingAction',
    updateLearningScenarioSchoolSharing,
  )({
    learningScenarioId,
    isSchoolShared,
    user,
  });
}

export async function updateLearningScenarioAction({
  learningScenarioId,
  data,
}: {
  learningScenarioId: string;
  data: LearningScenarioSelectModel;
}) {
  const { user } = await requireAuth();

  return runServerAction(
    'updateLearningScenarioAction',
    updateLearningScenario,
  )({
    learningScenarioId,
    user,
    data,
  });
}

export async function shareLearningScenarioAction({
  learningScenarioId,
  data,
}: {
  learningScenarioId: string;
  data: ShareWithLearnersLimitParams;
}) {
  const { user } = await requireAuth();

  return runServerAction(
    'shareLearningScenarioAction',
    shareLearningScenario,
  )({
    learningScenarioId,
    user,
    data,
  });
}

export async function unshareLearningScenarioAction({
  learningScenarioId,
}: {
  learningScenarioId: string;
}) {
  const { user } = await requireAuth();

  return runServerAction(
    'unshareLearningScenarioAction',
    unshareLearningScenario,
  )({
    learningScenarioId,
    user,
  });
}

export async function extendLearningScenarioShareExpirationAction({
  learningScenarioId,
  additionalTimeInMinutes,
}: {
  learningScenarioId: string;
  additionalTimeInMinutes: number;
}) {
  const { user } = await requireAuth();

  return runServerAction(
    'extendLearningScenarioShareExpirationAction',
    extendLearningScenarioShareExpiration,
  )({
    learningScenarioId,
    additionalTimeInMinutes,
    user,
  });
}

export async function updateLearningScenarioShareTokenPointsLimitAction({
  learningScenarioId,
  tokenPointsPercentageLimit,
}: {
  learningScenarioId: string;
  tokenPointsPercentageLimit: number;
}) {
  const { user } = await requireAuth();

  return runServerAction(
    'updateLearningScenarioShareTokenPointsLimitAction',
    updateLearningScenarioShareTokenPointsLimit,
  )({
    learningScenarioId,
    tokenPointsPercentageLimit,
    user,
  });
}

export async function getLearningScenarioShareDataAction({
  learningScenarioId,
}: {
  learningScenarioId: string;
}) {
  const { user, federalState } = await requireAuth();

  return runServerAction(
    'getLearningScenarioShareDataAction',
    getActiveLearningScenarioShareData,
  )({
    learningScenarioId,
    user,
    federalState,
  });
}

export async function removeFileFromLearningScenarioAction({
  learningScenarioId,
  fileId,
}: {
  learningScenarioId: string;
  fileId: string;
}) {
  const { user } = await requireAuth();
  return runServerAction(
    'removeFileFromLearningScenarioAction',
    removeFileFromLearningScenario,
  )({
    learningScenarioId,
    fileId,
    user,
  });
}

export async function uploadAvatarPictureForLearningScenarioAction({
  learningScenarioId,
  croppedImageBlob,
}: {
  learningScenarioId: string;
  croppedImageBlob: Blob;
}) {
  const { user } = await requireAuth();

  return runServerAction(
    'uploadAvatarPictureForLearningScenarioAction',
    uploadAvatarPictureForLearningScenario,
  )({
    learningScenarioId,
    croppedImageBlob,
    user,
  });
}
