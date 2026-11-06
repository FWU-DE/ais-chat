'use client';

import { zodResolver } from '@hookform/resolvers/zod';
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
import { FormField } from '@ui/components/form/form-field';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { updateApiKeyAction } from './actions';

export type FederalStateUpdateApiKeyProps = {
  federalState: FederalStateModel;
};

const patchApiKeySchema = z.object({
  decryptedApiKey: z.string().min(1, 'API Key darf nicht leer sein'),
});
export type PatchApiKey = z.infer<typeof patchApiKeySchema>;

export function FederalStateUpdateApiKey(props: FederalStateUpdateApiKeyProps) {
  const federalState = props.federalState;

  const form = useForm({
    resolver: zodResolver(patchApiKeySchema),
    defaultValues: {
      decryptedApiKey: '',
    },
  });

  const {
    control,
    handleSubmit,
    formState: { isDirty },
    reset,
  } = form;

  async function onSubmit(data: PatchApiKey) {
    try {
      await updateApiKeyAction(federalState.id, data.decryptedApiKey);
      reset();
      toast.success('API Key erfolgreich aktualisiert.');
    } catch {
      toast.error('Fehler beim Aktualisieren des API Keys.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Key aktualisieren</CardTitle>
        <CardDescription>
          Aktualisiert den API Key für das Bundesland {federalState.id}. Vorsicht! Der alte API Key
          ist dann nicht mehr gültig und kann nicht mehr verwendet werden.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-8" onSubmit={handleSubmit(onSubmit)}>
          <FormField
            name="decryptedApiKey"
            label="API Key"
            description="Der neue, unverschlüsselte API Key der in ais-chat-api generiert wurde."
            control={control}
          />
          <CardAction>
            <Button type="submit" disabled={!isDirty}>
              Speichern
            </Button>
          </CardAction>
        </form>
      </CardContent>
    </Card>
  );
}
