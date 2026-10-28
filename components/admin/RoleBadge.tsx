import React from 'react';
import { Text } from 'react-native';
import { ROLE_LABELS, type UserRole } from '@/lib/userRole';

const ROLE_CLASSES: Record<UserRole, string> = {
  superAdmin: 'bg-violet-100 text-violet-800',
  admin: 'bg-sky-100 text-sky-800',
  customer: 'bg-gray-100 text-gray-700',
};

export default function RoleBadge({ role }: { role: UserRole }) {
  return (
    <Text className={`overflow-hidden rounded-full px-2 py-0.5 text-xs font-semibold ${ROLE_CLASSES[role]}`}>
      {ROLE_LABELS[role]}
    </Text>
  );
}
