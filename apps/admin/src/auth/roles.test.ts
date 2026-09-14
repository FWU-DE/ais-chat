import { describe, expect, it } from 'vitest';
import {
  ADMIN_ROLE,
  canAccessAdminApp,
  canAccessEditorArea,
  EDITOR_ROLE,
  getAdminRoleFromClaims,
} from './roles';

describe('getAdminRoleFromClaims', () => {
  it.each([
    [{ role: 'admin' }, ADMIN_ROLE],
    [{ realm_access: { roles: ['Editor'] } }, EDITOR_ROLE],
    [{ resource_access: { admin: { roles: ['EDITOR'] } } }, EDITOR_ROLE],
    [{ realm_access: { roles: ['Editor', 'Admin'] } }, ADMIN_ROLE],
  ])('extracts %s roles', (claims, expectedRole) => {
    expect(getAdminRoleFromClaims(claims)).toBe(expectedRole);
  });

  it('ignores malformed and unrelated claims', () => {
    expect(getAdminRoleFromClaims({ realm_access: 'invalid', role: 'Teacher' })).toBeUndefined();
  });
});

describe('admin role permissions', () => {
  it.each([ADMIN_ROLE, EDITOR_ROLE] as const)(
    'allows %s to access the admin application',
    (role) => {
      expect(canAccessAdminApp(role)).toBe(true);
      expect(canAccessEditorArea(role)).toBe(true);
    },
  );

  it('does not allow an absent role to access protected areas', () => {
    expect(canAccessAdminApp(undefined)).toBe(false);
    expect(canAccessEditorArea(undefined)).toBe(false);
  });
});
