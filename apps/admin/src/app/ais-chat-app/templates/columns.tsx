'use client';

import { TemplateModel } from '@shared/templates/template';
import { formatDateToGermanTimestamp } from '@shared/utils/date';
import { ColumnDef } from '@tanstack/react-table';
import { DataTableFeatures } from '@ui/components/data-table';

import { sortableHeader } from '@/components/common/SortableHeader';

import { getTemplateTypeName } from './templateTypeName';

export const columns: ColumnDef<DataTableFeatures, TemplateModel>[] = [
  {
    accessorKey: 'id',
    header: sortableHeader('Id'),
  },
  {
    accessorKey: 'originalId',
    header: sortableHeader('Original Id'),
    cell: ({ row }) => row.original.originalId ?? '—',
  },
  {
    accessorKey: 'type',
    header: sortableHeader('Typ'),
    cell: ({ row }) => getTemplateTypeName(row.original.type),
  },
  {
    accessorKey: 'name',
    header: sortableHeader('Name'),
  },
  {
    accessorKey: 'createdAt',
    header: sortableHeader('Erstellt am'),
    cell: ({ row }) => formatDateToGermanTimestamp(row.original.createdAt),
  },
];
