'use client';

import type { SensitiveLlmModel } from '@ais-chat/api-database';
import { formatDateToGermanTimestamp } from '@shared/utils/date';
import { Checkbox } from '@ui/components/checkbox';

import { sortableHeader } from '@/components/common/SortableHeader';

import { type ModelColumn, nameColumn, typeColumn } from './model-columns';

type Col = ModelColumn<SensitiveLlmModel>;

const booleanColumn = (key: 'useBifrost' | 'isNew' | 'isDeleted', label: string): Col => ({
  accessorKey: key,
  header: sortableHeader(label),
  cell: ({ row }) => <Checkbox checked={row.original[key]} disabled />,
  sortFn: 'basic',
});

export function getColumns(showDeleted: boolean): Col[] {
  return [
    nameColumn(),
    typeColumn(),
    booleanColumn('useBifrost', 'Bifrost'),
    {
      accessorKey: 'description',
      header: sortableHeader('Beschreibung'),
      cell: ({ row }) => (
        <div className="max-w-xs truncate" title={row.original.description}>
          {row.original.description || '-'}
        </div>
      ),
    },
    booleanColumn('isNew', 'Neu'),
    ...(showDeleted ? [booleanColumn('isDeleted', 'Gelöscht')] : []),
    {
      accessorKey: 'createdAt',
      header: sortableHeader('Erstellt am'),
      cell: ({ row }) => formatDateToGermanTimestamp(row.original.createdAt),
    },
  ];
}
