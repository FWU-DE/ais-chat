'use client';

import { getCharacterShareDataAction } from '@/app/(authed)/(chat-bot)/characters/editor/[characterId]/actions';
import CountDownTimer from '@/app/(authed)/(chat-bot)/learning-scenarios/_components/count-down';
import { getLearningScenarioShareDataAction } from '@/app/(authed)/(chat-bot)/learning-scenarios/editor/[learningScenarioId]/actions';
import CopyToClipboardButton from '@/components/common/clipboard-button';
import CollapseSidebar from '@/components/common/collapse-sidebar';
import SidebarCloseIcon from '@/components/icons/sidebar-close';
import Footer from '@/components/navigation/footer';
import type { SharePollingData } from '@/hooks/use-share-data-polling';
import { useShareDataPolling } from '@/hooks/use-share-data-polling';
import type { ServerActionResult } from '@shared/actions/server-action-result';
import {
  ShareSessionState,
  calculateShareSessionState,
} from '@shared/sharing/calculate-share-session-state';
import { Button } from '@ui/components/button';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import CustomChatHeader from './custom-chat-header';
import { CustomChatShareWarning } from './share-with-learners/custom-chat-share-warning';

type CustomChatSharePageContentProps = {
  backHref: string;
  customChatName: string;
  inviteCode: string;
  totalTimeInSeconds: number;
  absoluteShareUrl: string;
  host: string;
  baseUrl: string;
  tGoTo: string;
  tEnterCode: string;
  tOpenChat: string;
  tCopyLink: string;
  tUseQr: string;
  tBackButton: string;
  tSubHeader: string;
  customChatVariant: 'character' | 'learning-scenario';
  customChatId: string;
  expiredAt: Date | null;
  manuallyStoppedAt: Date | null;
};

export default function CustomChatSharePageContent({
  backHref,
  customChatName,
  inviteCode,
  totalTimeInSeconds,
  absoluteShareUrl,
  host,
  baseUrl,
  tGoTo,
  tEnterCode,
  tOpenChat,
  tCopyLink,
  tUseQr,
  tBackButton,
  tSubHeader,
  customChatVariant,
  customChatId,
  expiredAt,
  manuallyStoppedAt,
}: CustomChatSharePageContentProps) {
  const t = useTranslations('custom-chat.share-with-learners');
  const formattedInviteCode = `${inviteCode.substring(0, 4)} ${inviteCode.substring(4, 8)}`;
  const shareUILink =
    customChatVariant === 'character'
      ? `/characters/editor/${customChatId}`
      : `/learning-scenarios/editor/${customChatId}`;

  const { timeLeftInSeconds: sharedChatTimeLeftInitial } = calculateShareSessionState({
    expiredAt,
    manuallyStoppedAt,
  });
  const sharedChatActiveInitial = sharedChatTimeLeftInitial > 0;

  const fetchShareData = async (): Promise<ServerActionResult<SharePollingData>> => {
    const result =
      customChatVariant === 'character'
        ? await getCharacterShareDataAction({ characterId: customChatId })
        : await getLearningScenarioShareDataAction({ learningScenarioId: customChatId });

    if (result.success) {
      return {
        success: true,
        value: {
          expiredAt: result.value.expiredAt,
          manuallyStoppedAt: result.value.manuallyStoppedAt,
          tokenPointsLimit: result.value.tokenPointsLimit,
          budgetUsedBySharedChat: result.value.budgetUsedBySharedChat,
          tokenLimitExceeded: result.value.tokenLimitExceeded,
        },
      };
    }

    return result;
  };

  const { data: polledData, refetch: refetchShareData } = useShareDataPolling({
    fetchShareData,
    isActive: sharedChatActiveInitial,
  });

  const currentExpiredAt = polledData?.expiredAt ?? expiredAt;
  const currentManuallyStoppedAt = polledData?.manuallyStoppedAt ?? manuallyStoppedAt;
  const currentTokenLimitExceeded = polledData?.tokenLimitExceeded ?? null;

  const { shareSessionState, timeLeftInSeconds: currentLeftTimeInSeconds } =
    calculateShareSessionState({
      expiredAt: currentExpiredAt,
      manuallyStoppedAt: currentManuallyStoppedAt,
    });
  const showShareWarning =
    shareSessionState === ShareSessionState.EXPIRED_RECENTLY || currentTokenLimitExceeded;

  const content = showShareWarning ? (
    <div className="flex flex-col items-center gap-6">
      <div className="w-full max-w-2xl">
        <CustomChatShareWarning info={t('share-not-possible')} />
      </div>
      <Button asChild>
        <Link href={shareUILink}>{t('button-to-share-settings')}</Link>
      </Button>
    </div>
  ) : (
    <>
      <CountDownTimer
        leftTimeInSeconds={currentLeftTimeInSeconds}
        totalTimeInSeconds={totalTimeInSeconds}
        stopWatchClassName="w-8 h-8"
        onExpire={() => {
          void refetchShareData();
        }}
      />
      <main className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] w-full gap-6 mt-6 sm:mt-8 mb-12 sm:mb-16">
        <section className="flex flex-col justify-between gap-4 items-center">
          <div className="flex flex-col items-center gap-4">
            <p className="text-2xl sm:text-3xl">{tGoTo}</p>
            <Link href={baseUrl} target="_blank" rel="noopener noreferrer">
              <p className="text-3xl sm:text-5xl text-primary font-bold">{host}</p>
            </Link>
          </div>
          <div className="flex flex-col items-center gap-4">
            <p className="text-2xl sm:text-3xl">{tEnterCode}</p>
            <div className="flex items-center gap-2">
              <p data-testid="join-code" className="text-3xl sm:text-5xl text-primary font-bold">
                {formattedInviteCode}
              </p>
              <CopyToClipboardButton text={formattedInviteCode} className="size-7 sm:size-9" />
            </div>
          </div>
          <div className="flex flex-col items-center gap-4 sm:mt-auto">
            <Button asChild>
              <Link href={absoluteShareUrl} target="_blank" rel="noopener noreferrer">
                {tOpenChat}
              </Link>
            </Button>
            <CopyToClipboardButton
              text={absoluteShareUrl}
              variant="outline"
              size="default"
              defaultIcons={false}
              aria-label={tCopyLink}
            >
              {tCopyLink}
            </CopyToClipboardButton>
          </div>
        </section>
        <div className="hidden sm:block w-1 border-r" />
        <section className="flex flex-col justify-between items-center gap-8">
          <h2 className="text-2xl sm:text-3xl text-center">{tUseQr}</h2>
          <QRCodeSVG
            data-testid="qr-code"
            className="w-full h-full max-w-64 sm:max-w-80 md:max-w-96 max-h-64 sm:max-h-80 md:max-h-96"
            value={absoluteShareUrl}
            aria-hidden="true"
          />
        </section>
      </main>
    </>
  );

  return (
    <div className="w-full px-4 sm:px-8 overflow-auto flex flex-col h-full">
      <CollapseSidebar />
      <CustomChatHeader />
      <Link href={backHref} className="flex gap-2 items-center text-primary w-full">
        <SidebarCloseIcon className="w-4 h-4" />
        <span className="text-base font-normal hover:underline">{tBackButton}</span>
      </Link>
      <div className="mx-auto mt-2 flex flex-col justify-center items-center text-center w-full">
        <p className="text-2xl sm:text-3xl mb-6">{tSubHeader}</p>
        <h1 className="text-4xl sm:text-5xl font-medium mb-10">{customChatName}</h1>
        {content}
      </div>
      <div className="grow" />
      <hr className="w-full" />
      <Footer host={host} />
    </div>
  );
}
