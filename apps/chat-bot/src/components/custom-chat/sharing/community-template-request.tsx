'use client';

import { CommunityTemplateRequestMutationResult } from '@/hooks/use-community-template-request';
import { CommunityTemplateRequestWithEvents } from '@shared/community-templates/community-template-service';
import { Chip } from '@ui/components/chip';
import { useTranslations } from 'next-intl';
import { Card, CardRow } from '@ui/components/card';
import { CommunityTemplateRequestEvent } from './community-template-request-event';
import { Button } from '@ui/components/button';
import { ChatTextIcon, PaperPlaneRightIcon } from '@phosphor-icons/react';
import { useToast } from '@/components/common/toast';
import { useState } from 'react';
import { CommunityTemplateMessageDialog } from './community-template-message-dialog';

type CommunityTemplateRequestProps = {
  requestWithEvents: CommunityTemplateRequestWithEvents;
  onResubmit: () => Promise<CommunityTemplateRequestMutationResult>;
  onSendMessage: (message: string) => Promise<CommunityTemplateRequestMutationResult>;
};

export function CommunityTemplateRequest({
  requestWithEvents,
  onResubmit,
  onSendMessage,
}: CommunityTemplateRequestProps) {
  const t = useTranslations('community-sharing');
  const toast = useToast();
  const [isResubmitting, setIsResubmitting] = useState(false);
  const canResubmit =
    requestWithEvents.state === 'rejected' || requestWithEvents.state === 'cancelled';

  async function handleResubmit() {
    setIsResubmitting(true);
    const result = await onResubmit();
    setIsResubmitting(false);

    if (!result.success) {
      toast.error(t('toasts.resubmit-toast-error'));
    }
  }

  return (
    <Card className="mt-3">
      <CardRow className="flex flex-col">
        <div className="flex flex-row gap-2">
          <span className="text-base font-medium">{t('title')}</span>
          <Chip>{t(`status.${requestWithEvents.state}`)}</Chip>
        </div>
        <div className="flex flex-row gap-4">
          {canResubmit && (
            <Button onClick={handleResubmit} disabled={isResubmitting}>
              <PaperPlaneRightIcon />
              {t('actions.resubmit')}
            </Button>
          )}
          <CommunityTemplateMessageDialog
            onSendMessage={onSendMessage}
            trigger={
              <Button>
                <ChatTextIcon />
                {t('actions.message-editor')}
              </Button>
            }
          />
        </div>
        <ul className="flex flex-col gap-6">
          {requestWithEvents.events.map((event) => (
            <li key={event.id}>
              <CommunityTemplateRequestEvent event={event} />
            </li>
          ))}
        </ul>
      </CardRow>
    </Card>
  );
}
