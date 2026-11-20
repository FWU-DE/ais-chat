export const ADMIN_ROLE = 'Admin';
export const EDITOR_ROLE = 'Editor';

export type AdminRole = typeof ADMIN_ROLE | typeof EDITOR_ROLE;

function getClaimValues(claims: Record<string, unknown>): string[] {
  const realmAccess = claims.realm_access;
  const resourceAccess = claims.resource_access;
  const clientRoles =
    resourceAccess && typeof resourceAccess === 'object'
      ? Object.values(resourceAccess).flatMap((client) =>
          client && typeof client === 'object' && 'roles' in client && Array.isArray(client.roles)
            ? client.roles
            : [],
        )
      : [];

  return [
    claims.role,
    realmAccess && typeof realmAccess === 'object' && 'roles' in realmAccess
      ? realmAccess.roles
      : undefined,
    clientRoles,
  ]
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value): value is string => typeof value === 'string');
}

export function getAdminRoleFromClaims(claims: Record<string, unknown>): AdminRole | undefined {
  const roles = getClaimValues(claims).map((role) => role.toLowerCase());

  if (roles.includes(ADMIN_ROLE.toLowerCase())) {
    return ADMIN_ROLE;
  }

  if (roles.includes(EDITOR_ROLE.toLowerCase())) {
    return EDITOR_ROLE;
  }

  return undefined;
}

export function canAccessAdminApp(role: AdminRole | undefined): role is AdminRole {
  return role !== undefined;
}

export function canAccessEditorArea(role: AdminRole | undefined): boolean {
  return role === ADMIN_ROLE || role === EDITOR_ROLE;
}
