import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import ScreenHeader from '@/components/ScreenHeader';
import AiReplyLoadingOverlay from '@/components/AiReplyLoadingOverlay';
import LiquidGlassIconButton from '@/components/LiquidGlassIconButton';
import { GuidedTarget } from '@/components/guidance/GuidanceProvider';
import { useTabContext } from '@/app/context/TabContext';
import { getHomeSettingsBackGuidanceTargetId } from '@/lib/navigationHelp';
import { PRIVACY_POLICY_URL, TERMS_URL } from '@/lib/legalLinks';
import { useSubscriptionStatus } from '@/lib/useSubscriptionStatus';
import {
  changeSubscriptionPlan,
  getStoreProducts,
  openManageSubscriptions,
  purchaseSubscription,
  restorePurchases,
  syncStoreSubscriptionStatus,
} from '@/lib/storeBilling';
import {
  DEFAULT_SUBSCRIPTION_PLAN_ID,
  buildPlanComparisonRows,
  type ComparisonRow,
  type ComparisonValue,
  type SubscriptionPlanId,
} from '@/lib/subscription';
import {
  DEFAULT_PRODUCT_DISPLAY,
  FALLBACK_STORE_PRODUCTS,
  formatPeriodLabel,
  getStoreCurrencyCode,
  getSwitchTargetPlanId,
  getYearlySavingsLabel,
  isUpgrade,
  orderStoreProducts,
  type StoreProduct,
} from '@/lib/subscriptionProducts';
import type { ProductDisplaySettings } from '@/lib/subscriptionApi';
import CurrentPlanCard from '@/components/subscription/CurrentPlanCard';

const ACCENT = '#1FF5EF';
const HEADLINE_ACCENT = '#74FEFE';
const CTA_FILL = '#9AFCFD';
const CTA_TEXT = '#00312F';
const CHECK_FILL = '#32C8C2';
const TABLE_BORDER = 'rgba(126, 244, 240, 0.22)';

function ComparisonCell({ value }: { value: ComparisonValue }) {
  if (value.kind === 'check') {
    return (
      <View style={styles.checkCircle}>
        <MaterialCommunityIcons name="check" size={15} color="#00312F" />
      </View>
    );
  }

  if (value.kind === 'none') {
    return <Text style={styles.cellDash}>—</Text>;
  }

  return <Text style={styles.cellText}>{value.label}</Text>;
}

function ComparisonTableRow({ row, isLast }: { row: ComparisonRow; isLast: boolean }) {
  return (
    <View style={[styles.tableRow, isLast && styles.tableRowLast]}>
      <View style={styles.featureCell}>
        <View style={styles.iconTile}>
          <MaterialCommunityIcons name={row.icon} size={20} color="#FFFFFF" />
        </View>
        <View style={styles.featureText}>
          <Text style={styles.featureTitle}>{row.title}</Text>
          <Text style={styles.featureDescription}>{row.description}</Text>
        </View>
      </View>

      <View style={styles.valueCell}>
        <ComparisonCell value={row.free} />
      </View>
      <View style={[styles.valueCell, styles.valueCellLast]}>
        <ComparisonCell value={row.pro} />
      </View>
    </View>
  );
}

function ComparisonTable({ rows }: { rows: ComparisonRow[] }) {
  return (
    <View style={styles.table}>
      <View style={styles.tableHeader}>
        <Text style={[styles.headerLabel, styles.featureCell]}>Pro unlocks</Text>
        <Text style={[styles.headerLabel, styles.valueCell]}>Free</Text>
        <Text style={[styles.headerLabel, styles.valueCell, styles.valueCellLast]}>Pro</Text>
      </View>

      {rows.map((row, index) => (
        <ComparisonTableRow
          key={row.title}
          row={row}
          isLast={index === rows.length - 1}
        />
      ))}
    </View>
  );
}

function PlanCard({
  product,
  badge,
  caption,
  selected,
  onSelect,
}: {
  product: StoreProduct;
  badge: string | null;
  caption: string | null;
  selected: boolean;
  onSelect: (planId: SubscriptionPlanId) => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      activeOpacity={0.85}
      onPress={() => onSelect(product.planId)}
      style={[styles.planCard, selected && styles.planCardSelected]}
    >
      <View style={styles.planTopRow}>
        <Text style={styles.planTitle}>{product.planId === 'yearly' ? 'Yearly' : 'Monthly'}</Text>
        {!!badge && (
          <View style={styles.planBadge}>
            <Text style={styles.planBadgeText}>{badge}</Text>
          </View>
        )}
        <View style={[styles.radio, selected && styles.radioSelected]}>
          {selected && <View style={styles.radioDot} />}
        </View>
      </View>

      <View style={styles.planPriceRow}>
        <Text style={styles.planPrice}>
          {product.displayPrice}
          {!!getStoreCurrencyCode(product) && (
            <Text style={styles.planCurrency}>{` (${getStoreCurrencyCode(product)})`}</Text>
          )}
        </Text>
        <Text style={styles.planPeriod}>{formatPeriodLabel(product)}</Text>
      </View>

      {!!caption && (
        <Text style={[styles.planCaption, selected && styles.planCaptionSelected]}>
          {caption}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export default function PaywallPanel({
  bottomInset,
  userId,
  onBack,
}: {
  bottomInset: number;
  userId?: string | null;
  onBack: () => void;
}) {
  const [selectedPlanId, setSelectedPlanId] = useState<SubscriptionPlanId>(
    DEFAULT_SUBSCRIPTION_PLAN_ID
  );
  const [isProcessing, setIsProcessing] = useState(false);
  /** Covers the screen while the App Store or the server works, so nothing can be tapped meanwhile. */
  const [blockingLabel, setBlockingLabel] = useState<string | null>(null);
  const [products, setProducts] = useState<StoreProduct[]>(FALLBACK_STORE_PRODUCTS);
  const [productDisplay, setProductDisplay] = useState<ProductDisplaySettings>(DEFAULT_PRODUCT_DISPLAY);
  const { setTabBarTheme } = useTabContext();
  const { tier, status, isSandboxAccount, limits, refresh } = useSubscriptionStatus(userId);
  const isPro = tier === 'pro';
  const orderedProducts = useMemo(() => orderStoreProducts(products, productDisplay), [productDisplay, products]);
  const comparisonRows = useMemo(() => buildPlanComparisonRows(limits), [limits]);
  const savingsLabel = getYearlySavingsLabel(products);
  const currentProduct = products.find((product) => product.planId === status.planId);
  const switchPlanId = getSwitchTargetPlanId(status.planId);
  const switchProduct = products.find((product) => product.planId === switchPlanId);
  const trialOffer = products.find((product) => product.planId === selectedPlanId)?.introOffer;

  // Tied to mount rather than the back handler so the tab bar always reverts,
  // including when the panel unmounts by switching tabs.
  useEffect(() => {
    setTabBarTheme('pro');
    return () => setTabBarTheme('default');
  }, [setTabBarTheme]);

  // Plans and prices from the App Store; plan, limits and display settings from
  // the server, which also picks up a cancellation made in Settings.
  useEffect(() => {
    // StoreKit can fail on the first try (connection still starting); try again a few
    // times so the placeholder prices do not stay up for the whole visit.
    let cancelled = false;
    const loadProducts = async (attempt: number) => {
      const loaded = await getStoreProducts();
      if (cancelled) return;
      setProducts(loaded);
      if (loaded.some((product) => product.isFallback) && attempt < 3) {
        setTimeout(() => void loadProducts(attempt + 1), 1500 * (attempt + 1));
      }
    };
    void loadProducts(0);
    if (!userId) return () => {
      cancelled = true;
    };
    void syncStoreSubscriptionStatus(userId).then((overview) => {
      if (overview) setProductDisplay(overview.products);
      refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [refresh, userId]);

  const handleContinue = useCallback(async () => {
    setIsProcessing(true);
    setBlockingLabel('Starting Eazee Pro...');
    try {
      const outcome = await purchaseSubscription(selectedPlanId);
      refresh();
      setBlockingLabel(null);

      // Stays here: the page switches to the subscriber view of the new plan.
      if (outcome.status === 'success') {
        return;
      }

      if (outcome.status === 'pending') {
        Alert.alert('Eazee Pro', 'The App Store is still confirming your purchase. Eazee Pro turns on as soon as it does.');
      }

      if (outcome.status === 'unavailable') {
        Alert.alert('Eazee Pro', outcome.message);
      }
    } finally {
      setIsProcessing(false);
      setBlockingLabel(null);
    }
  }, [refresh, selectedPlanId]);

  const handleSwitchPlan = useCallback(async (product: StoreProduct) => {
    setIsProcessing(true);
    setBlockingLabel(`Switching to ${product.title}...`);
    try {
      const outcome = await changeSubscriptionPlan(status.planId, product.planId);
      refresh();
      setBlockingLabel(null);
      if (outcome.status === 'success' || outcome.status === 'pending') {
        const upgrading = !!status.planId && isUpgrade(status.planId, product.planId);
        Alert.alert(
          'Eazee Pro',
          upgrading
            ? `You are now on ${product.title}. Apple credits the unused part of your current plan.`
            : `${product.title} starts at your next renewal. You keep your current plan until then.`
        );
      }
      if (outcome.status === 'unavailable') {
        Alert.alert('Eazee Pro', outcome.message);
      }
    } finally {
      setIsProcessing(false);
      setBlockingLabel(null);
    }
  }, [refresh, status.planId]);

  const handleManage = useCallback(async () => {
    if (!userId) return;
    setIsProcessing(true);
    try {
      // Apple's screen is on top while it is open; the cover starts once the user is back.
      await openManageSubscriptions(userId, { onSheetClosed: () => setBlockingLabel('Updating your subscription...') });
      refresh();
    } finally {
      setIsProcessing(false);
      setBlockingLabel(null);
    }
  }, [refresh, userId]);

  const handleRestore = useCallback(async () => {
    setIsProcessing(true);
    setBlockingLabel('Restoring purchases...');
    try {
      const outcome = await restorePurchases();
      refresh();
      setBlockingLabel(null);

      if (outcome.status === 'success') {
        Alert.alert('Eazee Pro', 'Your subscription has been restored.');
        return;
      }

      if (outcome.status === 'unavailable') {
        Alert.alert('Restore Purchases', outcome.message);
      }
    } finally {
      setIsProcessing(false);
      setBlockingLabel(null);
    }
  }, [refresh]);

  const openLink = useCallback((url: string) => {
    void Linking.openURL(url).catch((error) => {
      console.warn('Failed to open legal link', error);
    });
  }, []);

  return (
    <View style={styles.root}>
      <Image
        source={require('../../../assets/images/paywall-bg.png')}
        style={styles.background}
        resizeMode="cover"
      />

      <View style={styles.safeArea}>
        <ScreenHeader
          title="Eazee Pro"
          subtitle="Unlock More Possibilities"
          titleColor="#FFFFFF"
          horizontalPadding={0}
          left={(
            <GuidedTarget
              targetId={getHomeSettingsBackGuidanceTargetId()}
              label="Back"
              localHighlightRadius={999}
              localHighlightInset={4}
            >
              <LiquidGlassIconButton
                debugLabel="home:settings:paywall:back"
                onPress={onBack}
                size={44}
                style={styles.headerButton}
                fallbackTint="light"
                fallbackBackgroundColor="rgba(255, 255, 255, 0.18)"
                fallbackBorderColor="rgba(255, 255, 255, 0.36)"
                hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
              >
                <MaterialCommunityIcons
                  name="chevron-left"
                  size={38}
                  color="rgba(0, 0, 0, 0.52)"
                />
              </LiquidGlassIconButton>
            </GuidedTarget>
          )}
        />

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 28 }]}
        >
          <View style={styles.hero}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>A smarter,</Text>
              <Text style={[styles.heroTitle, styles.heroTitleAccent]}>easier you</Text>
              <Text style={styles.heroSubtitle}>
                Get the most out of Eazee and make every day easier.
              </Text>
            </View>

            <Image
              source={require('../../../assets/images/paywall-robot.png')}
              style={styles.robot}
              resizeMode="contain"
            />
          </View>

          <ComparisonTable rows={comparisonRows} />

          {!isPro && (
            <>
              <View style={styles.planRow}>
                {orderedProducts.map((product) => (
                  <PlanCard
                    key={product.productId}
                    product={product}
                    badge={productDisplay[product.productId]?.badge ?? null}
                    caption={productDisplay[product.productId]?.marketingText
                      ?? (product.planId === 'yearly' ? savingsLabel : null)}
                    selected={product.planId === selectedPlanId}
                    onSelect={setSelectedPlanId}
                  />
                ))}
              </View>
              {orderedProducts.some((product) => product.isFallback) && (
                <Text style={styles.priceNote}>
                  Apple confirms the price in your local currency before you subscribe.
                </Text>
              )}

              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.85}
                disabled={isProcessing}
                onPress={handleContinue}
                style={[styles.cta, isProcessing && styles.ctaDisabled]}
              >
                <Text style={styles.ctaText}>Continue with Pro</Text>
                <MaterialCommunityIcons name="arrow-right" size={22} color={CTA_TEXT} />
              </TouchableOpacity>

              <Text style={styles.trialNote}>
                {trialOffer ? `${trialOffer}  •  Cancel anytime` : 'Cancel anytime'}
              </Text>
            </>
          )}

          {isPro && (
            <CurrentPlanCard
              status={status}
              currentProduct={currentProduct}
              switchProduct={switchProduct}
              savingsLabel={savingsLabel}
              isSandboxAccount={isSandboxAccount}
              isProcessing={isProcessing}
              onSwitchPlan={handleSwitchPlan}
              onManage={handleManage}
              onOpenHistory={() => router.push('/purchase-history')}
            />
          )}

          {!isPro && !!status.planId && (
            <TouchableOpacity
              accessibilityRole="button"
              activeOpacity={0.7}
              onPress={() => router.push('/purchase-history')}
              style={styles.restoreButton}
            >
              <Text style={styles.restoreText}>Purchase history</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            accessibilityRole="button"
            activeOpacity={0.7}
            disabled={isProcessing}
            onPress={handleRestore}
            style={styles.restoreButton}
          >
            <Text style={styles.restoreText}>Restore Purchases</Text>
          </TouchableOpacity>

          <Text style={styles.legal}>
            By continuing, you agree to our{' '}
            <Text style={styles.legalLink} onPress={() => openLink(TERMS_URL)}>
              Terms of Service
            </Text>
            {' '}and{' '}
            <Text style={styles.legalLink} onPress={() => openLink(PRIVACY_POLICY_URL)}>
              Privacy Policy
            </Text>
            .
          </Text>
        </ScrollView>
      </View>
      <AiReplyLoadingOverlay
        visible={!!blockingLabel}
        title={blockingLabel ?? ''}
        subtitle="Confirming with the App Store. This can take a few seconds."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  background: {
    ...StyleSheet.absoluteFillObject,
    width: undefined,
    height: undefined,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 14,
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingTop: 6,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 6,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
  },
  heroTitleAccent: {
    color: HEADLINE_ACCENT,
  },
  heroSubtitle: {
    marginTop: 10,
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 14,
    lineHeight: 20,
  },
  robot: {
    width: 190,
    height: 148,
    marginRight: -10,
  },
  table: {
    marginTop: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: TABLE_BORDER,
    backgroundColor: 'rgba(2, 66, 68, 0.62)',
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: 'rgba(14, 95, 97, 0.85)',
  },
  headerLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 62,
    borderBottomWidth: 1,
    borderBottomColor: TABLE_BORDER,
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  featureCell: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#18827A',
  },
  featureText: {
    flex: 1,
    minWidth: 0,
    marginLeft: 10,
  },
  featureTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
  },
  featureDescription: {
    marginTop: 1,
    color: 'rgba(255, 255, 255, 0.66)',
    fontSize: 11,
    lineHeight: 15,
  },
  valueCell: {
    width: 84,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: TABLE_BORDER,
    alignSelf: 'stretch',
    paddingVertical: 8,
  },
  valueCellLast: {
    width: 88,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CHECK_FILL,
  },
  cellDash: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14,
  },
  cellText: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 15,
    textAlign: 'center',
  },
  planRow: {
    flexDirection: 'row',
    marginTop: 18,
    gap: 12,
  },
  planCard: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.24)',
    backgroundColor: 'rgba(1, 47, 51, 0.72)',
  },
  planCardSelected: {
    borderColor: ACCENT,
    backgroundColor: 'rgba(2, 63, 68, 0.9)',
  },
  planTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  planTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  planBadge: {
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 999,
    backgroundColor: '#93FAFB',
  },
  planBadgeText: {
    color: CTA_TEXT,
    fontSize: 9,
    fontWeight: '800',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginLeft: 'auto',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: ACCENT,
  },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: ACCENT,
  },
  planPriceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    marginTop: 8,
  },
  planCurrency: {
    fontSize: 13,
    fontWeight: '700',
  },
  priceNote: {
    marginTop: 8,
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  planPrice: {
    color: '#FFFFFF',
    fontSize: 24,
    lineHeight: 28,
    fontWeight: '800',
  },
  planPeriod: {
    marginLeft: 4,
    marginBottom: 2,
    color: 'rgba(255, 255, 255, 0.76)',
    fontSize: 12,
  },
  planCaption: {
    marginTop: 6,
    color: 'rgba(255, 255, 255, 0.68)',
    fontSize: 11,
    lineHeight: 15,
  },
  planCaptionSelected: {
    color: HEADLINE_ACCENT,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 56,
    marginTop: 18,
    borderRadius: 28,
    backgroundColor: CTA_FILL,
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: CTA_TEXT,
    fontSize: 17,
    fontWeight: '800',
  },
  trialNote: {
    marginTop: 12,
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 13,
    textAlign: 'center',
  },
  restoreButton: {
    marginTop: 14,
    paddingVertical: 6,
    alignItems: 'center',
  },
  restoreText: {
    color: 'rgba(255, 255, 255, 0.92)',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  legal: {
    marginTop: 12,
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
  legalLink: {
    color: 'rgba(255, 255, 255, 0.92)',
    textDecorationLine: 'underline',
  },
});
