'use client';

import DownloadConversationButton, {
  fetchConversationDownload,
  getLastAssistantModelName,
} from '@/app/(authed)/(chat-bot)/download-conversation-button';
import { UserAndContext } from '@/auth/types';
import { useToast } from '@/components/common/toast';
import {
  ApplicationHeaderActions,
  type HeaderActionConfig,
} from '@/components/layout/application-header';
import { downloadFileFromBlob } from '@/utils/files/blob-download';
import { BoxArrowDownIcon } from '@phosphor-icons/react';
import { useTranslations } from 'next-intl';
import SelectLlmModel from '../conversation/select-llm-model';
import { NewChatButton } from '../navigation/sidebar/collapsible-sidebar';
import { useLlmModels } from '../providers/llm-model-provider';
import { useConversationDownload } from './conversation-download-context';

export type ChatHeaderBarProps = {
  userAndContext: UserAndContext;
  title?: string;
  downloadConversationEnabled: boolean;
  chatId: string;
};

export function ChatHeaderBar({
  userAndContext,
  title,
  downloadConversationEnabled: downloadConversationEnabledProp,
}: ChatHeaderBarProps) {
  const tCommon = useTranslations('common');
  const toast = useToast();
  const { data } = useConversationDownload();
  const { downloadConversationEnabled: downloadConversationEnabledFromContext } = useLlmModels();
  const downloadConversationEnabled =
    (downloadConversationEnabledProp || downloadConversationEnabledFromContext) &&
    data !== undefined;

  async function handleDownload() {
    if (!downloadConversationEnabled) {
      return;
    }

    try {
      const { blob, fileName } = await fetchConversationDownload({
        messages: data.messages,
        fileMapping: data.fileMapping,
        createdAt: data.createdAt,
        conversationTitle: data.conversationTitle,
        characterName: title,
        modelName: getLastAssistantModelName(data.messages),
      });
      downloadFileFromBlob(blob, fileName);
    } catch {
      toast.error('Der Download der Konversation ist fehlgeschlagen.');
    }
  }

  const actions: HeaderActionConfig[] = [
    {
      id: 'chat-header-main-content',
      headerNode: (
        <div className="flex flex-col w-full">
          <div className="flex w-full min-w-0 sm:gap-6 justify-center sm:justify-between items-center">
            <NewChatButton />
            <SelectLlmModel isStudent={userAndContext.userRole === 'student'} />
            {title !== undefined && (
              <div className="hidden min-w-0 sm:flex">
                <span className="block w-full truncate font-normal text-xl">{title}</span>
              </div>
            )}
            <div className="hidden sm:flex">
              <DownloadConversationButton
                characterName={title}
                disabled={!downloadConversationEnabled}
                showText={false}
              />
            </div>
          </div>
          {title !== undefined && (
            <div className="flex flex-1 w-full min-w-0 pb-2 sm:hidden">
              <span className="w-full truncate text-center font-normal text-xl">{title}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'download-conversation',
      menuItem: {
        label: tCommon('conversation-download'),
        icon: <BoxArrowDownIcon />,
        disabled: !downloadConversationEnabled,
        onSelect: handleDownload,
      },
    },
  ];

  return <ApplicationHeaderActions actions={actions} />;
}
