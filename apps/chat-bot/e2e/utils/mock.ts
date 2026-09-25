import { UserAndContext } from '@/auth/types';
import { generateRandomString } from './random';
import { generateUUID } from '@shared/utils/uuid';
import { E2E_FEDERAL_STATE } from './const';
import {
  CharacterSelectModel,
  ConversationUsageTrackingSelectModel,
  LearningScenarioSelectModel,
  LlmModelSelectModel,
  SharedCharacterChatUsageTrackingSelectModel,
  SharedLearningScenarioUsageTrackingSelectModel,
} from '@shared/db/schema';

export const mockUserAndContext = (): UserAndContext => {
  const schoolId = generateUUID();
  const federalStateId = E2E_FEDERAL_STATE;

  return {
    id: generateUUID(),
    lastUsedModel: null,
    versionAcceptedConditions: null,
    schoolIds: [schoolId],
    federalStateId: E2E_FEDERAL_STATE,
    userRole: 'teacher',
    federalState: {
      id: federalStateId,
      teacherPriceLimit: 500,
      createdAt: new Date(),
      studentPriceLimit: 0,
      mandatoryCertificationTeacher: null,
      chatStorageTime: 0,
      supportContacts: null,
      trainingLink: null,
      designConfiguration: null,
      appName: null,
      featureToggles: {
        isStudentAccessEnabled: false,
        isCharacterEnabled: false,
        isCustomGptEnabled: false,
        isSharedChatEnabled: false,
        isShareTemplateWithSchoolEnabled: false,
      },
      pictureUrls: null,
      hasApiKeyAssigned: true,
    },
    createdAt: new Date(),
  };
};

export const mockLlmModel = (): LlmModelSelectModel => {
  return {
    id: generateUUID(),
    name: generateRandomString(10),
    createdAt: new Date(),
    provider: generateRandomString(10),
    displayName: generateRandomString(10),
    description: generateRandomString(10),
    priceMetadata: {
      type: 'text',
      completionTokenPrice: 0,
      promptTokenPrice: 0,
    },
    supportedImageFormats: null,
    imageGenerationConfig: null,
    isNew: false,
    isDeleted: false,
  };
};

export const mockConversationUsage = (): ConversationUsageTrackingSelectModel => {
  return {
    id: generateUUID(),
    userId: generateUUID(),
    modelId: generateUUID(),
    toolCallName: null,
    conversationId: generateUUID(),
    completionTokens: 0,
    promptTokens: 0,
    costsInCent: 0,
    createdAt: new Date(),
  };
};

export const mockLearningScenario = (): LearningScenarioSelectModel => {
  return {
    id: generateUUID(),
    author: '',
    name: generateRandomString(10),
    createdAt: new Date(),
    updatedAt: new Date(),
    description: generateRandomString(10),
    modelId: generateUUID(),
    userId: generateUUID(),
    studentExercise: generateRandomString(10),
    attachedLinks: [],
    filterGroup: {
      school_types: [],
      grade_ranges: [],
      subjects: [],
      categories: [],
      federal_states: [],
      languages: [],
    },
    additionalInstructions: null,
    restrictions: null,
    pictureId: null,
    accessLevel: 'private',
    originalLearningScenarioId: null,
    isDeleted: false,
    suspended: false,
    hasLinkAccess: false,
    isWebSearchEnabled: false,
    webSearchScope: 'all-web',
    webSearchIncludedDomains: [],
    ownerSchoolIds: [generateUUID()],
  };
};

export const mockSharedSchoolConversationUsage =
  (): SharedLearningScenarioUsageTrackingSelectModel => {
    return {
      id: generateUUID(),
      userId: generateUUID(),
      modelId: generateUUID(),
      toolCallName: null,
      learningScenarioId: generateUUID(),
      completionTokens: 0,
      promptTokens: 0,
      costsInCent: 0,
      createdAt: new Date(),
    };
  };

export const mockSharedCharacterChatUsage = (): SharedCharacterChatUsageTrackingSelectModel => {
  return {
    id: generateUUID(),
    userId: generateUUID(),
    modelId: generateUUID(),
    toolCallName: null,
    characterId: generateUUID(),
    completionTokens: 0,
    promptTokens: 0,
    costsInCent: 0,
    createdAt: new Date(),
  };
};

export const mockCharacter = (): CharacterSelectModel => {
  return {
    id: generateUUID(),
    author: '',
    userId: generateUUID(),
    modelId: generateUUID(),
    name: generateRandomString(10),
    description: generateRandomString(10),
    instructions: generateRandomString(10),
    learningContext: generateRandomString(10),
    competence: generateRandomString(10),
    filterGroup: {
      school_types: [],
      grade_ranges: [],
      subjects: [],
      categories: [],
      federal_states: [],
      languages: [],
    },
    specifications: generateRandomString(10),
    restrictions: generateRandomString(10),
    pictureId: generateUUID(),
    initialMessage: generateRandomString(10),
    accessLevel: 'private',
    createdAt: new Date(),
    updatedAt: new Date(),
    attachedLinks: [],
    originalCharacterId: null,
    isDeleted: false,
    suspended: false,
    hasLinkAccess: false,
    isWebSearchEnabled: false,
    webSearchScope: 'all-web',
    webSearchIncludedDomains: [],
    ownerSchoolIds: [generateUUID()],
  };
};
