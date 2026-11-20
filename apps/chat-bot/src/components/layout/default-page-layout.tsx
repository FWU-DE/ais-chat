import { ReactNode } from 'react';

import type { UserAndContext } from '@/auth/types';
import { PageLayoutSelector } from '@/components/layout/page-layout-selector';

export type DefaultPageLayoutConfig =
  | {
      layout: 'chat';
      headerConfig: {
        chatId: string;
        downloadConversationEnabled: boolean;
        userAndContext: UserAndContext;
        title?: string;
        // Only set when the personal context may be toggled for this chat
        personalContext?: { enabled: boolean };
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
