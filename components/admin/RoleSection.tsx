import React, { useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import RoleBadge from '@/components/admin/RoleBadge';
import { adminApi } from '@/lib/adminApi';
import { ROLE_LABELS, isSuperAdminRole, type UserRole } from '@/lib/userRole';

const ASSIGNABLE: ('customer' | 'admin')[] = ['customer', 'admin'];

/** Why a super admin cannot change this user's role, or null when they can. */
export function getRoleLockReason(input: { viewerRole: UserRole | null; viewerUid: string | null; targetUid: string; targetRole: UserRole }) {
  if (!isSuperAdminRole(input.viewerRole)) return 'Only the Super Admin can change roles.';
  if (input.targetUid === input.viewerUid) return 'You cannot change your own role.';
  if (input.targetRole === 'superAdmin') return 'The Super Admin role cannot be changed in the app.';
  return null;
}

/**
 * A user's role. The Super Admin can switch another user between Customer and
 * Admin, after a confirmation; everyone else sees it read-only. The server
 * checks the same rules again.
 */
export default function RoleSection({
  targetUid,
  targetEmail,
  role,
  viewerRole,
  viewerUid,
  onChanged,
}: {
  targetUid: string;
  targetEmail: string | null;
  role: UserRole;
  viewerRole: UserRole | null;
  viewerUid: string | null;
  onChanged: () => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const lockReason = getRoleLockReason({ viewerRole, viewerUid, targetUid, targetRole: role });

  const change = (next: 'customer' | 'admin') => {
    Alert.alert(
      `Make ${ROLE_LABELS[next]}?`,
      `${targetEmail || targetUid} becomes ${next === 'admin' ? 'an Admin and can use the admin panel' : 'a Customer and loses admin access'}. They are signed out and get the new role when they sign in again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Make ${ROLE_LABELS[next]}`,
          style: next === 'customer' ? 'destructive' : 'default',
          onPress: async () => {
            setIsSaving(true);
            try {
              await adminApi.setRole(targetUid, next);
              onChanged();
            } catch (error) {
              Alert.alert('Could not change the role', error instanceof Error ? error.message : String(error));
            } finally {
              setIsSaving(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View className="bg-white px-4 py-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm text-gray-500">Role</Text>
        <RoleBadge role={role} />
      </View>
      {lockReason ? (
        <Text className="mt-2 text-xs text-gray-500">{lockReason}</Text>
      ) : (
        <View className="mt-3 flex-row" style={{ gap: 8 }}>
          {ASSIGNABLE.map((option) => {
            const selected = option === role;
            return (
              <TouchableOpacity
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled: isSaving || selected }}
                disabled={isSaving || selected}
                onPress={() => change(option)}
                className={`flex-1 items-center rounded-xl border px-3 py-2 ${selected ? 'border-[#0F5A4D] bg-[#0F5A4D]' : 'border-gray-300 bg-white'} ${isSaving ? 'opacity-60' : ''}`}
              >
                <Text className={`font-semibold ${selected ? 'text-white' : 'text-gray-800'}`}>{ROLE_LABELS[option]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}
