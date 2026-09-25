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
          {data.events.map((event) => (
            <div key={event.id}>
              <div>{event.createdAt.toLocaleString()}</div>
              <div>{event.createdByName}</div>
              <div>{event.createdByRole}</div>
              <div>{event.eventType}</div>
              <div>{event.message}</div>
            </div>
          ))}
        </CardContent>
      </Card>
      <div></div>
      <div>{requestId}</div>
      <div>{JSON.stringify(data)}</div>
    </div>
  );
}
