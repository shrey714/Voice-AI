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

  const openAddMenu = useCallback(() => {
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
  }, [confirmActions, t, navigation]);

  // `bottomAccessory` (iOS 26+ only) is a **Tab**-level option, one navigator
  // up from this screen's own Stack — `navigation` here is the Stack's, so
  // `getParent()` reaches the Tab navigator that actually owns the tab bar.
  // Rendered twice by the native side (once per `placement`) — `'regular'`
  // shows above the tab bar, `'inline'` is what actually merges into the
  // minimized bar as the user scrolls, replacing the need for our own
  // absolutely-positioned `CollapsibleFab` overlay on iOS. Android's classic
  // tab navigator has no such option (silently ignores unknown
  // `screenOptions` keys, same as `tabBarMinimizeBehavior`), so it keeps the
  // existing `CollapsibleFab` below instead.
  useLayoutEffect(() => {
    if (Platform.OS !== 'ios') return;
    navigation.getParent()?.setOptions({
      // No manual `margin`/`alignSelf` positioning here — the native
      // accessory container already provides and sizes its own region
      // (above the tab bar for `'regular'`, merged into the minimized bar
      // for `'inline'`); fighting that with our own offsets is what made
      // the pill overlap list content instead of sitting in its own slot,
      // and the icon show a ghosted double-render artifact. Content just
      // fills the space it's given, same as the docs' own bare example.
          bottomAccessory: ({ placement }: { placement: 'regular' | 'inline' }) =>
            <TouchableOpacity
              onPress={openAddMenu}
              style={{ width: '100%', height: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 24, paddingHorizontal: 18 }}
              accessibilityLabel="Add Product"
              accessibilityRole="button"
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={{ color: '#fff', fontFamily: fonts.bold, fontSize: 14 }}>Add Product</Text>
            </TouchableOpacity>
    });
  }, [navigation, openAddMenu, colors]);

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
    <>
      {searchOpen && (
       <View style={Platform.OS === 'ios' ? { marginTop: headerCompensation } : undefined}>
          <InlineSearchBar
            value={search}
            onChangeText={setSearch}
            placeholder={t('searchProducts')}
            onClose={() => setSearchOpen(false)}
          />
        </View>
      )}
      {/* Back to `FlatList` — the real fix turned out to be the wrapping
          root `<View>` around this whole screen being replaced with a
          Fragment (see below): that removed an unnecessary extra native
          view between the Stack screen and this list, which is what was
          actually blocking `tabBarMinimizeBehavior` from finding the
          scroll view. The `ScrollView`+`.map()` swap was a useful
          diagnostic but not the fix itself. */}
      <FlatList
        data={filtered}
        keyExtractor={p => p.id}
        style={{ flex: 1, overflow: 'hidden' }}
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
          paddingTop: 8,
          paddingBottom: 120,
          flexGrow: 1,
        }}
        renderItem={renderProductItem}
        ListEmptyComponent={
          <EmptyState icon="cube-outline" title={t('noProducts')} subtitle={t('tapPlusToAdd')}
            actionLabel={t('addProduct')} onAction={() => navigation.navigate('ProductForm', {})} />
        }
      />

      {/* iOS gets the native `bottomAccessory` (set up above via
          `navigation.getParent()?.setOptions`) instead — Android has no
          such API, so it keeps this floating overlay. */}
      {Platform.OS !== 'ios' && (
        <CollapsibleFab bottom={24} icon="add" label="Add Product" extended={extended} onPress={openAddMenu} />
      )}

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
    </>
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
