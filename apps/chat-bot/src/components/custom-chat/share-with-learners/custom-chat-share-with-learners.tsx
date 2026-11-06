'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ShareFatIcon } from '@phosphor-icons/react';
import { ServerActionResult } from '@shared/actions/server-action-result';
import {
  calculateShareSessionState,
  ShareSessionState,
} from '@shared/sharing/calculate-share-session-state';
import { Button } from '@ui/components/button';
import { Card, CardContent } from '@ui/components/card';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useToast } from '@/components/common/toast';
import { CustomChatHeading2 } from '@/components/custom-chat/custom-chat-heading2';
import { SharePollingData, useShareDataPolling } from '@/hooks/use-share-data-polling';

import CountDownTimer from '../../../app/(authed)/(chat-bot)/learning-scenarios/_components/count-down';
import { RichText } from '../../common/rich-text';
import { CustomChatAdjustTokenLimitDialog } from './custom-chat-adjust-token-limit-dialog';
import { CustomChatExtendShareExpirationDialog } from './custom-chat-extend-share-expiration-dialog';
import { CustomChatGraceWindowNote } from './custom-chat-grace-window-note';
import { CustomChatShareWarning } from './custom-chat-share-warning';
import {
  tokenPointsPercentageValues,
  usageTimeValuesInMinutes,
} from './custom-chat-share-with-learners-limit-params';
import { CustomChatStopShareButton } from './custom-chat-stop-share-button';
import { TimeLimitSelect } from './custom-chat-time-limit-select';
import { TokenPointsLeftRing } from './custom-chat-token-points-left-ring';
import {
  getMaxAvailablePercentage,
  resolveTokenPointsPercentageLimit,
} from './custom-chat-token-points-limit-select';
import { TokenPointsLimitSelect } from './custom-chat-token-points-limit-select';

const shareFormSchema = z.object({
  tokenPointsPercentageLimit: z.number(),
  usageTimeLimit: z.number(),
});

type ShareFormValues = z.infer<typeof shareFormSchema>;

interface CustomChatShareWithLearnersProps {
  expiredAt: Date | null;
  manuallyStoppedAt: Date | null;
  maxUsageTimeLimit: number | null;
  tokenPointsLimit: number | null;
  usedBudget: number;
  budgetUsedBySharedChat: number;
  maxBudget: number;
  onShare: (data: ShareFormValues) => Promise<{ success: boolean }>;
  onUnshare: () => Promise<{ success: boolean }>;
  onAddTime: (data: { additionalTimeInMinutes: number }) => Promise<{
    success: boolean;
    expiredAt?: Date;
  }>;
  onAdjustTokenLimit: (data: { tokenPointsPercentageLimit: number }) => Promise<{
    success: boolean;
    tokenPointsLimit?: number;
  }>;
  shareUILink: string;
  sharingDisabled?: boolean;
  onPollShareData: () => Promise<ServerActionResult<SharePollingData>>;
}

export function CustomChatShareWithLearners({
  expiredAt,
  manuallyStoppedAt,
  maxUsageTimeLimit,
  tokenPointsLimit,
  usedBudget,
  budgetUsedBySharedChat,
  maxBudget,
  onShare,
  onUnshare,
  onAddTime,
  onAdjustTokenLimit,
  shareUILink,
  sharingDisabled = false,
  onPollShareData,
}: CustomChatShareWithLearnersProps) {
  const toast = useToast();
  const router = useRouter();

  const t = useTranslations('custom-chat.share-with-learners');
  const tToast = useTranslations('custom-chat.toasts');

  const { isExtendable: sharedChatActiveInitial } = calculateShareSessionState({
    expiredAt,
    manuallyStoppedAt,
  });

  const { data: polledData, refetch: refetchShareData } = useShareDataPolling({
    fetchShareData: onPollShareData,
    isActive: sharedChatActiveInitial,
  });

  const currentExpiredAt = polledData?.expiredAt ?? expiredAt;
  const currentManuallyStoppedAt = polledData?.manuallyStoppedAt ?? manuallyStoppedAt;

  const { shareSessionState, timeLeftInSeconds, isExtendable } = calculateShareSessionState({
    expiredAt: currentExpiredAt,
    manuallyStoppedAt: currentManuallyStoppedAt,
  });

  // For display purposes, show 0 instead of negative time for expired sessions
  const sharedChatTimeLeft = Math.max(0, timeLeftInSeconds);

  const maxAvailablePercentage = getMaxAvailablePercentage({ usedBudget, maxBudget });

  const currentTokenPointsLimit = polledData?.tokenPointsLimit ?? tokenPointsLimit;
  const preselectedTokenPointsPercentageLimit = resolveTokenPointsPercentageLimit({
    previousTokenPointsLimit: currentTokenPointsLimit,
    selectableFixedValues: tokenPointsPercentageValues.filter(
      (value) => value < maxAvailablePercentage,
    ),
  });
  const currentTokenPointsPercentageLimit = preselectedTokenPointsPercentageLimit;

  const currentBudgetUsedBySharedChat =
    polledData?.budgetUsedBySharedChat ?? budgetUsedBySharedChat;
  const currentTokenLimitExceeded = polledData?.tokenLimitExceeded ?? false;
  const isShareWarningVisible =
    shareSessionState === ShareSessionState.EXPIRED_RECENTLY || currentTokenLimitExceeded;
  const isShareButtonDisabled = sharingDisabled || isShareWarningVisible;

  const preselectedUsageTimeLimit =
    maxUsageTimeLimit !== null && usageTimeValuesInMinutes.includes(maxUsageTimeLimit)
      ? maxUsageTimeLimit
      : 45;

  const { getValues: getValuesShare, setValue: setShareValue } = useForm<ShareFormValues>({
    resolver: zodResolver(shareFormSchema),
    defaultValues: {
      tokenPointsPercentageLimit: preselectedTokenPointsPercentageLimit,
      usageTimeLimit: preselectedUsageTimeLimit,
    },
  });

  async function handleStartSharing() {
    const data = getValuesShare();
    const parseResult = shareFormSchema.safeParse(data);
    if (!parseResult.success) {
      toast.error(tToast('share-toast-error'));
      return;
    }
    const result = await onShare(parseResult.data);

    if (result.success) {
      toast.success(tToast('share-toast-success'));
      router.push(shareUILink);
    } else {
      toast.error(tToast('share-toast-error'));
    }
  }

  return (
    <div className="flex flex-col gap-3 mb-5">
      <CustomChatHeading2 text={t('title')} />
      <Card>
        <CardContent>
          <p className="mb-4">
            <RichText>{(tags) => t.rich('description', tags)}</RichText>
          </p>
          {isShareWarningVisible && (
            <div className="mb-6 w-full">
              <CustomChatShareWarning info={t('share-not-possible')} />
            </div>
          )}
          {isExtendable ? (
            <>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch w-full">
                <div className="flex flex-col lg:flex-row gap-4 items-stretch w-full lg:w-1/2">
                  <Card className="bg-background-2 min-w-0 flex-1 py-4">
                    <CardContent className="px-2 h-full flex flex-col">
                      <div className="space-y-2">
                        <p className="text-sm">{t('max-token-points')}</p>
                        <div className="pr-6">
                          <TokenPointsLimitSelect
                            ariaLabel={t('max-token-points')}
                            defaultValue={currentTokenPointsPercentageLimit}
                            value={currentTokenPointsPercentageLimit}
                            disabled
                            pointsPercentageValues={[currentTokenPointsPercentageLimit]}
                            maxAvailablePercentage={maxAvailablePercentage}
                          />
                        </div>
                      </div>
                      <div className="mt-4 flex-1 space-y-2">
                        <p className="text-sm">{t('token-points-left')}</p>
                        <TokenPointsLeftRing
                          tokenLimit={(maxBudget * currentTokenPointsPercentageLimit) / 100}
                          spentTokens={currentBudgetUsedBySharedChat}
                          spentLabel={t('token-points-spent')}
                          ariaLabel={t('token-points-left')}
                          className="w-6 h-6"
                        />
                      </div>
                      <div className="mt-4 flex justify-center">
                        <CustomChatAdjustTokenLimitDialog
                          trigger={
                            <Button type="button" data-testid="adjust-token-limit-button">
                              {t('button-adjust-token-limit')}
                            </Button>
                          }
                          sharedChatActive={isExtendable}
                          currentTokenPointsPercentageLimit={currentTokenPointsPercentageLimit}
                          maxAvailablePercentage={maxAvailablePercentage}
                          onAdjustTokenLimit={onAdjustTokenLimit}
                          onAdjustTokenLimitSuccess={() => {
                            void refetchShareData();
                          }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="bg-background-2 min-w-0 flex-1 py-4">
                    <CardContent className="px-2 h-full flex flex-col">
                      <div className="space-y-2">
                        <p className="text-sm">{t('max-usage-time')}</p>
                        <div className="pr-6">
                          <TimeLimitSelect
                            ariaLabel={t('max-usage-time')}
                            defaultValue={getValuesShare('usageTimeLimit')}
                            disabled
                            usageTimeValuesInMinutes={[preselectedUsageTimeLimit]}
                          />
                        </div>
                      </div>
                      <div className="mt-4 flex-1 space-y-2">
                        <p className="text-sm">{t('usage-time-left')}</p>
                        <CountDownTimer
                          leftTimeInSeconds={sharedChatTimeLeft}
                          totalTimeInSeconds={(maxUsageTimeLimit ?? 0) * 60}
                          className="!bg-transparent"
                          stopWatchClassName="w-4 h-4"
                          onExpire={() => {
                            void refetchShareData();
                          }}
                        />
                      </div>
                      <div className="mt-4 flex justify-center">
                        <CustomChatExtendShareExpirationDialog
                          trigger={
                            <Button type="button" data-testid="add-additional-time-button">
                              {t('button-additional-time')}
                            </Button>
                          }
                          preselectedUsageTimeLimit={preselectedUsageTimeLimit}
                          currentUsageTimeRemaining={sharedChatTimeLeft}
                          onAddTime={onAddTime}
                          onAddTimeSuccess={() => {
                            void refetchShareData();
                          }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>
                <div className="w-full lg:w-1/2 lg:shrink-0 lg:grid lg:grid-rows-[1fr_auto_1fr]">
                  <div className="lg:flex lg:items-start lg:justify-center lg:pt-3">
                    <CustomChatGraceWindowNote
                      expiredAt={currentExpiredAt}
                      shareSessionState={shareSessionState}
                    />
                  </div>
                  <div className="flex justify-center">
                    <div className="flex flex-col gap-3 w-fit">
                      <Button
                        type="button"
                        onClick={() => router.push(shareUILink)}
                        aria-label={t('share')}
                        data-testid="open-share-page-button"
                        disabled={shareSessionState === ShareSessionState.EXPIRED_RECENTLY}
                        className="w-full"
                      >
                        <ShareFatIcon className="size-5" /> {t('button-to-share-page')}
                      </Button>
                      <CustomChatStopShareButton
                        onUnshare={onUnshare}
                        onStopShareSuccess={() => {
                          router.refresh();
                        }}
                        className="w-full"
                      />
                    </div>
                  </div>
                  <div />
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-4 items-end">
              <TokenPointsLimitSelect
                label={t('token-points')}
                ariaLabel={t('token-points')}
                defaultValue={getValuesShare('tokenPointsPercentageLimit')}
                onValueChange={(value) => setShareValue('tokenPointsPercentageLimit', value)}
                disabled={isExtendable || maxAvailablePercentage <= 0}
                pointsPercentageValues={tokenPointsPercentageValues}
                maxAvailablePercentage={maxAvailablePercentage}
              />
              <TimeLimitSelect
                label={t('max-usage-time')}
                ariaLabel={t('max-usage-time')}
                defaultValue={getValuesShare('usageTimeLimit')}
                onChange={(value) => setShareValue('usageTimeLimit', value)}
                disabled={isExtendable}
                usageTimeValuesInMinutes={usageTimeValuesInMinutes}
              />
              <div className="grow" />

              <Button
                type="button"
                onClick={handleStartSharing}
                disabled={isShareButtonDisabled}
                data-testid="start-share-button"
              >
                <ShareFatIcon className="size-5" />
                {t('button-start')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
