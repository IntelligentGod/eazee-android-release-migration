import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { readUserRole, type UserRole } from '@/lib/userRole';
import { useAuthSession } from './AuthSessionContext';

type RoleSessionContextValue = {
  /** null while the signed-in user's role is being read, or when signed out. */
  role: UserRole | null;
  isResolving: boolean;
};

const RoleSessionContext = createContext<RoleSessionContextValue | undefined>(undefined);

/**
 * The signed-in account's role, read from a fresh ID token on every sign-in and
 * every cold start. It decides what staff see (the Admin panel row in Settings,
 * the admin screens); the server checks the role again on every admin request.
 */
export const RoleSessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading: isAuthLoading } = useAuthSession();
  const uid = user?.uid ?? null;
  const [resolved, setResolved] = useState<{ uid: string; role: UserRole } | null>(null);

  // The role has to be fetched when the signed-in account changes; nothing else triggers it.
  useEffect(() => {
    if (!user) return;
    let isCurrent = true;
    void readUserRole(user).then((role) => {
      if (isCurrent) setResolved({ uid: user.uid, role });
    });
    return () => {
      isCurrent = false;
    };
  }, [user]);

  const value = useMemo<RoleSessionContextValue>(() => {
    const role = uid && resolved?.uid === uid ? resolved.role : null;
    const isResolving = isAuthLoading || (!!uid && role === null);
    return { role, isResolving };
  }, [isAuthLoading, resolved, uid]);

  return <RoleSessionContext.Provider value={value}>{children}</RoleSessionContext.Provider>;
};

export const useRoleSession = () => {
  const context = useContext(RoleSessionContext);
  if (context === undefined) {
    throw new Error('useRoleSession must be used within a RoleSessionProvider');
  }
  return context;
};
