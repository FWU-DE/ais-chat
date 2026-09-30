'use client';

import { BackButton } from '@/components/common/back-button';
import { CustomChatActionDuplicate } from '@/components/custom-chat/custom-chat-action-duplicate';
import { CustomChatActions } from '@/components/custom-chat/custom-chat-actions';
import { CustomChatLayoutContainer } from '@/components/custom-chat/custom-chat-layout-container';
import { CustomChatTitle } from '@/components/custom-chat/custom-chat-title';
import { CustomChatLastUpdate } from '@/components/custom-chat/custom-chat-last-update';
import { CustomChatAvatarImage } from '@/components/custom-chat/custom-chat-avatar-image';
import { CustomChatFieldInfo } from '@/components/custom-chat/custom-chat-field-info';
import { CustomChatFilesAndLinks } from '@/components/custom-chat/files-and-links/custom-chat-files-and-links';
import type { FileModel, LearningScenarioOptionalShareDataModel } from '@shared/db/schema';
import type { WebSource } from '@shared/db/types';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/common/toast';
import { useTranslations } from 'next-intl';
import {
  createNewLearningScenarioFromTemplateAction,
  downloadFileFromLearningScenarioAction,
} from '../actions';
import { Card, CardContent } from '@ui/components/card';
import { useLlmModels } from '@/components/providers/llm-model-provider';
import { CustomChatHeading2 } from '@/components/custom-chat/custom-chat-heading2';
import { CustomChatShareWithLearners } from '@/components/custom-chat/share-with-learners/custom-chat-share-with-learners';
import {
  extendLearningScenarioShareExpirationAction,
  getLearningScenarioShareDataAction,
  shareLearningScenarioAction,
  unshareLearningScenarioAction,
  updateLearningScenarioShareTokenPointsLimitAction,
} from '../editor/[learningScenarioId]/actions';
import { CustomChatCreateSuspensionRequestButton } from '@/components/custom-chat/custom-chat-create-suspension-request-button';
import { CustomChatAuthorInfo } from '@/components/custom-chat/custom-chat-author-info';
import { CustomChatActionUse } from '@/components/custom-chat/custom-chat-action-use';
import { FilterDisplaySection } from '@/components/custom-chat/filter/custom-chat-filter-display-section';
import { extractFilterValues } from '@/components/custom-chat/filter/custom-chat-filter-utils';
import { FieldGroup } from '@ui/components/field';
import { CustomChatWebSearchView } from '@/components/custom-chat/web-search/custom-chat-web-search-view';

export function LearningScenarioView({
  learningScenario,
  fileMappings,
  pictureUrl,
  initialLinks,
  usedBudget,
  maxBudget,
  budgetUsedBySharedChat,
  isWebSearchAvailable,
}: {
  learningScenario: LearningScenarioOptionalShareDataModel;
  fileMappings: FileModel[];
  pictureUrl: string | undefined;
  initialLinks: WebSource[];
  usedBudget: number;
  maxBudget: number;
  budgetUsedBySharedChat: number;
  isWebSearchAvailable: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations('learning-scenarios');
  const tToast = useTranslations('learning-scenarios.toasts');
  const { models } = useLlmModels();
  const filterValues = extractFilterValues(learningScenario);

  const modelDisplayName = models.find((m) => m.id === learningScenario.modelId)?.displayName;

  const handleUseChat = () => {
    router.push(`/learning-scenarios/d/${learningScenario.id}`);
  };

  const handleDuplicateLearningScenario = async () => {
    const createResult = await createNewLearningScenarioFromTemplateAction({
      templateId: learningScenario.id,
      duplicateLearningScenarioName: t('duplicate-name-format-string', {
        sourceName: learningScenario.name,
      }),
    });
    if (createResult.success) {
      router.push(`/learning-scenarios/editor/${createResult.value.id}`);
    } else {
      toast.error(tToast('create-toast-error'));
    }
  };

  const handleShareLearningScenario = async (
    data: Parameters<typeof shareLearningScenarioAction>[0]['data'],
  ) => {
    return shareLearningScenarioAction({
      learningScenarioId: learningScenario.id,
      data,
    });
  };

  const handleUnshareLearningScenario = async () => {
    return unshareLearningScenarioAction({
      learningScenarioId: learningScenario.id,
    });
  };

  const handleAddTimeToLearningScenario = async ({
    additionalTimeInMinutes,
  }: {
    additionalTimeInMinutes: number;
  }) => {
    const result = await extendLearningScenarioShareExpirationAction({
      learningScenarioId: learningScenario.id,
      additionalTimeInMinutes,
    });
    if (result.success) {
      return { success: true, expiredAt: result.value.expiredAt };
    }
    return { success: false };
  };

  const handleAdjustTokenLimitForLearningScenario = async ({
    tokenPointsPercentageLimit,
  }: {
    tokenPointsPercentageLimit: number;
  }) => {
    const result = await updateLearningScenarioShareTokenPointsLimitAction({
      learningScenarioId: learningScenario.id,
      tokenPointsPercentageLimit,
    });
    if (result.success) {
      return { success: true, tokenPointsLimit: result.value.tokenPointsLimit };
    }
    return { success: false };
  };

  async function handleDownloadFile(fileId: string) {
    return downloadFileFromLearningScenarioAction({
      learningScenarioId: learningScenario.id,
      fileId,
    });
  }

  return (
    <CustomChatLayoutContainer>
      <BackButton
        href="/learning-scenarios"
        text={t('back-button')}
        aria-label={t('back-button-aria-label')}
      />
      <CustomChatTitle title={learningScenario.name} />
      <CustomChatActions>
        <CustomChatActionUse onClick={handleUseChat} />
        <CustomChatActionDuplicate onClick={handleDuplicateLearningScenario} />
        <CustomChatLastUpdate date={learningScenario.updatedAt} />
      </CustomChatActions>

      <CustomChatShareWithLearners
        expiredAt={learningScenario.expiredAt}
        manuallyStoppedAt={learningScenario.manuallyStoppedAt}
        maxUsageTimeLimit={learningScenario.maxUsageTimeLimit}
        tokenPointsLimit={learningScenario.tokenPointsLimit}
        usedBudget={usedBudget}
        maxBudget={maxBudget}
        budgetUsedBySharedChat={budgetUsedBySharedChat}
        onShare={handleShareLearningScenario}
        onUnshare={handleUnshareLearningScenario}
        onAddTime={handleAddTimeToLearningScenario}
        onAdjustTokenLimit={handleAdjustTokenLimitForLearningScenario}
        onPollShareData={() =>
          getLearningScenarioShareDataAction({
            learningScenarioId: learningScenario.id,
          })
        }
        shareUILink={`/learning-scenarios/editor/${learningScenario.id}/share`}
        sharingDisabled={!learningScenario.name || learningScenario.name.trim().length === 0}
      />

      <div className="flex flex-col gap-3">
        <CustomChatHeading2 text={t('configuration-heading')} />

        <Card>
          <CardContent className="flex justify-center items-center">
            <CustomChatAvatarImage pictureUrl={pictureUrl} />
          </CardContent>
        </Card>

        {learningScenario.isGlobal && (
          <CustomChatAuthorInfo
            authorLabel={t('author-label')}
            authorText={learningScenario.author !== '' ? learningScenario.author : t('author-text')}
          />
        )}

        <Card>
          <CardContent>
            <FieldGroup>
              <CustomChatFieldInfo label={t('name-label')} value={learningScenario.name} />
              <CustomChatFieldInfo
                label={t('description-label')}
                value={learningScenario.description}
              />
              {modelDisplayName && (
                <CustomChatFieldInfo label={t('form.model-label')} value={modelDisplayName} />
              )}
              <CustomChatFieldInfo
                label={t('instructions-label')}
                value={learningScenario.additionalInstructions}
              />
              <CustomChatFieldInfo
                label={t('student-exercise-label')}
                value={learningScenario.studentExercise}
              />
              <FilterDisplaySection values={filterValues} />
            </FieldGroup>
          </CardContent>
        </Card>
      </div>
      <CustomChatFilesAndLinks
        initialFiles={fileMappings}
        initialLinks={initialLinks}
        onDownloadFile={handleDownloadFile}
      />
      {isWebSearchAvailable && <CustomChatWebSearchView {...learningScenario} />}

      {(learningScenario.hasLinkAccess || learningScenario.isCommunityShared) && (
        <CustomChatCreateSuspensionRequestButton
          entityRef={{ entityType: 'learningScenario', entityId: learningScenario.id }}
        />
      )}
    </CustomChatLayoutContainer>
  );
}
