'use client';

import type { ChatMessage } from '@/types/chat';
import React from 'react';

export type ConversationDownloadFile = {
  id: string;
  name: string;
  localUrl?: string;
};

export type ConversationDownloadData = {
  messages: ChatMessage[];
  fileMapping: Map<string, ConversationDownloadFile[]>;
  createdAt: Date;
  conversationTitle?: string;
};

type ConversationDownloadContextValue = {
  data: ConversationDownloadData | undefined;
  setData: React.Dispatch<React.SetStateAction<ConversationDownloadData | undefined>>;
};

const ConversationDownloadContext = React.createContext<
  ConversationDownloadContextValue | undefined
>(undefined);

export function ConversationDownloadProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = React.useState<ConversationDownloadData>();

  return (
    <ConversationDownloadContext value={{ data, setData }}>{children}</ConversationDownloadContext>
  );
}

export function useConversationDownload() {
  const context = React.useContext(ConversationDownloadContext);

  if (context === undefined) {
    throw new Error(
      'useConversationDownload can only be used inside a ConversationDownloadProvider',
    );
  }

  return context;
}
