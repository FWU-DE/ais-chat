'use client';

import { SuspensionRequestEntityOverview } from '@shared/suspension/suspension-service';
import { formatDateToGermanTimestamp } from '@shared/utils/date';
import { ColumnDef } from '@tanstack/react-table';
import { DataTableFeatures } from '@ui/components/data-table';
import { mapStatusToLabel } from './utils';
import { Button } from '@ui/components/button';
import { ArrowUpDownIcon } from 'lucide-react';
import { mapEntityTypeToLabel } from '@/utils/mapEntityTypeToLabel';

export const columns: ColumnDef<DataTableFeatures, SuspensionRequestEntityOverview>[] = [
  {
    accessorKey: 'entityName',
    header: ({ column }) => {
      return (
        <Button
          variant="link"
          className="p-0"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Name
          <ArrowUpDownIcon className="ml-2 h-4 w-4" />
        </Button>
      );
    },
  },
  {
    accessorKey: 'entityType',
    header: ({ column }) => {
      return (
        <Button
          variant="link"
          className="p-0"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Typ
          <ArrowUpDownIcon className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      return mapEntityTypeToLabel(row.original.entityType);
    },
  },
  {
    accessorKey: 'latestRequestAt',
    header: ({ column }) => {
      return (
        <Button
          variant="link"
          className="p-0"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          zuletzt gemeldet am
          <ArrowUpDownIcon className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      return formatDateToGermanTimestamp(row.original.latestRequestAt);
    },
  },
  {
    accessorKey: 'requestCount',
    header: ({ column }) => {
      return (
        <Button
          variant="link"
          className="p-0"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Anzahl Meldungen
          <ArrowUpDownIcon className="ml-2 h-4 w-4" />
        </Button>
      );
    },
  },
  {
    accessorKey: 'status',
    header: ({ column }) => {
      return (
        <Button
          variant="link"
          className="p-0"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Status
          <ArrowUpDownIcon className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      return mapStatusToLabel(row.original.status);
    },
  },
];
