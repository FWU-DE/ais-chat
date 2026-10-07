'use client';

import { useToast } from '@/components/common/toast';
import { CommunityTemplateRequestMutationResult } from '@/hooks/use-community-template-request';
import {
  CaretDownIcon,
  CaretUpIcon,
  ChatTextIcon,
  PaperPlaneRightIcon,
} from '@phosphor-icons/react';
import { CommunityTemplateRequestWithEvents } from '@shared/community-templates/community-template-service';
import { Button } from '@ui/components/button';
import { Card, CardRow } from '@ui/components/card';
import { Chip } from '@ui/components/chip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@ui/components/collapsible';
import { ScrollArea } from '@ui/components/scroll-area';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { CommunityTemplateMessageDialog } from './community-template-message-dialog';
import { CommunityTemplateRequestEvent } from './community-template-request-event';

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
          <CollapsibleTrigger asChild className="cursor-pointer">
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
              <Button className="ml-auto" variant="ghost">
                {isOpen ? <CaretUpIcon /> : <CaretDownIcon />}
              </Button>
            </div>
          </CollapsibleTrigger>
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
            <ScrollArea className="max-h-96">
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
