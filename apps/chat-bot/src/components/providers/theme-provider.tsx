'use client';

import React, { startTransition } from 'react';
import { DesignConfiguration } from '@ui/types/design-configuration';
import { constructRootLayoutStyle } from '@/utils/tailwind/layout';
import { PortalContainerProvider } from '@ui/components/portal-container';

type ThemeContextType = {
  designConfiguration: DesignConfiguration;
};

const ThemeContext = React.createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export function ThemeProvider({
  children,
  designConfiguration,
}: {
  children: React.ReactNode;
  designConfiguration: DesignConfiguration;
}) {
  const [containerRef, setContainerRef] = React.useState<HTMLElement | null>(null);
  const [container, setContainer] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    if (containerRef) {
      // Do not set null values on `container` to prevent re-renders on teardown
      startTransition(() => setContainer(containerRef));
    }
  }, [containerRef]);

  return (
    <ThemeContext value={{ designConfiguration }}>
      <PortalContainerProvider container={container}>
        <div ref={setContainerRef} style={constructRootLayoutStyle({ designConfiguration })}>
          {children}
        </div>
      </PortalContainerProvider>
    </ThemeContext>
  );
}
