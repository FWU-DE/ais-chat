'use client';

import { useTranslations } from 'next-intl';

import { CustomChatFieldInfo } from '../custom-chat-field-info';
import {
  type ActiveFilterPill,
  FilterValues,
  getActiveFilterPills,
} from './custom-chat-filter-utils';

type FilterDisplaySectionProps = {
  values: FilterValues;
};

const FILTER_GROUP_LABELS: Record<keyof FilterValues, string> = {
  schoolTypes: 'filter.school-filter',
  gradeRanges: 'filter.grade-filter',
  subjects: 'filter.subject-filter',
  categories: 'filter.category-filter',
  federalStates: 'filter.federal-state-filter',
  languages: 'filter.language-filter',
};

export function FilterDisplaySection({ values }: FilterDisplaySectionProps) {
  const t = useTranslations();

  const pills = getActiveFilterPills(values, t);

  if (pills.length === 0) {
    return null;
  }

  const rowsByGroup = new Map<keyof FilterValues, ActiveFilterPill[]>();
  pills.forEach((pill: ActiveFilterPill) => {
    const existing = rowsByGroup.get(pill.group) || [];
    rowsByGroup.set(pill.group, [...existing, pill]);
  });

  const rows = Array.from(rowsByGroup.entries()).map(([group, groupPills]) => ({
    label: t(FILTER_GROUP_LABELS[group] as never),
    values: groupPills.map((p) => p.label),
  }));

  return (
    <CustomChatFieldInfo
      label={t('filter.filter-attributes')}
      tooltip={t('filter.filter-detail-tooltip')}
      value={
        <div className="grid grid-cols-[minmax(7.5rem,max-content)_1fr] items-start gap-x-3 gap-y-3 pt-3">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <p className="text-sm text-card-foreground font-medium">{row.label}</p>
              <div className="flex flex-wrap gap-2">
                {row.values.map((value) => (
                  <span
                    key={value}
                    className="rounded-enterprise-full bg-neutral-200 px-3 py-1 text-sm text-main-black"
                  >
                    {value}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      }
    />
  );
}
