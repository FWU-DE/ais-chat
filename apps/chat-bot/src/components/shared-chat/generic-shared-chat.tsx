'use client';

import { SharedChatExpiredError, TokenPointsExceededError } from '@ais-chat/ai-core/errors';
import { logError } from '@shared/logging';
import {
  calculateShareSessionState,
  ShareSessionState,
} from '@shared/sharing/calculate-share-session-state';
import { useTranslations } from 'next-intl';
import { ReactNode, RefObject, SyntheticEvent, useEffect, useRef, useState } from 'react';

import { loadSharedChatConversationMessagesAction } from '@/app/api/shared-chat/actions';
import { ChatInputBox } from '@/components/chat/chat-input-box';
import type { ConversationDownloadFile } from '@/components/chat/conversation-download-context';
import { InitialChatContentDisplay } from '@/components/chat/initial-content-display';
import { SharedChatHeader } from '@/components/chat/shared-header-bar';
import ExpiredChatModal from '@/components/common/expired-chat-modal';
import { getErrorMessageByType } from '@/error/get-error-message-by-type';
import { useAutoScroll } from '@/hooks/use-auto-scroll';
import type { ChatMessage, UseChatReturn } from '@/hooks/use-chat-hooks';
import { getFileExtension, isImageFile } from '@/utils/files/generic';
import { getSharedChatImageUrl } from '@/utils/shared-chat-files';
import {
  clearSharedChat,
  loadSharedChat,
  newSharedChatSessionId,
  saveSharedChat,
} from '@/utils/shared-chat-storage';

import { ErrorChatPlaceholder } from '../chat/error-chat-placeholder';
import { FloatingText } from '../chat/floating-text';
import { MessageFileModel, Messages } from '../chat/messages';
import { GenerateSpeechStreamFn } from '../chat/speech/types';
import StreamingFinishedMarker from '../chat/streaming-finished-marker';
import { LocalFileState } from '../file-upload/upload-file';

type ShareSessionInput = Parameters<typeof calculateShareSessionState>[0];
type Translator = ReturnType<typeof useTranslations>;

type EntityMeta = ShareSessionInput & {
  id: string;
  name: string;
  description: string;
};

export type SharedChatViewProps = {
  /**
   * Translation function used by the chat header. Pre-resolved by the caller so
   * the view stays agnostic of the translation namespace.
   */
  headerT: Translator;
  /**
   * Entity used to derive title/description, expiry and header information.
   * Can be used with learning scenarios and characters.
   */
  entity: EntityMeta;
  inviteCode: string;
  sharedEntityType: 'character' | 'learningScenario';
  avatarPictureUrl?: string;
  /**
   * Chat hook result owned by the caller. The caller is responsible for wiring
   * `errorState.handleError` into the chat hook's `onError` option.
   */
  chat: UseChatReturn;
  /**
   * Controls how the "dialog has started" state is derived:
   * - `explicit`: managed via local `useState`, toggled from the initial content
   *   display. The chat input is only rendered after the user starts the dialog.
   * - `derived`: treated as started as soon as there is at least one message.
   *   The chat input is always rendered.
   */
  dialogStartMode: 'explicit' | 'derived';
  /**
   * When provided alongside `enableFloatingText`, renders the floating exercise
   * description and forwards the description to the initial content display.
   */
  exerciseDescription?: string;
  /**
   * Title shown above the floating exercise description. Required when
   * `enableFloatingText` is true and `exerciseDescription` is non-empty.
   */
  exerciseTitle?: string;
  /**
   * Enables the layout containers and floating text needed for the exercise
   * overlay. Layout differs slightly from the plain layout (relative container,
   * `w-full` outer/inner, extra hr spacing).
   */
  enableFloatingText?: boolean;
  showActivityDialog?: boolean;
  /**
   * Icon rendered next to assistant messages. When provided, also rendered by the
   * `Messages` list.
   */
  assistantIcon?: ReactNode;
  uploadFileFn?: (file: File, sharedSessionId: string) => Promise<{ fileId: string }>;
  isSpeechModelEnabled: boolean;
  speechOnly: boolean;
  generateSpeechStreamFn: GenerateSpeechStreamFn;
  /**
   * Opening messages specified by the user in the entity. They are not stored with the conversation,
   * so they are put in front of the restored history.
   */
  initialMessages?: ChatMessage[];
};

/**
 * Shared chat shell used by the invite-based shared chats (learning scenarios and
 * characters). Owns the common layout, auto-scrolling, expired chat modal,
 * header, message list and input box. Entity-specific behaviour (which chat hook
 * to call, initial assistant message, floating exercise text, streaming marker,
 * assistant icon) is configured via props.
 */
export default function GenericSharedChat({
  headerT,
  entity,
  inviteCode,
  sharedEntityType,
  avatarPictureUrl,
  chat,
  dialogStartMode,
  exerciseDescription,
  exerciseTitle,
  enableFloatingText = false,
  showActivityDialog = false,
  assistantIcon,
  uploadFileFn,
  isSpeechModelEnabled,
  speechOnly,
  generateSpeechStreamFn,
  initialMessages = [],
}: SharedChatViewProps) {
  const tCommon = useTranslations('common');
  const tCustomChat = useTranslations('custom-chat.shared');
  const { shareSessionState } = calculateShareSessionState(entity);
  const chatActive = shareSessionState === ShareSessionState.RUNNING;

  const [explicitDialogStarted, setExplicitDialogStarted] = useState(false);
  const [sharedSessionId, setSharedSessionId] = useState(
    () => loadSharedChat(inviteCode)?.sharedSessionId ?? newSharedChatSessionId(),
  );
  const [historyLoading, setHistoryLoading] = useState(() => loadSharedChat(inviteCode) !== null);
  const [files, setFiles] = useState<Map<string, LocalFileState>>(new Map());
  const [messageFileMapping, setMessageFileMapping] = useState<Map<string, MessageFileModel[]>>(
    new Map(),
  );

  const {
    messages,
    uiMessages,
    setMessages,
    input,
    handleInputChange,
    handleSubmit,
    reload,
    stop,
    status,
    error,
  } = chat;

  const { scrollRef, reactivateAutoScrolling } = useAutoScroll([messages, entity.id, inviteCode]);
  const containerRef = useRef<HTMLDivElement>(null);
  const alreadyMounted = useRef(false); // Guard against the mount effect running twice (e.g. React StrictMode dev behavior)
  // If a response was interrupted (meaning last persisted msg is a user msg), this flag indicates that a regeneration of the response is needed.
  const recoverInterruptedResponse = useRef(false);

  const chatUsable =
    chatActive && !TokenPointsExceededError.is(error) && !SharedChatExpiredError.is(error);

  const dialogStarted =
    messages.length > 0 || (dialogStartMode === 'explicit' && explicitDialogStarted);

  async function customHandleSubmit(e: SyntheticEvent) {
    e.preventDefault();

    try {
      reactivateAutoScrolling();

      const currentFiles = Array.from(files);
      const fileIds = [
        ...new Set(
          currentFiles
            .map(([, file]) => file.fileId)
            .filter((id): id is string => id !== undefined && id.trim() !== ''),
        ),
      ];
      const userMessageId = crypto.randomUUID();

      const messageFiles: MessageFileModel[] = currentFiles.reduce<MessageFileModel[]>(
        (acc, [, file]) => {
          const fileId = file.fileId;

          if (fileId === undefined || fileId.trim() === '') {
            return acc;
          }

          acc.push({
            id: fileId,
            name: file.file.name,
            type: getFileExtension(file.file.name),
            createdAt: new Date(),
            size: file.file.size,
            metadata: null,
            userId: null,
            localUrl: isImageFile(file.file.name) ? URL.createObjectURL(file.file) : undefined,
          });

          return acc;
        },
        [],
      );

      if (messageFiles.length > 0) {
        setMessageFileMapping((prev) => {
          const next = new Map(prev);
          next.set(userMessageId, messageFiles);
          return next;
        });
      }

      setFiles(new Map());

      await handleSubmit(e, { fileIds, userMessageId, sharedSessionId });
    } catch (error) {
      logError('Error in customHandleSubmit', error);
    }
  }

  function handleDeattachFile(localFileId: string) {
    setFiles((prev) => {
      const next = new Map(prev);
      next.delete(localFileId);
      return next;
    });
  }

  function handleOpenNewChat() {
    for (const messageFiles of messageFileMapping.values()) {
      for (const messageFile of messageFiles) {
        if (messageFile.localUrl) {
          URL.revokeObjectURL(messageFile.localUrl);
        }
      }
    }

    const nextSharedSessionId = newSharedChatSessionId();

    setHistoryLoading(false);
    recoverInterruptedResponse.current = false;

    setFiles(new Map());
    setMessageFileMapping(new Map());
    setSharedSessionId(nextSharedSessionId);
    clearSharedChat(inviteCode);
    setMessages([]);
  }

  useEffect(() => {
    // Guard against the effect running twice (e.g. React StrictMode dev behavior)
    if (alreadyMounted.current) return;
    alreadyMounted.current = true;

    if (!historyLoading) return;

    void loadSharedChatConversationMessagesAction({
      sharedSessionId,
      inviteCode,
      entityType: sharedEntityType,
      entityId: entity.id,
    })
      .then((result) => {
        if (!result.success) {
          logError('Failed to load shared chat history', new Error(result.error.message));
          return;
        }

        if (result.value.messages.length > 0) {
          setMessages([...initialMessages, ...result.value.messages]);
          recoverInterruptedResponse.current = true;
        }

        const restoredFileMapping = new Map<string, MessageFileModel[]>();
        for (const { messageId, files: restoredFiles } of result.value.filesByMessageId) {
          restoredFileMapping.set(
            messageId,
            restoredFiles.map((file) => ({
              ...file,
              createdAt: new Date(),
              metadata: null,
              userId: null,
              localUrl: isImageFile(file.name)
                ? getSharedChatImageUrl({
                    fileId: file.id,
                    inviteCode,
                    entityType: sharedEntityType,
                    entityId: entity.id,
                    sharedSessionId,
                  })
                : undefined,
            })),
          );
        }
        setMessageFileMapping(restoredFileMapping);
      })
      .catch((error) => {
        logError('Failed to load shared chat history', error);
      })
      .finally(() => {
        setHistoryLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Runs after the restored messages are rendered, so the chat hook knows the last user message.
    if (!recoverInterruptedResponse.current || historyLoading) return;
    recoverInterruptedResponse.current = false;

    if (!chatUsable || messages.at(-1)?.role !== 'user') return;

    reactivateAutoScrolling();
    void reload({ sharedSessionId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLoading]);

  useEffect(() => {
    saveSharedChat(inviteCode, { sharedSessionId });
  }, [inviteCode, sharedSessionId]);

  function handleReload() {
    void reload({ sharedSessionId });
  }

  function handleRetry() {
    window.location.reload();
  }

  const isLoading = status === 'submitted';
  const isGenerating = status === 'submitted' || status === 'streaming';
  const hasExerciseDescription =
    enableFloatingText && exerciseDescription !== undefined && exerciseDescription.trim() !== '';
  const showInitialContent =
    dialogStartMode === 'explicit'
      ? messages.length === 0 && !dialogStarted
      : messages.length === 0;
  const showChatInputBox =
    !historyLoading && (dialogStartMode === 'explicit' ? dialogStarted : true);
  const imageUrl = (file: ConversationDownloadFile) =>
    getSharedChatImageUrl({
      fileId: file.id,
      inviteCode,
      entityType: sharedEntityType,
      entityId: entity.id,
      sharedSessionId,
    });

  return (
    <>
      {!chatUsable && (
        <ExpiredChatModal
          conversationMessages={uiMessages}
          title={entity.name}
          imageUrl={imageUrl}
          fileMapping={messageFileMapping}
          handleRetry={handleRetry}
        />
      )}
      <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
        <SharedChatHeader
          chatActive={chatUsable && !historyLoading}
          disableNewChat={historyLoading}
          hasMessages={messages.length > 0}
          t={headerT}
          handleOpenNewChat={handleOpenNewChat}
          title={entity.name}
          messages={uiMessages}
          dialogStarted={dialogStarted}
          imageSource={avatarPictureUrl}
          imageUrl={imageUrl}
          fileMapping={messageFileMapping}
        />
        <div ref={containerRef} className="relative flex min-h-0 flex-1 flex-col items-center">
          <div ref={scrollRef} className="min-h-0 w-full flex-1 max-w-5xl overflow-y-auto p-4">
            {hasExerciseDescription && (
              <FloatingText
                learningContext={exerciseDescription ?? ''}
                dialogStarted={dialogStarted}
                title={exerciseTitle ?? ''}
                parentRef={containerRef as RefObject<HTMLDivElement>}
                maxWidth={600}
                maxHeight={600}
                minMargin={16}
              />
            )}
            {showInitialContent ? (
              <InitialChatContentDisplay
                title={entity.name}
                description={entity.description}
                exerciseDescription={enableFloatingText ? exerciseDescription : undefined}
                imageSource={avatarPictureUrl}
                setDialogStarted={
                  dialogStartMode === 'explicit' ? setExplicitDialogStarted : undefined
                }
                startDialogLabel={
                  dialogStartMode === 'explicit' ? tCustomChat('enter-chat') : undefined
                }
              />
            ) : (
              <Messages
                messages={uiMessages}
                isLoading={isLoading}
                status={status}
                reload={handleReload}
                assistantIcon={assistantIcon}
                containerClassName="flex flex-col gap-4"
                messageFileMapping={messageFileMapping}
                activitySteps={chat.activitySteps}
                showActivityDialog={showActivityDialog}
                generateSpeechStreamFn={generateSpeechStreamFn}
                isSpeechModelEnabled={isSpeechModelEnabled}
                speechOnly={speechOnly}
              />
            )}
            {/* If there is a TokenPointsExceededError or SharedChatExpiredError we show a dialog instead */}
            {error && !TokenPointsExceededError.is(error) && !SharedChatExpiredError.is(error) && (
              <ErrorChatPlaceholder
                errorMessage={tCommon(getErrorMessageByType(error))}
                handleReload={handleReload}
              />
            )}
          </div>
          <div className="w-full max-w-5xl shrink-0 mx-auto p-4">
            {showChatInputBox && (
              <div className="flex flex-col">
                <ChatInputBox
                  files={files}
                  setFiles={setFiles}
                  customHandleSubmit={customHandleSubmit}
                  handleStopGeneration={stop}
                  input={input}
                  isGenerating={isGenerating}
                  handleInputChange={handleInputChange}
                  enableFileUpload
                  fileUploadFn={
                    uploadFileFn === undefined
                      ? undefined
                      : (file) => uploadFileFn(file, sharedSessionId)
                  }
                  handleDeattachFile={handleDeattachFile}
                  showPlaceholder={false}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <StreamingFinishedMarker status={status} />
    </>
  );
}
