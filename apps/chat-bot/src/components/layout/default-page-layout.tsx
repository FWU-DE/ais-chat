import { ReactNode } from 'react';

import { PageLayoutSelector } from '@/components/layout/page-layout-selector';

export type DefaultPageLayoutConfig =
  | {
      layout: 'chat';
      headerConfig: {
        chatId: string;
        downloadConversationEnabled: boolean;
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
