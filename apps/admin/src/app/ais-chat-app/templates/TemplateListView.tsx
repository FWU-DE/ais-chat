'use client';

import { useEffect, useState, useTransition } from 'react';
import { type ColumnFiltersState } from '@tanstack/react-table';
import { Button } from '@ui/components/button';
import { Checkbox } from '@ui/components/checkbox';
import { Input } from '@ui/components/input';
import { DataTable } from '@ui/components/data-table';
import { getTemplatesAction } from './actions';
import { FieldLabel } from '@ui/components/field';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ui/components/card';
import { TemplateModel } from '@shared/templates/template';
import { Skeleton } from '@ui/components/skeleton';
import { CreateTemplateModal } from './CreateTemplateModal';
import { columns } from './columns';

export default function TemplateListView() {
  const [templates, setTemplates] = useState<TemplateModel[]>([]);
  const [isPending, startTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [showDeletedTemplates, setShowDeletedTemplates] = useState(false);

  const visibleTemplates = showDeletedTemplates
    ? templates
    : templates.filter((template) => !template.isDeleted);

  const loadTemplates = async () => {
    startTransition(async () => {
      const templates = await getTemplatesAction();
      setTemplates(templates);
    });
  };

  useEffect(() => {
    void loadTemplates();
  }, []);

  const handleModalSuccess = () => {
    void loadTemplates();
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Vorlagen</CardTitle>
          <CardDescription>
            Liste aller globalen Vorlagen, sowohl Dialogpartner als auch Assistenten.
          </CardDescription>
          <CardAction>
            <Button onClick={() => setIsModalOpen(true)}>Neue Vorlage</Button>
            <Button disabled={isPending} onClick={loadTemplates} className="ml-2">
              {isPending ? 'Lädt...' : 'Aktualisieren'}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-full rounded" />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-row gap-8 items-center">
                <Input
                  placeholder="Nach Name filtern"
                  value={(columnFilters.find((f) => f.id === 'name')?.value as string) ?? ''}
                  onChange={(e) => setColumnFilters([{ id: 'name', value: e.target.value }])}
                  className="max-w-sm"
                />
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show-deleted-templates"
                    checked={showDeletedTemplates}
                    onCheckedChange={(checked) => setShowDeletedTemplates(checked === true)}
                  />
                  <FieldLabel htmlFor="show-deleted-templates">
                    gelöschte Vorlagen anzeigen
                  </FieldLabel>
                </div>
              </div>
              <DataTable
                columns={columns}
                data={visibleTemplates}
                columnFilters={columnFilters}
                onColumnFiltersChange={setColumnFilters}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <CreateTemplateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleModalSuccess}
      />
    </>
  );
}
