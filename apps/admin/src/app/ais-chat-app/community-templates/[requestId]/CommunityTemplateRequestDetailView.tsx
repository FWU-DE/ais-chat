'use client';

import { useEffect, useState } from 'react';
import {
  approveRequestAction,
  getCommunityTemplateRequestWithEventsForAdminAction,
  rejectRequestAction,
  sendMessageToAuthorAction,
  updateInternalNoteAction,
} from './actions';
import { CommunityTemplateRequestWithEventsAdmin } from '@shared/community-templates/community-template-service.admin';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@ui/components/card';
import { Button } from '@ui/components/button';
import { Textarea } from '@ui/components/textarea';
import { ExternalLink } from '@/components/navigation/ExternalLink';
import { mapEntityTypeToLabel } from '@/utils/mapEntityTypeToLabel';
import { mapStateToLabel } from '../columns';
import RejectCommunityTemplateRequestDialog from './RejectCommunityTemplateRequestDialog';
import SendMessageToAuthorDialog from './SendMessageToAuthorDialog';
import { CheckIcon, FloppyDiskIcon } from '@phosphor-icons/react';
import { cn } from '@ui/lib/utils';
import { toast } from 'sonner';

export type CommunityTemplateRequestDetailViewProps = {
  requestId: string;
  chatBotEntityUrl: string;
  initialData: CommunityTemplateRequestWithEventsAdmin;
};

export default function CommunityTemplateRequestDetailView(
  props: CommunityTemplateRequestDetailViewProps,
) {
  const { requestId, chatBotEntityUrl, initialData } = props;

  const [data, setData] = useState<CommunityTemplateRequestWithEventsAdmin>(initialData);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  useEffect(() => {
    // reloadTrigger starts at 0 so the initial fetch is skipped; initialData is already fresh
    if (reloadTrigger === 0) return;

    async function fetchData() {
      const result = await getCommunityTemplateRequestWithEventsForAdminAction(requestId);
      if (result.success) {
        setData(result.value);
      } else {
        toast.error(result.error.message);
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

  const handleApprove = async () => {
    const result = await approveRequestAction(requestId);
    if (result.success) {
      setReloadTrigger((currentTrigger) => currentTrigger + 1);
    } else {
      toast.error(result.error.message);
    }
  };

  const handleReject = async (message: string) => {
    const result = await rejectRequestAction(requestId, message);
    if (result.success) {
      setReloadTrigger((currentTrigger) => currentTrigger + 1);
    } else {
      toast.error(result.error.message);
    }
    return result.success;
  };

  const handleSendMessage = async (message: string) => {
    const result = await sendMessageToAuthorAction(requestId, message);
    if (result.success) {
      setReloadTrigger((currentTrigger) => currentTrigger + 1);
    } else {
      toast.error(result.error.message);
    }
    return result.success;
  };

  const handleUpdateNote = async (note: string) => {
    const result = await updateInternalNoteAction(requestId, note);
    if (result.success) {
      setReloadTrigger((currentTrigger) => currentTrigger + 1);
    } else {
      toast.error(result.error.message);
    }
    return result.success;
  };

  return (
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
              <ExternalLink href={chatBotEntityUrl}>{data.id}</ExternalLink>
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
              <Button disabled={!isApprovePossible} onClick={handleApprove}>
                <CheckIcon />
                Freigeben
              </Button>
              <RejectCommunityTemplateRequestDialog
                requestState={data.state}
                onReject={handleReject}
              />
            </dd>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Interne Notizen</CardTitle>
          <CardAction>
            <Button onClick={async () => await handleUpdateNote(data.note)}>
              <FloppyDiskIcon />
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
            <SendMessageToAuthorDialog onSendMessage={handleSendMessage} />
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
