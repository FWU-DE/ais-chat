'use client';

import { ConversationDownloadProvider } from '@/components/chat/conversation-download-context';
import { ChatHeaderBar } from '@/components/chat/header-bar';
import CustomChatHeader from '@/components/custom-chat/custom-chat-header';
import {
  CustomChatHeaderContentProvider,
  useCustomChatHeaderContent,
} from '@/components/custom-chat/custom-chat-header-content';
import SelectImageAspectRatio from '@/components/image-generation/select-image-aspect-ratio';
import SelectImageModel from '@/components/image-generation/select-image-model';
import SelectImageStyle from '@/components/image-generation/select-image-style';
import { ApplicationHeaderContent } from '@/components/layout/application-header';
import type { DefaultPageLayoutConfig } from '@/components/layout/default-page-layout';
import { ReactNode } from 'react';

function FormPageHeader() {
  const { formStateProps } = useCustomChatHeaderContent();

  return (
    <ApplicationHeaderContent>
      <CustomChatHeader
        showFormState={formStateProps !== undefined}
        formStateProps={formStateProps ?? undefined}
      />
    </ApplicationHeaderContent>
  );
}

function ImagePageHeader() {
  return (
    <ApplicationHeaderContent>
      <>
        <SelectImageModel />
        <SelectImageStyle />
        <SelectImageAspectRatio />
      </>
    </ApplicationHeaderContent>
  );
}

function ChatPageHeader({
  layoutConfig,
}: {
  layoutConfig: Extract<DefaultPageLayoutConfig, { layout: 'chat' }>;
}) {
  return (
    <ChatHeaderBar
      userAndContext={layoutConfig.headerConfig.userAndContext}
      chatId={layoutConfig.headerConfig.chatId}
      title={layoutConfig.headerConfig.title}
      downloadConversationEnabled={layoutConfig.headerConfig.downloadConversationEnabled}
    />
  );
}

function DefaultPageHeader({ layoutConfig }: { layoutConfig: DefaultPageLayoutConfig }) {
  if (!layoutConfig) {
    return null;
  }

  switch (layoutConfig.layout) {
    case 'form':
      return <FormPageHeader />;
    case 'image':
      return <ImagePageHeader />;
    case 'chat':
      return <ChatPageHeader layoutConfig={layoutConfig} />;
  }
}

export function PageLayoutSelector({
  children,
  layoutType,
}: {
  children: ReactNode;
  layoutType?: DefaultPageLayoutConfig;
}) {
  return (
    // Always render the chat header provider so any descendant that calls
    // `useCustomChatHeaderContent()` is guaranteed to have a provider in the tree,
    // regardless of which header layout branch is currently rendered.
    <CustomChatHeaderContentProvider>
      <ConversationDownloadProvider>
        {layoutType && <DefaultPageHeader layoutConfig={layoutType} />}
        <div
          className={`data-page-layout h-full max-w-5xl mx-auto px-6 ${layoutType?.layout === 'chat' ? 'pb-4' : 'pb-8'}`}
        >
          {children}
        </div>
      </ConversationDownloadProvider>
    </CustomChatHeaderContentProvider>
  );
}
