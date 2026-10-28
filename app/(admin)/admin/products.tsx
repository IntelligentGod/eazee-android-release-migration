import React, { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SimpleScreen, { ErrorState, LoadingState } from '@/components/SimpleScreen';
import { SectionTitle } from '@/components/admin/AdminControls';
import { adminApi } from '@/lib/adminApi';
import { getStoreProducts } from '@/lib/storeBilling';
import type { ProductDisplaySettings } from '@/lib/subscriptionApi';
import { DEFAULT_PRODUCT_DISPLAY, formatPeriodLabel, type StoreProduct } from '@/lib/subscriptionProducts';
import { useServerData } from '@/lib/useServerData';

type DisplayForm = Record<string, { displayOrder: string; badge: string; marketingText: string }>;

const toForm = (settings: ProductDisplaySettings, products: StoreProduct[]): DisplayForm =>
  Object.fromEntries(products.map((product) => {
    const current = settings[product.productId] ?? DEFAULT_PRODUCT_DISPLAY[product.productId];
    return [product.productId, {
      displayOrder: String(current?.displayOrder ?? 0),
      badge: current?.badge ?? '',
      marketingText: current?.marketingText ?? '',
    }];
  }));

const fromForm = (form: DisplayForm): ProductDisplaySettings =>
  Object.fromEntries(Object.entries(form).map(([productId, entry]) => [productId, {
    displayOrder: Math.min(100, Number(entry.displayOrder) || 0),
    badge: entry.badge.trim() || null,
    marketingText: entry.marketingText.trim() || null,
  }]));

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mt-2">
      <Text className="mb-1 text-xs font-semibold text-gray-500">{label}</Text>
      {children}
    </View>
  );
}

function ProductCard({
  product,
  value,
  onChange,
}: {
  product: StoreProduct;
  value: DisplayForm[string];
  onChange: (next: DisplayForm[string]) => void;
}) {
  const inputClass = 'rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-base text-gray-900';
  return (
    <View className="mx-4 mb-3 rounded-2xl border border-gray-200 bg-white p-4">
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
          <Text className="text-base font-bold text-gray-900">{product.title}</Text>
          <Text className="text-xs text-gray-500">{product.productId}</Text>
        </View>
        <Text className="text-base font-bold text-gray-900">{`${product.displayPrice} ${formatPeriodLabel(product)}`}</Text>
      </View>
      {!!product.introOffer && <Text className="mt-1 text-xs text-gray-600">{product.introOffer}</Text>}
      {product.isFallback && (
        <Text className="mt-1 text-xs font-semibold text-amber-700">App Store unavailable: showing offline placeholder prices.</Text>
      )}
      <Labeled label="Display order (0 shows first)">
        <TextInput
          value={value.displayOrder}
          onChangeText={(text) => onChange({ ...value, displayOrder: text.replace(/[^\d]/g, '') })}
          keyboardType="number-pad"
          className={`${inputClass} w-20`}
        />
      </Labeled>
      <Labeled label="Highlight badge (max 30 characters)">
        <TextInput
          value={value.badge}
          maxLength={30}
          onChangeText={(text) => onChange({ ...value, badge: text })}
          placeholder="None"
          className={inputClass}
        />
      </Labeled>
      <Labeled label="Marketing text (max 160 characters)">
        <TextInput
          value={value.marketingText}
          maxLength={160}
          onChangeText={(text) => onChange({ ...value, marketingText: text })}
          placeholder={product.planId === 'yearly' ? 'Default: the yearly saving, from the prices' : 'None'}
          className={inputClass}
        />
      </Labeled>
    </View>
  );
}

function ProductsEditor({ products, settings }: { products: StoreProduct[]; settings: ProductDisplaySettings }) {
  const [form, setForm] = useState<DisplayForm>(() => toForm(settings, products));
  const [isSaving, setIsSaving] = useState(false);

  const save = async () => {
    setIsSaving(true);
    try {
      await adminApi.saveProducts(fromForm(form));
      Alert.alert('Saved', 'The paywall shows the new settings the next time it opens.');
    } catch (error) {
      Alert.alert('Could not save', error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView keyboardShouldPersistTaps="handled">
      <View className="mx-4 mt-3 rounded-xl bg-sky-50 p-3">
        <Text className="text-xs text-sky-900">
          Names, prices, periods and free trials are read-only here: they come from the App Store. Change them in App
          Store Connect, or in eazee_products.storekit while testing from Xcode. Only the app-side display settings
          below can be edited.
        </Text>
      </View>
      <SectionTitle>Products</SectionTitle>
      {products.map((product) => (
        <ProductCard
          key={product.productId}
          product={product}
          value={form[product.productId]}
          onChange={(next) => setForm((previous) => ({ ...previous, [product.productId]: next }))}
        />
      ))}
      <TouchableOpacity
        accessibilityRole="button"
        disabled={isSaving}
        onPress={save}
        className={`mx-4 mb-8 items-center rounded-2xl bg-[#0F5A4D] p-4 ${isSaving ? 'opacity-60' : ''}`}
      >
        <Text className="font-bold text-white">{isSaving ? 'Saving...' : 'Save display settings'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

export default function AdminProductsScreen() {
  const data = useServerData(async () => {
    const [products, config] = await Promise.all([getStoreProducts(), adminApi.config()]);
    return { products, settings: config.products };
  }, 'products');

  return (
    <SimpleScreen title="Subscription products" subtitle="From StoreKit / App Store Connect">
      {data.error ? (
        <ErrorState error={data.error} onRetry={data.reload} />
      ) : data.isLoading || !data.data ? (
        <LoadingState />
      ) : (
        <ProductsEditor products={data.data.products} settings={data.data.settings} />
      )}
    </SimpleScreen>
  );
}
