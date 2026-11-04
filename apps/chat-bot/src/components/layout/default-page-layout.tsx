import type { UserAndContext } from '@/auth/types';
import { PageLayoutSelector } from '@/components/layout/page-layout-selector';
import { ReactNode } from 'react';

export type DefaultPageLayoutConfig =
  | {
      layout: 'chat';
      headerConfig: {
        chatId: string;
        downloadConversationEnabled: boolean;
        userAndContext: UserAndContext;
        title?: string;
      };
    }
  | {
      layout: 'image';
    }
  | {
      layout: 'form';
    };

export function DefaultPageLayout({
  children,
  layoutConfig,
}: {
  children: ReactNode;
  layoutConfig?: DefaultPageLayoutConfig;
}) {
  return <PageLayoutSelector layoutType={layoutConfig}>{children}</PageLayoutSelector>;
}
