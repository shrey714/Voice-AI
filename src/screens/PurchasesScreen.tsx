import React, { useState, useMemo, useEffect } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useScrollHideBar } from '../hooks/useScrollHideBar';
import ScrollHideBar from '../components/common/ScrollHideBar';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
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

export default function PurchasesScreen({ navigation }: any) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const { purchases, suppliers, settings } = useAppStore();
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterSupplierId, setFilterSupplierId] = useState<string | null>(null);
  const { extended, onScroll } = useFabScroll();
  const { translateY: chipTranslate, onListScroll, onBarLayout, listPaddingTop } = useScrollHideBar({ onScroll });

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

  const s = makeStyles(colors);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <LiquidHeaderIconButton icon="magnifyingglass" androidIcon="search-outline" onPress={() => setSearchOpen(v => !v)} />
      ),
    });
  }, [navigation]);

  const renderItem = ({ item: purchase, index }: { item: Purchase; index: number }) => {
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
                {purchase.supplierName || t('noSupplier')}
                {purchase.invoiceNumber ? <Text style={{ color: colors.textMuted }}> · #{purchase.invoiceNumber}</Text> : null}
              </Text>
              <Text style={[s.cardItems, { color: colors.textSub }]}>
                {purchase.items.length} item{purchase.items.length !== 1 ? 's' : ''} · {purchase.items.map(i => i.productName).join(', ')}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <Text style={[s.cardTotal, { color: colors.text }]}>{formatCurrency(purchase.totalAmount, settings.currency)}</Text>
              {purchase.paidAmount > 0 && purchase.paidAmount < purchase.totalAmount ? (
                <View style={[s.badge, { backgroundColor: colors.warning + '20' }]}>
                  <Text style={[s.badgeText, { color: colors.warning }]}>
                    Due {formatCurrency(outstanding, settings.currency)}
                  </Text>
                </View>
              ) : purchase.paidAmount >= purchase.totalAmount ? (
                <View style={[s.badge, { backgroundColor: colors.success + '18' }]}>
                  <Text style={[s.badgeText, { color: colors.success }]} accessibilityLabel="Paid in full">{t('paid')}</Text>
                </View>
              ) : (
                <View style={[s.badge, { backgroundColor: colors.danger + '18' }]}>
                  <Text style={[s.badgeText, { color: colors.danger }]} accessibilityLabel={`Unpaid: ${formatCurrency(outstanding, settings.currency)} outstanding`}>
                    {t('unpaid')} {formatCurrency(outstanding, settings.currency)}
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
                {purchase.paymentMode.toUpperCase()} · Paid {formatCurrency(purchase.paidAmount, settings.currency)}
              </Text>
            </View>
          ) : null}
        </View>
      </MotiView>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {searchOpen && (
        <InlineSearchBar
          value={search}
          onChangeText={setSearch}
          placeholder={t('searchPurchases')}
          onClose={() => setSearchOpen(false)}
        />
      )}
      <View style={{ flex: 1, overflow: 'hidden' }}>
        {suppliers.length > 0 && (
          <ScrollHideBar translateY={chipTranslate} bgColor={colors.bg} onLayout={onBarLayout}>
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
          </ScrollHideBar>
        )}

        {/* Summary banner */}
        

        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          onScroll={onListScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingHorizontal: 8, paddingTop: suppliers.length > 0 ? listPaddingTop : 8, paddingBottom: 150, flexGrow: 1 }}
          renderItem={renderItem}
          ListHeaderComponent={()=>{
          if(filtered.length > 0 && totalOutstanding > 0) {
            return <View style={[s.summaryBanner]}>
            <Ionicons name="alert-circle-outline" size={15} color={colors.warning} />
            <Text style={[s.summaryText, { color: colors.warning }]}>
              {t('totalOutstandingLabel')}: {formatCurrency(totalOutstanding, settings.currency)}
            </Text>
          </View>
          }else return <></>
          }}
          ListEmptyComponent={
            <EmptyState
              icon="receipt-outline"
              title={t('noPurchasesYet')}
              subtitle={t('noPurchasesDesc')}
              actionLabel={t('newPurchase')}
              onAction={() => navigation.navigate('PurchaseForm', {})}
            />
          }
        />
      </View>

      <CollapsibleFab
        bottom={90}
        icon="add"
        label={t('newPurchase')}
        extended={extended}
        onPress={() => navigation.navigate('PurchaseForm', {})}
      />
    </View>
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
