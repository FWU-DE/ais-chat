'use client';

import { CommunityTemplateRequestMutationResult } from '@/hooks/use-community-template-request';
import { CommunityTemplateRequestWithEvents } from '@shared/community-templates/community-template-service';
import { Chip } from '@ui/components/chip';
import { useTranslations } from 'next-intl';
import { Card, CardRow } from '@ui/components/card';
import { CommunityTemplateRequestEvent } from './community-template-request-event';
import { Button } from '@ui/components/button';
import { ScrollArea } from '@ui/components/scroll-area';
import {
  CaretDownIcon,
  CaretUpIcon,
  ChatTextIcon,
  PaperPlaneRightIcon,
} from '@phosphor-icons/react';
import { useToast } from '@/components/common/toast';
import { useState } from 'react';
import { CommunityTemplateMessageDialog } from './community-template-message-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@ui/components/collapsible';

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
  const showRequestDetails = requestWithEvents.state === 'rejected';
  const [isOpen, setIsOpen] = useState(showRequestDetails);
  const canResubmit = requestWithEvents.state === 'rejected';

  async function handleResubmit() {
    setIsResubmitting(true);
    const result = await onResubmit();
    setIsResubmitting(false);

    if (!result.success) {
      toast.error(t('toasts.resubmit-toast-error'));
    }
  }

  return requestWithEvents.state === 'approved' ? null : (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="mt-3">
        <CardRow className="flex flex-col gap-4">
          <div className="flex flex-row gap-2 items-center">
            <span className="text-base font-medium">{t('title')}</span>
            <Chip
              className={
                requestWithEvents.state === 'rejected'
                  ? 'bg-warning/30 text-warning-foreground'
                  : ''
              }
            >
              {t(`status.${requestWithEvents.state}`)}
            </Chip>
            <CollapsibleTrigger asChild>
              <Button className="ml-auto" variant="ghost">
                {isOpen ? <CaretUpIcon /> : <CaretDownIcon />}
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent className="flex flex-col gap-4">
            <div className="flex flex-row gap-4">
              {canResubmit && (
                <Button type="button" onClick={handleResubmit} disabled={isResubmitting}>
                  <PaperPlaneRightIcon />
                  {t('actions.resubmit')}
                </Button>
              )}
              <CommunityTemplateMessageDialog
                onSendMessage={onSendMessage}
                trigger={
                  <Button type="button">
                    <ChatTextIcon />
                    {t('actions.message-editor')}
                  </Button>
                }
              />
            </div>
            <ScrollArea className="max-h-40">
              <ul className="flex flex-col gap-6 pr-4">
                {requestWithEvents.events.map((event) => (
                  <li key={event.id}>
                    <CommunityTemplateRequestEvent event={event} />
                  </li>
                ))}
              </ul>
            </ScrollArea>
          </CollapsibleContent>
        </CardRow>
      </Card>
    </Collapsible>
  );
}
