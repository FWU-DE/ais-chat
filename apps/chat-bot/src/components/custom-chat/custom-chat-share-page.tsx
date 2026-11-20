import { NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';

import { loadTranslations } from '@/i18n/load-translations';
import { resolveSharingLocale } from '@/i18n/sharing-locale';
import { getBaseUrlByHeaders, getHostByHeaders } from '@/utils/host';

import CustomChatSharePageContent from './custom-chat-share-page-content';

type CustomChatSharePageProps = {
  backHref: string;
  customChatName: string;
  inviteCode: string;
  leftTimeInSeconds: number;
  relativeShareUrl: string;
  totalTimeInSeconds: number;
  customChatVariant: 'character' | 'learning-scenario';
  expiredAt: Date | null;
  manuallyStoppedAt: Date | null;
  customChatId: string;
  sharingUserId: string;
};

export default async function CustomChatSharePage({
  backHref,
  customChatName,
  inviteCode,
  relativeShareUrl,
  totalTimeInSeconds,
  customChatVariant,
  expiredAt,
  manuallyStoppedAt,
  customChatId,
  sharingUserId,
}: CustomChatSharePageProps) {
  const locale = await resolveSharingLocale({
    customChatVariant,
    customChatId,
    sharingUserId,
  });
  const t = await getTranslations({ locale, namespace: 'custom-chat.share-page' });
  const messages = await loadTranslations(locale);
  const baseUrl = await getBaseUrlByHeaders();
  const host = await getHostByHeaders();
  const absoluteShareUrl = new URL(relativeShareUrl, baseUrl).href;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <CustomChatSharePageContent
        backHref={backHref}
        customChatName={customChatName}
        inviteCode={inviteCode}
        totalTimeInSeconds={totalTimeInSeconds}
        absoluteShareUrl={absoluteShareUrl}
        host={host}
        baseUrl={baseUrl}
        tGoTo={t('go-to')}
        tEnterCode={t('enter-code')}
        tOpenChat={t('open-chat')}
        tCopyLink={t('copy-link')}
        tUseQr={t('use-qr')}
        tBackButton={t(`${customChatVariant}.back-button`)}
        tSubHeader={t(`${customChatVariant}.sub-header`)}
        customChatVariant={customChatVariant}
        customChatId={customChatId}
        expiredAt={expiredAt}
        manuallyStoppedAt={manuallyStoppedAt}
      />
    </NextIntlClientProvider>
  );
}
