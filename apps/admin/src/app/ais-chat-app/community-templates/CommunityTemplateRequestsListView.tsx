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
import { MultipleSelectDropdown } from '@ui/components/multiple-select-dropdown';
import { Skeleton } from '@ui/components/skeleton';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { getCommunityTemplateRequestsAction } from './actions';
import { Button } from '@ui/components/button';
import {
  columns,
  communityTemplateRequestStatusOptions,
  type CommunityTemplateRequestStatus,
} from './columns';
import { ColumnFiltersState } from '@tanstack/react-table';
import { CommunityTemplateRequestSummary } from '@shared/community-templates/community-template-service.admin';
import { Field, FieldLabel } from '@ui/components/field';
import { useRouter } from 'next/navigation';
import { ROUTES } from '@/consts/routes';

export default function CommunityTemplateRequestsListView() {
  const router = useRouter();
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
    router.push(ROUTES.app.communityTemplateRequest(row.id));
  }

  function updateColumnFilter(id: string, value: string | string[]) {
    setColumnFilters((currentFilters) => {
      const otherFilters = currentFilters.filter((filter) => filter.id !== id);
      return value.length > 0 ? [...otherFilters, { id, value }] : otherFilters;
    });
  }

  const selectedStatuses =
    (columnFilters.find((filter) => filter.id === 'state')
      ?.value as CommunityTemplateRequestStatus[]) ?? [];

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
            <div className="grid max-w-3xl grid-cols-1 items-end gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Nach Name filtern</FieldLabel>
                <Input
                  className="m-0"
                  data-testid="community-template-name-filter"
                  placeholder="Vorlagenname"
                  value={
                    (columnFilters.find((filter) => filter.id === 'entityName')?.value as string) ??
                    ''
                  }
                  onChange={(event) => updateColumnFilter('entityName', event.target.value)}
                />
              </Field>
              <MultipleSelectDropdown
                label="Nach Status filtern"
                value={selectedStatuses}
                onValueChange={(statuses) => updateColumnFilter('state', statuses)}
                optionGroups={[{ options: communityTemplateRequestStatusOptions }]}
                placeholder="Alle Status"
                testId="community-template-status-filter"
                selectedCountLabel={(count) => `${count} ausgewählt`}
              />
            </div>
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
