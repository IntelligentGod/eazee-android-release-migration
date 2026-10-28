import {
  isStaffRole,
  isSuperAdminRole,
  readRoleClaim,
  readUserRole,
} from '@/lib/userRole';

const userWithClaims = (claims: Record<string, unknown>) => ({
  getIdTokenResult: jest.fn(async () => ({ claims } as any)),
});

describe('readUserRole', () => {
  it('reads the three roles from the role claim set by the server', async () => {
    await expect(readUserRole(userWithClaims({ role: 'superAdmin' }))).resolves.toBe('superAdmin');
    await expect(readUserRole(userWithClaims({ role: 'admin' }))).resolves.toBe('admin');
    await expect(readUserRole(userWithClaims({}))).resolves.toBe('customer');
    await expect(readUserRole(null)).resolves.toBe('customer');
  });

  it('never grants a role from anything but a known role value', async () => {
    await expect(readUserRole(userWithClaims({ admin: true }))).resolves.toBe('customer');
    await expect(readUserRole(userWithClaims({ role: 'owner' }))).resolves.toBe('customer');
    expect(readRoleClaim('SUPERADMIN')).toBe('customer');
  });

  it('refreshes the token so a newly granted or removed role is seen', async () => {
    const user = userWithClaims({ role: 'admin' });
    await readUserRole(user);
    expect(user.getIdTokenResult).toHaveBeenCalledWith(true);
  });

  it('treats a failed or slow check as a customer, so sign-in never hangs', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(readUserRole({ getIdTokenResult: jest.fn(async () => { throw new Error('offline'); }) })).resolves.toBe('customer');

    jest.useFakeTimers();
    const pending = readUserRole({ getIdTokenResult: jest.fn(() => new Promise<never>(() => {})) });
    jest.advanceTimersByTime(4000);
    await expect(pending).resolves.toBe('customer');
    jest.useRealTimers();
  });
});

describe('role helpers', () => {
  it('knows which roles are staff (they see the Admin panel row in Settings) and which can manage roles', () => {
    expect([isStaffRole('superAdmin'), isStaffRole('admin'), isStaffRole('customer'), isStaffRole(null)]).toEqual([true, true, false, false]);
    expect([isSuperAdminRole('superAdmin'), isSuperAdminRole('admin')]).toEqual([true, false]);
  });
});
