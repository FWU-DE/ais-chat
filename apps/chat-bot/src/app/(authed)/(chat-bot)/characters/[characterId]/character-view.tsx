'use client';

import { CharacterOptionalShareDataModel, FileModel } from '@shared/db/schema';
import { WebSource } from '@shared/db/types';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { useLlmModels } from '@/components/providers/llm-model-provider';
import { BackButton } from '@/components/common/back-button';
import { CustomChatLayoutContainer } from '@/components/custom-chat/custom-chat-layout-container';
import { CustomChatTitle } from '@/components/custom-chat/custom-chat-title';
import { CustomChatActions } from '@/components/custom-chat/custom-chat-actions';
import { CustomChatActionUse } from '@/components/custom-chat/custom-chat-action-use';
import { CustomChatHeading2 } from '@/components/custom-chat/custom-chat-heading2';
import { CustomChatLastUpdate } from '@/components/custom-chat/custom-chat-last-update';
import { CustomChatFieldInfo } from '@/components/custom-chat/custom-chat-field-info';
import { CustomChatAvatarImage } from '@/components/custom-chat/custom-chat-avatar-image';
import { CustomChatFilesAndLinks } from '@/components/custom-chat/files-and-links/custom-chat-files-and-links';
import { Card, CardContent } from '@ui/components/card';
import { FieldGroup } from '@ui/components/field';
import { useToast } from '@/components/common/toast';
import { createNewCharacterAction } from '../actions';
import {
  downloadFileFromCharacterAction,
  extendCharacterShareExpirationAction,
  getCharacterShareDataAction,
  shareCharacterAction,
  unshareCharacterAction,
  updateCharacterShareTokenPointsLimitAction,
} from '../editor/[characterId]/actions';
import { CustomChatActionDuplicate } from '@/components/custom-chat/custom-chat-action-duplicate';
import { CustomChatShareWithLearners } from '@/components/custom-chat/share-with-learners/custom-chat-share-with-learners';
import { CustomChatCreateSuspensionRequestButton } from '@/components/custom-chat/custom-chat-create-suspension-request-button';
import { CustomChatAuthorInfo } from '@/components/custom-chat/custom-chat-author-info';
import { FilterDisplaySection } from '@/components/custom-chat/filter/custom-chat-filter-display-section';
import { extractFilterValues } from '@/components/custom-chat/filter/custom-chat-filter-utils';
import { CustomChatWebSearchView } from '@/components/custom-chat/web-search/custom-chat-web-search-view';

export function CharacterView({
  character,
  relatedFiles,
  initialLinks,
  avatarPictureUrl,
  usedBudget,
  maxBudget,
  budgetUsedBySharedChat,
  isWebSearchAvailable,
}: {
  character: CharacterOptionalShareDataModel;
  relatedFiles: FileModel[];
  initialLinks: WebSource[];
  avatarPictureUrl?: string;
  usedBudget: number;
  maxBudget: number;
  budgetUsedBySharedChat: number;
  isWebSearchAvailable: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations('characters');
  const tChat = useTranslations('custom-chat');
  const { models, defaultModel } = useLlmModels();
  const maybeDefaultModelId = defaultModel?.id;
  const isModelAvailable = character.modelId && models.some((m) => m.id === character.modelId);
  const selectedModelId = isModelAvailable ? character.modelId : maybeDefaultModelId;
  const selectedModel = models.find((m) => m.id === selectedModelId);
  const filterValues = extractFilterValues(character);

  const handleUseChat = () => {
    router.push(`/characters/d/${character.id}`);
  };

  const handleDuplicateCharacter = async () => {
    const createResult = await createNewCharacterAction({
      templateId: character.id,
      duplicateCharacterName: t('duplicate-name-format-string', {
        sourceName: character.name,
      }),
    });
    if (createResult.success) {
      router.push(`/characters/editor/${createResult.value.id}?create=true`);
    } else {
      toast.error(t('toasts.create-toast-error'));
    }
  };

  const handleDownloadFile = (fileId: string) =>
    downloadFileFromCharacterAction({ characterId: character.id, fileId });

  return (
    <CustomChatLayoutContainer>
      <BackButton
        href="/characters"
        text={t('back-button')}
        aria-label={t('back-button-aria-label')}
      />
      <CustomChatTitle title={character.name} />
      <CustomChatActions>
        <CustomChatActionUse onClick={handleUseChat} />
        <CustomChatActionDuplicate onClick={handleDuplicateCharacter} />
        <CustomChatLastUpdate date={character.updatedAt} />
      </CustomChatActions>

      <CustomChatShareWithLearners
        expiredAt={character.expiredAt}
        manuallyStoppedAt={character.manuallyStoppedAt}
        maxUsageTimeLimit={character.maxUsageTimeLimit}
        tokenPointsLimit={character.tokenPointsLimit}
        usedBudget={usedBudget}
        budgetUsedBySharedChat={budgetUsedBySharedChat}
        maxBudget={maxBudget}
        onShare={(data) =>
          shareCharacterAction({
            id: character.id,
            tokenPointsPercentageLimit: data.tokenPointsPercentageLimit,
            usageTimeLimit: data.usageTimeLimit,
          })
        }
        onUnshare={() =>
          unshareCharacterAction({
            characterId: character.id,
          })
        }
        onAddTime={async (data) => {
          const result = await extendCharacterShareExpirationAction({
            characterId: character.id,
            additionalTimeInMinutes: data.additionalTimeInMinutes,
          });
          if (result.success) {
            return { success: true, expiredAt: result.value.expiredAt };
          }
          return { success: false };
        }}
        onAdjustTokenLimit={async (data) => {
          const result = await updateCharacterShareTokenPointsLimitAction({
            characterId: character.id,
            tokenPointsPercentageLimit: data.tokenPointsPercentageLimit,
          });
          if (result.success) {
            return { success: true, tokenPointsLimit: result.value.tokenPointsLimit };
          }
          return { success: false };
        }}
        onPollShareData={() =>
          getCharacterShareDataAction({
            characterId: character.id,
          })
        }
        shareUILink={`/characters/editor/${character.id}/share`}
      />

      <div className="flex flex-col gap-3">
        <CustomChatHeading2 text={t('configuration-heading')} />

        <Card className="justify-center items-center">
          <CardContent className="flex items-center justify-center">
            <CustomChatAvatarImage pictureUrl={avatarPictureUrl} />
          </CardContent>
        </Card>

        {character.isGlobal && (
          <CustomChatAuthorInfo
            authorLabel={t('author-label')}
            authorText={character.author !== '' ? character.author : t('author-text')}
          />
        )}

        <Card>
          <CardContent>
            <FieldGroup>
              <CustomChatFieldInfo label={t('name-label')} value={character.name} />
              <CustomChatFieldInfo label={t('description-label')} value={character.description} />
              {selectedModel && (
                <CustomChatFieldInfo
                  label={tChat('model.label')}
                  value={selectedModel.displayName}
                />
              )}
              <CustomChatFieldInfo label={t('instructions-label')} value={character.instructions} />
              <CustomChatFieldInfo
                label={t('initial-message-label')}
                value={character.initialMessage}
              />
              <FilterDisplaySection values={filterValues} />
            </FieldGroup>
          </CardContent>
        </Card>

        <CustomChatFilesAndLinks
          initialFiles={relatedFiles}
          initialLinks={initialLinks}
          onDownloadFile={handleDownloadFile}
        />
      </div>
      {isWebSearchAvailable && <CustomChatWebSearchView {...character} />}

      {(character.hasLinkAccess || character.isCommunityShared) && (
        <CustomChatCreateSuspensionRequestButton
          entityRef={{ entityType: 'character', entityId: character.id }}
        />
      )}
    </CustomChatLayoutContainer>
  );
}
