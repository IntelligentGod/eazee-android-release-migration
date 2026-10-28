import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

let mockAuthState: { user: any; isLoading: boolean } = { user: null, isLoading: true };
jest.mock('../AuthSessionContext', () => ({
  useAuthSession: () => mockAuthState,
}));

import { RoleSessionProvider, useRoleSession } from '../RoleSessionContext';

const userWithRole = (uid: string, role?: string) => ({
  uid,
  getIdTokenResult: jest.fn(async () => ({ claims: role ? { role } : {} })),
});

function renderSession() {
  const seen: Array<ReturnType<typeof useRoleSession>> = [];
  function Probe() {
    seen.push(useRoleSession());
    return null;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<RoleSessionProvider><Probe /></RoleSessionProvider>);
  });
  const rerender = () => act(() => {
    renderer.update(<RoleSessionProvider><Probe /></RoleSessionProvider>);
  });
  return { latest: () => seen[seen.length - 1], rerender, unmount: () => renderer.unmount() };
}

const flush = () => act(async () => {
  await Promise.resolve();
});

describe('RoleSessionProvider', () => {
  it('reads a saved session role on launch', async () => {
    mockAuthState = { user: userWithRole('super', 'superAdmin'), isLoading: false };
    const session = renderSession();
    expect(session.latest()).toEqual({ role: null, isResolving: true });

    await flush();
    expect(session.latest()).toEqual({ role: 'superAdmin', isResolving: false });
    session.unmount();
  });

  it('re-reads the role when another account signs in', async () => {
    mockAuthState = { user: userWithRole('carol'), isLoading: false };
    const session = renderSession();
    await flush();
    expect(session.latest().role).toBe('customer');

    mockAuthState = { user: userWithRole('admin-2', 'admin'), isLoading: false };
    session.rerender();
    expect(session.latest().isResolving).toBe(true);
    await flush();
    expect(session.latest()).toEqual({ role: 'admin', isResolving: false });
    session.unmount();
  });

  it('has no role when signed out', () => {
    mockAuthState = { user: null, isLoading: false };
    const session = renderSession();
    expect(session.latest()).toEqual({ role: null, isResolving: false });
    session.unmount();
  });
});
