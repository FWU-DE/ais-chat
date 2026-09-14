'use client';

import { useMainChat, type ChatMessage } from '@/hooks/use-chat-hooks';
import React, { ReactNode, SyntheticEvent, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useLlmModels } from '../providers/llm-model-provider';
import { type CharacterSelectModel, type AssistantSelectModel, FileModel } from '@shared/db/schema';
import { type LearningScenarioSelectModel } from '@shared/db/schema';
import PromptSuggestions from './prompt-suggestions';
import MarkdownDisplay from './markdown-display';
import { navigateWithoutRefresh } from '@/utils/navigation/router';
import { useQueryClient } from '@tanstack/react-query';
import RobotIcon from '../icons/robot';
import { LocalFileState } from './send-message-form';
import { deepCopy } from '@/utils/object';
import { getFileExtension, isImageFile } from '@/utils/files/generic';
import { refetchFileMapping } from '@/app/(authed)/(chat-bot)/actions';
import { InitialChatContentDisplay } from './initial-content-display';
import { HELP_MODE_ASSISTANT_ID } from '@shared/db/const';
import { ChatInputBox } from './chat-input-box';
import { ErrorChatPlaceholder } from './error-chat-placeholder';
import { logError, logDebug, logWarning } from '@shared/logging';
import { useSession } from 'next-auth/react';
import { AssistantIcon } from './assistant-icon';
import { useAutoScroll } from '@/hooks/use-auto-scroll';
import { getConversationPath } from '@/utils/chat/path';
import { Messages, type PendingFileModel } from './messages';
import { WebSource } from '@shared/db/types';
import { FloatingText } from './floating-text';
import { getErrorMessageByType } from '@/error/get-error-message-by-type';

type ChatProps = {
  id: string;
  initialMessages: ChatMessage[];
  assistant?: AssistantSelectModel;
  character?: CharacterSelectModel;
  learningScenario?: LearningScenarioSelectModel;
  imageSource?: string;
  promptSuggestions?: string[];
  initialFileMapping?: Map<string, FileModel[]>;
  enableFileUpload: boolean;
  webSourceMapping?: Map<string, WebSource[]>;
  logoElement: ReactNode;
};

export default function Chat({
  id,
  initialMessages,
  assistant,
  character,
  learningScenario,
  imageSource,
  promptSuggestions = [],
  initialFileMapping,
  enableFileUpload,
  webSourceMapping,
  logoElement,
}: ChatProps) {
  const tHelpMode = useTranslations('help-mode');
  const tCommon = useTranslations('common');
  const tLearningScenarioShared = useTranslations('learning-scenarios.shared');

  const { selectedModel, setDownloadConversationEnabled } = useLlmModels();
  const conversationPath = getConversationPath({
    customGptId: assistant?.id,
    characterId: character?.id,
    learningScenarioId: learningScenario?.id,
    conversationId: id,
  });
  const [fileMapping, setFileMapping] = useState<Map<string, FileModel[]>>(
    initialFileMapping ?? new Map(),
  );
  // pendingFileMapping stores files for messages that haven't been persisted to DB yet
  // This allows immediate display of attachments while the server processes the message
  const [pendingFileMapping, setPendingFileMapping] = useState<Map<string, PendingFileModel[]>>(
    new Map(),
  );
  const pendingFileMappingRef = React.useRef(pendingFileMapping);
  const [files, setFiles] = useState<Map<string, LocalFileState>>(new Map());
  const [countOfFilesInChat, setCountOfFilesInChat] = useState(0);
  const queryClient = useQueryClient();
  const session = useSession();

  function refetchConversations() {
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }

  // Ref to hold pending files that will be associated with the next user message
  const pendingFilesRef = React.useRef<PendingFileModel[]>([]);

  // Tracks whether this is the first user message in the conversation (used to trigger
  // URL update and sidebar refetch). For character chats with an initial assistant message,
  // we check for the absence of any user messages rather than checking messages.length === 0.
  const isFirstMessageRef = React.useRef(false);

  const {
    messages,
    uiMessages,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    reload,
    stop,
    status,
    error,
  } = useMainChat({
    conversationId: id,
    initialMessages: initialMessages,
    modelId: selectedModel?.id,
    characterId: character?.id,
    learningScenarioId: learningScenario?.id,
    assistantId: assistant?.id,
    onMessageCreated: (messageId) => {
      // Associate pending files with the message ID immediately when the message is created
      const filesToAssociate = pendingFilesRef.current;
      if (filesToAssociate.length > 0) {
        setPendingFileMapping((prev) => {
          const newMap = new Map(prev);
          newMap.set(messageId, filesToAssociate);
          return newMap;
        });
        pendingFilesRef.current = [];
      }
    },
    onFinish: (message) => {
      logDebug(`onFinish called with message ${JSON.stringify(message)}`);
      // Trigger refetch of the fileMapping from the DB
      setCountOfFilesInChat((prev) => prev + 1);

      // After the first message exchange: update the sidebar so it shows the generated title
      if (isFirstMessageRef.current) {
        isFirstMessageRef.current = false;
        refetchConversations();
        return;
      }

      if (messages.length > 1) {
        return;
      }
      logWarning('Assert: onFinish was called with zero assistant messages.');
      refetchConversations();
    },
    onError: () => {
      refetchConversations();
    },
  });

  const { scrollRef, reactivateAutoScrolling } = useAutoScroll([messages, status]);
  const containerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Skip fetching file mappings if the conversation doesn't exist yet (no messages sent)
    if (messages.length === 0) {
      return;
    }

    const fetchData = async () => {
      const result = await refetchFileMapping(id);
      if (!result.success) return;
      setFileMapping(result.value);
    };
    void fetchData();
  }, [countOfFilesInChat, id, messages.length]);

  useEffect(() => {
    pendingFileMappingRef.current = pendingFileMapping;
  }, [pendingFileMapping]);

  // Blob URLs stay usable for the whole session, so they are kept once the files are persisted
  // and only revoked on unmount.
  useEffect(
    () => () => {
      for (const files of pendingFileMappingRef.current.values()) {
        for (const file of files) {
          if (file.localUrl !== undefined) {
            URL.revokeObjectURL(file.localUrl);
          }
        }
      }
    },
    [],
  );

  async function customHandleSubmit(e: SyntheticEvent) {
    e.preventDefault();

    try {
      reactivateAutoScrolling();

      // Trigger refetch of the fileMapping from the DB
      setCountOfFilesInChat((prev) => prev + 1);

      // If this is the first user message, update the URL and sidebar.
      // Check for user messages specifically, since character chats may have an
      // initial assistant message before any user message is sent.
      if (!messages.some((m) => m.role === 'user')) {
        navigateWithoutRefresh(conversationPath);
        isFirstMessageRef.current = true;
        setDownloadConversationEnabled(true);
        refetchConversations();
      }

      // Set pending files BEFORE handleSubmit so they can be associated with the message ID
      // when onMessageCreated is called
      const currentFiles = Array.from(files);
      pendingFilesRef.current = currentFiles.map(([, file]) => ({
        id: file.fileId ?? '',
        name: file.file.name,
        type: getFileExtension(file.file.name),
        createdAt: new Date(),
        size: file.file.size,
        metadata: null,
        userId: null,
        // Create a blob URL for images so they display immediately without fetching from S3
        localUrl: isImageFile(file.file.name) ? URL.createObjectURL(file.file) : undefined,
      }));

      // Capture fileIds before clearing the files state
      const fileIds = currentFiles.map(([, file]) => file.fileId).filter(Boolean) as string[];

      // Clear files immediately so UI updates
      setFiles(new Map());

      await handleSubmit(e, { fileIds });
    } catch (error) {
      logError('Error in handleSubmitWithFiles', error);
    }
  }

  function handleReload() {
    void reload();
  }

  function formatSupportAdressesToString(arr: string[]): string {
    if (arr.length === 0) return '';
    if (arr.length === 1) return arr[0]!;

    const allButLast = arr.slice(0, -1).join(', ');
    const last = arr[arr.length - 1];
    return `${allButLast} ${tHelpMode('support-addresses-concat')} ${last}`;
  }
  const formatedSubHeading = tHelpMode('chat-subheading', {
    FAQ_LINK: tHelpMode('faq-link'),
    SUPPORT_ADRESSES: formatSupportAdressesToString(
      session.data?.user?.federalState?.supportContacts ?? [],
    ),
  });

  function handleDeattachFile(localFileId: string) {
    setFiles((prev) => {
      const newMap = deepCopy(prev);
      const deleted = newMap.delete(localFileId);
      if (!deleted) {
        logWarning('Could not delete file', { localFileId });
      }
      return newMap;
    });
  }

  let placeholderElement: ReactNode;

  if (character !== undefined) {
    placeholderElement = (
      <InitialChatContentDisplay
        title={character.name}
        imageSource={imageSource}
        description={character.description}
      />
    );
  } else if (learningScenario !== undefined) {
    placeholderElement = (
      <InitialChatContentDisplay
        title={learningScenario.name}
        imageSource={imageSource}
        description={learningScenario.description}
      />
    );
  } else if (assistant !== undefined && assistant.id === HELP_MODE_ASSISTANT_ID) {
    placeholderElement = (
      <div className="flex flex-col items-center justify-center gap-6 h-full p-4">
        <div className="pb-4">
          <RobotIcon className="w-14 h-14 text-primary" />
        </div>
        <div className="flex flex-col items-center justify-center gap-4">
          <span className="text-3xl font-medium text-center">{tHelpMode('chat-heading')}</span>
          <span className="text-base font-normal text-center max-w-2xl">
            <MarkdownDisplay>{formatedSubHeading}</MarkdownDisplay>
          </span>
        </div>
        <span className="text-base font-normal">{tHelpMode('chat-placeholder')}</span>
      </div>
    );
  } else if (assistant !== undefined) {
    placeholderElement = (
      <InitialChatContentDisplay
        title={assistant.name}
        imageSource={imageSource}
        description={assistant.description ?? undefined}
      />
    );
  } else {
    placeholderElement = (
      <div className="flex items-center justify-center h-full">{logoElement}</div>
    );
  }

  const assistantIcon = AssistantIcon({
    customGptId: assistant?.id,
    imageName: character?.name ?? learningScenario?.name ?? assistant?.name,
    imageSource,
  });

  const isLoading = status === 'submitted';

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <div
        ref={containerRef}
        className="relative flex flex-col grow justify-between w-full overflow-hidden"
      >
        <div ref={scrollRef} className="grow overflow-y-auto">
          {learningScenario !== undefined && learningScenario.studentExercise.trim() !== '' && (
            <FloatingText
              learningContext={learningScenario.studentExercise}
              dialogStarted={true}
              title={tLearningScenarioShared('exercise-title')}
              maxWidth={600}
              maxHeight={600}
              minMargin={16}
            />
          )}
          {messages.length === 0 ? (
            placeholderElement
          ) : (
            <Messages
              messages={uiMessages}
              isLoading={isLoading}
              status={status}
              reload={reload}
              conversationId={id}
              assistantIcon={assistantIcon}
              containerClassName="flex flex-col gap-2 mx-auto p-4"
              fileMapping={fileMapping}
              pendingFileMapping={pendingFileMapping}
              webSourceMapping={webSourceMapping}
              showWebSourcesInDialog={character !== undefined}
            />
          )}
          {error && (
            <ErrorChatPlaceholder
              errorMessage={tCommon(getErrorMessageByType(error))}
              handleReload={handleReload}
            />
          )}
        </div>
        <div className="w-full pb-4 px-4 mx-auto">
          <div className="relative flex flex-col">
            {input.length === 0 && messages.length === 0 && (
              <PromptSuggestions
                suggestions={promptSuggestions}
                onSelectSuggestion={(suggestion) => setInput(suggestion)}
              />
            )}
            <ChatInputBox
              files={files}
              setFiles={setFiles}
              customHandleSubmit={customHandleSubmit}
              handleStopGeneration={stop}
              enableFileUpload={enableFileUpload}
              handleDeattachFile={handleDeattachFile}
              handleInputChange={handleInputChange}
              input={input}
              isLoading={isLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
