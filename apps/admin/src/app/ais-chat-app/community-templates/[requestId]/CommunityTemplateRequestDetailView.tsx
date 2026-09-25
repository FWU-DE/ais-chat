'use client';

import { useEffect, useState } from 'react';
import {
  getCommunityTemplateRequestWithEventsForAdminAction,
  updateInternalNoteAction,
} from './actions';
import { CommunityTemplateRequestWithEventsAdmin } from '@shared/community-templates/community-template-service.admin';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@ui/components/card';
import { Button } from '@ui/components/button';
import { Textarea } from '@ui/components/textarea';
import { ExternalLink } from '@/components/navigation/ExternalLink';
import { buildChatBotEntityUrl } from '@/utils/buildChatBotEntityUrl';
import { mapEntityTypeToLabel } from '@/utils/mapEntityTypeToLabel';
import { mapStateToLabel } from '../columns';
import RejectCommunityTemplateRequestDialog from './RejectCommunityTemplateRequestDialog';
import SendMessageToAuthorDialog from './SendMessageToAuthorDialog';
import { CheckIcon } from '@phosphor-icons/react';
import { cn } from '@ui/lib/utils';
export const dynamic = 'force-dynamic';

export type CommunityTemplateRequestDetailViewProps = {
  requestId: string;
  host: string;
};

export default function CommunityTemplateRequestDetailView(
  props: CommunityTemplateRequestDetailViewProps,
) {
  const { requestId, host } = props;

  const [data, setData] = useState<CommunityTemplateRequestWithEventsAdmin | undefined>(undefined);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  useEffect(() => {
    async function fetchData() {
      const result = await getCommunityTemplateRequestWithEventsForAdminAction(requestId);
      if (result.success) {
        setData(result.value);
      }
    }
    void fetchData();
  }, [requestId, reloadTrigger]);

  const latestReviewedAt = data?.events
    ?.filter((event) => event.createdByRole === 'editor')
    ?.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0]?.createdAt;

  const latestReviewedFrom = data?.events
    ?.filter((event) => event.createdByRole === 'editor')
    ?.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0]?.createdByName;

  const isApprovePossible = data?.state === 'submitted' || data?.state === 'rejected';

  return data === undefined ? (
    <div>Loading...</div>
  ) : (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-row justify-between">
            <span className="font-medium">{data.entityName}</span>
            <span className="font-medium">{mapEntityTypeToLabel(data.entityType)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[150px_1fr] gap-4 [&>dt]:text-muted-foreground">
            <dt>ID:</dt>
            <dd>
              <ExternalLink
                href={buildChatBotEntityUrl(
                  data.entityType,
                  data.assistantId ?? data.characterId ?? data.learningScenarioId ?? '',
                  host,
                )}
              >
                {data.id}
              </ExternalLink>
            </dd>
            <dt>Erstellt am:</dt>
            <dd>{data.createdAt.toLocaleString()}</dd>
            <dt>Zuletzt geprüft am:</dt>
            <dd>{latestReviewedAt?.toLocaleString()}</dd>
            <dt>Zuletzt geprüft von:</dt>
            <dd>{latestReviewedFrom}</dd>
            <dt>Status</dt>
            <dd>{mapStateToLabel(data.state)}</dd>
            <dt></dt>
            <dd className="flex flex-row gap-4">
              <Button disabled={!isApprovePossible}>
                <CheckIcon />
                Freigeben
              </Button>
              <RejectCommunityTemplateRequestDialog
                requestId={requestId}
                requestState={data.state}
                onRejected={async () => setReloadTrigger((currentTrigger) => currentTrigger + 1)}
              />
            </dd>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Interne Notizen</CardTitle>
          <CardAction>
            <Button
              onClick={async () => {
                await updateInternalNoteAction(requestId, data.note);
                setReloadTrigger((currentTrigger) => currentTrigger + 1);
              }}
            >
              Speichern
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Textarea
            className="min-h-30"
            value={data.note}
            onChange={(event) =>
              setData((currentData) =>
                currentData ? { ...currentData, note: event.target.value } : currentData,
              )
            }
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Verlauf</CardTitle>
          <CardAction>
            <SendMessageToAuthorDialog
              requestId={requestId}
              onSendMessage={async () => setReloadTrigger((currentTrigger) => currentTrigger + 1)}
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-8">
            {data.events.map((event) => (
              <li key={event.id} className="flex flex-col gap-2 text-sm font-normal">
                <div className="flex flex-row gap-4 items-center">
                  <span className="font-medium">{mapEventTypeToLabel(event.eventType)}</span>
                  {event.createdByName && (
                    <span className="text-xs font-normal text-foreground/60">
                      {event.createdByName}
                    </span>
                  )}
                  <span className="text-xs font-normal text-foreground/60">
                    {event.createdAt.toLocaleString()}
                  </span>
                </div>
                {event.message && (
                  <div
                    className={cn(
                      'px-4 py-3 rounded-xl rounded-br-none',
                      event.createdByRole === 'editor' ? 'bg-primary/10' : 'bg-secondary/30',
                    )}
                  >
                    {event.message}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function mapEventTypeToLabel(
  eventType: CommunityTemplateRequestWithEventsAdmin['events'][number]['eventType'],
) {
  switch (eventType) {
    case 'approve':
      return 'Freigegeben';
    case 'cancel':
      return 'Zurückgezogen';
    case 'reject':
      return 'Änderungen erforderlich';
    case 'submit':
      return 'Eingereicht';
    case 'editor_message':
      return 'Nachricht von AIS.chat-Redaktion';
    case 'user_message':
      return 'Nachricht von Autor/Autorin';
    default:
      return eventType;
  }
}
