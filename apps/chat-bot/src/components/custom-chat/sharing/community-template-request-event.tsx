'use client';

import { type CommunityTemplateRequestEventSelectModel } from '@shared/db/schema';
import { formatDateToGermanTimestamp } from '@shared/utils/date';
import { useTranslations } from 'next-intl';
import { CommunityTemplateRequestEventMessage } from './community-template-request-event-message';

export type CommunityTemplateRequestEventProps = {
  event: Pick<
    CommunityTemplateRequestEventSelectModel,
    'createdAt' | 'createdByRole' | 'eventType' | 'message'
  >;
};

export function CommunityTemplateRequestEvent({ event }: CommunityTemplateRequestEventProps) {
  const { createdAt, createdByRole, eventType, message } = event;
  const t = useTranslations('community-sharing');

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row gap-2 items-center">
        <span className="text-sm font-medium">{t(`event-type.${eventType}`)}</span>
        <span className="text-xs font-normal text-foreground/60">
          {formatDateToGermanTimestamp(createdAt)}
        </span>
      </div>
      <CommunityTemplateRequestEventMessage message={message} createdByRole={createdByRole} />
    </div>
  );
}
