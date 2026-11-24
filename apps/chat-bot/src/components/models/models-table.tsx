'use client';

import { ArrowDownIcon, ArrowsDownUpIcon, ArrowUpIcon } from '@phosphor-icons/react';
import type { LlmModelSelectModel } from '@shared/db/schema';
import { getTextModels } from '@shared/llm-models/llm-model-utils';
import { RadioGroup, RadioGroupItem } from '@ui/components/radio-group';
import {
  ClickableTableRow,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/components/table';
import { InfoTooltip } from '@ui/components/tooltip';
import { cn } from '@ui/lib/utils';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/common/badge';
import { useLlmModels } from '@/components/providers/llm-model-provider';

import { getCostFactor } from './cost-factor';
import { ModelCostBadge } from './model-cost-badge';
import { ModelVendorTooltip } from './model-vendor-tooltip';
import {
  INITIAL_MODEL_SORT,
  type ModelSort,
  type ModelSortKey,
  sortModels,
  toggleModelSort,
} from './sort-models';

function SortableHead({
  sortKey,
  sort,
  onSort,
  label,
  tooltip,
}: {
  sortKey: ModelSortKey;
  sort: ModelSort;
  onSort: (key: ModelSortKey) => void;
  label: string;
  tooltip?: string;
}) {
  const t = useTranslations('models');
  const isActive = sort.key === sortKey;
  const SortIcon = !isActive
    ? ArrowsDownUpIcon
    : sort.direction === 'asc'
      ? ArrowUpIcon
      : ArrowDownIcon;

  return (
    <TableHead
      aria-sort={!isActive ? 'none' : sort.direction === 'asc' ? 'ascending' : 'descending'}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          data-testid={`models-sort-${sortKey}`}
          aria-label={t('sort-by', { column: label })}
          onClick={() => onSort(sortKey)}
          className="flex items-center gap-1 rounded font-semibold focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {label}
          <SortIcon aria-hidden="true" className={cn('size-4', !isActive && 'text-icon')} />
        </button>
        {tooltip && <InfoTooltip tooltip={tooltip} />}
      </div>
    </TableHead>
  );
}

export function ModelsTable() {
  const t = useTranslations('models');
  const { models, defaultModel, selectedModel, setSelectedModel } = useLlmModels();
  const [sort, setSort] = useState<ModelSort>(INITIAL_MODEL_SORT);

  const rows = useMemo(
    () => sortModels(getTextModels(models), sort, defaultModel),
    [models, sort, defaultModel],
  );

  function handleSelect(modelName: string) {
    const model = rows.find((row) => row.name === modelName);
    if (model && model.id !== selectedModel?.id) void setSelectedModel(model);
  }

  return (
    <RadioGroup value={selectedModel?.name ?? ''} onValueChange={handleSelect} className="block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <span className="sr-only">{t('columns.select')}</span>
            </TableHead>
            <SortableHead
              sortKey="name"
              sort={sort}
              onSort={(key) => setSort((current) => toggleModelSort(current, key))}
              label={t('columns.model')}
            />
            <SortableHead
              sortKey="reasoning"
              sort={sort}
              onSort={(key) => setSort((current) => toggleModelSort(current, key))}
              label={t('columns.reasoning')}
              tooltip={t('reasoning-tooltip')}
            />
            <SortableHead
              sortKey="cost"
              sort={sort}
              onSort={(key) => setSort((current) => toggleModelSort(current, key))}
              label={t('columns.cost')}
              tooltip={t('cost-tooltip')}
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((model) => (
            <ModelRow
              key={model.id}
              model={model}
              defaultModel={defaultModel}
              onSelect={handleSelect}
            />
          ))}
        </TableBody>
      </Table>
    </RadioGroup>
  );
}

function ModelRow({
  model,
  defaultModel,
  onSelect,
}: {
  model: LlmModelSelectModel;
  defaultModel: LlmModelSelectModel | undefined;
  onSelect: (modelName: string) => void;
}) {
  const t = useTranslations('models');
  const labelId = `model-label-${model.id}`;

  return (
    <ClickableTableRow
      data-testid={`model-row-${model.displayName}`}
      focusable={false}
      onActivate={() => onSelect(model.name)}
    >
      <TableCell>
        <RadioGroupItem
          value={model.name}
          aria-labelledby={labelId}
          data-testid={`model-radio-${model.displayName}`}
          onClick={(event) => event.stopPropagation()}
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-3">
          <ModelVendorTooltip vendor={model.vendor} />
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-2">
              <span id={labelId} data-testid="model-name" className="font-medium">
                {model.displayName}
              </span>
              {model.isNew && <Badge text="NEU" />}
              {model.id === defaultModel?.id && (
                <Badge text={t('default-tag')} variant="neutral" data-testid="model-default-tag" />
              )}
            </div>
            {model.description && (
              <span className="text-sm text-text-secondary">{model.description}</span>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        {model.reasoning?.effort ? t(`reasoning.${model.reasoning.effort}`) : '–'}
      </TableCell>
      <TableCell>
        <ModelCostBadge factor={getCostFactor({ model, defaultModel })} />
      </TableCell>
    </ClickableTableRow>
  );
}
