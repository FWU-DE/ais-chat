'use client';

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
import { Checkbox } from '@ui/components/checkbox';
import { DataTable } from '@ui/components/data-table';
import { FieldLabel } from '@ui/components/field';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import { ROUTES } from '@/consts/routes';
import type { LargeLanguageModel } from '@/types/large-language-model';

import { getLargeLanguageModelsAction } from './actions';
import { getColumns } from './columns';

export type LargeLanguageModelListViewProps = {
  initialData: LargeLanguageModel[];
};

export function LargeLanguageModelListView({ initialData }: LargeLanguageModelListViewProps) {
  const router = useRouter();
  const [languageModels, setLanguageModels] = useState<LargeLanguageModel[]>(initialData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showDeletedModels, setShowDeletedModels] = useState(false);

  const columns = useMemo(() => getColumns(showDeletedModels), [showDeletedModels]);
  const visibleModels = showDeletedModels
    ? languageModels
    : languageModels.filter((model) => !model.isDeleted);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const refreshedData = await getLargeLanguageModelsAction();
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
          <Link href={ROUTES.api.llmNew}>
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
          <DataTable
            columns={columns}
            data={visibleModels}
            rowClickHandler={(model) => router.push(ROUTES.api.llmDetails(model.id))}
          />
        </div>
      </CardContent>
    </Card>
  );
}
