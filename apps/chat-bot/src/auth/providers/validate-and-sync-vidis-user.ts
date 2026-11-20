import { dbCreateUser, dbGetUserById, dbUpdateUserById } from '@ais-chat/shared/db/functions/user';
import { AuthErrorCode, validateOidcProfile } from '@shared/auth/authentication-service';
import { dbGetFederalStateById } from '@shared/db/functions/federal-state';
import { normalizeVidisSchoolIds, vidisRoleToUserRole } from '@shared/db/functions/vidis';

export type VidisSignInResult =
  | { success: true }
  | { success: false; fieldErrors: string[] }
  | { success: false; authError: AuthErrorCode };

export async function validateAndSyncVidisUser(profile: unknown): Promise<VidisSignInResult> {
  const profileValidationResult = validateOidcProfile(profile);
  if (!profileValidationResult.success) {
    return profileValidationResult;
  }

  const parsedProfile = profileValidationResult.value;
  const federalState = await dbGetFederalStateById(parsedProfile.bundesland.trim());
  if (!federalState) {
    return { success: false, authError: 'federal_state_not_found' };
  }

  const existingUser = await dbGetUserById({ userId: parsedProfile.sub });
  const schoolIds = normalizeVidisSchoolIds(parsedProfile.schulkennung);
  const userRole = vidisRoleToUserRole(parsedProfile.rolle.trim());

  if (!existingUser) {
    await dbCreateUser({
      id: parsedProfile.sub,
      schoolIds,
      federalStateId: federalState.id,
      userRole,
    });

    return { success: true };
  }

  await dbUpdateUserById({
    id: existingUser.id,
    schoolIds,
    federalStateId: federalState.id,
    userRole,
  });

  return { success: true };
}
