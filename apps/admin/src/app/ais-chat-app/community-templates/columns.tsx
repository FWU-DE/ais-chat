'use client';

import type { CommunityTemplateRequestSummary } from '@shared/community-templates/community-template-service.admin';
import { formatDateToGermanTimestamp } from '@shared/utils/date';
import { ColumnDef } from '@tanstack/react-table';
import { DataTableFeatures } from '@ui/components/data-table';

import { sortableHeader } from '@/components/common/SortableHeader';
import { mapEntityTypeToAbbreviation } from '@/utils/mapEntityTypeToLabel';

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
    header: sortableHeader('Name'),
  },

  {
    accessorKey: 'entityType',
    header: sortableHeader('Typ'),
    cell: ({ row }) => {
      return mapEntityTypeToAbbreviation(row.original.entityType);
    },
  },
  {
    accessorKey: 'latestEventCreatedAt',
    header: sortableHeader('Zuletzt aktualisiert am'),
    cell: ({ row }) => {
      return formatDateToGermanTimestamp(row.original.latestEventCreatedAt);
    },
  },
  {
    accessorKey: 'latestEventCreatedByName',
    header: sortableHeader('Zuletzt aktualisiert von'),
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
    header: sortableHeader('Status'),
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
