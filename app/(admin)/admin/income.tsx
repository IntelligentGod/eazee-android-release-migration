import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import SimpleScreen, { ErrorState, LoadingState } from '@/components/SimpleScreen';
import { BarChart, FilterChips, SectionTitle, StatTile, type ChipOption } from '@/components/admin/AdminControls';
import { ADMIN_ENVIRONMENT_OPTIONS, adminApi, type AdminEnvironment, type IncomeReport, type Money } from '@/lib/adminApi';
import { SUBSCRIPTION_PLANS } from '@/lib/subscription';
import { formatCurrency } from '@/lib/subscriptionStatusText';
import { useServerData } from '@/lib/useServerData';

type Granularity = 'day' | 'month';
const GRANULARITY_OPTIONS: ChipOption<Granularity>[] = [
  { value: 'day', label: 'Last 30 days, by day' },
  { value: 'month', label: 'Last 12 months, by month' },
];

const utcDay = (epochMs: number) => new Date(epochMs).toISOString().slice(0, 10);

const rangeFor = (granularity: Granularity) => {
  const now = Date.now();
  if (granularity === 'day') return { from: utcDay(now - 29 * 86_400_000), to: utcDay(now) };
  const start = new Date(now);
  start.setUTCMonth(start.getUTCMonth() - 11, 1);
  return { from: utcDay(start.getTime()), to: utcDay(now) };
};

/** Amounts stay per currency (no conversion), joined when there is more than one. */
const formatMoney = (money: Money) => {
  const entries = Object.entries(money).filter(([, value]) => value !== 0);
  return entries.length
    ? entries.map(([currency, value]) => formatCurrency(value, currency)).join(' + ')
    : formatCurrency(0, 'USD');
};

const productName = (productId: string) =>
  SUBSCRIPTION_PLANS.find((plan) => plan.productId === productId)?.title ?? productId;

function IncomeSummary({ report }: { report: IncomeReport }) {
  const currencies = Object.keys(report.totals.net);
  const chartCurrency = currencies[0] ?? 'USD';
  const { subscribers } = report;

  return (
    <>
      <View className="mx-4 mt-3 rounded-xl bg-amber-50 p-3">
        <Text className="text-xs text-amber-900">Estimated. {report.note}</Text>
      </View>

      <View className="flex-row flex-wrap px-4 pt-3" style={{ gap: 8 }}>
        <StatTile label="Net revenue (est.)" value={formatMoney(report.totals.net)} detail={`${report.from} to ${report.to}`} />
        <StatTile label="Gross (est.)" value={formatMoney(report.totals.gross)} detail={`${report.totals.count} paid transactions`} />
        <StatTile label="Refunds" value={formatMoney(report.totals.refunds)} detail={`${report.totals.refundCount} refunded`} />
        <StatTile label="MRR (est.)" value={formatMoney(subscribers.mrr)} detail="Renewing paid plans, yearly / 12" />
        <StatTile
          label="Active subscribers"
          value={String(subscribers.active + subscribers.billingRetry)}
          detail={`${subscribers.byPlan.monthly} monthly · ${subscribers.byPlan.yearly} yearly`}
        />
        <StatTile
          label="Cancelled"
          value={String(subscribers.cancelled)}
          detail={`Back on Free · ${subscribers.trial} in free trial · ${subscribers.billingRetry} billing issues`}
        />
      </View>

      <SectionTitle>{`Net revenue by ${report.granularity} (${chartCurrency})`}</SectionTitle>
      <View className="mx-4 rounded-2xl border border-gray-200 bg-white">
        <BarChart
          emptyLabel="No revenue in this period."
          data={report.buckets.map((bucket) => ({
            label: bucket.period,
            value: Math.max(0, bucket.net[chartCurrency] ?? 0),
            display: formatCurrency(bucket.net[chartCurrency] ?? 0, chartCurrency),
          }))}
        />
      </View>

      <SectionTitle>By product</SectionTitle>
      <View className="mx-4 rounded-2xl border border-gray-200 bg-white">
        {Object.entries(report.totals.byProduct).length ? (
          Object.entries(report.totals.byProduct).map(([productId, entry]) => (
            <View key={productId} className="flex-row justify-between border-b border-gray-100 px-4 py-3">
              <Text className="text-sm font-semibold text-gray-900">{productName(productId)}</Text>
              <Text className="text-sm text-gray-700">{`${entry.count} · ${formatMoney(entry.gross)}`}</Text>
            </View>
          ))
        ) : (
          <Text className="p-4 text-center text-sm text-gray-500">No sales in this period.</Text>
        )}
      </View>
      <View className="h-8" />
    </>
  );
}

export default function AdminIncomeScreen() {
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [environment, setEnvironment] = useState<AdminEnvironment>('Production');
  const report = useServerData(
    () => adminApi.income({ granularity, environment, ...rangeFor(granularity) }),
    `${granularity}:${environment}`
  );

  return (
    <SimpleScreen title="Income" subtitle="Estimated from Eazee's transaction records">
      <View className="pt-3" style={{ backgroundColor: 'rgba(255, 255, 255, 0.3)' }}>
        <FilterChips label="Period" options={GRANULARITY_OPTIONS} value={granularity} allowAll={false} onChange={(value) => value && setGranularity(value)} />
        <FilterChips label="Environment" options={ADMIN_ENVIRONMENT_OPTIONS} value={environment} allowAll={false} onChange={(value) => value && setEnvironment(value)} />
      </View>
      {report.error ? (
        <ErrorState error={report.error} onRetry={report.reload} />
      ) : report.isLoading || !report.data ? (
        <LoadingState />
      ) : (
        <ScrollView>
          <IncomeSummary report={report.data} />
        </ScrollView>
      )}
    </SimpleScreen>
  );
}
