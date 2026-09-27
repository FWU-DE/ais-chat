'use client';

import { CommunityTemplateRequestWithEvents } from '@shared/community-templates/community-template-service';
import { Chip } from '@ui/components/chip';
import { useTranslations } from 'next-intl';
import { Card, CardRow } from '@ui/components/card';
import { CommunityTemplateRequestEvent } from './community-template-request-event';

type CommunityTemplateRequestProps = {
  requestWithEvents: CommunityTemplateRequestWithEvents;
};

export function CommunityTemplateRequest({ requestWithEvents }: CommunityTemplateRequestProps) {
  const t = useTranslations('community-sharing');

  return (
    <Card className="mt-3">
      <CardRow className="flex flex-col">
        <div className="flex flex-row gap-2">
          <span className="text-base font-medium">{t('title')}</span>
          <Chip>{t(`status.${requestWithEvents.state}`)}</Chip>
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
