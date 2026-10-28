import React from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';
import { Redirect } from 'expo-router';
import SimpleScreen, { ErrorState, LoadingState } from '@/components/SimpleScreen';
import RoleBadge from '@/components/admin/RoleBadge';
import { useRoleSession } from '@/app/context/RoleSessionContext';
import { adminApi, type RoleChange } from '@/lib/adminApi';
import { usePagedServerData } from '@/lib/usePagedServerData';
import { isSuperAdminRole } from '@/lib/userRole';

function RoleChangeRow({ change }: { change: RoleChange }) {
  return (
    <View className="mx-3 mt-2 rounded-2xl bg-white px-4 py-3">
      <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>{change.targetEmail || change.targetUid}</Text>
      <View className="mt-1 flex-row items-center" style={{ gap: 8 }}>
        <RoleBadge role={change.from} />
        <Text className="text-xs text-gray-500">to</Text>
        <RoleBadge role={change.to} />
      </View>
      <Text className="mt-1 text-xs text-gray-500">
        {`By ${change.changedByEmail || change.changedBy} · ${new Date(change.at).toLocaleString()}`}
      </Text>
    </View>
  );
}

function RoleChangesList() {
  const changes = usePagedServerData<RoleChange>(
    async (cursor) => {
      const page = await adminApi.roleChanges(cursor);
      return { items: page.changes, nextCursor: page.nextCursor };
    },
    'role-changes'
  );

  if (changes.error && !changes.items.length) return <ErrorState error={changes.error} onRetry={changes.reload} />;
  if (changes.isLoading && !changes.items.length) return <LoadingState />;
  return (
    <FlatList
      data={changes.items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <RoleChangeRow change={item} />}
      onRefresh={changes.reload}
      refreshing={changes.isLoading && changes.items.length > 0}
      onEndReached={changes.loadMore}
      ListEmptyComponent={<Text className="p-8 text-center text-sm text-gray-600">No role changes yet.</Text>}
      ListFooterComponent={changes.hasMore ? (
        <TouchableOpacity accessibilityRole="button" onPress={changes.loadMore} className="items-center p-4">
          <Text className="font-semibold text-[#0F5A4D]">Load more</Text>
        </TouchableOpacity>
      ) : null}
    />
  );
}

/** The role-change audit log; the Super Admin only. */
export default function AdminRoleChangesScreen() {
  const { role } = useRoleSession();
  if (!isSuperAdminRole(role)) return <Redirect href="/admin" />;

  return (
    <SimpleScreen title="Role changes" subtitle="Audit log">
      <RoleChangesList />
    </SimpleScreen>
  );
}
