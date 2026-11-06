'use client';

import type { ToolCallName } from '@shared/db/schema';
import {
  type ToolCallCost,
  type UpdateToolCallCostInput,
  type UpdateToolCallCostPayload,
  updateToolCallCostSchema,
} from '@shared/tool-call-costs/tool-call-cost';
import { Button } from '@ui/components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ui/components/card';
import { Field, FieldDescription, FieldError, FieldLabel } from '@ui/components/field';
import { Input } from '@ui/components/input';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import z from 'zod';

import { FormErrorDisplay } from '@/components/FormErrorDisplay';

import { getToolCallCostAction, updateToolCallCostAction } from './actions';

const TOOL_CALL_NAME: ToolCallName = 'web_search';
const TOOL_CALL_LABEL = 'Websuche';

type ToolCallCostListViewProps = {
  initialToolCallCost: ToolCallCost | null;
  initialLoadError?: string | null;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten.';
}

export default function ToolCallCostListView({
  initialToolCallCost,
  initialLoadError = null,
}: ToolCallCostListViewProps) {
  const [toolCallCost, setToolCallCost] = useState<ToolCallCost | null>(initialToolCallCost);
  const [loadError, setLoadError] = useState<string | null>(initialLoadError);
  const [isLoading, setIsLoading] = useState(false);
  const {
    control,
    register,
    reset,
    handleSubmit,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<UpdateToolCallCostPayload>({
    defaultValues: {
      toolCallName: initialToolCallCost?.toolCallName ?? TOOL_CALL_NAME,
      costsInCent: initialToolCallCost ? String(initialToolCallCost.costsInCent) : '',
    },
  });

  async function loadToolCallCost() {
    setIsLoading(true);

    try {
      clearErrors();
      setLoadError(null);
      const loadedToolCallCost = await getToolCallCostAction(TOOL_CALL_NAME);
      setToolCallCost(loadedToolCallCost);
      reset({
        toolCallName: loadedToolCallCost.toolCallName,
        costsInCent: String(loadedToolCallCost.costsInCent),
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      setLoadError(errorMessage);
      toast.error(`Fehler beim Laden der Tool Call Kosten: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }

  async function onSubmit(payload: UpdateToolCallCostPayload) {
    clearErrors();

    let values: UpdateToolCallCostInput;

    try {
      values = updateToolCallCostSchema.parse(payload);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        const errorMessage =
          validationError.issues[0]?.message ??
          'Bitte geben Sie einen gültigen Preis ab 0 Cent ein.';
        setError('costsInCent', {
          type: 'manual',
          message: errorMessage,
        });
        toast.error(errorMessage);
        return;
      }

      toast.error(getErrorMessage(validationError));
      return;
    }

    try {
      setLoadError(null);
      const updatedToolCallCost = await updateToolCallCostAction(values);
      setToolCallCost(updatedToolCallCost);
      reset({
        toolCallName: updatedToolCallCost.toolCallName,
        costsInCent: String(updatedToolCallCost.costsInCent),
      });
      toast.success('Tool Call Kosten erfolgreich aktualisiert.');
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      setLoadError(errorMessage);
      toast.error(`Fehler beim Speichern der Tool Call Kosten: ${errorMessage}`);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tool Call Kosten</CardTitle>
        <CardDescription>Konfigurieren Sie den aktuell hinterlegten Preis.</CardDescription>
        <CardAction>
          <Button disabled={isLoading || isSubmitting} onClick={() => void loadToolCallCost()}>
            {isLoading ? 'Lädt...' : 'Aktualisieren'}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {loadError && (
          <div className="mb-4 rounded border border-red-400 bg-red-100 p-3 text-red-700">
            {loadError}
          </div>
        )}

        <FormErrorDisplay errors={errors} />

        <form
          className="flex flex-col gap-6"
          onSubmit={handleSubmit(onSubmit)}
          inert={isLoading || isSubmitting}
        >
          <input type="hidden" {...register('toolCallName')} />

          <dl className="grid gap-4 rounded-lg border border-border p-4 md:grid-cols-3">
            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground">Name</dt>
              <dd className="font-medium">{TOOL_CALL_LABEL}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground">Schlüssel</dt>
              <dd className="font-medium">{toolCallCost?.toolCallName ?? TOOL_CALL_NAME}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm text-muted-foreground">Zuletzt aktualisiert</dt>
              <dd className="font-medium">
                {toolCallCost ? toolCallCost.updatedAt.toLocaleString() : 'Noch nicht geladen'}
              </dd>
            </div>
          </dl>

          <Controller
            name="costsInCent"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name} required>
                  Kosten pro Aufruf (Cent)
                </FieldLabel>
                <FieldDescription>
                  Dieser Wert wird für jede abgerechnete Websuche gespeichert.
                </FieldDescription>
                <Input
                  id={field.name}
                  type="number"
                  min="0"
                  step="0.01"
                  showCharacterCount={false}
                  value={
                    typeof field.value === 'number' ? String(field.value) : (field.value ?? '')
                  }
                  onChange={(event) => field.onChange(event.currentTarget.value)}
                  onBlur={field.onBlur}
                  disabled={isLoading || isSubmitting}
                  aria-invalid={fieldState.invalid}
                />
                {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
              </Field>
            )}
          />

          <div className="flex justify-end">
            <Button type="submit" disabled={isLoading || isSubmitting}>
              {isSubmitting ? 'Speichert...' : 'Speichern'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
