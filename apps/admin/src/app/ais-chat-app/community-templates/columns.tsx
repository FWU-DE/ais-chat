'use client';

import { mapEntityTypeToAbbreviation } from '@/utils/mapEntityTypeToLabel';
import type { CommunityTemplateRequestSummary } from '@shared/community-templates/community-template-service.admin';
import { formatDateToGermanTimestamp } from '@shared/utils/date';
import { ColumnDef } from '@tanstack/react-table';
import { Button } from '@ui/components/button';
import { DataTableFeatures } from '@ui/components/data-table';
import { ArrowUpDownIcon } from 'lucide-react';

export type CommunityTemplateRequestStatus = CommunityTemplateRequestSummary['state'];

export const communityTemplateRequestStatusOptions: Array<{
  value: CommunityTemplateRequestStatus;
  label: string;
}> = [
  { value: 'submitted', label: 'Eingereicht' },
  { value: 'approved', label: 'Genehmigt' },
  { value: 'rejected', label: 'Überarbeitung angefordert' },
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
      return mapEntityTypeToAbbreviation(row.original.entityType);
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
          Zuletzt aktualisiert am
          <ArrowUpDownIcon className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      return formatDateToGermanTimestamp(row.original.latestEventCreatedAt);
    },
  },
  {
    accessorKey: 'latestEventCreatedByName',
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
      return buildCreatedByRoleAndNameLabel(
        row.original.latestEventCreatedByRole,
        row.original.latestEventCreatedByName,
      );
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

export function buildCreatedByRoleAndNameLabel(
  createdByRole: CommunityTemplateRequestSummary['latestEventCreatedByRole'],
  createdByName: CommunityTemplateRequestSummary['latestEventCreatedByName'],
) {
  if (createdByRole === 'user') return 'Benutzer';
  if (createdByRole === 'editor' && createdByName) return `${createdByName} (Redakteur)`;
  return 'unbekannt';
}

export function mapStateToLabel(status: CommunityTemplateRequestSummary['state']) {
  return (
    communityTemplateRequestStatusOptions.find((option) => option.value === status)?.label ??
    'unbekannt'
  );
}
