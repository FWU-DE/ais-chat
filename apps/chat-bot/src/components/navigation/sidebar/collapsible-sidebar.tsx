'use client';

import { useSidebar } from '@ais-chat/ui/components/sidebar';
import { PlusSquareIcon, SidebarSimpleIcon } from '@phosphor-icons/react';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export function ToggleSidebarButton({ forceVisibility = false }: { forceVisibility?: boolean }) {
  const { toggleSidebar, open, isMobile, openMobile } = useSidebar();
  const isOpen = isMobile ? openMobile : open;
  const t = useTranslations('common');

  if (isOpen && !forceVisibility) return null;

  return (
    <Button
      variant="ghost"
      size="icon-round"
      title="Sidebar"
      onClick={toggleSidebar}
      aria-label={t(isOpen ? 'sidebar-toggle-close' : 'sidebar-toggle-open')}
    >
      <SidebarSimpleIcon className="size-6 text-primary" />
    </Button>
  );
}

export function NewChatButton({ forceVisibility = false }: { forceVisibility?: boolean }) {
  const { open, toggleSidebar, isMobile, openMobile } = useSidebar();
  const router = useRouter();
  const isOpen = isMobile ? openMobile : open;

  function handleOpenNewChat() {
    if (isMobile && openMobile) {
      toggleSidebar();
    }
    router.push('/');
  }

  if (isOpen && !forceVisibility) return null;

  return (
    <Button
      variant="ghost"
      size="icon-round"
      onClick={handleOpenNewChat}
      className="text-primary"
      aria-label="Neuer Chat"
      title="Neuer Chat"
    >
      <PlusSquareIcon className="size-6 text-primary" />
    </Button>
  );
}
