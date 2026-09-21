'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@ui/components/button';
import { ConfirmAlertDialog, useConfirmAlertDialog } from '@ui/components/alert-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/card';
import { FormField } from '@ui/components/form/form-field';
import { FormFieldCheckbox } from '@ui/components/form/form-field-checkbox';
import { FormErrorDisplay } from '@/components/FormErrorDisplay';
import { ROUTES } from '@/consts/routes';
import type { ProviderKey } from '@/types/provider-key';
import {
  createProviderKeyAction,
  deleteProviderKeyAction,
  updateProviderKeyAction,
} from './actions';
import { TrashSimpleIcon } from '@phosphor-icons/react';

const providerKeyFormSchema = z.object({
  name: z.string().trim().min(1, 'Name ist erforderlich'),
  provider: z.string().trim().min(1, 'Provider ist erforderlich'),
  settings: z.string().refine((value) => {
    try {
      return typeof JSON.parse(value) === 'object';
    } catch {
      return false;
    }
  }, 'Einstellungen müssen gültiges JSON sein'),
  weight: z.number().positive('Gewichtung muss größer als 0 sein'),
  isEnabled: z.boolean(),
});

type ProviderKeyForm = z.infer<typeof providerKeyFormSchema>;

export function ProviderKeyDetailView({
  organizationId,
  providerKey,
  mode,
}: {
  organizationId: string;
  providerKey?: ProviderKey;
  mode: 'create' | 'edit';
}) {
  const router = useRouter();
  const isCreate = mode === 'create';
  const { dialogProps: deleteDialogProps, confirm: confirmDelete } = useConfirmAlertDialog();
  const {
    control,
    formState: { errors, isDirty, isSubmitting },
    handleSubmit,
  } = useForm<ProviderKeyForm>({
    resolver: zodResolver(providerKeyFormSchema),
    defaultValues: {
      name: providerKey?.name ?? '',
      provider: providerKey?.provider ?? '',
      settings: providerKey ? JSON.stringify(providerKey.settings, null, 2) : '{}',
      weight: providerKey?.weight ?? 1,
      isEnabled: providerKey?.isEnabled ?? true,
    },
  });

  async function onSubmit(data: ProviderKeyForm) {
    const payload = {
      name: data.name,
      provider: data.provider,
      settings: data.settings,
      weight: data.weight,
      isEnabled: data.isEnabled,
    };

    if (isCreate) {
      const result = await createProviderKeyAction(organizationId, payload);
      if (result.success) {
        toast.success('Provider-Key erfolgreich erstellt');
        router.push(ROUTES.api.providerKeyDetails(organizationId, result.value.id));
      } else {
        toast.error(result.error.message);
      }
    } else if (providerKey) {
      const result = await updateProviderKeyAction(organizationId, providerKey.id, payload);
      if (result.success) {
        toast.success('Provider-Key erfolgreich aktualisiert');
      } else {
        toast.error(result.error.message);
      }
    }
  }

  async function handleDelete() {
    if (!providerKey) return;

    const result = await deleteProviderKeyAction(organizationId, providerKey.id);
    if (result.success) {
      toast.success('Provider-Key erfolgreich gelöscht');
      router.push(ROUTES.api.providerKeys(organizationId));
    } else {
      toast.error(result.error.message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isCreate
            ? 'Neuen Provider-Key erstellen'
            : `Provider-Key bearbeiten: ${providerKey?.name}`}
        </CardTitle>
        <CardDescription>
          Provider-Zugang konfigurieren und logischen Sprachmodellen zuweisen.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FormErrorDisplay errors={errors} />
        <form className="flex flex-col gap-6" onSubmit={handleSubmit(onSubmit)}>
          <FormField name="name" label="Name" control={control} required />
          <FormField
            name="provider"
            label="Provider"
            description="ionos, openai, azure oder google; muss dem Provider in den Einstellungen entsprechen"
            control={control}
            required
          />
          <FormField
            name="settings"
            label="Einstellungen"
            description="Provider-spezifische JSON-Konfiguration einschließlich Zugangsdaten"
            control={control}
            type="textArea"
            required
            className="min-h-40 font-mono"
          />
          <FormField name="weight" label="Gewichtung" control={control} type="number" required />
          <FormFieldCheckbox name="isEnabled" label="Aktiv" control={control} />

          <div className="flex justify-end gap-3 pt-4">
            {!isCreate && (
              <Button
                type="button"
                variant="destructive"
                disabled={isSubmitting}
                onClick={() => confirmDelete(handleDelete)}
              >
                <TrashSimpleIcon /> Löschen
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => router.push(ROUTES.api.providerKeys(organizationId))}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={isSubmitting || (!isDirty && !isCreate)}>
              {isCreate ? 'Erstellen' : 'Speichern'}
            </Button>
          </div>
        </form>
      </CardContent>
      <ConfirmAlertDialog
        title="Provider-Key löschen"
        description="Möchten Sie diesen Provider-Key wirklich löschen? Alle zugehörigen Modell-Zuordnungen werden ebenfalls entfernt."
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        {...deleteDialogProps}
      />

      {!!providerKey?.models.length && (
        <CardContent>
          <h3 className="mb-3 text-lg font-medium">Zugeordnete Modelle</h3>
          {providerKey.models.map(({ model }) => (
            <Button key={model.id} variant="link" asChild>
              <Link href={ROUTES.api.llmDetails(organizationId, model.id)}>
                {model.displayName}
              </Link>
            </Button>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
