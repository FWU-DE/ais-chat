'use client';
import { Button } from '@ui/components/button';
import { ConfirmAlertDialog, useConfirmAlertDialog } from '@ui/components/alert-dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { deleteFederalStateAction, updateFederalStateAction } from './actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/card';
import { FormField } from '@ui/components/form/form-field';
import { FormFieldCheckbox } from '@ais-chat/ui/components/form/form-field-checkbox';
import { FormFieldArray } from '@/components/form/FormFieldArray';
import { toast } from 'sonner';
import z from 'zod';
import { FederalStateModel, federalStateSchema } from '@shared/federal-states/types';
import { DesignConfigurationSchema } from '@ui/types/design-configuration';
import { logError } from '@shared/logging';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FormErrorDisplay } from '@/components/FormErrorDisplay';
import { federalStatePictureUrlsSchema } from '@shared/db/schema';
import { ROUTES } from '@/consts/routes';
import { TrashSimpleIcon } from '@phosphor-icons/react';

export type FederalStateViewProps = {
  federalState: FederalStateModel;
};

// Form-specific schema that extends the base schema with UI adaptations
export const federalStateEditFormSchema = federalStateSchema.extend({
  supportContacts: z.array(
    z.object({
      value: z.string(),
    }),
  ),
  designConfiguration: z.string(), // Will be parsed as JSON before submitting
  pictureUrls: z.string(), // Will be parsed as JSON before submitting
});
// Form-specific schema that extends the base schema with UI adaptations
export const federalStatePictureUrlsEditFormSchema = federalStatePictureUrlsSchema.extend({
  logo: z.string().startsWith('whitelabels/').optional(),
  favicon: z.string().startsWith('whitelabels/').optional(),
});

export type FederalStateEditForm = z.infer<typeof federalStateEditFormSchema>;

// Parse string as schema if not empty, otherwise set to null
function parseAsSchema<T>(schema: z.ZodType<T>, value: string | null): T | null {
  if (!value || value.trim() === '') {
    return null;
  }
  return schema.parse(JSON.parse(value));
}

function transformToFederalStateEditForm(federalState: FederalStateModel): FederalStateEditForm {
  return {
    ...federalState,
    // Only transform the fields that need UI-specific formatting
    featureToggles: {
      ...federalState.featureToggles,
      isImageGenerationEnabled: federalState.featureToggles.isImageGenerationEnabled ?? false,
      isWebSearchEnabled: federalState.featureToggles.isWebSearchEnabled ?? false,
      isCalculatorEnabled: federalState.featureToggles.isCalculatorEnabled ?? false,
      isSharedPageLocaleDetectionEnabled:
        federalState.featureToggles.isSharedPageLocaleDetectionEnabled ?? true,
    },
    supportContacts: federalState.supportContacts?.map((s) => ({ value: s })) ?? [],
    designConfiguration: federalState.designConfiguration
      ? JSON.stringify(federalState.designConfiguration, null, 2)
      : '',
    pictureUrls: federalState.pictureUrls ? JSON.stringify(federalState.pictureUrls, null, 2) : '',
  };
}

export function FederalStateView(props: FederalStateViewProps) {
  const { federalState } = props;
  const router = useRouter();
  const { dialogProps: deleteDialogProps, confirm: confirmDelete } = useConfirmAlertDialog();

  // Destructuring is necessary, otherwise formState is not updated correctly
  // https://www.react-hook-form.com/api/useform/formstate/
  const {
    control,
    formState: { isValid, errors, isDirty, isSubmitting },
    handleSubmit,
    reset,
  } = useForm({
    resolver: zodResolver(federalStateEditFormSchema),
    defaultValues: transformToFederalStateEditForm(federalState),
  });

  async function onSubmit(data: FederalStateEditForm) {
    if (!isValid) {
      toast.error('Das Formular enthält ungültige Werte.');
      return;
    }

    let parsedDesignConfiguration = null;
    try {
      parsedDesignConfiguration = parseAsSchema(
        DesignConfigurationSchema,
        data.designConfiguration,
      );
    } catch (e) {
      console.error(e);
      toast.error('Fehler: designConfiguration ist nicht im korrekten Format');
      return;
    }
    let parsedPictureUrls = null;
    try {
      parsedPictureUrls = parseAsSchema(federalStatePictureUrlsEditFormSchema, data.pictureUrls);
    } catch (e) {
      console.error(e);
      toast.error('Fehler: pictureUrls ist nicht im korrekten Format');
      return;
    }

    try {
      // Update existing federal state
      await updateFederalStateAction({
        ...data,
        supportContacts:
          data.supportContacts.length > 0 ? data.supportContacts.map((s) => s.value) : [],
        designConfiguration: parsedDesignConfiguration,
        pictureUrls: parsedPictureUrls,
      });
      toast.success('Bundesland erfolgreich aktualisiert');
    } catch (error) {
      logError('Error saving federal state', error);
      toast.error('Fehler beim Aktualisieren des Bundeslands');
    }
  }

  useEffect(() => {
    reset(transformToFederalStateEditForm(federalState));
  }, [federalState, reset]);

  async function handleDelete() {
    const result = await deleteFederalStateAction(federalState.id);
    if (result.success) {
      toast.success('Bundesland erfolgreich gelöscht');
      router.push(ROUTES.app.federalStates);
    } else {
      toast.error(result.error.message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bundesland Detailansicht</CardTitle>
        <CardDescription>Details zum Bundesland {federalState.id}</CardDescription>
        <FormErrorDisplay errors={errors} />
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-8"
          onSubmit={handleSubmit(onSubmit)}
          inert={isSubmitting}
        >
          <FormField
            name="id"
            label="ID"
            description="Eindeutige ID des Bundeslandes."
            control={control}
            disabled
          />
          <FormField
            name="createdAt"
            label="Erstellt am"
            description="Datum, an dem das Bundesland erstellt wurde."
            control={control}
            disabled
          />
          <FormFieldCheckbox
            name="hasApiKeyAssigned"
            label="API Key vorhanden?"
            description="Zeigt an ob bereits ein API Key erstellt wurde. Dieser ist zwingend für die Kommunikation mit ais-chat-api erforderlich."
            control={control}
            disabled
          />
          <FormField
            name="apiKeyId"
            label="API Key ID"
            description="UUID des API keys aus ais-chat-api für Kostenmanagement und Billing."
            control={control}
          />
          <FormField
            name="appName"
            label="Name"
            description="Beschreibender Name für das Bundesland."
            control={control}
          />
          <FormField
            name="teacherPriceLimit"
            label="Preislimit für Unterrichtende"
            description="Legt das Preislimit (in Cent) für Unterrichtende pro Monat fest."
            control={control}
            type="number"
          />
          <FormField
            name="studentPriceLimit"
            label="Preislimit für Lernende"
            description="Legt das Preislimit (in Cent) für Lernende pro Monat fest."
            control={control}
            type="number"
          />
          <FormField
            name="chatStorageTime"
            label="Speicherzeit für Chats"
            description="Legt die Speicherzeit (in Tagen) für Chats fest."
            control={control}
            type="number"
          />
          <FormFieldCheckbox
            name="mandatoryCertificationTeacher"
            label="Pflichtschulung für Unterrichtende aktivieren"
            description="Lehrer müssen zuerst eine Schulung abschließen bevor die Verwendung erlaubt wird."
            control={control}
          />
          <FormField
            name="trainingLink"
            label="Link für die Schulung"
            description="Legt den Link für die Schulung fest."
            control={control}
          />
          <FormFieldArray
            name="supportContacts"
            label="Support Kontaktadressen"
            description="Emailadressen, Telefonnummern oder auch Webadressen die im Supportfall benutzt werden können. Diese werden im Disclaimer angezeigt."
            control={control}
            defaultAppendValue={{ value: '' }}
          />
          <FormFieldCheckbox
            name="featureToggles.isStudentAccessEnabled"
            label="Zugriff für Lernende erlaubt?"
            description="Erlaubt den Zugriff auch für Lernende."
            control={control}
          />
          <FormFieldCheckbox
            name="featureToggles.isCharacterEnabled"
            label="Aktiviere Dialogpartner"
            description="Schaltet die Verwendung von Dialogpartnern frei."
            control={control}
          />
          <FormFieldCheckbox
            name="featureToggles.isCustomGptEnabled"
            label="Aktiviere Assistenten"
            description="Schaltet die Verwendung von Assistenten frei."
            control={control}
          />
          <FormFieldCheckbox
            name="featureToggles.isSharedChatEnabled"
            label="Lernszenarien aktivieren"
            description="Schaltet die Verwendung von Lernszenarien frei."
            control={control}
          />
          <FormFieldCheckbox
            name="featureToggles.isShareTemplateWithSchoolEnabled"
            label="Vorlage mit Schule teilen aktivieren"
            description="Schaltet die Möglichkeit frei, Vorlagen mit allen Benutzern einer Schule zu teilen."
            control={control}
          />
          <FormFieldCheckbox
            name="featureToggles.isImageGenerationEnabled"
            label="Bildgenerierung aktivieren"
            description="Erlaubt die Nutzung der Bildgenerierungsfunktion."
            control={control}
          />
          <FormFieldCheckbox
            name="featureToggles.isWebSearchEnabled"
            label="Websuche aktivieren"
            description="Erlaubt die Nutzung der Websuchfunktion."
            control={control}
          />
          <FormFieldCheckbox
            name="featureToggles.isCalculatorEnabled"
            label="Taschenrechner aktivieren"
            description="Erlaubt die Nutzung des Taschenrechners."
            control={control}
          />
          <FormFieldCheckbox
            name="featureToggles.isSharedPageLocaleDetectionEnabled"
            label="Spracherkennung für geteilte Seiten aktivieren"
            description="Ermittelt und setzt automatisch die Sprache für geteilte Seiten."
            control={control}
          />
          <FormField
            name="designConfiguration"
            label="Design Konfiguration"
            description="Legt die Hauptfarben für die Anwendung fest."
            control={control}
            type="textArea"
          />
          <FormField
            name="pictureUrls"
            label="Picture URLs"
            description='Legt die Whitelabel-Bilder fest, z.B. {"logo":"whitelabels/<id>/logo.svg","favicon":"whitelabels/<id>/favicon.svg"}.'
            control={control}
            type="textArea"
          />
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="destructive" onClick={() => confirmDelete(handleDelete)}>
              <TrashSimpleIcon /> Löschen
            </Button>
            <Button type="submit" disabled={!isDirty || isSubmitting}>
              Speichern
            </Button>
          </div>
        </form>
      </CardContent>
      <ConfirmAlertDialog
        title="Bundesland löschen"
        description="Möchten Sie dieses Bundesland wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden."
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        {...deleteDialogProps}
      />
    </Card>
  );
}
