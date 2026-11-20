import '@ui/styles/globals.css';
import './scrollbar.css';

import { dbGetFederalStateByIdWithResult } from '@shared/db/functions/federal-state';
import { getReadOnlySignedUrl } from '@shared/s3';
import { SEVEN_DAYS } from '@shared/s3/const';
import { buildPublicConfig } from '@shared/sentry/public-config';
import { type Metadata } from 'next';
import { Barlow } from 'next/font/google';
import Script from 'next/script';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import React from 'react';

import appleTouchIcon from '@/assets/apple-touch-icon.png';
import { getMaybeSession, getMaybeUser } from '@/auth/utils';
import { DEFAULT_DESIGN_CONFIGURATION } from '@/db/const';
import { cn } from '@/utils/tailwind';

import ClientProvider from './client-provider';

const barlow = Barlow({
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
});

export async function generateMetadata(): Promise<Metadata> {
  const maybeUser = await getMaybeUser();
  const [, federalState] = await dbGetFederalStateByIdWithResult(maybeUser?.federalStateId);
  const favicon = federalState?.pictureUrls?.favicon;
  const faviconPreSignedUrl = favicon
    ? await getReadOnlySignedUrl({ key: favicon, options: { expiresIn: SEVEN_DAYS } })
    : undefined;

  return {
    title: { default: 'AIS.chat', template: '%s | AIS.chat' },
    description: 'Der datenschutzkonforme KI-Chatbot für die Schule',
    icons: {
      icon: faviconPreSignedUrl ?? { url: '/icon', type: 'image/png' },
      apple: appleTouchIcon.src,
    },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [maybeUser, maybeSession, locale, messages] = await Promise.all([
    getMaybeUser(),
    getMaybeSession(),
    getLocale(),
    getMessages(),
  ]);

  const fullSession =
    maybeUser !== null && maybeSession !== null ? { ...maybeSession, user: maybeUser } : null;
  const [, federalState] = await dbGetFederalStateByIdWithResult(maybeUser?.federalStateId);
  const designConfiguration = federalState?.designConfiguration ?? DEFAULT_DESIGN_CONFIGURATION;

  const { inlineScript } = buildPublicConfig();

  return (
    <html lang={locale} className={cn(barlow.className)} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Script
          id="public-config"
          // runs as soon as the browser parses it (before client components hydrate)
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: inlineScript }}
        />
        <NextIntlClientProvider messages={messages}>
          <ClientProvider session={fullSession} designConfiguration={designConfiguration}>
            {children}
          </ClientProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
