'use client';

import type { LlmModelWithSecrets } from '@ais-chat/api-database';
import type { ColumnDef } from '@tanstack/react-table';
import { Chip } from '@ui/components/chip';
import type { DataTableFeatures } from '@ui/components/data-table';

import { sortableHeader } from '@/components/common/SortableHeader';

export type ModelColumn<T extends LlmModelWithSecrets> = ColumnDef<DataTableFeatures, T>;

export const nameColumn = <T extends LlmModelWithSecrets>(): ModelColumn<T> => ({
  id: 'name',
  accessorFn: (model) => model.displayName || model.name,
  header: sortableHeader('Name'),
  cell: ({ row }) => {
    const model = row.original;
    return (
      <div>
        <div className="font-medium">{model.displayName || model.name}</div>
        {model.displayName && model.displayName !== model.name && (
          <div className="text-sm text-gray-500">{model.name}</div>
        )}
      </div>
    );
  },
});

export const typeColumn = <T extends LlmModelWithSecrets>(): ModelColumn<T> => ({
  id: 'type',
  accessorFn: (model) => model.priceMetadata.type,
  header: sortableHeader('Typ'),
  cell: ({ row }) => <Chip label={row.original.priceMetadata.type} size="sm" />,
});
