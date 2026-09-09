'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@ui/components/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/components/select';
import type {
  LlmModelSelectModel,
  StaticModelsConfiguration,
  StaticModelRole,
} from '@shared/db/schema';
import { updateStaticModelConfigurationAction } from './actions';

const roles: { role: StaticModelRole; label: string; type: 'text' | 'image' | 'safety' }[] = [
  { role: 'default-chat', label: 'Standard-Chatmodell', type: 'text' },
  { role: 'fallback', label: 'Fallback-Modell', type: 'text' },
  { role: 'auxiliary', label: 'Hilfsmodell', type: 'text' },
  { role: 'strong-auxiliary', label: 'Starkes Hilfsmodell', type: 'text' },
  { role: 'auxiliary-fallback', label: 'Fallback-Hilfsmodell', type: 'text' },
  { role: 'default-image', label: 'Standard-Bildmodell', type: 'image' },
  { role: 'safety', label: 'Sicherheitsmodell', type: 'safety' },
];

type Props = {
  models: LlmModelSelectModel[];
  configuration: StaticModelsConfiguration | undefined;
};

export default function StaticModelConfigurationView({ models, configuration }: Props) {
  const [selected, setSelected] = useState<Partial<Record<StaticModelRole, string>>>(
    () => configuration ?? {},
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isComplete = roles
    .filter((role) => role.role !== 'safety')
    .every((role) => selected[role.role] !== undefined);

  async function save() {
    setIsSubmitting(true);
    try {
      const result = await updateStaticModelConfigurationAction(selected);
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      toast.success('Statische Modelle erfolgreich aktualisiert.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Fehler beim Speichern.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Statische Modelle</CardTitle>
        <CardDescription>
          Konfigurieren Sie die global verwendeten Modelle der Chat-App.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!isComplete && (
          <p className="text-sm text-destructive">
            Alle statischen Modellrollen müssen vor dem Speichern konfiguriert werden.
          </p>
        )}
        {roles.map(({ role, label, type }) => (
          <div className="space-y-2" key={role}>
            <label className="text-sm font-medium">{label}</label>
            <Select
              value={selected[role]}
              onValueChange={(value) => setSelected({ ...selected, [role]: value })}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Modell auswählen" />
              </SelectTrigger>
              <SelectContent>
                {models
                  .filter((model) => model.priceMetadata.type === type && !model.isDeleted)
                  .map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.displayName} ({model.name})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </CardContent>
      <CardFooter>
        <Button onClick={() => void save()} disabled={isSubmitting || !isComplete}>
          {isSubmitting ? 'Speichert...' : 'Speichern'}
        </Button>
      </CardFooter>
    </Card>
  );
}
