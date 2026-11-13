'use client';

import { FederalStateModel } from '@shared/federal-states/types';
import { Button } from '@ui/components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ui/components/card';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@ui/components/select';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';

import { updateApiKeyIdAction } from './actions';

type ApiKeyOption = { id: string; name: string; projectName: string };

export type FederalStateUpdateApiKeyProps = {
  federalState: FederalStateModel;
  apiKeys: ApiKeyOption[];
};

function groupByProject(apiKeys: ApiKeyOption[]) {
  const groups = new Map<string, ApiKeyOption[]>();
  for (const apiKey of apiKeys) {
    groups.set(apiKey.projectName, [...(groups.get(apiKey.projectName) ?? []), apiKey]);
  }
  return Array.from(groups.entries());
}

export function FederalStateUpdateApiKey({ federalState, apiKeys }: FederalStateUpdateApiKeyProps) {
  const [savedApiKeyId, setSavedApiKeyId] = useState(federalState.apiKeyId ?? undefined);
  const [selectedApiKeyId, setSelectedApiKeyId] = useState(savedApiKeyId);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedApiKeyId) return;

    setIsSubmitting(true);
    try {
      await updateApiKeyIdAction(federalState.id, selectedApiKeyId);
      setSavedApiKeyId(selectedApiKeyId);
      toast.success('API Key erfolgreich aktualisiert.');
    } catch {
      toast.error('Fehler beim Aktualisieren des API Keys.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Key aktualisieren</CardTitle>
        <CardDescription>
          Ordnet dem Bundesland {federalState.id} einen API Key aus ais-chat-api zu. Darüber werden
          verfügbare Modelle, Zugriff und Abrechnung gesteuert.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-8" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="apiKeyId">
              API Key
            </label>
            <Select value={selectedApiKeyId} onValueChange={setSelectedApiKeyId}>
              <SelectTrigger className="w-full" id="apiKeyId">
                <SelectValue placeholder="API Key auswählen" />
              </SelectTrigger>
              <SelectContent>
                {groupByProject(apiKeys).map(([projectName, projectApiKeys]) => (
                  <SelectGroup key={projectName}>
                    <SelectLabel>{projectName}</SelectLabel>
                    {projectApiKeys.map((apiKey) => (
                      <SelectItem key={apiKey.id} value={apiKey.id}>
                        {apiKey.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <CardAction>
            <Button
              type="submit"
              disabled={isSubmitting || !selectedApiKeyId || selectedApiKeyId === savedApiKeyId}
            >
              Speichern
            </Button>
          </CardAction>
        </form>
      </CardContent>
    </Card>
  );
}
