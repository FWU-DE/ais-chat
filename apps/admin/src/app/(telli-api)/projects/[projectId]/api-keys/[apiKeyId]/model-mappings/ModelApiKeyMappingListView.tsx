'use client';

import { isBifrostProviderSyncError } from '@ais-chat/api-database/bifrost-provider-sync/error';
import { logError } from '@shared/logging';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/components/table';
import { startTransition, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { LargeLanguageModel } from '@/types/large-language-model';
import { ModelApiKeyMapping } from '@/types/model-mappings';

import {
  getLargeLanguageModelsAction,
  getModelMappingsAction,
  saveModelMappingsAction,
} from './actions';

export type ModelApiKeyMappingListViewProps = {
  projectId: string;
  apiKeyId: string;
};

export function ModelApiKeyMappingListView({
  projectId,
  apiKeyId,
}: ModelApiKeyMappingListViewProps) {
  const [availableModels, setAvailableModels] = useState<LargeLanguageModel[]>([]);
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Zugeordnet</TableHead>
              <TableHead>Modell Name</TableHead>
              <TableHead>Anbieter</TableHead>
              <TableHead>Beschreibung</TableHead>
              <TableHead>Erstellt am</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {availableModels.map((model) => {
              const isAssigned = assignedModelIds.has(model.id);
              const mapping = modelApiKeyMappings.find((m) => m.llmModelId === model.id);

              return (
                <TableRow key={model.id}>
                  <TableCell>
                    <Checkbox
                      checked={isAssigned}
                      onCheckedChange={(checked) => handleModelToggle(model.id, checked as boolean)}
                      aria-label={`${model.displayName || model.name} zugeordnet`}
                    />
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{model.displayName || model.name}</div>
                      {model.displayName && model.name !== model.displayName && (
                        <div className="text-sm text-gray-500">{model.name}</div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {model.provider}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-xs truncate" title={model.description}>
                      {model.description || '-'}
                    </div>
                  </TableCell>
                  <TableCell>
                    {mapping ? new Date(mapping.createdAt).toLocaleString() : '-'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
