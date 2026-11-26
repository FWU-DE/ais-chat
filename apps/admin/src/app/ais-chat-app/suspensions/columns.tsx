'use client';

import { SuspensionRequestEntityOverview } from '@shared/suspension/suspension-service';
import { formatDateToGermanTimestamp } from '@shared/utils/date';
import { ColumnDef } from '@tanstack/react-table';
import { DataTableFeatures } from '@ui/components/data-table';

import { sortableHeader } from '@/components/common/SortableHeader';
import { mapEntityTypeToLabel } from '@/utils/mapEntityTypeToLabel';

import { mapStatusToLabel } from './utils';

export const columns: ColumnDef<DataTableFeatures, SuspensionRequestEntityOverview>[] = [
  {
    accessorKey: 'entityName',
    header: sortableHeader('Name'),
  },
  {
    accessorKey: 'entityType',
    header: sortableHeader('Typ'),
    cell: ({ row }) => {
      return mapEntityTypeToLabel(row.original.entityType);
    },
  },
  {
    accessorKey: 'latestRequestAt',
    header: sortableHeader('zuletzt gemeldet am'),
    cell: ({ row }) => {
      return formatDateToGermanTimestamp(row.original.latestRequestAt);
    },
  },
  {
    accessorKey: 'requestCount',
    header: sortableHeader('Anzahl Meldungen'),
  },
  {
    accessorKey: 'status',
    header: sortableHeader('Status'),
    cell: ({ row }) => {
      return mapStatusToLabel(row.original.status);
    },
  },
];
