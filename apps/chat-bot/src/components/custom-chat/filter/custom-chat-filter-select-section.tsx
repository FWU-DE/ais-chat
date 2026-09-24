'use client';

import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react';
import { Card, CardRow } from '@ui/components/card';
import { Button } from '@ui/components/button';
import { MultipleSelectDropdown } from '@ui/components/multiple-select-dropdown';
import { useTranslations } from 'next-intl';
import {
  CATEGORY_KEYS,
  FEDERAL_STATE_KEYS,
  GRADE_RANGE_KEYS,
  LANGUAGE_KEYS,
  SCHOOL_TYPE_KEYS,
  SUBJECT_SUBGROUPS,
} from './custom-chat-filter-keys';
import { CustomChatHeading2 } from '../custom-chat-heading2';
import { cn } from '@ui/lib/utils';
import type {
  SchoolType,
  GradeRange,
  Subject,
  Category,
  FederalState,
  Language,
} from '@shared/db/schema';

export type FilterSelectSectionValues = {
  schoolTypes: SchoolType[];
  gradeRanges: GradeRange[];
  subjects: Subject[];
  categories: Category[];
  federalStates: FederalState[];
  languages: Language[];
};

type FilterSelectSectionProps = {
  values: FilterSelectSectionValues;
  onSchoolTypesChange: (values: SchoolType[]) => void;
  onGradeRangesChange: (values: GradeRange[]) => void;
  onSubjectsChange: (values: Subject[]) => void;
  onCategoriesChange: (values: Category[]) => void;
  onFederalStatesChange: (values: FederalState[]) => void;
  onLanguagesChange: (values: Language[]) => void;
  hideHeading?: boolean;
  isEditView?: boolean;
  onReset?: () => void;
  hasActiveValues?: boolean;
  className?: string;
};

export default function FilterSelectSection({
  values,
  onSchoolTypesChange,
  onGradeRangesChange,
  onSubjectsChange,
  onCategoriesChange,
  onFederalStatesChange,
  onLanguagesChange,
  hideHeading = false,
  isEditView = true,
  onReset,
  hasActiveValues = false,
  className,
}: FilterSelectSectionProps) {
  const t = useTranslations();

  const selectPlaceholder = t('common.please-select');

  const schoolTypeOptions = SCHOOL_TYPE_KEYS.map((key) => ({
    value: key,
    label: t(`school-types.${key}`),
  }));

  const gradeRangeOptions = GRADE_RANGE_KEYS.map((key) => ({
    value: key,
    label: t(`grade-range.${key}`),
  }));

  const categoryOptions = CATEGORY_KEYS.map((key) => ({
    value: key,
    label: t(`category.${key}`),
  }));

  const federalStateOptions = FEDERAL_STATE_KEYS.map((key) => ({
    value: key,
    label: t(`federal-states.${key}`),
  }));

  const languageOptions = LANGUAGE_KEYS.map((key) => ({
    value: key,
    label: t(`languages.${key}`),
  }));

  const subjectOptions = SUBJECT_SUBGROUPS.map((group) => ({
    title: t(group.titleKey),
    options: group.values.map((value) => ({
      value,
      label: t(`subjects.${value}`),
    })),
  }));

  return (
    <div
      className={cn(isEditView ? 'mt-10 flex flex-col gap-3' : 'flex flex-col gap-2', className)}
    >
      {isEditView && !hideHeading ? (
        <CustomChatHeading2
          text={t('filter.filter-attributes')}
          tooltip={t('filter.filter-edit-tooltip')}
        />
      ) : null}
      {!isEditView ? (
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-medium">{t('filter.filter-label')}</h2>
          {onReset && hasActiveValues ? (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={onReset}>
              <ArrowCounterClockwiseIcon className="mr-1 size-3.5" aria-hidden="true" />
              {t('entity-overview.filter-reset')}
            </Button>
          ) : null}
        </div>
      ) : null}
      <Card className={cn(!isEditView && 'border-0 pt-0 pb-2 gap-4')}>
        <CardRow
          className={cn(
            'grid grid-cols-1 gap-y-4 gap-x-8 md:grid-cols-2 lg:grid-cols-3',
            !isEditView && 'px-0',
          )}
        >
          <MultipleSelectDropdown
            label={t('filter.school-filter')}
            value={values.schoolTypes}
            onValueChange={onSchoolTypesChange}
            optionGroups={[{ options: schoolTypeOptions }]}
            placeholder={selectPlaceholder}
            testId="filter-school-type-select"
            selectedCountLabel={(count) => t('filter.selected-count', { count })}
            showSelectAll={isEditView}
            size="sm"
          />
          <MultipleSelectDropdown
            label={t('filter.grade-filter')}
            value={values.gradeRanges}
            onValueChange={onGradeRangesChange}
            optionGroups={[{ options: gradeRangeOptions }]}
            placeholder={selectPlaceholder}
            testId="filter-grade-range-select"
            selectedCountLabel={(count) => t('filter.selected-count', { count })}
            showSelectAll={isEditView}
            size="sm"
          />
          <MultipleSelectDropdown
            label={t('filter.subject-filter')}
            value={values.subjects}
            onValueChange={onSubjectsChange}
            optionGroups={subjectOptions}
            placeholder={selectPlaceholder}
            testId="filter-subject-select"
            selectedCountLabel={(count) => t('filter.selected-count', { count })}
            showSelectAll={isEditView}
            size="sm"
          />
          <MultipleSelectDropdown
            label={t('filter.category-filter')}
            value={values.categories}
            onValueChange={onCategoriesChange}
            optionGroups={[{ options: categoryOptions }]}
            placeholder={selectPlaceholder}
            testId="filter-category-select"
            selectedCountLabel={(count) => t('filter.selected-count', { count })}
            showSelectAll={isEditView}
            size="sm"
          />
          <MultipleSelectDropdown
            label={t('filter.federal-state-filter')}
            value={values.federalStates}
            onValueChange={onFederalStatesChange}
            optionGroups={[{ options: federalStateOptions }]}
            placeholder={selectPlaceholder}
            testId="filter-federal-state-select"
            selectedCountLabel={(count) => t('filter.selected-count', { count })}
            showSelectAll={isEditView}
            size="sm"
          />
          <MultipleSelectDropdown
            label={t('filter.language-filter')}
            value={values.languages}
            tooltip={t('filter.language-tooltip')}
            onValueChange={onLanguagesChange}
            optionGroups={[{ options: languageOptions }]}
            placeholder={selectPlaceholder}
            testId="filter-language-select"
            selectedCountLabel={(count) => t('filter.selected-count', { count })}
            showSelectAll={isEditView}
            size="sm"
          />
        </CardRow>
      </Card>
    </div>
  );
}
