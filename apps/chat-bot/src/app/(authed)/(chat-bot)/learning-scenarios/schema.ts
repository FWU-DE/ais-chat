/**
 * This schema is used to validate the form values for the shared school chat form.
 * If the field is required, set the min length to at least 1.
 */

import { z } from 'zod';

import {
  SMALL_TEXT_INPUT_FIELDS_LIMIT,
  TEXT_INPUT_FIELDS_LENGTH_LIMIT,
  TEXT_INPUT_FIELDS_LENGTH_LIMIT_FOR_DETAILED_SETTINGS,
} from '@/configuration-text-inputs/const';
import { formLinks } from '@/utils/web-search/form-links';

/**
 * Zod form configuration Info:
 * - If the field is required, set the min length to at least 1.
 * - If the field is nullable, it must not have a min length.
 * - behavior of the textInput component is based on the nullable property (required behavior vs optional behavior)
 * - the max length property controls the behavior of the TextInput component and blocks user input if the max length is reached
 */
export const sharedSchoolChatFormValuesSchema = z.object({
  name: z.string().trim().min(1).max(SMALL_TEXT_INPUT_FIELDS_LIMIT),
  description: z.string().min(1).max(SMALL_TEXT_INPUT_FIELDS_LIMIT),
  pictureId: z.string().nullable(),
  modelId: z.string(),
  schoolType: z.string().max(SMALL_TEXT_INPUT_FIELDS_LIMIT).nullable(),
  gradeLevel: z.string().max(SMALL_TEXT_INPUT_FIELDS_LIMIT).nullable(),
  subject: z.string().max(SMALL_TEXT_INPUT_FIELDS_LIMIT).nullable(),
  studentExercise: z.string().max(1000).nullable(),
  additionalInstructions: z
    .string()
    .min(1)
    .max(TEXT_INPUT_FIELDS_LENGTH_LIMIT_FOR_DETAILED_SETTINGS),
  restrictions: z.string().max(TEXT_INPUT_FIELDS_LENGTH_LIMIT).nullable(),
  attachedLinks: formLinks,
  isSchoolShared: z.boolean(),
  hasLinkAccess: z.boolean(),
});

export type SharedSchoolChatFormValues = z.infer<typeof sharedSchoolChatFormValuesSchema>;
