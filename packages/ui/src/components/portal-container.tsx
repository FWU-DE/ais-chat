'use client';

import React from 'react';

const PortalContainerContext = React.createContext<HTMLElement | null>(null);

export function PortalContainerProvider({
  children,
  container,
}: {
  children: React.ReactNode;
  container: HTMLElement | null;
}) {
  return <PortalContainerContext value={container}>{children}</PortalContainerContext>;
}

export function usePortalContainer() {
  return React.useContext(PortalContainerContext);
}
