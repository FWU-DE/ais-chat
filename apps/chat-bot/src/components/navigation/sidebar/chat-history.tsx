'use client';

import { MagnifyingGlassIcon, XCircleIcon } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button } from '@ui/components/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@ui/components/input-group';
import { SidebarGroup, SidebarMenu } from '@ui/components/sidebar';
import { Spinner } from '@ui/components/spinner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  deleteConversationAction,
  updateConversationTitleAction,
} from '@/app/(authed)/(chat-bot)/actions';
import { fetchClientSideConversations } from '@/app/(authed)/(chat-bot)/utils';
import { useToast } from '@/components/common/toast';
import { useCustomPathname } from '@/hooks/use-custom-pathname';

import { ChatHistoryItem } from './chat-history-item';

/**
 * ChatHistory component handles rendering a virtual-scrolled list of conversations.
 *
 * Note: This component is not memoized (not wrapped in `React.memo`) because:
 * - It relies on external scroll container measurements that can change frequently
 * - The virtualizer needs to respond to real-time scroll events
 * - Memoization would prevent proper synchronization with scroll position changes
 */
export function ChatHistory({ scrollContainer }: { scrollContainer: HTMLDivElement | null }) {
  'use no memo';

  const router = useRouter();
  const pathname = useCustomPathname();
  const toast = useToast();
  const t = useTranslations('sidebar');
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState('');
  const [isClearPressed, setIsClearPressed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    data: conversations = [],
    error,
    isLoading,
  } = useQuery({
    queryKey: ['conversations'],
    queryFn: fetchClientSideConversations,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  function refetchConversations() {
    void queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }

  async function handleUpdateConversation({ id, name }: { id: string; name: string }) {
    const result = await updateConversationTitleAction({ conversationId: id, name });

    if (result.success) {
      refetchConversations();
    } else {
      toast.error(t('chats-error'));
    }
  }

  async function handleDeleteConversation(conversationId: string) {
    const result = await deleteConversationAction({ conversationId });
    if (result.success) {
      toast.success(t('conversation-delete-toast-success'));
      refetchConversations();
      // call router.replace only if the deleted conversation is currently open
      if (isCurrentConversation(conversationId)) {
        router.replace('/');
      }
    } else {
      toast.error(t('conversation-delete-toast-error'));
    }
  }

  function isCurrentConversation(conversationId: string) {
    return pathname.includes(conversationId);
  }

  const filteredConversations = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return conversations.filter((conversation) =>
      (conversation.name ?? '').toLowerCase().includes(normalizedSearch),
    );
  }, [conversations, searchText]);

  const navRef = useRef<HTMLElement>(null);

  // scrollMargin is used for the vertical offset of the navigation element within the scroll container (i.e., the space for the menu items above the chat history)
  const [scrollMargin, setScrollMargin] = useState(0);

  // useLayoutEffect is used instead of useEffect to be able to call getBoundingClientRect()
  useLayoutEffect(() => {
    const navEl = navRef.current;
    if (!scrollContainer || !navEl) return;
    setScrollMargin(
      navEl.getBoundingClientRect().top -
        scrollContainer.getBoundingClientRect().top +
        scrollContainer.scrollTop,
    );
  }, [scrollContainer]);

  // eslint-disable-next-line react-hooks/incompatible-library -- opted out of memoization via "use no memo"
  const virtualizer = useVirtualizer({
    count: filteredConversations.length,
    getScrollElement: () => scrollContainer,
    estimateSize: () => 40,
    overscan: 10,
    scrollMargin,
  });

  return (
    <>
      <SidebarGroup className="p-0">
        <InputGroup className="mb-2 bg-sidebar-input text-sidebar-input-foreground rounded-full">
          <InputGroupInput
            ref={inputRef}
            value={searchText}
            placeholder={t('chat-search-placeholder')}
            aria-label={t('chat-search-placeholder')}
            onChange={(event) => setSearchText(event.target.value)}
            data-testid="chat-search"
          />
          <InputGroupAddon align="inline-end">
            {searchText.length === 0 ? (
              <MagnifyingGlassIcon />
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('search-clear')}
                  onClick={() => {
                    setSearchText('');
                    inputRef.current?.focus();
                  }}
                  onPointerDown={() => setIsClearPressed(true)}
                  onPointerUp={() => setIsClearPressed(false)}
                  onPointerLeave={() => setIsClearPressed(false)}
                  className="hover:bg-transparent"
                >
                  <XCircleIcon
                    weight={isClearPressed ? 'fill' : 'regular'}
                    className="size-4 text-sidebar-input-foreground group-hover/button:text-foreground transition-colors "
                  />
                </Button>
              </>
            )}
          </InputGroupAddon>
        </InputGroup>
        <nav ref={navRef} aria-label={t('aria.chat-history')}>
          <SidebarMenu style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const conversation = filteredConversations[virtualItem.index];
              if (!conversation) return null;
              return (
                <ChatHistoryItem
                  key={conversation.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start - scrollMargin}px)`,
                  }}
                  conversation={conversation}
                  onDeleteConversation={handleDeleteConversation}
                  onUpdateConversation={(name) =>
                    handleUpdateConversation({ id: conversation.id, name })
                  }
                />
              );
            })}
          </SidebarMenu>
        </nav>
      </SidebarGroup>

      {isLoading && (
        <div className="flex flex-col w-full items-center" data-testid="chat-history-loading">
          <Spinner aria-label={t('chats-loading')} />
        </div>
      )}

      {error && (
        <div className="flex flex-col gap-2 w-full items-center justify-center">
          <p className="text-primary">{t('chats-error')}</p>
          <Button onClick={refetchConversations}>{t('chats-reload')}</Button>
        </div>
      )}
    </>
  );
}
