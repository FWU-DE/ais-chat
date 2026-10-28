'use client';

import { useId } from 'react';
import Link from 'next/link';
import { cn } from '@/utils/tailwind';
import { truncateClassName } from '@/utils/tailwind/truncate';
import AvatarPicture from '@/components/common/avatar-picture';
import { useTranslations } from 'next-intl';
import { ChatTextIcon, ImageSquareIcon } from '@phosphor-icons/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@ui/components/tooltip';
import { Button } from '@ui/components/button';
import CountDownTimer from '@/app/(authed)/(chat-bot)/learning-scenarios/_components/count-down';
import { calculateShareSessionState } from '@shared/sharing/calculate-share-session-state';

type ShareInfo = {
  expiredAt: Date | null;
  maxUsageTimeLimit: number | null;
  manuallyStoppedAt?: Date | null;
};

type EntityCardProps = {
  name: string;
  description: string | null;
  avatarUrl: string | undefined;
  isOwned: boolean;
  href: string;
  chatHref?: string;
  shareInfo?: ShareInfo;
};

export default function EntityCard({
  name,
  description,
  avatarUrl,
  isOwned,
  href,
  chatHref,
  shareInfo,
}: EntityCardProps) {
  const { timeLeftInSeconds, isExtendable } = shareInfo
    ? calculateShareSessionState(shareInfo)
    : { timeLeftInSeconds: -1, isExtendable: false };

  const t = useTranslations('entity-overview');
  const tCommon = useTranslations('common');

  const descriptionId = useId();

  return (
    <div
      className="rounded-enterprise-md border flex items-center w-full hover:border-primary bg-card has-[[data-card-link]:focus-visible]:ring-2 has-[[data-card-link]:focus-visible]:ring-ring"
      data-testid="entity-card"
    >
      <Link
        href={href}
        prefetch={false}
        aria-label={name}
        aria-describedby={description ? descriptionId : undefined}
        data-card-link
        className="flex items-center gap-4 grow min-w-0 p-4 outline-none"
        data-testid="entity-link"
      >
        <figure className="w-15 h-15 bg-primary/7 rounded-full flex justify-center items-center shrink-0">
          {avatarUrl ? (
            <AvatarPicture src={avatarUrl} alt={`${name} Avatar`} variant="smallCircle" />
          ) : (
            <ImageSquareIcon
              className="w-8 h-8 text-primary/30 "
              aria-hidden="true"
              weight="thin"
            />
          )}
        </figure>

        <div className="flex flex-col gap-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <h2 className={cn('font-medium leading-none py-0.5', truncateClassName)}>{name}</h2>
            {isOwned && (
              <span className="inline-flex items-center rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary shrink-0 uppercase tracking-wider">
                {t('badge-mine')}
              </span>
            )}
          </div>
          {description && (
            <span id={descriptionId} className={cn(truncateClassName, 'text-gray-600')}>
              {description}
            </span>
          )}
        </div>
      </Link>

      {isExtendable && (
        <CountDownTimer
          leftTimeInSeconds={timeLeftInSeconds}
          totalTimeInSeconds={(shareInfo?.maxUsageTimeLimit ?? 0) * 60}
          className={cn('shrink-0 text-sm min-w-0 px-2 py-1', !chatHref && 'mr-4')}
          stopWatchClassName="w-4 h-4"
        />
      )}

      {chatHref && (
        <Tooltip>
          <TooltipTrigger asChild disableKeyboardToggle>
            <Button
              asChild
              data-testid="chat-button"
              variant="ghost"
              size="icon-round"
              className="mx-4"
            >
              <Link href={chatHref} prefetch={false} aria-label={tCommon('new-chat')}>
                <ChatTextIcon aria-hidden="true" className="size-6 text-primary" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('chat')}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
