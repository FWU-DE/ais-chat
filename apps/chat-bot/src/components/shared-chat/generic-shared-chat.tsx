'use client';

import { ReactNode, RefObject, SyntheticEvent, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import ExpiredChatModal from '@/components/common/expired-chat-modal';
import { SharedChatHeader } from '@/components/chat/shared-header-bar';
import { InitialChatContentDisplay } from '@/components/chat/initial-content-display';
import { ChatInputBox } from '@/components/chat/chat-input-box';
import { FloatingText } from '../chat/floating-text';
import { Messages } from '../chat/messages';
import StreamingFinishedMarker from '../chat/streaming-finished-marker';
import { useAutoScroll } from '@/hooks/use-auto-scroll';
import {
  calculateShareSessionState,
  ShareSessionState,
} from '@shared/sharing/calculate-share-session-state';
import { logError } from '@shared/logging';
import type { UseChatReturn } from '@/hooks/use-chat-hooks';
import { SharedChatExpiredError, TokenPointsExceededError } from '@ais-chat/ai-core/errors';
import { getErrorMessageByType } from '@/error/get-error-message-by-type';
import { ErrorChatPlaceholder } from '../chat/error-chat-placeholder';
import { LocalFileState } from '../chat/send-message-form';
import { getFileExtension, isImageFile } from '@/utils/files/generic';
import { PendingFileModel } from '../chat/messages';
import {
  clearSharedChat,
  loadSharedChat,
  newSharedChatSessionId,
  saveSharedChat,
} from '@/utils/shared-chat-storage';
import { cnanoid } from '@shared/random/randomService';

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
  /**
   * Icon rendered next to assistant messages. When provided, also rendered by the
   * `Messages` list.
   */
  assistantIcon?: ReactNode;
  uploadFileFn?: (file: File, sharedSessionId: string) => Promise<{ fileId: string }>;
  /**
   * When true, web search results are shown in a modal dialog
   * triggered from the message icons row instead of the inline panel above
   * the message.
   */
  showWebSourcesInDialog?: boolean;
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
  avatarPictureUrl,
  chat,
  dialogStartMode,
  exerciseDescription,
  exerciseTitle,
  enableFloatingText = false,
  assistantIcon,
  uploadFileFn,
  showWebSourcesInDialog,
}: SharedChatViewProps) {
  const tCommon = useTranslations('common');
  const tCustomChat = useTranslations('custom-chat.shared');
  const { shareSessionState } = calculateShareSessionState(entity);
  const chatActive = shareSessionState === ShareSessionState.RUNNING;

  const [explicitDialogStarted, setExplicitDialogStarted] = useState(false);
  const [sharedSessionId, setSharedSessionId] = useState(
    () => loadSharedChat(inviteCode)?.sharedSessionId ?? newSharedChatSessionId(),
  );
  const [files, setFiles] = useState<Map<string, LocalFileState>>(new Map());
  const [pendingFileMapping, setPendingFileMapping] = useState<Map<string, PendingFileModel[]>>(
    () => {
      const restored = loadSharedChat(inviteCode);
      const mapping = new Map<string, PendingFileModel[]>();
      if (restored === null) return mapping;

      for (const message of restored.messages) {
        if (message.files.length > 0) {
          // Persisted files only keep id/name/type/size; fill in the remaining
          // FileModel fields with placeholders since they aren't used for display.
          mapping.set(
            message.id,
            message.files.map((file) => ({
              ...file,
              createdAt: new Date(),
              metadata: null,
              userId: null,
            })),
          );
        }
      }
      return mapping;
    },
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

  const chatUsable =
    chatActive && !TokenPointsExceededError.is(error) && !SharedChatExpiredError.is(error);

  const dialogStarted =
    messages.length > 0 || (dialogStartMode === 'explicit' && explicitDialogStarted);

  async function customHandleSubmit(e: SyntheticEvent) {
    e.preventDefault();

    try {
      reactivateAutoScrolling();

      const currentFiles = Array.from(files);
      const previousFileIds = Array.from(pendingFileMapping.values())
        .flatMap((pendingFiles) => pendingFiles.map((pendingFile) => pendingFile.id))
        .filter((id): id is string => id.trim() !== '');
      const currentFileIds = currentFiles
        .map(([, file]) => file.fileId)
        .filter((id): id is string => id !== undefined && id.trim() !== '');
      const fileIds = [...new Set([...previousFileIds, ...currentFileIds])];
      const userMessageId = crypto.randomUUID();

      const pendingFiles: PendingFileModel[] = currentFiles.reduce<PendingFileModel[]>(
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

      if (pendingFiles.length > 0) {
        setPendingFileMapping((prev) => {
          const next = new Map(prev);
          next.set(userMessageId, pendingFiles);
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
    for (const pendingFiles of pendingFileMapping.values()) {
      for (const pendingFile of pendingFiles) {
        if (pendingFile.localUrl) {
          URL.revokeObjectURL(pendingFile.localUrl);
        }
      }
    }

    const nextSharedSessionId = cnanoid();

    setFiles(new Map());
    setPendingFileMapping(new Map());
    setSharedSessionId(nextSharedSessionId);
    clearSharedChat(inviteCode);
    setMessages([]);
  }

  useEffect(() => {
    // Do not persist messages during streaming (assistant content is incomplete).
    if (status === 'streaming') return;

    saveSharedChat(inviteCode, {
      sharedSessionId,
      messages: messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        files: pendingFileMapping.get(message.id) ?? [],
      })),
    });
  }, [inviteCode, sharedSessionId, messages, pendingFileMapping, status]);

  function handleReload() {
    void reload();
  }

  function handleRetry() {
    window.location.reload();
  }

  const isLoading = status === 'submitted';
  const hasExerciseDescription =
    enableFloatingText && exerciseDescription !== undefined && exerciseDescription.trim() !== '';
  const showInitialContent =
    dialogStartMode === 'explicit'
      ? messages.length === 0 && !dialogStarted
      : messages.length === 0;
  const showChatInputBox = dialogStartMode === 'explicit' ? dialogStarted : true;
  const sharedConversationMessages = uiMessages.map((message) => ({
    ...message,
    files: pendingFileMapping.get(message.id)?.map((file) => ({ id: file.id })) ?? [],
  }));

  useEffect(() => {
    if (alreadyMounted.current) {
      return;
    }
    alreadyMounted.current = true;

    const lastMessage = messages.at(-1);

    if (!chatUsable || lastMessage === undefined || lastMessage.role !== 'user') {
      return;
    }

    reactivateAutoScrolling();
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {!chatUsable && (
        <ExpiredChatModal
          conversationMessages={sharedConversationMessages}
          title={entity.name}
          inviteCode={inviteCode}
          sharedSessionId={sharedSessionId}
          handleRetry={handleRetry}
        />
      )}
      <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
        <SharedChatHeader
          chatActive={chatUsable}
          hasMessages={messages.length > 0}
          t={headerT}
          handleOpenNewChat={handleOpenNewChat}
          title={entity.name}
          messages={uiMessages}
          dialogStarted={dialogStarted}
          imageSource={avatarPictureUrl}
          inviteCode={inviteCode}
          sharedSessionId={sharedSessionId}
          pendingFileMapping={pendingFileMapping}
        />
        <div ref={containerRef} className="relative flex min-h-0 flex-1 flex-col items-center">
          <div
            ref={scrollRef}
            className="min-h-0 w-full flex-1 max-w-5xl overflow-y-auto p-4 pb-20"
          >
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
                reload={reload}
                assistantIcon={assistantIcon}
                containerClassName="flex flex-col gap-4"
                pendingFileMapping={pendingFileMapping}
                showWebSourcesInDialog={showWebSourcesInDialog}
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
          <div className="w-full max-w-5xl shrink-0 mx-auto px-4 pb-4">
            {showChatInputBox && (
              <div className="flex flex-col">
                <ChatInputBox
                  files={files}
                  setFiles={setFiles}
                  customHandleSubmit={customHandleSubmit}
                  handleStopGeneration={stop}
                  input={input}
                  isLoading={isLoading}
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
