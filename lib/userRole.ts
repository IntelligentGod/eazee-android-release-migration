import type { User } from 'firebase/auth';

/**
 * Account roles, read from the Firebase custom claim `role`. Only the Eazee
 * server sets that claim: the super admin is created on server startup, and the
 * super admin assigns admin or customer in the admin panel. The app never
 * stores or trusts a role of its own; every admin endpoint re-checks the claim.
 */
export type UserRole = 'superAdmin' | 'admin' | 'customer';

/** Signing in should never hang on the role check; past this, the user is treated as a customer. */
const ROLE_CHECK_TIMEOUT_MS = 4000;

/** Anything missing or unknown is a customer, so a bad claim never grants access. */
export const readRoleClaim = (value: unknown): UserRole =>
  value === 'superAdmin' || value === 'admin' ? value : 'customer';

export const isStaffRole = (role: UserRole | null | undefined) => role === 'admin' || role === 'superAdmin';

export const isSuperAdminRole = (role: UserRole | null | undefined) => role === 'superAdmin';

/**
 * The account's role from a freshly refreshed ID token, so a role granted or
 * removed on the server is seen right away. A failed or slow check falls back
 * to customer, never to a staff role.
 */
export async function readUserRole(user: Pick<User, 'getIdTokenResult'> | null | undefined, forceRefresh = true): Promise<UserRole> {
  if (!user) return 'customer';
  try {
    const result = await Promise.race([
      user.getIdTokenResult(forceRefresh),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Role check timed out')), ROLE_CHECK_TIMEOUT_MS)),
    ]);
    return readRoleClaim(result.claims.role);
  } catch (error) {
    console.warn('Could not check the account role:', error);
    return 'customer';
  }
}

export const ROLE_LABELS: Record<UserRole, string> = {
  superAdmin: 'Super Admin',
  admin: 'Admin',
  customer: 'Customer',
};
