jest.mock('@/lib/adminApi', () => ({ adminApi: {} }));

import { getRoleLockReason } from '@/components/admin/RoleSection';

describe('role controls', () => {
  const base = { viewerUid: 'super', targetUid: 'carol', targetRole: 'customer' as const };

  it('are editable only for the Super Admin, on someone else who is not the Super Admin', () => {
    expect(getRoleLockReason({ ...base, viewerRole: 'superAdmin' })).toBeNull();
    expect(getRoleLockReason({ ...base, viewerRole: 'admin' })).toBe('Only the Super Admin can change roles.');
    expect(getRoleLockReason({ ...base, viewerRole: null })).toBe('Only the Super Admin can change roles.');
    expect(getRoleLockReason({ ...base, viewerRole: 'superAdmin', targetUid: 'super' })).toBe('You cannot change your own role.');
    expect(getRoleLockReason({ ...base, viewerRole: 'superAdmin', targetRole: 'superAdmin' }))
      .toBe('The Super Admin role cannot be changed in the app.');
  });
});
