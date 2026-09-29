'use client';

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from '@ui/components/card';
import { SuspensionRequestEntityOverview } from '@shared/suspension/suspension-service';
import { EntityRef, EntityType } from '@shared/entities/entity-types';
import { Button } from '@ui/components/button';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { SuspensionRequestSelectModel } from '@shared/db/schema';
import Link from 'next/link';
import {
  getSuspensionRequestItemWithDetailsAction,
  liftSuspensionAction,
  markSuspensionRequestAsCheckedAction,
  suspendEntityAction,
} from '../../actions';
import { toast } from 'sonner';
import { Skeleton } from '@ui/components/skeleton';
import { SuspensionRequestItem } from './SuspensionRequestItem';
import { mapEntityTypeToLabel } from '@/utils/mapEntityTypeToLabel';

type SuspendedEntityDetailViewProps = {
  entityType: EntityType;
  entityId: string;
  chatBotEntityUrl: string;
};

export function SuspensionRequestItemDetailView({
  entityType,
  entityId,
  chatBotEntityUrl,
}: SuspendedEntityDetailViewProps) {
  const [suspensionRequestItemDetails, setSuspensionRequestItemDetails] =
    useState<SuspensionRequestEntityOverview>();
  const [suspensionRequests, setSuspensionRequests] = useState<SuspensionRequestSelectModel[]>([]);
  const [isPending, startTransition] = useTransition();

  const loadData = useCallback(async () => {
    startTransition(async () => {
      const result = await getSuspensionRequestItemWithDetailsAction({ entityType, entityId });
      if (result.success) {
        setSuspensionRequests(result.value.requests);
        setSuspensionRequestItemDetails(result.value.suspendedItem);
      } else {
        toast.error(result.error.message);
      }
    });
  }, [entityType, entityId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function canMarkAsChecked() {
    return suspensionRequestItemDetails?.status === 'new';
  }

  async function handleMarkAsChecked(suspensionRequestId: string) {
    const result = await markSuspensionRequestAsCheckedAction(suspensionRequestId);
    if (!result.success) {
      toast.error(result.error.message);
    }
    void loadData();
  }

  function canLiftSuspension() {
    return suspensionRequestItemDetails?.status === 'suspended';
  }

  async function handleLiftSuspension() {
    if (!suspensionRequestItemDetails) {
      return;
    }

    const entityRef: EntityRef = {
      entityType: suspensionRequestItemDetails.entityType,
      entityId: suspensionRequestItemDetails.entityId,
    };
    const result = await liftSuspensionAction(entityRef);
    if (!result.success) {
      toast.error(result.error.message);
    }
    void loadData();
  }

  function canSuspendEntity() {
    return (
      suspensionRequestItemDetails?.status === 'new' ||
      suspensionRequestItemDetails?.status === 'checked'
    );
  }

  async function handleSuspendEntity() {
    if (!suspensionRequestItemDetails) {
      return;
    }

    const entityRef: EntityRef = {
      entityType: suspensionRequestItemDetails.entityType,
      entityId: suspensionRequestItemDetails.entityId,
    };
    const result = await suspendEntityAction(entityRef);
    if (!result.success) {
      toast.error(result.error.message);
    }
    void loadData();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meldungen</CardTitle>
        <CardDescription>
          <div>
            Liste aller Meldungen für {mapEntityTypeToLabel(entityType)} mit ID {entityId}
          </div>
          <Link
            href={chatBotEntityUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            In AIS.chat öffnen
          </Link>
        </CardDescription>
        <CardAction className="flex gap-2">
          <Button
            variant="destructive"
            disabled={!canSuspendEntity()}
            onClick={handleSuspendEntity}
          >
            Sperren
          </Button>
          <Button disabled={!canLiftSuspension()} onClick={handleLiftSuspension}>
            Entsperren
          </Button>
        </CardAction>
      </CardHeader>
      {isPending ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-1/4" />
          <Skeleton className="h-10 w-1/4" />
          <Skeleton className="h-10 w-1/4" />
        </div>
      ) : (
        <CardContent className="flex flex-col gap-4">
          {suspensionRequests.map((request) => {
            return (
              <SuspensionRequestItem
                key={request.id}
                request={request}
                canMarkAsChecked={canMarkAsChecked()}
                onMarkAsChecked={handleMarkAsChecked}
              />
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}
