'use client';

import { TemplateModel } from '@shared/templates/template';
import { formatDateToGermanTimestamp } from '@shared/utils/date';
import { ColumnDef } from '@tanstack/react-table';
import { DataTableFeatures } from '@ui/components/data-table';
import { Button } from '@ui/components/button';
import { ArrowUpDownIcon } from 'lucide-react';
import { getTemplateTypeName } from './templateTypeName';

export const columns: ColumnDef<DataTableFeatures, TemplateModel>[] = [
  {
    accessorKey: 'id',
    header: ({ column }) => (
      <Button
        variant="link"
        className="p-0"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Id
        <ArrowUpDownIcon className="ml-2 h-4 w-4" />
      </Button>
    ),
  },
  {
    accessorKey: 'originalId',
    header: ({ column }) => (
      <Button
        variant="link"
        className="p-0"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Original Id
        <ArrowUpDownIcon className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => row.original.originalId ?? '—',
  },
  {
    accessorKey: 'type',
    header: ({ column }) => (
      <Button
        variant="link"
        className="p-0"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Typ
        <ArrowUpDownIcon className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => getTemplateTypeName(row.original.type),
  },
  {
    accessorKey: 'name',
    header: ({ column }) => (
      <Button
        variant="link"
        className="p-0"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Name
        <ArrowUpDownIcon className="ml-2 h-4 w-4" />
      </Button>
    ),
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => (
      <Button
        variant="link"
        className="p-0"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        Erstellt am
        <ArrowUpDownIcon className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => formatDateToGermanTimestamp(row.original.createdAt),
  },
];
