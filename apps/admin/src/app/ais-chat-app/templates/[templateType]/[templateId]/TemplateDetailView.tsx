'use client';

import { FormFieldCheckbox } from '@ais-chat/ui/components/form/form-field-checkbox';
import {
  TemplateModel,
  TemplateToFederalStateMapping,
  TemplateTypes,
} from '@shared/templates/template';
import { Button } from '@ui/components/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ui/components/card';
import { useEffect, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import {
  getFederalStatesWithMappingsAction,
  getTemplateByIdAction,
  updateTemplateMappingsAction,
} from './actions';
import { TemplateInfoCard } from './TemplateInfoCard';

export type TemplateDetailViewProps = {
  templateType: TemplateTypes;
  templateId: string;
};

export default function TemplateDetailView(props: TemplateDetailViewProps) {
  const { templateType, templateId } = props;
  const [template, setTemplate] = useState<TemplateModel | null>(null);
  const [formData, setFormData] = useState<TemplateToFederalStateMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ mappings: TemplateToFederalStateMapping[] }>();
  const { control, reset, setValue } = form;
  const watchedMappings = useWatch({ control, name: 'mappings' }) ?? [];

  const { fields } = useFieldArray({
    control,
    name: 'mappings',
  });

  const handleSubmit = async ({ mappings }: { mappings: TemplateToFederalStateMapping[] }) => {
    try {
      const updatedMappings = await updateTemplateMappingsAction(
        templateType,
        templateId,
        mappings,
      );
      setFormData(updatedMappings);
      toast.success('Template-Zuordnungen erfolgreich aktualisiert.');
    } catch {
      toast.error('Fehler beim Aktualisieren der Template-Zuordnungen.');
    }
  };

  useEffect(() => {
    reset({ mappings: formData });
  }, [formData, reset]);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [template, federalStateMappings] = await Promise.all([
          getTemplateByIdAction(templateType, templateId),
          getFederalStatesWithMappingsAction(templateType, templateId),
        ]);

        setTemplate(template);
        setFormData(federalStateMappings);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Ein Fehler ist aufgetreten');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [templateType, templateId]);

  async function handleAuthorChanged() {
    try {
      const template = await getTemplateByIdAction(templateType, templateId);
      setTemplate(template);
    } catch (error) {
      toast.error('Fehler beim Laden des Templates.', {
        description: (error as Error).message,
      });
    }
  }

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        {template && <TemplateInfoCard template={template} onDataChanged={handleAuthorChanged} />}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Template Zuordnungen</CardTitle>
          <CardDescription>Legt die Zuweisung zu den Bundesländern fest.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(handleSubmit)}>
            <div className="flex gap-2 mb-3">
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
            {fields.map((field, index) => {
              return (
                <FormFieldCheckbox
                  control={control}
                  key={field.id}
                  label={field.federalStateId}
                  name={`mappings.${index}.isMapped`}
                  variant="compact"
                />
              );
            })}
            <CardAction>
              <Button type="submit">Speichern</Button>
            </CardAction>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
