import React from 'react';
import { Redirect, Stack } from 'expo-router';
import { LoadingState } from '@/components/SimpleScreen';
import { isStaffRole } from '@/lib/userRole';
import { useAuthSession } from '../context/AuthSessionContext';
import { useRoleSession } from '../context/RoleSessionContext';

/**
 * Client-side guard for every admin screen: admins and the super admin only.
 * Role-management screens add a super-admin check of their own. The server
 * checks the role again on every admin request, so this only keeps customers
 * from seeing screens they could not load anyway.
 */
export default function AdminLayout() {
  const { user, isLoading: isAuthLoading } = useAuthSession();
  const { role, isResolving } = useRoleSession();

  if (!isAuthLoading && !user) return <Redirect href="/" />;
  if (isResolving) return <LoadingState label="Checking access..." />;
  if (!isStaffRole(role)) return <Redirect href="/(tabs)/chat" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
