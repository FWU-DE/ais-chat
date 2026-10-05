'use client';

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ui/components/card';
import { Button } from '@ui/components/button';
import { Checkbox } from '@ui/components/checkbox';
import { FieldLabel } from '@ui/components/field';
import { DataTable } from '@ui/components/data-table';
import { logError } from '@shared/logging';
import { getLargeLanguageModelsAction } from './actions';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { getColumns } from './columns';
import type { LargeLanguageModel } from '@/types/large-language-model';

export type LargeLanguageModelListViewProps = {
  organizationId: string;
  initialData: LargeLanguageModel[];
};

export function LargeLanguageModelListView({
  organizationId,
  initialData,
}: LargeLanguageModelListViewProps) {
  const [languageModels, setLanguageModels] = useState<LargeLanguageModel[]>(initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDeletedModels, setShowDeletedModels] = useState(false);

  const columns = useMemo(
    () => getColumns(organizationId, showDeletedModels),
    [organizationId, showDeletedModels],
  );
  const visibleModels = showDeletedModels
    ? languageModels
    : languageModels.filter((model) => !model.isDeleted);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const refreshedData = await getLargeLanguageModelsAction(organizationId);
      setLanguageModels(refreshedData);
    } catch (error) {
      logError('Failed to refresh language models', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sprachmodelle</CardTitle>
        <CardDescription>
          Liste aller verfügbaren Sprachmodelle für diese Organisation.
        </CardDescription>
        <CardAction>
          <Link href={`/organizations/${organizationId}/llms/new`}>
            <Button>Neues Modell</Button>
          </Link>
          <Button className="ml-2" onClick={handleRefresh} disabled={isRefreshing}>
            Aktualisieren
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="show-deleted-models"
              checked={showDeletedModels}
              onCheckedChange={(checked) => setShowDeletedModels(checked === true)}
            />
            <FieldLabel htmlFor="show-deleted-models">gelöschte Modelle anzeigen</FieldLabel>
          </div>
          <DataTable columns={columns} data={visibleModels} />
        </div>
      </CardContent>
    </Card>
  );
}
