import type { TemplateRequestStatus } from '@shared/db/schema';

/**
 * Community sharing counts as active as soon as a request exists that the user has not withdrawn,
 * even though isCommunityShared is only set once an admin approves the request.
 */
export function isCommunitySharingActive({
  isCommunityShared,
  requestState,
}: {
  isCommunityShared: boolean;
  requestState: TemplateRequestStatus | undefined;
}): boolean {
  return isCommunityShared || (requestState !== undefined && requestState !== 'cancelled');
}
