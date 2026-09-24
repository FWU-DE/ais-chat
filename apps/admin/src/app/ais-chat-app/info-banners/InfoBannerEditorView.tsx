'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Control, Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import z from 'zod';
import { toast } from 'sonner';
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from '@ui/components/field';
import { FormField } from '@ui/components/form/form-field';
import { FormFieldCheckbox } from '@ais-chat/ui/components/form/form-field-checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/components/select';
import { ROUTES } from '@/consts/routes';
import { FormErrorDisplay } from '@/components/FormErrorDisplay';
import type { FederalStateModel } from '@shared/federal-states/types';
import {
  infoBannerToFederalStateMappingSchema,
  manageInfoBannerBaseSchema,
  validateManageInfoBanner,
} from '@shared/info-banners/info-banner';
import type { InfoBanner, InfoBannerToFederalStateMapping } from '@shared/info-banners/info-banner';
import { createInfoBannerAction, deleteInfoBannerAction, updateInfoBannerAction } from './actions';

const dateTimeLocalSchema = z
  .string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    error: 'Bitte geben Sie ein gültiges Datum und eine Uhrzeit an.',
  })
  .transform((value) => new Date(value));

const infoBannerEditFormSchema = manageInfoBannerBaseSchema
  .extend({
    startsAt: dateTimeLocalSchema,
    endsAt: dateTimeLocalSchema,
    mappings: infoBannerToFederalStateMappingSchema.array(),
  })
  .superRefine((value, ctx) => {
    validateManageInfoBanner(value, ctx);

    const hasMappings = value.mappings.some((mapping) => mapping.isMapped);

    if (!hasMappings) {
      ctx.addIssue({
        code: 'custom',
        message: 'Bitte wählen Sie mindestens ein Bundesland aus.',
        path: ['mappings'],
      });
    }
  });

type InfoBannerEditForm = z.input<typeof infoBannerEditFormSchema>;

type InfoBannerEditFormData = z.output<typeof infoBannerEditFormSchema>;

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function toDateTimeLocalString(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function buildDefaultMappings(
  federalStates: FederalStateModel[],
): InfoBannerToFederalStateMapping[] {
  return federalStates.map((federalState) => ({
    federalStateId: federalState.id,
    isMapped: false,
  }));
}

function buildFormValues({
  federalStates,
  infoBanner,
  mappings,
}: {
  federalStates: FederalStateModel[];
  infoBanner?: InfoBanner;
  mappings?: InfoBannerToFederalStateMapping[];
}): InfoBannerEditForm {
  const now = new Date();
  const defaultMappings = mappings ?? buildDefaultMappings(federalStates);

  return {
    type: infoBanner?.type ?? 'info',
    message: infoBanner?.message ?? '',
    buttonLabel: infoBanner?.buttonLabel ?? '',
    buttonUrl: infoBanner?.buttonUrl ?? '',
    startsAt: toDateTimeLocalString(infoBanner?.startsAt ?? now),
    endsAt: toDateTimeLocalString(infoBanner?.endsAt ?? addDays(now, 7)),
    maxLoginCount: infoBanner?.maxLoginCount ?? null,
    mappings: defaultMappings,
  };
}

function getTypeLabel(type: 'warning' | 'info') {
  return type === 'warning' ? 'Warnung' : 'Information';
}

export type InfoBannerEditorViewProps = {
  federalStates: FederalStateModel[];
  infoBanner?: InfoBanner;
  mappings?: InfoBannerToFederalStateMapping[];
};

export default function InfoBannerEditorView({
  federalStates,
  infoBanner,
  mappings,
}: InfoBannerEditorViewProps) {
  const router = useRouter();
  const {
    control,
    formState: { errors, isDirty, isSubmitting, isValid },
    getValues,
    handleSubmit,
    reset,
    setValue,
  } = useForm<InfoBannerEditForm, undefined, InfoBannerEditFormData>({
    resolver: zodResolver(infoBannerEditFormSchema),
    defaultValues: buildFormValues({ federalStates, infoBanner, mappings }),
  });
  const formControl = control as unknown as Control<InfoBannerEditForm>;

  const { fields } = useFieldArray({
    control,
    name: 'mappings',
  });

  const watchedMappings = useWatch({ control, name: 'mappings' });

  useEffect(() => {
    reset(buildFormValues({ federalStates, infoBanner, mappings }));
  }, [federalStates, infoBanner, mappings, reset]);

  async function onSubmit(data: InfoBannerEditFormData) {
    if (!isValid) {
      toast.error('Das Formular enthält ungültige Werte.');
      return;
    }

    const { mappings: selectedMappings, ...payload } = data;

    try {
      if (infoBanner) {
        await updateInfoBannerAction(infoBanner.id, payload, selectedMappings);
        toast.success('Info-Banner erfolgreich aktualisiert.');
        router.refresh();
        reset({
          ...getValues(),
          mappings: selectedMappings,
        });
        return;
      }

      const createdInfoBanner = await createInfoBannerAction(payload, selectedMappings);
      toast.success('Info-Banner erfolgreich erstellt.');
      router.push(ROUTES.app.infoBannerDetails(createdInfoBanner.id));
    } catch (error) {
      logError('Error saving info banner', error);
      toast.error('Fehler beim Speichern der Info-Banner.');
    }
  }

  async function handleDelete() {
    if (!infoBanner) {
      return;
    }

    const confirmed = window.confirm('Soll dieses Info-Banner wirklich gelöscht werden?');
    if (!confirmed) {
      return;
    }

    try {
      await deleteInfoBannerAction(infoBanner.id);
      toast.success('Info-Banner erfolgreich gelöscht.');
      router.push(ROUTES.app.infoBanners);
    } catch (error) {
      logError('Error deleting info banner', error);
      toast.error('Fehler beim Löschen der Info-Banner.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{infoBanner ? 'Info-Banner bearbeiten' : 'Neues Info-Banner'}</CardTitle>
        <CardDescription>
          Konfigurieren Sie Nachrichten, Laufzeit und Zuordnung zu Bundesländern.
        </CardDescription>
        <FormErrorDisplay errors={errors} />
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-8"
          onSubmit={handleSubmit(onSubmit)}
          inert={isSubmitting}
        >
          <Controller
            name="type"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="type">Typ</FieldLabel>
                <FieldDescription>Warnungen werden vor Informationen angezeigt.</FieldDescription>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-11 w-full" id="type">
                    <SelectValue placeholder="Typ auswählen" />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start">
                    <SelectItem value="warning">{getTypeLabel('warning')}</SelectItem>
                    <SelectItem value="info">{getTypeLabel('info')}</SelectItem>
                  </SelectContent>
                </Select>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />

          <FormField
            name="message"
            label="Nachricht"
            description="Text, der oberhalb der Anwendung angezeigt wird."
            control={formControl}
            type="textArea"
          />

          <FormField
            name="startsAt"
            label="Start"
            description="Ab diesem Zeitpunkt darf das Info-Banner angezeigt werden."
            control={formControl}
            type="datetime-local"
          />

          <FormField
            name="endsAt"
            label="Ende"
            description="Nach diesem Zeitpunkt wird das Info-Banner nicht mehr angezeigt."
            control={formControl}
            type="datetime-local"
          />

          <FormField
            name="maxLoginCount"
            label="Maximale Anzeigen pro Benutzer"
            description="Optional: Begrenzt, wie oft das Info-Banner einem Benutzer angezeigt wird."
            control={formControl}
            type="number"
          />

          <FormField
            name="buttonLabel"
            label="Button-Beschriftung"
            description="Optional: Beschriftung des Buttons im Banner."
            control={formControl}
          />

          <FormField
            name="buttonUrl"
            label="Button-Link"
            description="Optional: Link, der in einem neuen Tab geöffnet wird."
            control={formControl}
            type="url"
          />

          <FieldSet>
            <FieldLegend variant="label">Bundesländer</FieldLegend>
            <FieldDescription>
              Legt fest, in welchen Bundesländern das Info-Banner sichtbar ist.
            </FieldDescription>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setValue(
                    'mappings',
                    watchedMappings.map((mapping) => ({ ...mapping, isMapped: true })),
                    { shouldDirty: true },
                  );
                }}
              >
                Alle
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  setValue(
                    'mappings',
                    watchedMappings.map((mapping) => ({ ...mapping, isMapped: false })),
                    { shouldDirty: true },
                  );
                }}
              >
                Keine
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {fields.map((field, index) => (
                <FormFieldCheckbox
                  key={field.id}
                  control={formControl}
                  label={field.federalStateId}
                  name={`mappings.${index}.isMapped`}
                  variant="compact"
                />
              ))}
            </div>
            {'message' in (errors.mappings ?? {}) ? (
              <FieldError>{errors.mappings?.message?.toString()}</FieldError>
            ) : null}
          </FieldSet>

          <CardAction className="flex flex-col gap-3 sm:flex-row sm:justify-start w-full">
            <div>
              {infoBanner ? (
                <Button type="button" variant="destructive" onClick={handleDelete}>
                  Löschen
                </Button>
              ) : null}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="submit" disabled={!isDirty && !!infoBanner}>
                Speichern
              </Button>
            </div>
          </CardAction>
        </form>
      </CardContent>
    </Card>
  );
}
