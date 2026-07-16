import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../stores/useAppStore';
import { useTranslation } from '../hooks/useTranslation';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';
import { formatCurrency } from '../utils/helpers';
import EmptyState from '../components/common/EmptyState';
import CollapsibleFab, { useFabScroll } from '../components/common/CollapsibleFab';
import InlineSearchBar from '../components/common/InlineSearchBar';
import LiquidHeaderIconButton from '../components/common/LiquidHeaderIconButton';
import { Purchase } from '../types';

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Extracted + memoized — renders inside a `FlatList`. No press handler to
// stabilize here (a static display card), just the extraction + `React.memo`
// itself, plus the parent's `renderItem`/`s` also being stable (see below).
const PurchaseRow = React.memo(function PurchaseRow({
  purchase, index, colors, s, currency, noSupplierLabel, paidLabel, unpaidLabel,
}: {
  purchase: Purchase; index: number; colors: any; s: any; currency: string;
  noSupplierLabel: string; paidLabel: string; unpaidLabel: string;
}) {
  const outstanding = Math.max(0, purchase.totalAmount - purchase.paidAmount);
  return (
    <MotiView
      from={{ opacity: 0, translateY: 8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 260, delay: Math.min(index * 35, 350) }}
    >
      <View style={[s.card, { backgroundColor: colors.surface }]}>
        <View style={s.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[s.cardDate, { color: colors.textMuted }]}>{formatDate(purchase.createdAt)}</Text>
            <Text style={[s.cardSupplier, { color: colors.text }]}>
              {purchase.supplierName || noSupplierLabel}
              {purchase.invoiceNumber ? <Text style={{ color: colors.textMuted }}> · #{purchase.invoiceNumber}</Text> : null}
            </Text>
            <Text style={[s.cardItems, { color: colors.textSub }]}>
              {purchase.items.length} item{purchase.items.length !== 1 ? 's' : ''} · {purchase.items.map(i => i.productName).join(', ')}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Text style={[s.cardTotal, { color: colors.text }]}>{formatCurrency(purchase.totalAmount, currency)}</Text>
            {purchase.paidAmount > 0 && purchase.paidAmount < purchase.totalAmount ? (
              <View style={[s.badge, { backgroundColor: colors.warning + '20' }]}>
                <Text style={[s.badgeText, { color: colors.warning }]}>
                  Due {formatCurrency(outstanding, currency)}
                </Text>
              </View>
            ) : purchase.paidAmount >= purchase.totalAmount ? (
              <View style={[s.badge, { backgroundColor: colors.success + '18' }]}>
                <Text style={[s.badgeText, { color: colors.success }]} accessibilityLabel="Paid in full">{paidLabel}</Text>
              </View>
            ) : (
              <View style={[s.badge, { backgroundColor: colors.danger + '18' }]}>
                <Text style={[s.badgeText, { color: colors.danger }]} accessibilityLabel={`Unpaid: ${formatCurrency(outstanding, currency)} outstanding`}>
                  {unpaidLabel} {formatCurrency(outstanding, currency)}
                </Text>
              </View>
            )}
          </View>
        </View>
        {purchase.paymentMode ? (
          <View style={[s.modeRow, { borderTopColor: colors.border }]}>
            <Ionicons
              name={purchase.paymentMode === 'cash' ? 'cash-outline' : purchase.paymentMode === 'upi' ? 'phone-portrait-outline' : 'card-outline'}
              size={13} color={colors.textMuted}
            />
            <Text style={[s.modeText, { color: colors.textMuted }]}>
              {purchase.paymentMode.toUpperCase()} · Paid {formatCurrency(purchase.paidAmount, currency)}
            </Text>
          </View>
        ) : null}
      </View>
    </MotiView>
  );
});

export default function PurchasesScreen({ navigation }: any) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const { purchases, suppliers, settings } = useAppStore(
    useShallow(state => ({
      purchases: state.purchases,
      suppliers: state.suppliers,
      settings: state.settings,
    }))
  );
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterSupplierId, setFilterSupplierId] = useState<string | null>(null);
  const { extended, onScroll } = useFabScroll();
  const insets = useSafeAreaInsets();
  const headerCompensation = insets.top + (Platform.OS === 'ios' ? 44 : 56);

  const filtered = useMemo(() => {
    return purchases.filter(p => {
      const matchSearch = !search.trim() ||
        (p.supplierName || '').toLowerCase().includes(search.toLowerCase()) ||
        (p.invoiceNumber || '').toLowerCase().includes(search.toLowerCase()) ||
        p.items.some(i => i.productName.toLowerCase().includes(search.toLowerCase()));
      const matchSupplier = !filterSupplierId || p.supplierId === filterSupplierId;
      return matchSearch && matchSupplier;
    });
  }, [purchases, search, filterSupplierId]);

  const totalOutstanding = useMemo(() => {
    return filtered.reduce((s, p) => s + Math.max(0, p.totalAmount - p.paidAmount), 0);
  }, [filtered]);

  const s = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    navigation.setOptions({
      // iOS-only — see InventoryScreen's header comment for why.
      ...(Platform.OS === 'ios' ? { headerTransparent: true, headerStyle: { backgroundColor: 'transparent' } } : null),
      headerRight: () => (
        <LiquidHeaderIconButton icon="magnifyingglass" androidIcon="search-outline" onPress={() => setSearchOpen(v => !v)} />
      ),
    });
  }, [navigation]);

  const handleNewPurchase = useCallback(() => navigation.navigate('PurchaseForm', {}), [navigation]);

  // `bottomAccessory` (iOS 26+ only) — same conversion as InventoryScreen/SupplierScreen.
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'ios') return;
      const parent = navigation.getParent();
      parent?.setOptions({
        bottomAccessory: ({ placement }: { placement: 'regular' | 'inline' }) =>
              <TouchableOpacity
                onPress={handleNewPurchase}
                style={{ width: '100%', height: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 24, paddingHorizontal: 18, justifyContent: 'center' }}
                accessibilityLabel={t('newPurchase')}
                accessibilityRole="button"
              >
                <Ionicons name="add" size={20} color={colors.text} />
                <Text style={{ color: colors.text, fontFamily: fonts.bold, fontSize: 14 }}>{t('newPurchase')}</Text>
              </TouchableOpacity>
      });
      return () => { parent?.setOptions({ bottomAccessory: undefined }); };
    }, [navigation, handleNewPurchase, colors, t])
  );

  const noSupplierLabel = t('noSupplier');
  const paidLabel = t('paid');
  const unpaidLabel = t('unpaid');
  const renderItem = useCallback(({ item, index }: { item: Purchase; index: number }) => (
    <PurchaseRow
      purchase={item}
      index={index}
      colors={colors}
      s={s}
      currency={settings.currency}
      noSupplierLabel={noSupplierLabel}
      paidLabel={paidLabel}
      unpaidLabel={unpaidLabel}
    />
  ), [colors, s, settings.currency, noSupplierLabel, paidLabel, unpaidLabel]);

  return (
    <>
      {searchOpen && (
        <View style={Platform.OS === 'ios' ? { marginTop: headerCompensation } : undefined}>
          <InlineSearchBar
            value={search}
            onChangeText={setSearch}
            placeholder={t('searchPurchases')}
            onClose={() => setSearchOpen(false)}
          />
        </View>
      )}

      {/* `FlatList` is a direct child here (Fragment root) so react-native-screens
          can detect it — same fix as InventoryScreen. Supplier filter chips +
          summary banner moved into `ListHeaderComponent` (dropped `ScrollHideBar`,
          same trade-off as PurchasesScreen's peers: chips now scroll away with
          the list instead of auto-hiding). */}
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        onScroll={onScroll}
        scrollEventThrottle={16}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={{ paddingHorizontal: 8, paddingTop: searchOpen ? 8 : 0, paddingBottom: 120, flexGrow: 1 }}
        renderItem={renderItem}
        ListHeaderComponent={
          <>
            {suppliers.length > 0 && (
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={[{ id: null, name: t('all') } as any, ...suppliers]}
                keyExtractor={item => item.id ?? 'all'}
                contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8, gap: 8 }}
                renderItem={({ item }) => {
                  const active = filterSupplierId === item.id;
                  return (
                    <TouchableOpacity
                      style={[s.chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surface }]}
                      onPress={() => setFilterSupplierId(item.id)}
                    >
                      <Text style={[s.chipText, { color: active ? '#fff' : colors.textSub }]}>{item.name}</Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
            {filtered.length > 0 && totalOutstanding > 0 && (
              <View style={s.summaryBanner}>
                <Ionicons name="alert-circle-outline" size={15} color={colors.warning} />
                <Text style={[s.summaryText, { color: colors.warning }]}>
                  {t('totalOutstandingLabel')}: {formatCurrency(totalOutstanding, settings.currency)}
                </Text>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          <EmptyState
            icon="receipt-outline"
            title={t('noPurchasesYet')}
            subtitle={t('noPurchasesDesc')}
            actionLabel={t('newPurchase')}
            onAction={handleNewPurchase}
          />
        }
      />

      {Platform.OS !== 'ios' && (
        <CollapsibleFab
          bottom={24}
          icon="add"
          label={t('newPurchase')}
          extended={extended}
          onPress={handleNewPurchase}
        />
      )}
    </>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  chipText: { fontFamily: fonts.bold, fontSize: 13 },
  summaryBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingBottom: 8 },
  summaryText: { fontFamily: fonts.semiBold, fontSize: 13 },
  card: {
    borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.border,
  },
  cardTop: { flexDirection: 'row', gap: 10 },
  cardDate: { fontFamily: fonts.regular, fontSize: 11, marginBottom: 2 },
  cardSupplier: { fontFamily: fonts.bold, fontSize: 15, marginBottom: 2 },
  cardItems: { fontFamily: fonts.regular, fontSize: 12 },
  cardTotal: { fontFamily: fonts.extraBold, fontSize: 16 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontFamily: fonts.bold, fontSize: 11 },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth },
  modeText: { fontFamily: fonts.regular, fontSize: 12 },
});
