'use client';

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ui/components/card';
import { DataTable } from '@ui/components/data-table';
import { Input } from '@ui/components/input';
import { Skeleton } from '@ui/components/skeleton';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { getCommunityTemplateRequestsAction } from './actions';
import { CommunityTemplateRequestSelectModel } from '@shared/db/schema';
import { Button } from '@ui/components/button';
import { columns } from './columns';
import { ColumnFiltersState } from '@tanstack/react-table';
import { CommunityTemplateRequestSummary } from '@shared/community-templates/community-template-service.admin';

export default function CommunityTemplateRequestsListView() {
  const [requests, setRequests] = useState<CommunityTemplateRequestSummary[]>([]);
  const [isPending, startTransition] = useTransition();
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  async function loadData() {
    startTransition(async () => {
      const result = await getCommunityTemplateRequestsAction();
      if (result.success) {
        setRequests(result.value as CommunityTemplateRequestSummary[]);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  useEffect(() => {
    void loadData();
  }, []);

  const handleRefresh = () => {
    void loadData();
  };

  function handleRowClicked(row: CommunityTemplateRequestSummary): void {
    // router.push(ROUTES.app.suspensionDetails(row.entityType, row.entityId));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Community Vorlagen</CardTitle>
        <CardDescription>
          Liste aller Community Vorlagen für Assistenten, Dialogpartner und Lernszenarien.
        </CardDescription>
        <CardAction>
          <Button disabled={isPending} onClick={handleRefresh} className="ml-2">
            {isPending ? 'Lädt...' : 'Aktualisieren'}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-full rounded" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Input
              placeholder="Nach Name filtern"
              value={(columnFilters.find((f) => f.id === 'entityName')?.value as string) ?? ''}
              onChange={(e) => setColumnFilters([{ id: 'entityName', value: e.target.value }])}
              className="max-w-sm"
            />
            <DataTable
              columns={columns}
              data={requests}
              rowClickHandler={handleRowClicked}
              columnFilters={columnFilters}
              onColumnFiltersChange={setColumnFilters}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
