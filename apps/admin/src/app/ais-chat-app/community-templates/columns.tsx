'use client';

import type { CommunityTemplateRequestSummary } from '@shared/community-templates/community-template-service.admin';
import { ColumnDef } from '@tanstack/react-table';
import { DataTableFeatures } from '@ui/components/data-table';
import { Button } from '@ui/components/button';
import { ArrowUpDownIcon } from 'lucide-react';
import { formatDateToGermanTimestamp } from '@shared/utils/date';

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
    accessorKey: 'entityType',
    header: ({ column }) => {
      return (
        <Button
          variant="link"
          className="p-0"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Vorlagentyp
          <ArrowUpDownIcon className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      return mapEntityTypeToLabel(row.original.entityType);
    },
  },
  {
    accessorKey: 'entityName',
    header: ({ column }) => {
      return (
        <Button
          variant="link"
          className="p-0"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Vorlagenname
          <ArrowUpDownIcon className="ml-2 h-4 w-4" />
        </Button>
      );
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
          zuletzt aktualisiert
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
          zuletzt aktualisiert von
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
      return mapStatusToLabel(row.original.state);
    },
  },
];

function mapEntityTypeToLabel(entityType: CommunityTemplateRequestSummary['entityType']) {
  switch (entityType) {
    case 'assistant':
      return 'Assistent';
    case 'character':
      return 'Dialogpartner';
    case 'learningScenario':
      return 'Lernszenario';
    default:
      return 'unbekannt';
  }
}

function mapCreatedByRoleToLabel(
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

function mapStatusToLabel(status: CommunityTemplateRequestSummary['state']) {
  return (
    communityTemplateRequestStatusOptions.find((option) => option.value === status)?.label ??
    'unbekannt'
  );
}
