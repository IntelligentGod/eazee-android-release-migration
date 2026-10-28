import React, { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SimpleScreen, { ErrorState, LoadingState } from '@/components/SimpleScreen';
import { SectionTitle } from '@/components/admin/AdminControls';
import { adminApi, type AdminConfig } from '@/lib/adminApi';
import { LIMIT_FIELDS, formToLimits, limitsToForm, type LimitField, type LimitsForm } from '@/lib/adminLimitsForm';
import { formatSubscriptionDate } from '@/lib/subscriptionStatusText';
import { useServerData } from '@/lib/useServerData';

function LimitRow({
  label,
  unit,
  free,
  pro,
  onChange,
}: {
  label: string;
  unit: string;
  free: string;
  pro: string;
  onChange: (tier: 'free' | 'pro', value: string) => void;
}) {
  const input = (tier: 'free' | 'pro', value: string) => (
    <TextInput
      value={value}
      onChangeText={(text) => onChange(tier, text.replace(/[^\d]/g, ''))}
      placeholder="Unlimited"
      keyboardType="number-pad"
      accessibilityLabel={`${label}, ${tier}`}
      className="w-24 rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-right text-base text-gray-900"
    />
  );
  return (
    <View className="flex-row items-center border-b border-gray-100 bg-white px-4 py-2.5">
      <View className="flex-1 pr-2">
        <Text className="text-sm font-semibold text-gray-900">{label}</Text>
        <Text className="text-xs text-gray-500">{unit}</Text>
      </View>
      <View className="flex-row" style={{ gap: 8 }}>
        {input('free', free)}
        {input('pro', pro)}
      </View>
    </View>
  );
}

function LimitsEditor({ config, onSaved }: { config: AdminConfig; onSaved: (config: AdminConfig) => void }) {
  const [form, setForm] = useState<LimitsForm>(() => limitsToForm(config.limits));
  const [isSaving, setIsSaving] = useState(false);

  const setField = (field: LimitField) => (tier: 'free' | 'pro', value: string) =>
    setForm((previous) => ({ ...previous, [tier]: { ...previous[tier], [field]: value } }));

  const save = async () => {
    const parsed = formToLimits(form);
    if ('error' in parsed) {
      Alert.alert('Check the limits', parsed.error);
      return;
    }
    setIsSaving(true);
    try {
      const saved = await adminApi.saveLimits(parsed.limits);
      setForm(limitsToForm(saved.limits));
      onSaved(saved);
      Alert.alert('Saved', 'The server applies the new limits within a minute.');
    } catch (error) {
      Alert.alert('Could not save', error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const rows = (fields: typeof LIMIT_FIELDS) => fields.map(({ field, label, unit }) => (
    <LimitRow key={field} label={label} unit={unit} free={form.free[field]} pro={form.pro[field]} onChange={setField(field)} />
  ));

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <Text className="px-4 pt-3 text-xs text-gray-600">
        Empty means unlimited. An AI action is one item Eazee creates, changes or deletes for the user;
        chatting, voice, suggestions and guidance are never counted. Limits reset each day in the user&apos;s time zone.
      </Text>
      <View className="flex-row justify-end px-4 pt-3" style={{ gap: 8 }}>
        <Text className="w-24 text-center text-xs font-bold uppercase text-gray-500">Free</Text>
        <Text className="w-24 text-center text-xs font-bold uppercase text-gray-500">Pro</Text>
      </View>
      {/* AI chat, voice input and guidance are unlimited on every plan, so only AI actions have a limit. */}
      <SectionTitle>AI actions</SectionTitle>
      {rows(LIMIT_FIELDS)}
      {!!config.updatedAt && (
        <Text className="px-4 pt-3 text-xs text-gray-500">
          {`Last changed ${formatSubscriptionDate(config.updatedAt)}${config.updatedBy ? ` by ${config.updatedBy}` : ''}`}
        </Text>
      )}
      <TouchableOpacity
        accessibilityRole="button"
        disabled={isSaving}
        onPress={save}
        className={`m-4 items-center rounded-2xl bg-[#0F5A4D] p-4 ${isSaving ? 'opacity-60' : ''}`}
      >
        <Text className="font-bold text-white">{isSaving ? 'Saving...' : 'Save limits'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

export default function AdminLimitsScreen() {
  const config = useServerData(() => adminApi.config(), 'config');
  const [saved, setSaved] = useState<AdminConfig | null>(null);
  const current = saved ?? config.data;

  return (
    <SimpleScreen title="Limits and settings" subtitle="Enforced by the server">
      {config.error ? (
        <ErrorState error={config.error} onRetry={config.reload} />
      ) : config.isLoading || !current ? (
        <LoadingState />
      ) : (
        <LimitsEditor config={current} onSaved={setSaved} />
      )}
    </SimpleScreen>
  );
}
