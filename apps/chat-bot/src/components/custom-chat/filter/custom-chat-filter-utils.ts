import {
  type Category,
  type FederalState,
  type FilterGroup,
  type GradeRange,
  type Language,
  type SchoolType,
  type Subject,
} from '@shared/db/schema';
import { useTranslations } from 'next-intl';

export type FilterValues = {
  schoolTypes: SchoolType[];
  gradeRanges: GradeRange[];
  subjects: Subject[];
  categories: Category[];
  federalStates: FederalState[];
  languages: Language[];
};

export const EMPTY_FILTER_VALUES: FilterValues = {
  schoolTypes: [],
  gradeRanges: [],
  subjects: [],
  categories: [],
  federalStates: [],
  languages: [],
};

export type EntityWithFilterValues = {
  filterGroup?: {
    school_types?: SchoolType[];
    grade_ranges?: GradeRange[];
    subjects?: Subject[];
    categories?: Category[];
    federal_states?: FederalState[];
    languages?: Language[];
  };
  schoolType?: SchoolType | null;
  gradeLevel?: GradeRange | null;
  subject?: Subject | null;
};

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function matchesSelectedGroup<T>(entityValues: T[], selectedValues: T[]): boolean {
  if (selectedValues.length === 0) {
    return true;
  }

  const entityValueSet = new Set(entityValues);
  return selectedValues.some((value) => entityValueSet.has(value));
}

export function matchesFilterValues(
  entityValues: FilterValues,
  selectedValues: FilterValues,
): boolean {
  return (
    matchesSelectedGroup(entityValues.schoolTypes, selectedValues.schoolTypes) &&
    matchesSelectedGroup(entityValues.gradeRanges, selectedValues.gradeRanges) &&
    matchesSelectedGroup(entityValues.subjects, selectedValues.subjects) &&
    matchesSelectedGroup(entityValues.categories, selectedValues.categories) &&
    matchesSelectedGroup(entityValues.federalStates, selectedValues.federalStates) &&
    matchesSelectedGroup(entityValues.languages, selectedValues.languages)
  );
}

export function extractFilterValues(entity: EntityWithFilterValues): FilterValues {
  const filterGroup = entity.filterGroup;
  const schoolTypes =
    filterGroup?.school_types && filterGroup.school_types.length > 0
      ? filterGroup.school_types
      : entity.schoolType
        ? [entity.schoolType]
        : [];

  const gradeRanges =
    filterGroup?.grade_ranges && filterGroup.grade_ranges.length > 0
      ? filterGroup.grade_ranges
      : entity.gradeLevel
        ? [entity.gradeLevel]
        : [];

  const subjects =
    filterGroup?.subjects && filterGroup.subjects.length > 0
      ? filterGroup.subjects
      : entity.subject
        ? [entity.subject]
        : [];

  return {
    schoolTypes: unique(schoolTypes),
    gradeRanges: unique(gradeRanges),
    subjects: unique(subjects),
    categories: unique(filterGroup?.categories ?? []),
    federalStates: unique(filterGroup?.federal_states ?? []),
    languages: unique(filterGroup?.languages ?? []),
  };
}

export function toFilterGroup(values: FilterValues): FilterGroup {
  return {
    school_types: unique(values.schoolTypes),
    grade_ranges: unique(values.gradeRanges),
    subjects: unique(values.subjects),
    categories: unique(values.categories),
    federal_states: unique(values.federalStates),
    languages: unique(values.languages),
  };
}

export type ActiveFilterPill = {
  label: string;
  group: keyof FilterValues;
  value: FilterValues[keyof FilterValues][number];
};

export function getActiveFilterPills(
  values: FilterValues,
  t: ReturnType<typeof useTranslations<never>>,
): ActiveFilterPill[] {
  return [
    ...values.schoolTypes.map((value) => ({
      label: t(`school-types.${value}`),
      group: 'schoolTypes' as const,
      value,
    })),
    ...values.gradeRanges.map((value) => ({
      label: t(`grade-range.${value}`),
      group: 'gradeRanges' as const,
      value,
    })),
    ...values.subjects.map((value) => ({
      label: t(`subjects.${value}`),
      group: 'subjects' as const,
      value,
    })),
    ...values.categories.map((value) => ({
      label: t(`category.${value}`),
      group: 'categories' as const,
      value,
    })),
    ...values.federalStates.map((value) => ({
      label: t(`federal-states.${value}`),
      group: 'federalStates' as const,
      value,
    })),
    ...values.languages.map((value) => ({
      label: t(`languages.${value}`),
      group: 'languages' as const,
      value,
    })),
  ];
}
