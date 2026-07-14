import React, { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Alert, ScrollView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import LiquidBottomSheet, { LiquidBottomSheetRef } from '../../components/common/LiquidBottomSheet';
import LiquidTextField from '../../components/common/LiquidTextField';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../stores/useAppStore';
import { formatCurrency, fuzzyMatch } from '../../utils/helpers';
import { Product } from '../../types';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';
import EmptyState from '../../components/common/EmptyState';
import { SkeletonList } from '../../components/common/Skeleton';
import CollapsibleFab, { useFabScroll } from '../../components/common/CollapsibleFab';
import ProductCard from '../../components/inventory/ProductCard';
import InlineSearchBar from '../../components/common/InlineSearchBar';
import LiquidHeaderIconButton from '../../components/common/LiquidHeaderIconButton';
import LiquidHeaderMenu from '../../components/common/LiquidHeaderMenu';
import LiquidButton from '../../components/common/LiquidButton';
import SheetHeader from '../../components/common/SheetHeader';
import { useTranslation } from '../../hooks/useTranslation';
import { useConfirm } from '../../components/common/ConfirmDialogProvider';
// Deep import, iOS-only: `ScrollViewMarker` isn't exported from
// `react-native-screens`'s public top-level entry (it lives under the
// package's experimental `gamma` namespace) and has no Android native
// counterpart (only `.ios`/native fabric files exist for it) — importing it
// unconditionally would crash Android at runtime with "no component found
// for view name...". This is an unstable API that could change/break on a
// future `react-native-screens` upgrade without a deprecation warning; it's
// the only way currently found to fix `tabBarMinimizeBehavior` not
// detecting this screen's `FlatList` as the scrollable content (see usage
// below for why).
// @ts-ignore — deep import into an undocumented path has no shipped .d.ts
// at this exact subpath (the package's typed declarations live under a
// separate `lib/typescript` tree Metro doesn't use for runtime resolution).
import { ScrollViewMarker } from 'react-native-screens/lib/module/components/gamma/scroll-view-marker';

// Android has no native counterpart for `ScrollViewMarker` — fall back to a
// plain `View` there.
const ScrollAreaWrapper: React.ComponentType<any> = Platform.OS === 'ios' ? ScrollViewMarker : View;

export default function InventoryScreen({ route, navigation }: any) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const { confirm, confirmActions } = useConfirm();
  const insets = useSafeAreaInsets();
  // `headerTransparent` no longer reserves layout space for the native
  // header on either platform, so content needs to compensate manually or
  // it renders underneath the (now see-through) header instead of below it.
  // 44 is UIKit's standard compact nav bar height on iOS; 56 is Material's
  // standard app-bar height on Android. `insets.top` covers the status
  // bar/notch on both.
  const headerCompensation = insets.top + (Platform.OS === 'ios' ? 44 : 56);
  const { products, deleteProduct, updateProduct, settings } = useAppStore(
    useShallow(state => ({
      products: state.products,
      deleteProduct: state.deleteProduct,
      updateProduct: state.updateProduct,
      settings: state.settings,
    }))
  );
  const dataReady = useAppStore(st => st.dataReady);
  const CATEGORIES = ['All', ...(settings.productCategories ?? [])];

  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'price'>('name');
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockQty, setStockQty] = useState('');
  const [menuProduct, setMenuProduct] = useState<Product | null>(null);
  const { extended, onScroll } = useFabScroll();

  const stockSheetRef = useRef<LiquidBottomSheetRef>(null);
  const menuSheetRef = useRef<LiquidBottomSheetRef>(null);

  const openStockSheet = useCallback((item: Product) => {
    setStockProduct(item);
    setStockQty('');
    stockSheetRef.current?.expand();
  }, []);
  const closeStockSheet = useCallback(() => stockSheetRef.current?.close(), []);

  const openMenuSheet = useCallback((item: Product) => {
    setMenuProduct(item);
    menuSheetRef.current?.expand();
  }, []);
  const closeMenuSheet = useCallback(() => menuSheetRef.current?.close(), []);

  // Stable `renderItem` (and stable `onAddStock`/`onMenu` passed straight
  // through, not wrapped in a fresh per-row closure) — this is what lets
  // `ProductCard`'s own `React.memo` actually skip re-rendering off-screen/
  // unchanged rows, instead of every row re-rendering on any list re-render.
  const renderProductItem = useCallback(({ item, index }: { item: Product; index: number }) => (
    <ProductCard
      product={item}
      currency={settings.currency}
      colors={colors}
      index={index}
      onAddStock={openStockSheet}
      onMenu={openMenuSheet}
    />
  ), [settings.currency, colors, openStockSheet, openMenuSheet]);

  // If navigated with prefillBarcode, open form immediately
  useEffect(() => {
    const barcode = route?.params?.prefillBarcode;
    const openAdd = route?.params?.openAdd;
    if (barcode || openAdd) {
      navigation.navigate('ProductForm', { prefillBarcode: barcode || '' });
    }
  }, [route?.params?.prefillBarcode, route?.params?.openAdd]);

  const filtered = useMemo(() => {
    return products.filter(p => {
      const matchSearch = !search || fuzzyMatch(search, p.name) || fuzzyMatch(search, p.category);
      const matchCat = categoryFilter === 'All' || p.category === categoryFilter;
      return matchSearch && matchCat;
    }).sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'stock') return a.quantity - b.quantity;
      return a.sellingPrice - b.sellingPrice;
    });
  }, [products, search, categoryFilter, sortBy]);

  const handleDelete = async (product: Product) => {
    const ok = await confirm({
      title: t('deleteProduct'),
      message: t('deleteProductConfirm').replace('{name}', product.name),
      confirmLabel: t('delete'),
      cancelLabel: t('cancel'),
      destructive: true,
    });
    if (ok) deleteProduct(product.id);
  };

  const lowStockCount = products.filter(p => p.quantity <= p.lowStockThreshold).length;
  const s = makeStyles(colors);

  // Show the item count beside the header title, and the CSV import at the header's right end.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontFamily: fonts.extraBold, fontSize: 18, color: colors.text }}>Inventory</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primaryLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 }}>
            <Ionicons name="cube-outline" size={12} color={colors.primary} />
            <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: colors.primary }}>{products.length} items</Text>
          </View>
          {lowStockCount > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.danger + '1A', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 }}>
              <Ionicons name="warning-outline" size={12} color={colors.danger} />
              <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: colors.danger }}>{lowStockCount}</Text>
            </View>
          ) : null}
        </View>
      ),
      headerTransparent: true,
      headerStyle: { backgroundColor: 'transparent' },
      // Plain flex row, not absolutely-positioned siblings — see this file's
      // header comment / AppNavigator's useHeaderOpts for why.
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <LiquidHeaderIconButton
            icon="doc.text"
            androidIcon="document-text-outline"
            onPress={() => navigation.navigate('CsvImport')}
          />
          <LiquidHeaderIconButton
            icon="magnifyingglass"
            androidIcon="search-outline"
            onPress={() => setSearchOpen(v => !v)}
          />
          <LiquidHeaderMenu
            icon="line.3.horizontal.decrease.circle"
            androidIcon="options-outline"
            sections={[
              {
                title: 'Sort by',
                options: [
                  { label: 'Name', value: 'name', selected: sortBy === 'name' },
                  { label: 'Stock', value: 'stock', selected: sortBy === 'stock' },
                  { label: 'Price', value: 'price', selected: sortBy === 'price' },
                ],
                onSelect: (v) => setSortBy(v as 'name' | 'stock' | 'price'),
              },
              {
                title: t('category'),
                options: CATEGORIES.map(cat => ({ label: cat, value: cat, selected: categoryFilter === cat })),
                onSelect: setCategoryFilter,
              },
            ]}
          />
        </View>
      ),
    });
  }, [navigation, products.length, lowStockCount, colors, t, sortBy, categoryFilter, CATEGORIES]);

  if (!dataReady) return <View style={{ flex: 1, backgroundColor: colors.bg }}><SkeletonList count={8} /></View>;

  return (
    <View style={[{ backgroundColor: colors.bg, flex: 1 }]}>
      {searchOpen && (
        <View style={{ marginTop: headerCompensation }}>
          <InlineSearchBar
            value={search}
            onChangeText={setSearch}
            placeholder={t('searchProducts')}
            onClose={() => setSearchOpen(false)}
          />
        </View>
      )}
      {/* Scrollable area — `ScrollViewMarker` (iOS only) explicitly
          registers the `FlatList` below as this screen's content scroll
          view for `react-native-screens`, regardless of what else sits in
          the tree around it. Without it, `tabBarMinimizeBehavior` (see
          `AppNavigator.tsx`) only works on screens where the scrollable
          view happens to be reachable by always taking the first child at
          every level of the native tree — true for `DashboardScreen`'s bare
          `ScrollView`, apparently not true here for reasons not fully
          diagnosable from source alone (see conversation history / git log
          around this comment for the investigation). */}
      <ScrollAreaWrapper style={{ flex: 1, overflow: 'hidden' }}>
        <FlatList
        data={filtered}
        keyExtractor={p => p.id}
        style={{ flex: 1 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        contentContainerStyle={{
          paddingHorizontal: 8,
          // Only applied when the search bar isn't shown — when it is, ITS
          // `marginTop` above already accounts for the header, and adding
          // this on top too would double the gap before the first item.
          paddingTop: searchOpen ? 8 : headerCompensation + 8,
          paddingBottom: 120,
          flexGrow: 1,
        }}
        renderItem={renderProductItem}
        ListEmptyComponent={
          <EmptyState icon="cube-outline" title={t('noProducts')} subtitle={t('tapPlusToAdd')}
            actionLabel={t('addProduct')} onAction={() => navigation.navigate('ProductForm', {})} />
        }
      />
      </ScrollAreaWrapper>{/* end scrollable area */}

      <CollapsibleFab bottom={24} icon="add" label="Add Product" extended={extended} onPress={() => {
        confirmActions({
          title: t('addStock'),
          actions: [
            { label: t('newProduct'), value: 'new' },
            { label: t('receiveStockGrn'), value: 'grn' },
          ],
          cancelLabel: t('cancel'),
        }).then(choice => {
          if (choice === 'new') navigation.navigate('ProductForm', {});
          else if (choice === 'grn') navigation.navigate('More', { screen: 'PurchaseForm', params: {} });
        });
      }} />

      {/* Stock Adjust Sheet */}
      <LiquidBottomSheet ref={stockSheetRef}>
        <SheetHeader title={t('updateStockLabel')} subtitle={stockProduct?.name} onClose={closeStockSheet} />
        <ScrollView contentContainerStyle={s.sheetContent}>
          <Text style={[s.stockCurrent, { color: colors.textMuted }]}>Current: {stockProduct?.quantity} {stockProduct?.unit}</Text>
          <View style={s.stockQuickRow}>
            {[1, 5, 10, 25, 50].map(n => (
              <TouchableOpacity key={n}
                style={[s.stockQuickBtn, { backgroundColor: colors.primaryLight }]}
                onPress={() => setStockQty(String(n))}>
                <Text style={[s.stockQuickText, { color: colors.primary }]}>+{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <LiquidTextField
            value={stockQty}
            onChangeText={setStockQty}
            placeholder={t('enterQtyToAdd')}
            keyboardType="numeric"
          />
          <LiquidButton
            title={t('addStock')}
            onPress={() => {
              const n = parseInt(stockQty);
              if (isNaN(n)) { Alert.alert(t('error'), t('enterValidNumber')); return; }
              if (stockProduct) updateProduct({ ...stockProduct, quantity: Math.max(0, stockProduct.quantity + n), updatedAt: Date.now() });
              closeStockSheet();
            }}
            variant="glassProminent"
            style={{ marginTop: 12 }}
          />
        </ScrollView>
      </LiquidBottomSheet>

      {/* Product Action Sheet (⋯ menu) */}
      <LiquidBottomSheet ref={menuSheetRef}>
        <SheetHeader title={menuProduct?.name ?? ''} onClose={closeMenuSheet} />
        <View style={s.sheetContent}>
          <TouchableOpacity style={s.sheetRow} onPress={() => { const p = menuProduct; closeMenuSheet(); navigation.navigate('ProductForm', { product: p }); }}>
            <View style={[s.sheetIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="pencil-outline" size={20} color={colors.primary} />
            </View>
            <Text style={[s.sheetLabel, { color: colors.text }]}>{t('editProduct')}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={s.sheetRow} onPress={() => { const p = menuProduct; closeMenuSheet(); if (p) handleDelete(p); }}>
            <View style={[s.sheetIcon, { backgroundColor: colors.danger + '15' }]}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </View>
            <Text style={[s.sheetLabel, { color: colors.danger }]}>{t('deleteProduct')}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </LiquidBottomSheet>
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({

  sheetContent: { paddingHorizontal: 4, paddingBottom: 20 },
  stockCurrent: { fontFamily: fonts.medium, fontSize: 14, marginBottom: 18 },
  stockQuickRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  stockQuickBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  stockQuickText: { fontFamily: fonts.bold, fontSize: 14 },
  stockInput: { borderRadius: 14, padding: 16, fontSize: 15, borderWidth: 1, marginBottom: 16 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 4 },
  sheetIcon: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  sheetLabel: { flex: 1, fontFamily: fonts.semiBold, fontSize: 15 },
});
