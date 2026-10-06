'use client';

import type { LargeLanguageModel } from '@/types/large-language-model';
import { formatDateToGermanTimestamp } from '@shared/utils/date';
import type { ColumnDef, Column } from '@tanstack/react-table';
import { Button } from '@ui/components/button';
import { Checkbox } from '@ui/components/checkbox';
import type { DataTableFeatures } from '@ui/components/data-table';
import { ArrowUpDownIcon, Search } from 'lucide-react';
import Link from 'next/link';

type Col = ColumnDef<DataTableFeatures, LargeLanguageModel>;

function SortableHeader({
  column,
  label,
}: {
  column: Column<DataTableFeatures, LargeLanguageModel>;
  label: string;
}) {
  return (
    <Button
      variant="link"
      className="p-0"
      onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
    >
      {label}
      <ArrowUpDownIcon className="ml-2 h-4 w-4" />
    </Button>
  );
}

const sortableHeader = (label: string): Col['header'] =>
  function Header({ column }) {
    return <SortableHeader column={column} label={label} />;
  };

const booleanColumn = (key: 'useBifrost' | 'isNew' | 'isDeleted', label: string): Col => ({
  accessorKey: key,
  header: sortableHeader(label),
  cell: ({ row }) => <Checkbox checked={row.original[key]} disabled />,
  sortFn: 'basic',
});

export function getColumns(organizationId: string, showDeleted: boolean): Col[] {
  return [
    {
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
    },
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
    {
      id: 'actions',
      cell: ({ row }) => (
        <Link href={`/organizations/${organizationId}/llms/${row.original.id}`}>
          <Search className="text-primary" />
        </Link>
      ),
    },
  ];
}
