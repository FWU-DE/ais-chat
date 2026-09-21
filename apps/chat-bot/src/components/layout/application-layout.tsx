'use client';

import type { UserAndContext } from '@/auth/types';
import ActiveInfoBanners from '@/components/info-banners/active-info-banners';
import { HeaderExtensionProvider } from '@/components/hooks/use-header-extension';
import { ApplicationHeader } from '@/components/layout/application-header';
import { ChatOverlayRootContext } from '@/components/layout/chat-overlay-root-context';
import { useCustomPathname } from '@/hooks/use-custom-pathname';
import type { InfoBanner } from '@shared/info-banners/info-banner';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';

export function ApplicationLayout({
  children,
  userAndContext,
  infoBanners,
}: {
  children: ReactNode;
  userAndContext?: UserAndContext;
  infoBanners?: InfoBanner[];
}) {
  const pathname = useCustomPathname();
  const mainScrollContainerRef = useRef<HTMLElement | null>(null);
  const [overlayRoot, setOverlayRoot] = useState<HTMLDivElement | null>(null);

  const overlayRootRef = useCallback((node: HTMLDivElement | null) => {
    setOverlayRoot(node);
  }, []);

  useEffect(() => {
    mainScrollContainerRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <HeaderExtensionProvider>
      <ChatOverlayRootContext value={overlayRoot}>
        <div className="relative flex flex-col h-dvh w-dvw overflow-hidden bg-background-2">
          {infoBanners !== undefined && <ActiveInfoBanners infoBanners={infoBanners} />}
          <ApplicationHeader userAndContext={userAndContext} />
          <div className="relative min-h-0 flex-1">
            <main
              ref={mainScrollContainerRef}
              className="min-h-0 w-full mx-auto h-full overflow-auto"
            >
              {children}
            </main>
            <div ref={overlayRootRef} className="pointer-events-none absolute inset-0" />
          </div>
        </div>
      </ChatOverlayRootContext>
    </HeaderExtensionProvider>
  );
}
