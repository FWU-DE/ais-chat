'use client';

import type { CommunityTemplateRequestSummary } from '@shared/community-templates/community-template-service.admin';
import { ColumnDef } from '@tanstack/react-table';
import { DataTableFeatures } from '@ui/components/data-table';
import { Button } from '@ui/components/button';
import { ArrowUpDownIcon } from 'lucide-react';
import { formatDateToGermanTimestamp } from '@shared/utils/date';
import { mapEntityTypeToLabel } from '@/utils/mapEntityTypeToLabel';

export type CommunityTemplateRequestStatus = CommunityTemplateRequestSummary['state'];

export const communityTemplateRequestStatusOptions: Array<{
  value: CommunityTemplateRequestStatus;
  label: string;
}> = [
  { value: 'submitted', label: 'Eingereicht' },
  { value: 'approved', label: 'Genehmigt' },
  { value: 'rejected', label: 'Änderungen erforderlich' },
  { value: 'cancelled', label: 'Zurückgezogen' },
];

export const columns: ColumnDef<DataTableFeatures, CommunityTemplateRequestSummary>[] = [
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
    accessorKey: 'createdAt',
    header: ({ column }) => {
      return (
        <Button
          variant="link"
          className="p-0"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Erstellt am
          <ArrowUpDownIcon className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      return formatDateToGermanTimestamp(row.original.createdAt);
    },
  },
  {
    accessorKey: 'latestEventCreatedAt',
    header: ({ column }) => {
      return (
        <Button
          variant="link"
          className="p-0"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Zuletzt aktualisiert
          <ArrowUpDownIcon className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      return formatDateToGermanTimestamp(row.original.latestEventCreatedAt);
    },
  },
  {
    accessorKey: 'latestEventCreatedByRole',
    header: ({ column }) => {
      return (
        <Button
          variant="link"
          className="p-0"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Zuletzt aktualisiert von
          <ArrowUpDownIcon className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      return mapCreatedByRoleToLabel(row.original.latestEventCreatedByRole);
    },
  },
  {
    accessorKey: 'state',
    filterFn: (row, _columnId, selectedStatuses: CommunityTemplateRequestStatus[]) =>
      selectedStatuses.length === 0 || selectedStatuses.includes(row.original.state),
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
      return mapStateToLabel(row.original.state);
    },
  },
];

export function mapCreatedByRoleToLabel(
  createdByRole: CommunityTemplateRequestSummary['latestEventCreatedByRole'],
) {
  switch (createdByRole) {
    case 'user':
      return 'Benutzer';
    case 'editor':
      return 'Redakteur';
    default:
      return 'unbekannt';
  }
}

export function mapStateToLabel(status: CommunityTemplateRequestSummary['state']) {
  return (
    communityTemplateRequestStatusOptions.find((option) => option.value === status)?.label ??
    'unbekannt'
  );
}
