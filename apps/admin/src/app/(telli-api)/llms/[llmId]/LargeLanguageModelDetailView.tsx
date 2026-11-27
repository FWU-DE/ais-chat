'use client';

import type { LlmModelWithSecrets } from '@ais-chat/api-database';
import {
  imageGenerationConfigSchema,
  REASONING_EFFORTS,
  REASONING_SUMMARIES,
  type ReasoningConfig,
  type ReasoningEffort,
  reasoningEffortSchema,
  type ReasoningSummary,
  reasoningSummarySchema,
  speechConfigSchema,
  supportedImageFormatsSchema,
} from '@ais-chat/api-database/types';
import { llmModelPriceMetadataSchema } from '@ais-chat/shared/db/schema';
import { VENDORS } from '@ais-chat/shared-core/schemas/llm-model-vendor';
import { FormFieldCheckbox } from '@ais-chat/ui/components/form/form-field-checkbox';
import { zodResolver } from '@hookform/resolvers/zod';
import { TrashSimpleIcon } from '@phosphor-icons/react';
import { ConfirmAlertDialog, useConfirmAlertDialog } from '@ui/components/alert-dialog';
import { Button } from '@ui/components/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ui/components/card';
import { Checkbox } from '@ui/components/checkbox';
import { Field, FieldDescription, FieldError, FieldLabel } from '@ui/components/field';
import { FormField } from '@ui/components/form/form-field';
import { ModelVendorIcon } from '@ui/components/icons/model-vendor-icon';
import { Input } from '@ui/components/input';
import { useRouter } from 'next/navigation';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import { FormErrorDisplay } from '@/components/FormErrorDisplay';
import {
  createJsonStringSchema,
  jsonStringSchema,
  parseJsonFormValue,
} from '@/components/utils/json-schema';
import { ROUTES } from '@/consts/routes';
import type { LlmModelInput } from '@/services/llm-service';
import type { ProviderKey } from '@/types/provider-key';

import { createLLMAction, deleteLLMAction, updateLLMAction } from './actions';
import { ImageGenerationConfigExampleDialog } from './ImageGenerationConfigExampleDialog';
import { ModelConfigExampleDialog } from './ModelConfigExampleDialog';
import { PriceMetadataExamplesDialog } from './PriceMetadataExamplesDialog';

const priceMetadataSchema = createJsonStringSchema(
  llmModelPriceMetadataSchema,
  'Muss einer der bekannten Preis-Formen entsprechen (siehe Beispiele). Ein leeres Objekt ist nicht gültig.',
  { allowEmpty: false },
);

const supportedImageFormatsFormSchema = createJsonStringSchema(
  supportedImageFormatsSchema,
  'Muss ein JSON-Array mit unterstützten Bild-Dateiendungen sein (z. B. ["png", "jpeg"])',
);

const imageGenerationConfigFormSchema = createJsonStringSchema(
  imageGenerationConfigSchema,
  'Muss eine gültige Bildgenerierungs-Konfiguration sein',
);

const modelConfigFormSchema = createJsonStringSchema(
  speechConfigSchema,
  'Muss eine gültige Modell-Konfiguration sein',
);

const additionalParametersSchema = z.custom<Record<string, unknown>>();

const llmFormSchema = z.object({
  name: z.string().min(1, 'Name ist erforderlich'),
  displayName: z.string().min(1, 'Anzeigename ist erforderlich'),
  description: z.string().optional().default(''),
  priceMetadata: priceMetadataSchema,
  supportedImageFormats: supportedImageFormatsFormSchema.optional().default(''),
  imageGenerationConfig: imageGenerationConfigFormSchema.optional().default(''),
  modelConfig: modelConfigFormSchema.optional().default(''),
  additionalParameters: jsonStringSchema.optional().default(''),
  vendor: z.string(),
  reasoningEffort: z.union([reasoningEffortSchema, z.literal('')]),
  reasoningSummary: z.union([reasoningSummarySchema, z.literal('')]),
  isNew: z.boolean().default(false),
  isDeleted: z.boolean().default(false),
  useBifrost: z.boolean().default(true),
  safetyFilterEnabled: z.boolean().default(true),
  providerKeys: z.array(
    z.object({
      providerKeyId: z.string(),
      selected: z.boolean(),
      upstreamModelName: z.string(),
    }),
  ),
});

type LLMForm = z.infer<typeof llmFormSchema>;

/** Builds the config from form values; no value set means no config. */
function buildReasoningConfig({
  effort,
  summary,
}: {
  effort: ReasoningEffort | '';
  summary: ReasoningSummary | '';
}): ReasoningConfig | null {
  if (!effort && !summary) return null;
  return { ...(effort ? { effort } : {}), ...(summary ? { summary } : {}) };
}

// `useAzureSpeechEndpoint` switches Bifrost to the Azure AI Speech route, which only exists
// for speech models served by an Azure provider key.
function createLlmFormSchema(providerKeys: ProviderKey[]) {
  const azureProviderKeyIds = new Set(
    providerKeys.filter(({ provider }) => provider === 'azure').map(({ id }) => id),
  );

  return llmFormSchema.superRefine((data, ctx) => {
    const modelType = parseJsonFormValue(data.priceMetadata, llmModelPriceMetadataSchema)?.type;
    if (modelType && modelType !== 'text' && (data.reasoningEffort || data.reasoningSummary)) {
      ctx.addIssue({
        code: 'custom',
        path: ['reasoningEffort'],
        message: 'Reasoning ist nur für Textmodelle zulässig (Preis-Metadaten vom Typ „text“).',
      });
    }

    const modelConfig = parseJsonFormValue(data.modelConfig, speechConfigSchema);
    if (!modelConfig?.useAzureSpeechEndpoint) return;

    const priceMetadata = parseJsonFormValue(data.priceMetadata, llmModelPriceMetadataSchema);
    if (priceMetadata?.type !== 'speech') {
      ctx.addIssue({
        code: 'custom',
        path: ['modelConfig'],
        message:
          '„useAzureSpeechEndpoint“ ist nur für Sprachmodelle zulässig (Preis-Metadaten vom Typ „speech“).',
      });
    }

    const hasAzureProviderKey = data.providerKeys.some(
      ({ providerKeyId, selected }) => selected && azureProviderKeyIds.has(providerKeyId),
    );
    if (!hasAzureProviderKey) {
      ctx.addIssue({
        code: 'custom',
        path: ['modelConfig'],
        message: '„useAzureSpeechEndpoint“ erfordert einen zugewiesenen Azure-Provider-Key.',
      });
    }
  });
}

export type LargeLanguageModelDetailViewProps = {
  model?: LlmModelWithSecrets;
  mode: 'create' | 'edit';
  providerKeys: ProviderKey[];
};

export function LargeLanguageModelDetailView({
  model,
  mode,
  providerKeys,
}: LargeLanguageModelDetailViewProps) {
  const router = useRouter();
  const isCreate = mode === 'create';
  const { dialogProps: deleteDialogProps, confirm: confirmDelete } = useConfirmAlertDialog();
  const assignments = new Map(
    providerKeys.flatMap((providerKey) =>
      providerKey.models
        .filter(({ model: assignedModel }) => assignedModel.id === model?.id)
        .map(({ upstreamModelName }) => [providerKey.id, upstreamModelName] as const),
    ),
  );

  const {
    control,
    formState: { isValid, errors, isSubmitting, isDirty },
    handleSubmit,
  } = useForm({
    resolver: zodResolver(createLlmFormSchema(providerKeys)),
    defaultValues: model
      ? {
          name: model.name,
          displayName: model.displayName,
          description: model.description,
          priceMetadata: JSON.stringify(model.priceMetadata, null, 2),
          supportedImageFormats: JSON.stringify(model.supportedImageFormats, null, 2),
          imageGenerationConfig: model.imageGenerationConfig
            ? JSON.stringify(model.imageGenerationConfig, null, 2)
            : '',
          modelConfig: model.modelConfig ? JSON.stringify(model.modelConfig, null, 2) : '',
          additionalParameters: JSON.stringify(model.additionalParameters, null, 2),
          vendor: model.vendor ?? '',
          reasoningEffort: model.reasoning?.effort ?? '',
          reasoningSummary: model.reasoning?.summary ?? '',
          isNew: model.isNew,
          isDeleted: model.isDeleted,
          useBifrost: model.useBifrost,
          safetyFilterEnabled: model.safetyFilterEnabled,
          providerKeys: providerKeys.map((providerKey) => ({
            providerKeyId: providerKey.id,
            selected: assignments.has(providerKey.id),
            upstreamModelName:
              assignments.get(providerKey.id) === model.name
                ? ''
                : (assignments.get(providerKey.id) ?? ''),
          })),
        }
      : {
          name: '',
          displayName: '',
          description: '',
          priceMetadata: '{}',
          supportedImageFormats: '[]',
          imageGenerationConfig: '',
          modelConfig: '',
          additionalParameters: '{}',
          vendor: '',
          reasoningEffort: '',
          reasoningSummary: '',
          isNew: false,
          isDeleted: false,
          useBifrost: true,
          safetyFilterEnabled: true,
          providerKeys: providerKeys.map((providerKey) => ({
            providerKeyId: providerKey.id,
            selected: false,
            upstreamModelName: '',
          })),
        },
  });
  const logicalModelName = useWatch({ control, name: 'name' });
  const providerKeyAssignments = useWatch({ control, name: 'providerKeys' });
  const priceMetadataValue = useWatch({ control, name: 'priceMetadata' });
  const reasoningEffortValue = useWatch({ control, name: 'reasoningEffort' });
  const reasoningSummaryValue = useWatch({ control, name: 'reasoningSummary' });
  const modelType = parseJsonFormValue(priceMetadataValue, llmModelPriceMetadataSchema)?.type;
  // A value that is already set stays visible so it can be cleared after the type changed.
  const showReasoning =
    !modelType || modelType === 'text' || !!reasoningEffortValue || !!reasoningSummaryValue;

  async function onSubmit(data: LLMForm) {
    if (!isValid) {
      toast.error('Das Formular enthält ungültige Werte.');
      return;
    }

    const { reasoningEffort, reasoningSummary, ...formData } = data;
    const payload: LlmModelInput = {
      ...formData,
      priceMetadata: JSON.parse(formData.priceMetadata),
      supportedImageFormats:
        parseJsonFormValue(formData.supportedImageFormats, supportedImageFormatsSchema) ?? [],
      imageGenerationConfig:
        parseJsonFormValue(formData.imageGenerationConfig, imageGenerationConfigSchema) ?? null,
      modelConfig: parseJsonFormValue(formData.modelConfig, speechConfigSchema) ?? null,
      additionalParameters:
        parseJsonFormValue(formData.additionalParameters, additionalParametersSchema) ?? {},
      reasoning: buildReasoningConfig({ effort: reasoningEffort, summary: reasoningSummary }),
      vendor: data.vendor || null,
      providerKeys: data.providerKeys
        .filter(({ selected }) => selected)
        .map(({ providerKeyId, upstreamModelName }) => ({
          providerKeyId,
          upstreamModelName: upstreamModelName.trim() || data.name,
        })),
    };
    if (isCreate) {
      const result = await createLLMAction(payload);
      if (result.success) {
        toast.success('Sprachmodell erfolgreich erstellt');
        router.push(ROUTES.api.llmDetails(result.value.id));
      } else {
        toast.error(result.error.message);
      }
    } else if (model) {
      const result = await updateLLMAction(model.id, payload);
      if (result.success) {
        toast.success('Sprachmodell erfolgreich aktualisiert');
      } else {
        toast.error(result.error.message);
      }
    }
  }

  const handleCancel = () => {
    router.push(ROUTES.api.llms);
  };

  async function handleDelete() {
    if (!model) return;

    const result = await deleteLLMAction(model.id);
    if (result.success) {
      toast.success('Sprachmodell erfolgreich gelöscht');
      router.push(ROUTES.api.llms);
    } else {
      toast.error(result.error.message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isCreate
            ? 'Neues Sprachmodell erstellen'
            : `Sprachmodell bearbeiten: ${model?.displayName || model?.name}`}
        </CardTitle>
        <CardDescription>
          {isCreate
            ? 'Erstellen Sie ein neues Sprachmodell für diese Organisation.'
            : 'Bearbeiten Sie die Eigenschaften dieses Sprachmodells.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FormErrorDisplay errors={errors} />

        <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
          <FormField
            name="name"
            label="Name *"
            description="Technischer Name des Modells"
            tooltip="Beginnt der Name mit dem Namen eines Bifrost-nativen Providers (z. B. bei einem via Provider-Key direkt als nativer Bifrost-Provider registrierten Anbieter), deutet Bifrost dies als Adressierung nach dem Schema „Provider/Modellname“ und schneidet den Provider-Teil ab – das Modell wird dann nicht gefunden. In diesem Fall abweichenden Namen wählen und den echten Wert unter „Provider-Modellnamen“ hinterlegen."
            control={control}
          />

          <FormField
            name="displayName"
            label="Anzeigename *"
            description="Benutzerfreundlicher Name des Modells"
            control={control}
          />

          <FormField
            name="description"
            label="Beschreibung"
            description="Kurze Beschreibung des Modells"
            control={control}
            type="textArea"
          />

          <FormField
            name="priceMetadata"
            label="Preis-Metadaten *"
            control={control}
            type="textArea"
          >
            {(input) => (
              <>
                <FieldDescription>
                  JSON mit Preisinformationen <PriceMetadataExamplesDialog />
                </FieldDescription>
                {input}
              </>
            )}
          </FormField>

          <FormField
            name="supportedImageFormats"
            label="Unterstützte Bildformate"
            description="JSON-Array mit unterstützten Bildformaten"
            control={control}
            type="textArea"
          />

          <FormField
            name="imageGenerationConfig"
            label="Bildgenerierungs-Konfiguration"
            control={control}
            type="textArea"
          >
            {(input) => (
              <>
                <FieldDescription>
                  JSON mit Konfiguration für die Bildgenerierung{' '}
                  <ImageGenerationConfigExampleDialog />
                </FieldDescription>
                {input}
              </>
            )}
          </FormField>

          <FormField
            name="modelConfig"
            label="Modell-Konfiguration"
            control={control}
            type="textArea"
          >
            {(input) => (
              <>
                <FieldDescription>
                  JSON mit modellspezifischer Konfiguration.
                  <br /> Flag „useAzureSpeechEndpoint“ nur für Azure-AI-Speech-Modelle setzen.
                  <br /> Flag „enableSsmlRewrite“ lässt den Text vor der Sprachausgabe vom
                  Sprachausgabe-Hilfsmodell (sonst starkes Hilfsmodell) in SSML umschreiben.
                  <br />
                  <ModelConfigExampleDialog />
                </FieldDescription>
                {input}
              </>
            )}
          </FormField>

          <FormField
            name="vendor"
            label="Hersteller"
            description="Entwickler des Modells, wird in der KI-Modelle-Übersicht angezeigt"
            control={control}
            type="select"
            options={VENDORS}
            renderOption={(vendor) => (
              <span className="flex items-center gap-2">
                <ModelVendorIcon vendor={vendor} className="size-4" />
                {vendor}
              </span>
            )}
            placeholder="Kein Hersteller"
          />

          {showReasoning && (
            <>
              <FormField
                name="reasoningEffort"
                label="Reasoning-Aufwand"
                description="Wie intensiv das Modell vor der Antwort nachdenkt (reasoning.effort)"
                control={control}
                type="select"
                options={REASONING_EFFORTS}
                placeholder="Nicht gesetzt"
              />

              <FormField
                name="reasoningSummary"
                label="Reasoning-Zusammenfassung"
                description="Detailgrad der angezeigten Zusammenfassung des Denkprozesses (reasoning.summary)"
                control={control}
                type="select"
                options={REASONING_SUMMARIES}
                placeholder="Nicht gesetzt"
              />
            </>
          )}

          <FormField
            name="additionalParameters"
            label="Zusätzliche Parameter"
            description="JSON mit weiteren Parametern"
            control={control}
            type="textArea"
          />

          <FormFieldCheckbox
            name="isNew"
            label="Als neu markieren"
            description="Kennzeichnet das Modell als neu"
            control={control}
          />

          <FormFieldCheckbox
            name="isDeleted"
            label="Als gelöscht markieren"
            description="Kennzeichnet das Modell als gelöscht"
            control={control}
          />

          <FormFieldCheckbox
            name="useBifrost"
            label="Bifrost verwenden"
            description="Bifrost ermöglicht mehrere Provider-Keys und automatische Provider-Auswahl. Für direkte Provider-Aufrufe muss genau ein aktivierter Provider-Key zugewiesen sein."
            control={control}
          />

          <FormFieldCheckbox
            name="safetyFilterEnabled"
            label="Sicherheitsprüfung aktivieren"
            description="Führt vor der Antwort die konfigurierte Sicherheitsmodell-Prüfung durch. Provider-eigene Sicherheitsfunktionen werden dadurch nicht verändert."
            control={control}
          />

          <div className="flex flex-col gap-3">
            <div>
              <h2 className="font-medium">Provider-Keys</h2>
              <p className="text-muted-foreground text-sm">
                Schlüssel auswählen. Der Provider-Modellname muss nur bei abweichenden Namen oder
                Azure-Deployments angepasst werden.
              </p>
            </div>
            {providerKeys.length === 0 && (
              <p className="text-muted-foreground text-sm">Keine Provider-Keys vorhanden.</p>
            )}
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              {providerKeys.map((providerKey, index) => (
                <Controller
                  key={providerKey.id}
                  name={`providerKeys.${index}`}
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid} className="rounded-md border p-3">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          id={`provider-key-${providerKey.id}`}
                          checked={field.value.selected}
                          onCheckedChange={(selected) =>
                            field.onChange({
                              ...field.value,
                              selected: selected === true,
                              upstreamModelName: field.value.upstreamModelName,
                            })
                          }
                        />
                        <FieldLabel
                          htmlFor={`provider-key-${providerKey.id}`}
                          className="min-w-0 flex-1 truncate"
                        >
                          {providerKey.name}
                        </FieldLabel>
                        <span className="text-muted-foreground text-xs">
                          {providerKey.provider}
                        </span>
                      </div>
                      {fieldState.error && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
              ))}
            </div>
            {providerKeyAssignments.some(({ selected }) => selected) && (
              <div className="flex flex-col gap-3 pt-2">
                <div>
                  <h3 className="font-medium">Provider-Modellnamen</h3>
                  <p className="text-muted-foreground text-sm">
                    Leere Felder verwenden automatisch den oben eingetragenen technischen
                    Modellnamen. Eine Eingabe ist meist nur für Azure nötig, wenn der
                    Deployment-Name abweicht. Bei anderen Providern muss der Wert nur gesetzt
                    werden, wenn deren Modell-ID ebenfalls abweicht.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {providerKeyAssignments.map((assignment, index) => {
                    if (!assignment.selected) return null;
                    const providerKey = providerKeys[index];
                    if (!providerKey) return null;

                    return (
                      <Controller
                        key={providerKey.id}
                        name={`providerKeys.${index}`}
                        control={control}
                        render={({ field, fieldState }) => (
                          <Field data-invalid={fieldState.invalid}>
                            <FieldLabel htmlFor={`provider-model-${providerKey.id}`}>
                              {providerKey.name}
                            </FieldLabel>
                            <Input
                              id={`provider-model-${providerKey.id}`}
                              value={field.value.upstreamModelName}
                              onChange={(event) =>
                                field.onChange({
                                  ...field.value,
                                  upstreamModelName: event.target.value,
                                })
                              }
                              placeholder={
                                logicalModelName || 'Provider-Modellname oder Deployment'
                              }
                            />
                            {fieldState.error && <FieldError errors={[fieldState.error]} />}
                          </Field>
                        )}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-end pt-4">
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
            <Button type="button" variant="outline" onClick={handleCancel} disabled={isSubmitting}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={isSubmitting || (!isDirty && !isCreate)}>
              {isCreate ? 'Erstellen' : 'Speichern'}
            </Button>
          </div>
        </form>
      </CardContent>
      <ConfirmAlertDialog
        title="Sprachmodell löschen"
        description="Möchten Sie dieses Sprachmodell wirklich löschen? Alle zugehörigen Provider- und API-Key-Zuordnungen werden ebenfalls entfernt."
        confirmLabel="Löschen"
        cancelLabel="Abbrechen"
        {...deleteDialogProps}
      />
    </Card>
  );
}
