'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarSeparator,
  useSidebar,
} from '@ais-chat/ui/components/sidebar';
import {
  ChatTextIcon,
  ImageSquareIcon,
  LegoSmileyIcon,
  MountainsIcon,
  QuestionIcon,
  SidebarSimpleIcon,
  StudentIcon,
} from '@phosphor-icons/react';
import { UserModel } from '@shared/auth/user-model';
import { HELP_MODE_ASSISTANT_ID } from '@shared/db/const';
import { FederalStateModel } from '@shared/federal-states/types';
import { Button } from '@ui/components/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import LogoWithName from '@/assets/logo-with-name.svg';

import { AppMenuItem } from './app-menu-item';
import { ChatHistory } from './chat-history';
import { MyTokenPoints } from './my-token-points';

type AppSidebarProps = {
  federalState: FederalStateModel;
  user: UserModel;
  usedBudget: number;
  maxBudget: number;
};

export function AppSidebar({ federalState, user, usedBudget, maxBudget }: AppSidebarProps) {
  const { toggleSidebar, open } = useSidebar();
  const t = useTranslations('sidebar');
  const [sidebarContentEl, setSidebarContentEl] = useState<HTMLDivElement | null>(null);

  return (
    <Sidebar>
      <div className="flex h-full min-h-0 flex-col p-2">
        <SidebarHeader>
          <div className="p-2 flex justify-end gap-2">
            <Link href="/" aria-hidden="true" tabIndex={-1} className="mr-auto rounded">
              <LogoWithName className="h-7 text-primary" />
            </Link>
            <Button
              variant="toggle"
              size="icon-round"
              className="text-primary -mt-1"
              onClick={toggleSidebar}
              aria-label={open ? t('aria.close-sidebar') : t('aria.open-sidebar')}
              aria-expanded={open}
            >
              <SidebarSimpleIcon className="size-6" />
            </Button>
          </div>
        </SidebarHeader>
        <SidebarContent ref={setSidebarContentEl}>
          <SidebarGroup>
            <nav aria-label={t('aria.main-navigation')}>
              <SidebarMenu>
                <AppMenuItem href="/" icon={<ChatTextIcon />} text={t('new-chat')} />
                {federalState.featureToggles?.isImageGenerationEnabled && (
                  <AppMenuItem
                    href="/image-generation"
                    icon={<ImageSquareIcon />}
                    text={t('new-image')}
                  />
                )}
                {user.userRole === 'teacher' && federalState.featureToggles?.isCustomGptEnabled && (
                  <AppMenuItem
                    href="/assistants"
                    icon={<LegoSmileyIcon />}
                    text={t('assistants')}
                  />
                )}
                <SidebarSeparator className="my-6" />
                {user.userRole === 'teacher' &&
                  federalState.featureToggles?.isSharedChatEnabled && (
                    <AppMenuItem
                      href="/learning-scenarios"
                      icon={<MountainsIcon />}
                      text={t('learning-scenarios')}
                    />
                  )}
                {user.userRole === 'teacher' && federalState.featureToggles?.isCharacterEnabled && (
                  <AppMenuItem href="/characters" icon={<StudentIcon />} text={t('characters')} />
                )}
                <SidebarSeparator className="my-6" />
                {user.userRole === 'teacher' && federalState.featureToggles?.isCustomGptEnabled && (
                  <AppMenuItem
                    href={`/assistants/d/${HELP_MODE_ASSISTANT_ID}`}
                    icon={<QuestionIcon />}
                    text={t('help-chat')}
                  />
                )}
              </SidebarMenu>
            </nav>
          </SidebarGroup>

          <SidebarGroup className="mt-2">
            <MyTokenPoints text={t('token-points')} usedBudget={usedBudget} maxBudget={maxBudget} />
          </SidebarGroup>

          <SidebarGroup className="mt-4">
            <ChatHistory scrollContainer={sidebarContentEl} />
          </SidebarGroup>
        </SidebarContent>
      </div>
    </Sidebar>
  );
}

export default AppSidebar;
