import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

export type ChipOption<T extends string> = { value: T; label: string };

/** A single-choice row of filter chips; `null` is the "All" choice. */
export function FilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
  allowAll = true,
}: {
  label: string;
  options: ChipOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  allowAll?: boolean;
}) {
  const choices: { value: T | null; label: string }[] = allowAll ? [{ value: null, label: 'All' }, ...options] : options;
  return (
    <View className="mb-2">
      <Text className="mb-1 px-4 text-xs font-semibold uppercase text-[#0F5A4D]">{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
        {choices.map((choice) => {
          const selected = choice.value === value;
          return (
            <TouchableOpacity
              key={choice.label}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(choice.value)}
              className={`rounded-full border px-3 py-1.5 ${selected ? 'border-[#0F5A4D] bg-[#0F5A4D]' : 'border-gray-300 bg-white'}`}
            >
              <Text className={`text-sm font-semibold ${selected ? 'text-white' : 'text-gray-700'}`}>{choice.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function StatTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <View className="min-w-[46%] flex-1 rounded-2xl border border-gray-200 bg-white p-3">
      <Text className="text-xs font-semibold uppercase text-gray-500">{label}</Text>
      <Text className="mt-1 text-xl font-bold text-gray-900">{value}</Text>
      {!!detail && <Text className="mt-0.5 text-xs text-gray-500">{detail}</Text>}
    </View>
  );
}

export type BarDatum = { label: string; value: number; display: string };

/** Horizontal bars, one per row, so long period lists stay readable on a phone. */
export function BarChart({ data, emptyLabel }: { data: BarDatum[]; emptyLabel: string }) {
  const max = Math.max(0, ...data.map((datum) => datum.value));
  if (!data.length || max === 0) {
    return <Text className="p-4 text-center text-sm text-gray-500">{emptyLabel}</Text>;
  }
  return (
    <View className="p-4" style={{ gap: 6 }}>
      {data.map((datum) => (
        <View key={datum.label} className="flex-row items-center">
          <Text className="w-20 text-xs text-gray-600" numberOfLines={1}>{datum.label}</Text>
          <View className="mx-2 h-4 flex-1 overflow-hidden rounded bg-gray-100">
            <View className="h-4 rounded bg-[#0F5A4D]" style={{ width: `${Math.max(2, (datum.value / max) * 100)}%` }} />
          </View>
          <Text className="w-20 text-right text-xs font-semibold text-gray-800" numberOfLines={1}>{datum.display}</Text>
        </View>
      ))}
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  return <Text className="px-4 pb-1 pt-4 text-sm font-bold uppercase text-[#0F5A4D]">{children}</Text>;
}
