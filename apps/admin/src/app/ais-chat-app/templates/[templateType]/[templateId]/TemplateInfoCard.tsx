import { useState } from 'react';
import { TemplateModel, TemplateTypes } from '@shared/templates/template';
import { Card, CardContent, CardHeader, CardTitle } from '@ui/components/card';
import { SimpleInputDialog } from '@ui/components/simple-input-dialog';
import { getTemplateTypeName } from '../../templateTypeName';
import { EditIcon } from 'lucide-react';
import { Button } from '@ui/components/button';
import { Input } from '@ui/components/input';
import { updateAuthorOfTemplateAction, updateTemplateDeletedStateAction } from './actions';
import { toast } from 'sonner';

export type TemplateInfoCardProps = {
  template: TemplateModel;
  onDataChanged: () => void | Promise<void>;
};

export function TemplateInfoCard({ template, onDataChanged }: TemplateInfoCardProps) {
  const [isUpdatingDeletedState, setIsUpdatingDeletedState] = useState(false);

  async function handleSubmitOfAuthorChange(
    templateId: string,
    templateType: TemplateTypes,
    newAuthor: string,
  ) {
    try {
      const result = await updateAuthorOfTemplateAction(templateType, templateId, newAuthor);
      if (!result.success) {
        toast.error('Fehler beim Aktualisieren des Autors.', {
          description: result.error.message,
        });
        return;
      }
      await onDataChanged();
    } catch (error) {
      toast.error('Fehler beim Aktualisieren des Autors.', {
        description: (error as Error).message,
      });
    }
  }

  async function handleToggleDeletedState() {
    setIsUpdatingDeletedState(true);
    try {
      const result = await updateTemplateDeletedStateAction(
        template.type,
        template.id,
        !template.isDeleted,
      );
      if (!result.success) {
        toast.error('Fehler beim Löschen/Wiederherstellen.', {
          description: result.error.message,
        });
        return;
      }
      await onDataChanged();
    } catch (error) {
      toast.error('Fehler beim Löschen/Wiederherstellen.', {
        description: (error as Error).message,
      });
    } finally {
      setIsUpdatingDeletedState(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-row justify-between">
          <span>{template.name}</span>
          <span>{getTemplateTypeName(template.type)}</span>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <dl className="grid grid-cols-[150px_1fr] gap-2 [&>dt]:text-muted-foreground">
          <dt>ID:</dt>
          <dd>{template.id}</dd>
          <dt>Erstellt am:</dt>
          <dd>{template.createdAt.toLocaleString()}</dd>
          <dt>Gelöscht:</dt>
          <dd className="flex items-center gap-3">
            <span>{template.isDeleted ? 'Ja' : 'Nein'}</span>
            <Button
              type="button"
              variant="outline"
              size="xs"
              disabled={isUpdatingDeletedState}
              onClick={handleToggleDeletedState}
            >
              {isUpdatingDeletedState
                ? 'Speichert...'
                : template.isDeleted
                  ? 'Wiederherstellen'
                  : 'Löschen'}
            </Button>
          </dd>
          <dt>Autor:</dt>
          <dd className="flex items-center gap-2">
            <span>{template.author !== '' ? template.author : 'nicht gesetzt'}</span>
            <SimpleInputDialog
              title="Name des Autors"
              description="Geben Sie den Namen des Autors ein."
              initialValues={{ author: template.author }}
              content={(values, onChange) => (
                <Input
                  type="text"
                  value={values.author}
                  onChange={(e) => onChange({ ...values, author: e.target.value })}
                />
              )}
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label="Autor bearbeiten">
                  <EditIcon />
                </Button>
              }
              onSubmit={async (values) => {
                await handleSubmitOfAuthorChange(template.id, template.type, values.author);
              }}
            />
          </dd>
        </dl>
      </CardContent>
    </Card>
  );
}
