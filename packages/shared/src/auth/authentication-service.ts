import z from 'zod';

import { normalizeVidisSchoolIds } from '../db/functions/vidis';

const authErrorCodeSchema = z.enum(['federal_state_not_found']);
export type AuthErrorCode = z.infer<typeof authErrorCodeSchema>;

const vidisProfileSchema = z.object({
  sub: z.string(),
  sid: z.string(),
  is_ai_chat_eligible: z.boolean().optional(),
  rolle: z.string(),
  schulkennung: z.string().or(z.array(z.string())),
  bundesland: z.string(),
});
export type OidcProfile = z.infer<typeof vidisProfileSchema>;

type OidcValidationResult =
  | { success: true; value: z.infer<typeof vidisProfileSchema> }
  | { success: false; fieldErrors: string[] };

function isEmptyString(value: string): boolean {
  return value.trim().length === 0;
}

function getBusinessFieldErrors(profile: z.infer<typeof vidisProfileSchema>): string[] {
  const fieldErrors: string[] = [];

  if (isEmptyString(profile.rolle)) {
    fieldErrors.push('rolle');
  }
  if (isEmptyString(profile.bundesland)) {
    fieldErrors.push('bundesland');
  }

  const schoolIds = normalizeVidisSchoolIds(profile.schulkennung);
  if (schoolIds.length === 0) {
    fieldErrors.push('schulkennung');
  }

  return fieldErrors;
}

/**
 * The profile returned by VIDIS must contain certain fields
 * like federalState, role, schoolIds, etc.
 * This function checks if all mandatory fields are present in the profile.
 * If not, it returns which fields are missing from the zod error.
 *
 * @param profile - The profile object to validate
 * @returns An object indicating whether the profile is valid or which fields are missing
 */
export function validateOidcProfile(profile: unknown): OidcValidationResult {
  const profileResult = vidisProfileSchema.safeParse(profile);
  if (!profileResult.success) {
    const flattened = z.flattenError(profileResult.error);
    const fieldErrors = Object.keys(flattened.fieldErrors);

    return { success: false, fieldErrors };
  }

  const fieldErrors = getBusinessFieldErrors(profileResult.data);
  if (fieldErrors.length > 0) {
    return { success: false, fieldErrors };
  }

  return { success: true, value: profileResult.data };
}

/**
 * Generates an error URL with the missing field names as search params.
 * @param fieldErrors - An array of missing field names
 * @param authError - An optional authentication error code
 * @returns A URL string pointing to the login error page with query parameters
 */
export function generateErrorUrl(fieldErrors: string[], authError?: AuthErrorCode) {
  if (fieldErrors.length === 0 && !authError) {
    return '/login/error';
  }

  const searchParams = new URLSearchParams();
  if (fieldErrors.length > 0) {
    searchParams.append('profile_error', fieldErrors.join(','));
  }
  if (authError) {
    searchParams.append('auth_error', authError);
  }

  return `/login/error?${searchParams.toString()}`;
}

const profileSearchParamsSchema = z.object({
  profile_error: z.string().optional(),
  auth_error: authErrorCodeSchema.optional(),
});

/**
 * Parses the URL search params to extract field errors.
 */
export function getFieldErrorsFromUrl(
  searchParams: Record<string, string | string[] | undefined>,
): string[] {
  const parseResult = profileSearchParamsSchema.safeParse(searchParams);
  if (!parseResult.success) {
    return [];
  }

  const fieldErrorsEncoded = parseResult.data.profile_error;
  if (!fieldErrorsEncoded) {
    return [];
  }
  // Decode the strings because comma is encoded as %2C
  const fieldErrors = decodeURIComponent(fieldErrorsEncoded);
  return fieldErrors.split(',');
}

export function getAuthErrorFromUrl(
  searchParams: Record<string, string | string[] | undefined>,
): AuthErrorCode | undefined {
  const parseResult = profileSearchParamsSchema.safeParse(searchParams);
  if (!parseResult.success) {
    return undefined;
  }

  return parseResult.data.auth_error;
}
