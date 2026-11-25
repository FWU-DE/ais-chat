'use client';

import { type Column, type ColumnDef, type RowData, Subscribe } from '@tanstack/react-table';
import { Button } from '@ui/components/button';
import type { DataTableFeatures } from '@ui/components/data-table';
import { cn } from '@ui/lib/utils';
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react';

function SortableHeader<T extends RowData>({
  column,
  label,
}: {
  column: Column<DataTableFeatures, T>;
  label: string;
}) {
  return (
    <Subscribe source={column.table.atoms.sorting} selector={() => column.getIsSorted()}>
      {(sorted) => {
        const Icon =
          sorted === 'asc' ? ArrowUpIcon : sorted === 'desc' ? ArrowDownIcon : ArrowUpDownIcon;
        const sortLabel =
          sorted === 'asc'
            ? 'aufsteigend sortiert'
            : sorted === 'desc'
              ? 'absteigend sortiert'
              : null;

        return (
          <Button
            variant="link"
            className="h-8 p-0"
            aria-label={sortLabel ? `${label}, ${sortLabel}` : label}
            onClick={() => column.toggleSorting(sorted === 'asc')}
          >
            {label}
            <Icon className={cn('ml-2 h-4 w-4', !sorted && 'text-muted-foreground/60')} />
          </Button>
        );
      }}
    </Subscribe>
  );
}

export const sortableHeader = <T extends RowData>(
  label: string,
): ColumnDef<DataTableFeatures, T>['header'] =>
  function Header({ column }) {
    return <SortableHeader column={column} label={label} />;
  };
