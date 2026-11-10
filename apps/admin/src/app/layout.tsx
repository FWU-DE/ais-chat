import '@ui/styles/globals.css';

import { buildPublicConfig } from '@shared/sentry/public-config';
import { Toaster } from '@ui/components/toaster';
import { TooltipProvider } from '@ui/components/tooltip';
import { Barlow } from 'next/font/google';
import Script from 'next/script';
import type { ReactNode } from 'react';

import { Header } from '../components/header/Header';

const barlow = Barlow({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
});

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { inlineScript } = buildPublicConfig();

  return (
    <html lang="de" className={barlow.className}>
      <body style={{ margin: 0, padding: 0, fontFamily: 'sans-serif' }}>
        <Script
          id="public-config"
          // runs as soon as the browser parses it (before client components hydrate)
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: inlineScript }}
        />
        <Toaster />
        <div className="flex flex-col gap-6 p-6 min-h-screen">
          <Header />
          <TooltipProvider>{children}</TooltipProvider>
        </div>
      </body>
    </html>
  );
}
