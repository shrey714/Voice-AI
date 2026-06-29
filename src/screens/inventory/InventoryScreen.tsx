import React, { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView } from 'react-native';
import { useScrollHideBar } from '../../hooks/useScrollHideBar';
import ScrollHideBar from '../../components/common/ScrollHideBar';
import { Text, ActivityIndicator } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetView, BottomSheetScrollView, BottomSheetTextInput, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { useAppStore } from '../../stores/useAppStore';
import { formatCurrency, fuzzyMatch } from '../../utils/helpers';
import { Product } from '../../types';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';
import EmptyState from '../../components/common/EmptyState';
import { SkeletonList } from '../../components/common/Skeleton';
import CollapsibleFab, { useFabScroll } from '../../components/common/CollapsibleFab';
import ProductCard from '../../components/inventory/ProductCard';
import { useTranslation } from '../../hooks/useTranslation';



export default function InventoryScreen({ route, navigation }: any) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const { products, deleteProduct, updateProduct, settings } = useAppStore();
  const dataReady = useAppStore(st => st.dataReady);
  const CATEGORIES = ['All', ...(settings.productCategories ?? [])];

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [sortBy, setSortBy] = useState<'name' | 'stock' | 'price'>('name');
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockQty, setStockQty] = useState('');
  const [menuProduct, setMenuProduct] = useState<Product | null>(null);
  const { extended, onScroll } = useFabScroll();
  const { translateY: catTranslate, onListScroll, onBarLayout, listPaddingTop } = useScrollHideBar({ onScroll });

  const stockSheetRef = useRef<BottomSheet>(null);
  const menuSheetRef = useRef<BottomSheet>(null);
  const stockSnapPoints = useMemo(() => ['72%'], []);
  const menuSnapPoints = useMemo(() => ['42%'], []);

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

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} pressBehavior="close" />
    ), []
  );

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

  const handleDelete = (product: Product) => {
    Alert.alert(t('deleteProduct'), t('deleteProductConfirm').replace('{name}', product.name), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: () => deleteProduct(product.id) },
    ]);
  };

  const lowStockCount = products.filter(p => p.quantity <= p.lowStockThreshold).length;

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
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.navigate('CsvImport')} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Ionicons name="document-text-outline" size={18} color={colors.primary} />
          <Text style={{ color: colors.primary, fontFamily: fonts.bold, fontSize: 13 }}>CSV</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, products.length, lowStockCount, colors]);

  const s = makeStyles(colors);

  if (!dataReady) return <View style={{ flex: 1, backgroundColor: colors.bg }}><SkeletonList count={8} /></View>;

  return (
    <View style={[{ backgroundColor: colors.bg, flex: 1 }]}>
      {/* Search + Sort */}
      <View style={[s.searchRow, {backgroundColor: colors.surface}]}>
        <View style={[s.searchBox, { backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
          <TextInput
            style={[s.searchInput, { color: colors.text }]}
            placeholder={t('searchProducts')}
            value={search}
            onChangeText={setSearch}
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <TouchableOpacity
          style={[s.sortBtn, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}
          onPress={() => setSortBy(s => s === 'name' ? 'stock' : s === 'stock' ? 'price' : 'name')}>
          <Ionicons name="swap-vertical-outline" size={14} color={colors.primary} />
          <Text style={[s.sortBtnText, { color: colors.primary }]}>{sortBy}</Text>
        </TouchableOpacity>
      </View>

      {/* Scrollable area — category bar floats above the list within this container */}
      <View style={{ flex: 1, overflow: 'hidden' }}>
        <ScrollHideBar translateY={catTranslate} bgColor={colors.bg} onLayout={onBarLayout}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, gap: 8, paddingVertical: 8, alignItems: 'center' }}>
            {CATEGORIES.map(cat => {
              const active = categoryFilter === cat;
              return (
                <TouchableOpacity key={cat}
                  style={[s.catChip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surface }]}
                  onPress={() => setCategoryFilter(cat)}>
                  <Text style={[s.catChipText, { color: active ? '#fff' : colors.textSub }]}>{cat}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </ScrollHideBar>

        <FlatList
        data={filtered}
        keyExtractor={p => p.id}
        style={{ flex: 1 }}
        onScroll={onListScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: 8, paddingTop: listPaddingTop, paddingBottom: 150, flexGrow: 1 }}
        renderItem={({ item, index }) => (
          <ProductCard
            product={item}
            currency={settings.currency}
            colors={colors}
            index={index}
            onAddStock={() => openStockSheet(item)}
            onMenu={() => openMenuSheet(item)}
          />
        )}
        ListEmptyComponent={
          <EmptyState icon="cube-outline" title={t('noProducts')} subtitle={t('tapPlusToAdd')}
            actionLabel={t('addProduct')} onAction={() => navigation.navigate('ProductForm', {})} />
        }
      />
      </View>{/* end scrollable area */}

      <CollapsibleFab bottom={90} icon="add" label="Add Product" extended={extended} onPress={() => {
        Alert.alert(t('addStock'), undefined, [
          { text: t('newProduct'), onPress: () => navigation.navigate('ProductForm', {}) },
          { text: t('receiveStockGrn'), onPress: () => navigation.navigate('More', { screen: 'PurchaseForm', params: {} }) },
          { text: t('cancel'), style: 'cancel' },
        ]);
      }} />

      {/* Stock Adjust Sheet */}
      <BottomSheet
        ref={stockSheetRef}
        index={-1}
        snapPoints={stockSnapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.primary, width: 40 }}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
      >
        <BottomSheetScrollView contentContainerStyle={s.sheetContent}>
          <Text style={[s.stockTitle, { color: colors.text }]}>{t('updateStockLabel')}</Text>
          <Text style={[s.stockProductName, { color: colors.primary }]}>{stockProduct?.name}</Text>
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
          <BottomSheetTextInput
            style={[s.stockInput, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
            value={stockQty}
            onChangeText={setStockQty}
            placeholder={t('enterQtyToAdd')}
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity style={[s.stockBtn, { backgroundColor: colors.surfaceHigh }]} onPress={closeStockSheet}>
              <Text style={{ color: colors.textSub, fontFamily: fonts.semiBold }}>{t('cancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.stockBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                const n = parseInt(stockQty);
                if (isNaN(n)) { Alert.alert(t('error'), t('enterValidNumber')); return; }
                if (stockProduct) updateProduct({ ...stockProduct, quantity: Math.max(0, stockProduct.quantity + n), updatedAt: Date.now() });
                closeStockSheet();
              }}>
              <Text style={{ color: '#fff', fontFamily: fonts.bold }}>{t('addStock')}</Text>
            </TouchableOpacity>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Product Action Sheet (⋯ menu) */}
      <BottomSheet
        ref={menuSheetRef}
        index={-1}
        snapPoints={menuSnapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.surface }}
        handleIndicatorStyle={{ backgroundColor: colors.primary, width: 40 }}
      >
        <BottomSheetView style={s.sheetContent}>
          <Text style={[s.sheetTitle, { color: colors.text }]} numberOfLines={1}>{menuProduct?.name}</Text>
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
          <TouchableOpacity style={[s.sheetCancel, { backgroundColor: colors.surfaceHigh }]} onPress={closeMenuSheet}>
            <Text style={{ color: colors.textSub, fontFamily: fonts.bold, fontSize: 15 }}>Cancel</Text>
          </TouchableOpacity>
        </BottomSheetView>
      </BottomSheet>
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  // Search & filter row — cleaner
  searchRow: { flexDirection: 'row', gap: 10, padding: 12, alignItems: 'center', borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, padding: 0, fontFamily: fonts.regular },
  sortBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center', borderWidth: 0.5 },
  sortBtnText: { fontFamily: fonts.bold, fontSize: 12 },

  // Category chips
  catChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  catChipText: { fontFamily: fonts.bold, fontSize: 13 },

  sheetContent: { paddingHorizontal: 20, paddingBottom: 40 },
  stockTitle: { fontFamily: fonts.extraBold, fontSize: 18, marginBottom: 6 },
  stockProductName: { fontFamily: fonts.bold, fontSize: 16, marginBottom: 4 },
  stockCurrent: { fontFamily: fonts.medium, fontSize: 14, marginBottom: 18 },
  stockQuickRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  stockQuickBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  stockQuickText: { fontFamily: fonts.bold, fontSize: 14 },
  stockInput: { borderRadius: 14, padding: 16, fontSize: 15, borderWidth: 1, marginBottom: 16 },
  stockBtn: { flex: 1, padding: 16, borderRadius: 14, alignItems: 'center' },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 14, marginBottom: 8, paddingHorizontal: 4 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingHorizontal: 4 },
  sheetIcon: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  sheetLabel: { flex: 1, fontFamily: fonts.semiBold, fontSize: 15 },
  sheetCancel: { marginTop: 10, padding: 15, borderRadius: 14, alignItems: 'center' },
});
