import {
  artsSubjects,
  categoriesSchema,
  ethicsSubjects,
  federalStatesSchema,
  gradeRangesSchema,
  langSubjects,
  languagesSchema,
  otherSubjects,
  schoolTypesSchema,
  socialSciSubjects,
  stemSubjects,
  subjectsSchema,
} from '@shared/db/schema';

export const SCHOOL_TYPE_KEYS = schoolTypesSchema.options;
export const GRADE_RANGE_KEYS = gradeRangesSchema.options;
export const CATEGORY_KEYS = categoriesSchema.options;
export const FEDERAL_STATE_KEYS = federalStatesSchema.options;
export const LANGUAGE_KEYS = languagesSchema.options;
export const SUBJECT_KEYS = subjectsSchema.options;

export const SUBJECT_SUBGROUPS = [
  {
    titleKey: 'filter.subject-subgroup-languages',
    values: langSubjects.options,
  },
  {
    titleKey: 'filter.subject-subgroup-social-sciences',
    values: socialSciSubjects.options,
  },
  {
    titleKey: 'filter.subject-subgroup-arts',
    values: artsSubjects.options,
  },
  {
    titleKey: 'filter.subject-subgroup-other',
    values: otherSubjects.options,
  },
  {
    titleKey: 'filter.subject-subgroup-stem',
    values: stemSubjects.options,
  },
  {
    titleKey: 'filter.subject-subgroup-ethics',
    values: ethicsSubjects.options,
  },
] as const;
