'use client';

import type { ApplicationHeaderMenuItem } from '@/components/layout/application-header';
import { createContext, useContext, useMemo, ReactNode, useState } from 'react';

type HeaderExtensionContextValue = {
  headerMountNode: HTMLDivElement | null;
  setHeaderMountNode: (node: HTMLDivElement | null) => void;
  compactMenuItems: ApplicationHeaderMenuItem[];
  setCompactMenuItems: (compactMenuItems: ApplicationHeaderMenuItem[]) => void;
};

const HeaderExtensionContext = createContext<HeaderExtensionContextValue | null>(null);

export function HeaderExtensionProvider({ children }: { children: ReactNode }) {
  const [headerMountNode, setHeaderMountNode] = useState<HTMLDivElement | null>(null);
  const [compactMenuItems, setCompactMenuItems] = useState<ApplicationHeaderMenuItem[]>([]);

  const value = useMemo(
    () => ({
      headerMountNode,
      setHeaderMountNode,
      compactMenuItems,
      setCompactMenuItems,
    }),
    [headerMountNode, compactMenuItems],
  );

  return <HeaderExtensionContext value={value}>{children}</HeaderExtensionContext>;
}

export function useHeaderExtension() {
  const context = useContext(HeaderExtensionContext);

  if (!context) {
    throw new Error('useHeaderExtension must be used within HeaderExtensionProvider');
  }

  return context;
}
