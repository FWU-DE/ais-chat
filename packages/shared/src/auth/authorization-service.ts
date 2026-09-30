import { ForbiddenError } from '@shared/error';
import { UserRole } from '@shared/db/schema';
import { UserModel } from './user-model';

type AuthorizedItem = {
  isSchoolShared: boolean;
  isCommunityShared: boolean;
  isGlobal: boolean;
  hasLinkAccess: boolean;
  userId: string | null;
  ownerSchoolIds?: string[];
  suspended: boolean;
};

export function verifyReadAccess<T extends AuthorizedItem>({
  item,
  user,
}: {
  item: T;
  user?: Pick<UserModel, 'id' | 'schoolIds'>;
}) {
  // allow access if shared by link
  if (item.hasLinkAccess && !item.suspended) return;
  // allow access if shared with the community
  if (item.isCommunityShared && !item.suspended) return;
  // allow access if shared globally
  if (item.isGlobal && !item.suspended) return;
  // allow if owner (disregarding the access-level)
  if (item.userId && item.userId === user?.id) return;
  // allow if school-shared
  if (
    item.isSchoolShared &&
    user?.schoolIds &&
    item.ownerSchoolIds?.some((id) => user.schoolIds?.includes(id)) &&
    !item.suspended
  )
    return;

  throw new ForbiddenError('Not authorized for read access');
}

export function verifyWriteAccess<T extends AuthorizedItem>({
  item,
  user,
}: {
  item: T;
  user?: Pick<UserModel, 'id'>;
}) {
  // allow if owner (disregarding the access-level)
  if (item.userId && item.userId === user?.id) return;

  throw new ForbiddenError('Not authorized for write access');
}

export function verifySuspensionState<T extends Pick<AuthorizedItem, 'suspended'>>({
  item,
}: {
  item: T;
}) {
  if (item.suspended) {
    throw new ForbiddenError('Cannot perform this action: item is suspended');
  }
}

export function filterReadableCustomChats<T extends AuthorizedItem>({
  items,
  user,
}: {
  items: T[];
  user?: Pick<UserModel, 'id' | 'schoolIds'>;
}) {
  return items.filter((item) => {
    try {
      verifyReadAccess({ item, user });
      return true;
    } catch (error) {
      if (error instanceof ForbiddenError) {
        return false;
      }
      throw error;
    }
  });
}

export function filterCommunitySharedByAssociatedSchool<
  T extends Pick<AuthorizedItem, 'ownerSchoolIds'>,
>({ items, user }: { items: T[]; user: Pick<UserModel, 'schoolIds'> }) {
  if (user.schoolIds.length === 0) {
    return [];
  }

  return items.filter((item) =>
    item.ownerSchoolIds?.some((schoolId) => user.schoolIds.includes(schoolId)),
  );
}

export function requireTeacherRole(userRole: UserRole) {
  // allow teacher role
  if (userRole === 'teacher') return;

  throw new ForbiddenError('Only teachers are allowed ');
}
