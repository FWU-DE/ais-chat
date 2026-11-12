'use client';

import { AssistantSelectModel, FileModel } from '@shared/db/schema';
import { Card, CardContent } from '@ui/components/card';
import { FieldGroup } from '@ui/components/field';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { BackButton } from '@/components/common/back-button';
import { useToast } from '@/components/common/toast';
import { CustomChatActionDuplicate } from '@/components/custom-chat/custom-chat-action-duplicate';
import { CustomChatActionFavorite } from '@/components/custom-chat/custom-chat-action-favorite';
import { CustomChatActionUse } from '@/components/custom-chat/custom-chat-action-use';
import { CustomChatActions } from '@/components/custom-chat/custom-chat-actions';
import { CustomChatAuthorInfo } from '@/components/custom-chat/custom-chat-author-info';
import { CustomChatAvatarImage } from '@/components/custom-chat/custom-chat-avatar-image';
import { CustomChatCreateSuspensionRequestButton } from '@/components/custom-chat/custom-chat-create-suspension-request-button';
import { CustomChatFieldInfo } from '@/components/custom-chat/custom-chat-field-info';
import { CustomChatLastUpdate } from '@/components/custom-chat/custom-chat-last-update';
import { CustomChatLayoutContainer } from '@/components/custom-chat/custom-chat-layout-container';
import { CustomChatTitle } from '@/components/custom-chat/custom-chat-title';
import { CustomChatDidacticCommentaryView } from '@/components/custom-chat/didactic-commentary/custom-chat-didactic-commentary-view';
import { CustomChatFilesAndLinks } from '@/components/custom-chat/files-and-links/custom-chat-files-and-links';
import { FilterDisplaySection } from '@/components/custom-chat/filter/custom-chat-filter-display-section';
import { extractFilterValues } from '@/components/custom-chat/filter/custom-chat-filter-utils';
import { CustomChatLicenseInformationView } from '@/components/custom-chat/license-information/custom-chat-license-information-view';
import { CustomChatSpeechView } from '@/components/custom-chat/speech/custom-chat-speech-view';
import { CustomChatWebSearchView } from '@/components/custom-chat/web-search/custom-chat-web-search-view';

import { createNewAssistantAction, downloadFileFromAssistantAction } from '../actions';

export function AssistantView({
  assistant,
  fileMappings,
  pictureUrl,
  isWebSearchAvailable,
  isSpeechAvailable,
  initialIsFavorite,
}: {
  assistant: AssistantSelectModel;
  fileMappings: FileModel[];
  pictureUrl: string | undefined;
  isWebSearchAvailable: boolean;
  isSpeechAvailable: boolean;
  initialIsFavorite: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const t = useTranslations('assistants');
  const tChat = useTranslations('custom-chat');
  const filterValues = extractFilterValues(assistant);

  const handleDuplicateAssistant = async () => {
    const createResult = await createNewAssistantAction({
      templateId: assistant.id,
      duplicateAssistantName: t('duplicate-name-format-string', {
        sourceName: assistant.name,
      }),
    });
    if (createResult.success) {
      router.push(`/assistants/editor/${createResult.value.id}`);
    } else {
      toast.error(t('toasts.create-toast-error'));
    }
  };

  async function handleDownloadFile(fileId: string) {
    return downloadFileFromAssistantAction({ assistantId: assistant.id, fileId });
  }

  return (
    <CustomChatLayoutContainer>
      <BackButton
        href="/custom"
        text={t('back-button-text')}
        aria-label={t('back-button-aria')}
        onClick={() => {
          router.push('/assistants');
        }}
      />
      <CustomChatTitle title={assistant.name} />
      <CustomChatActions>
        <CustomChatActionUse
          onClick={() => {
            router.push(`/assistants/d/${assistant.id}/`);
          }}
        />
        <CustomChatActionDuplicate onClick={handleDuplicateAssistant} />
        <CustomChatActionFavorite
          entityRef={{ entityType: 'assistant', entityId: assistant.id }}
          initialIsFavorite={initialIsFavorite}
        />
        <CustomChatLastUpdate date={assistant.updatedAt} />
      </CustomChatActions>
      <Card>
        <CardContent className="flex justify-center items-center">
          <CustomChatAvatarImage pictureUrl={pictureUrl} />
        </CardContent>
      </Card>

      {assistant.isGlobal && (
        <CustomChatAuthorInfo
          authorLabel={t('author-label')}
          authorText={assistant.author !== '' ? assistant.author : t('author-text')}
        />
      )}

      <Card>
        <CardContent>
          <FieldGroup>
            <CustomChatFieldInfo label={t('name-label')} value={assistant.name} />
            <CustomChatFieldInfo label={t('description-label')} value={assistant.description} />
            <CustomChatDidacticCommentaryView
              didacticCommentary={assistant.didacticCommentary}
              tooltip={tChat('didactic-commentary.heading-tooltip-assistant')}
            />
            <CustomChatFieldInfo label={t('instructions-label')} value={assistant.instructions} />
            {assistant.promptSuggestions.map((suggestion, index) => (
              <CustomChatFieldInfo
                key={index}
                label={`Promptvorschlag ${index + 1}`}
                value={suggestion}
              />
            ))}
            <FilterDisplaySection values={filterValues} />
            <CustomChatLicenseInformationView licenseInformation={assistant.licenseInformation} />
          </FieldGroup>
        </CardContent>
      </Card>
      <CustomChatFilesAndLinks
        initialFiles={fileMappings}
        initialLinks={assistant.attachedLinks.map((l) => ({ link: l }))}
        onDownloadFile={handleDownloadFile}
      />
      {isWebSearchAvailable && <CustomChatWebSearchView {...assistant} />}
      {isSpeechAvailable && <CustomChatSpeechView {...assistant} />}

      {(assistant.hasLinkAccess || assistant.isCommunityShared) && (
        <CustomChatCreateSuspensionRequestButton
          entityRef={{ entityType: 'assistant', entityId: assistant.id }}
        />
      )}
    </CustomChatLayoutContainer>
  );
}
