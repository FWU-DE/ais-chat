'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider as NextThemeProvider } from '@ui/components/theme-provider';
import { TooltipProvider } from '@ui/components/tooltip';
import { DesignConfiguration } from '@ui/types/design-configuration';
import { Session } from 'next-auth';

import ResilientSessionProvider from '@/auth/ResilientSessionProvider';
import SessionClearer from '@/auth/SessionClearer';
import { ToastProvider } from '@/components/common/toast';
import { ThemeProvider } from '@/components/providers/theme-provider';

const queryClient = new QueryClient();

export default function ClientProvider({
  children,
  session,
  designConfiguration,
}: {
  children: React.ReactNode;
  session: Session | null;
  designConfiguration: DesignConfiguration;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ToastProvider>
          <NextThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem={false}
            disableTransitionOnChange
          >
            <ThemeProvider designConfiguration={designConfiguration}>
              <ResilientSessionProvider session={session} refetchInterval={60} refetchOnWindowFocus>
                <SessionClearer />
                {children}
              </ResilientSessionProvider>
            </ThemeProvider>
          </NextThemeProvider>
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
