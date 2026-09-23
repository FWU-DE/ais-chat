'use client';

import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { type ColumnDef } from '@tanstack/react-table';
import { DataTable, type DataTableFeatures } from '@ui/components/data-table';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ui/components/card';
import { Button } from '@ui/components/button';
import { Checkbox } from '@ui/components/checkbox';
import { logError } from '@shared/logging';
import { toast } from 'sonner';
import { ArrowUpDownIcon } from 'lucide-react';
import { getLlmApiKeyAssignmentsDataAction, saveApiKeysForModelAction } from './actions';

export type LlmApiKeyAssignmentsViewProps = {
  organizationId: string;
  modelId: string;
};

type OrganizationApiKey = Awaited<
  ReturnType<typeof getLlmApiKeyAssignmentsDataAction>
>['apiKeys'][number];

export function LlmApiKeyAssignmentsView({
  organizationId,
  modelId,
}: LlmApiKeyAssignmentsViewProps) {
  const [apiKeys, setApiKeys] = useState<OrganizationApiKey[]>([]);
  const [assignedApiKeyIds, setAssignedApiKeyIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const { apiKeys, assignedApiKeyIds } = await getLlmApiKeyAssignmentsDataAction(
        organizationId,
        modelId,
      );

      setApiKeys(apiKeys);
      setAssignedApiKeyIds(new Set(assignedApiKeyIds));
    } catch (error) {
      logError('Error loading API key assignments', error);
      toast.error('Fehler beim Laden der API-Schlüssel');
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, modelId]);

  useEffect(() => {
    startTransition(async () => {
      await loadData();
    });
  }, [loadData]);

  const handleToggle = (apiKeyId: string, checked: boolean) => {
    setAssignedApiKeyIds((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(apiKeyId);
      } else {
        newSet.delete(apiKeyId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setAssignedApiKeyIds(new Set(apiKeys.map((apiKey) => apiKey.id)));
  };

  const handleDeselectAll = () => {
    setAssignedApiKeyIds(new Set());
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await saveApiKeysForModelAction(
        organizationId,
        modelId,
        Array.from(assignedApiKeyIds),
      );
      if (result.success) {
        toast.success('Zuordnungen erfolgreich gespeichert');
        await loadData();
      } else {
        toast.error(result.error.message);
      }
    } catch (error) {
      logError('Error saving API key assignments', error);
      toast.error('Fehler beim Speichern der Zuordnungen');
    } finally {
      setIsSaving(false);
    }
  };

  const columns = useMemo<ColumnDef<DataTableFeatures, OrganizationApiKey>[]>(
    () => [
      {
        id: 'assigned',
        accessorFn: (apiKey) => assignedApiKeyIds.has(apiKey.id),
        header: ({ column }) => (
          <Button
            variant="link"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Zugeordnet
            <ArrowUpDownIcon className="ml-2 h-4 w-4" />
          </Button>
        ),
        sortingFn: 'basic',
        cell: ({ row }) => (
          <Checkbox
            checked={assignedApiKeyIds.has(row.original.id)}
            onCheckedChange={(checked) => handleToggle(row.original.id, checked as boolean)}
          />
        ),
      },
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <Button
            variant="link"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Name
            <ArrowUpDownIcon className="ml-2 h-4 w-4" />
          </Button>
        ),
      },
      {
        accessorKey: 'projectName',
        header: ({ column }) => (
          <Button
            variant="link"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Projekt
            <ArrowUpDownIcon className="ml-2 h-4 w-4" />
          </Button>
        ),
      },
    ],
    [assignedApiKeyIds],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>API-Schlüssel-Zuordnungen</CardTitle>
        <CardDescription>
          Wählen Sie die API-Schlüssel aus, denen dieses Modell zugeordnet werden soll.
        </CardDescription>
        <CardAction>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? 'Speichere...' : 'Zuordnungen speichern'}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">Lade API-Schlüssel...</div>
          </div>
        ) : (
          <>
            <div className="flex gap-2 pb-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                disabled={apiKeys.length === 0}
              >
                Alle auswählen
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleDeselectAll}
                disabled={apiKeys.length === 0}
              >
                Alle abwählen
              </Button>
            </div>
            {apiKeys.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Keine API-Schlüssel in dieser Organisation vorhanden.
              </p>
            ) : (
              <DataTable columns={columns} data={apiKeys} />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
