'use client';

import { SuspensionRequestEntityOverview } from '@shared/suspension/suspension-service';
import { type ColumnFiltersState } from '@tanstack/react-table';
import { Button } from '@ui/components/button';
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
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { ROUTES } from '@/consts/routes';

import { getSuspensionRequestEntitiesAction } from './actions';
import { columns } from './columns';

export default function SuspensionRequestEntitiesOverview() {
  const [suspensionRequestEntities, setSuspensionRequestEntities] = useState<
    SuspensionRequestEntityOverview[]
  >([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function loadData() {
    startTransition(async () => {
      const result = await getSuspensionRequestEntitiesAction();
      if (result.success) {
        setSuspensionRequestEntities(result.value as SuspensionRequestEntityOverview[]);
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

  function handleRowClicked(row: SuspensionRequestEntityOverview): void {
    router.push(ROUTES.app.suspensionDetails(row.entityType, row.entityId));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gemeldete Inhalte</CardTitle>
        <CardDescription>Übersicht aller gemeldeten Inhalte (AS/DP/LS).</CardDescription>
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
              data={suspensionRequestEntities}
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
