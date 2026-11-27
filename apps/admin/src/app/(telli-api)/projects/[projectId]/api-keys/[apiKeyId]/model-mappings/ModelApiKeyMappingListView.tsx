'use client';

import type { LlmModelWithSecrets } from '@ais-chat/api-database';
import { isBifrostProviderSyncError } from '@ais-chat/api-database/bifrost-provider-sync/error';
import { logError } from '@shared/logging';
import { formatDateToGermanTimestamp } from '@shared/utils/date';
import { Button } from '@ui/components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ui/components/card';
import { Checkbox } from '@ui/components/checkbox';
import { DataTable } from '@ui/components/data-table';
import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { type ModelColumn, nameColumn, typeColumn } from '@/app/(telli-api)/llms/model-columns';
import { sortableHeader } from '@/components/common/SortableHeader';
import { ModelApiKeyMapping } from '@/types/model-mappings';

import {
  getLargeLanguageModelsAction,
  getModelMappingsAction,
  saveModelMappingsAction,
} from './actions';

type ModelRow = LlmModelWithSecrets & { isAssigned: boolean; assignedAt: Date | null };

type Col = ModelColumn<ModelRow>;

const columns: Col[] = [
  {
    id: 'assigned',
    accessorFn: (model) => model.assignedAt !== null,
    header: sortableHeader('Zugeordnet'),
    sortFn: 'basic',
    cell: ({ row }) => (
      <Checkbox
        checked={row.original.isAssigned}
        aria-label={`${row.original.displayName || row.original.name} zugeordnet`}
      />
    ),
  },
  nameColumn(),
  typeColumn(),
  {
    accessorKey: 'description',
    header: sortableHeader('Beschreibung'),
    cell: ({ row }) => (
      <div className="max-w-xs truncate" title={row.original.description}>
        {row.original.description || '-'}
      </div>
    ),
  },
  {
    id: 'assignedAt',
    accessorFn: (model) => model.assignedAt?.getTime() ?? 0,
    header: sortableHeader('Zugeordnet am'),
    sortFn: 'basic',
    cell: ({ row }) =>
      row.original.assignedAt ? formatDateToGermanTimestamp(row.original.assignedAt) : '-',
  },
];

export type ModelApiKeyMappingListViewProps = {
  projectId: string;
  apiKeyId: string;
};

export function ModelApiKeyMappingListView({
  projectId,
  apiKeyId,
}: ModelApiKeyMappingListViewProps) {
  const [availableModels, setAvailableModels] = useState<LlmModelWithSecrets[]>([]);
  const [modelApiKeyMappings, setModelApiKeyMappings] = useState<ModelApiKeyMapping[]>([]);
  const [assignedModelIds, setAssignedModelIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [mappings, models] = await Promise.all([
        getModelMappingsAction(projectId, apiKeyId),
        getLargeLanguageModelsAction(),
      ]);

      setModelApiKeyMappings(mappings);
      setAvailableModels(models);
      setAssignedModelIds(
        new Set(mappings.map((mapping: ModelApiKeyMapping) => mapping.llmModelId)),
      );
    } catch (error) {
      logError('Error loading data', error);
      toast.error('Fehler beim Laden der Daten');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, apiKeyId]);

  useEffect(() => {
    startTransition(async () => {
      await loadData();
    });
  }, [projectId, apiKeyId, loadData]);

  const handleModelToggle = (modelId: string, checked: boolean) => {
    setAssignedModelIds((prev) => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(modelId);
      } else {
        newSet.delete(modelId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setAssignedModelIds(new Set(availableModels.map((model) => model.id)));
  };

  const handleDeselectAll = () => {
    setAssignedModelIds(new Set());
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveModelMappingsAction(projectId, apiKeyId, Array.from(assignedModelIds));
      toast.success('Zuordnungen erfolgreich gespeichert');
      // Reload data to reflect changes
      await loadData();
    } catch (error) {
      logError('Error saving assignments', error);
      if (isBifrostProviderSyncError(error)) {
        toast.error('Fehler beim Aktualisieren der Bifrost-Zuordnung');
        return;
      }

      toast.error('Fehler beim Speichern der Zuordnungen');
    } finally {
      setIsSaving(false);
    }
  };

  const rows = useMemo<ModelRow[]>(() => {
    const assignedAtByModelId = new Map(
      modelApiKeyMappings.map((mapping) => [mapping.llmModelId, new Date(mapping.createdAt)]),
    );
    return availableModels.map((model) => ({
      ...model,
      isAssigned: assignedModelIds.has(model.id),
      assignedAt: assignedAtByModelId.get(model.id) ?? null,
    }));
  }, [availableModels, assignedModelIds, modelApiKeyMappings]);

  if (isLoading) {
    return (
      <Card>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">Lade Modelle...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Modell-Zuordnungen</CardTitle>
        <CardDescription>
          Verfügbare Modelle für diesen API-Schlüssel. Wählen Sie die Modelle aus, die diesem
          API-Schlüssel zugeordnet werden sollen.
        </CardDescription>
        <CardAction>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Speichere...' : 'Zuordnungen speichern'}
          </Button>
          <Button onClick={loadData} disabled={isLoading} className="ml-2">
            Aktualisieren
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 pb-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
            disabled={availableModels.length === 0}
          >
            Alle auswählen
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDeselectAll}
            disabled={availableModels.length === 0}
          >
            Alle abwählen
          </Button>
        </div>
        <DataTable
          columns={columns}
          data={rows}
          focusableRows={false}
          rowClickHandler={(model) => handleModelToggle(model.id, !model.isAssigned)}
        />
      </CardContent>
    </Card>
  );
}
