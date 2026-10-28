import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { router, type Href } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import SimpleScreen from '@/components/SimpleScreen';
import RoleBadge from '@/components/admin/RoleBadge';
import { useRoleSession } from '@/app/context/RoleSessionContext';
import { isSuperAdminRole } from '@/lib/userRole';

type Section = {
  href: Href;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  description: string;
  superAdminOnly?: boolean;
};

const SECTIONS: Section[] = [
  { href: '/admin/users', icon: 'account-group-outline', title: 'Users', description: 'Search accounts, roles, plans, purchases and usage' },
  { href: '/admin/purchases', icon: 'receipt', title: 'Purchases', description: 'Every transaction, by product, status and date' },
  { href: '/admin/income', icon: 'chart-bar', title: 'Income', description: 'Estimated revenue and active subscribers' },
  { href: '/admin/products', icon: 'tag-outline', title: 'Subscription products', description: 'App Store prices and display settings' },
  { href: '/admin/limits', icon: 'tune-variant', title: 'Limits and settings', description: 'Free and Pro daily limits' },
  { href: '/admin/role-changes', icon: 'history', title: 'Role changes', description: 'Who changed whose role, and when', superAdminOnly: true },
];

export default function AdminHomeScreen() {
  const { role } = useRoleSession();
  // Staff reach Admin from Settings, which stays open underneath, so going
  // back returns straight to it. Opened some other way, it reopens Settings.
  const backToApp = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace({ pathname: '/(tabs)/home', params: { settings: 'true', settingsNonce: String(Date.now()) } });
  };
  const sections = SECTIONS.filter((section) => !section.superAdminOnly || isSuperAdminRole(role));

  return (
    <SimpleScreen
      title="Admin"
      onBack={backToApp}
      right={role ? <View className="pr-2"><RoleBadge role={role} /></View> : null}
    >
      <ScrollView contentContainerStyle={{ gap: 12, padding: 16 }}>
        {sections.map((section) => (
          <TouchableOpacity
            key={section.title}
            accessibilityRole="button"
            activeOpacity={0.85}
            onPress={() => router.push(section.href)}
            className="flex-row items-center rounded-2xl border border-gray-200 bg-white p-4"
          >
            <View className="h-11 w-11 items-center justify-center rounded-xl bg-[#E6F4F1]">
              <MaterialCommunityIcons name={section.icon} size={24} color="#0F5A4D" />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-base font-bold text-gray-900">{section.title}</Text>
              <Text className="text-sm text-gray-600">{section.description}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-right" size={24} color="#9CA3AF" />
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          accessibilityRole="button"
          onPress={backToApp}
          className="mt-2 items-center rounded-2xl bg-[#0F5A4D] p-4"
        >
          <Text className="font-bold text-white">Back to the app</Text>
        </TouchableOpacity>
      </ScrollView>
    </SimpleScreen>
  );
}
