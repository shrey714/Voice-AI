import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl, Image, Alert } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import AppBottomSheet, { AppBottomSheetRef } from '../../components/common/AppBottomSheet';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';
import { useAppStore } from '../../stores/useAppStore';
import { useOnlineShopStore } from '../../stores/useOnlineShopStore';
import { OnlineInventorySkeleton } from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';
import CollapsibleFab, { useFabScroll } from '../../components/common/CollapsibleFab';
import HeaderSearchToggle from '../../components/common/HeaderSearchToggle';
import { formatCurrency } from '../../utils/helpers';
import { OnlineProduct } from '../../types/online';
import { Product } from '../../types';
import { toast } from '../../utils/toast';

/**
 * Online catalog — a fully independent list of listings, fetched straight
 * from Supabase `online_products`. There is no relation to local inventory:
 * "Import from local shop" only prefills a one-time copy when creating a new
 * listing, it never keeps the two in sync afterwards.
 */
export default function OnlineInventoryScreen({ navigation }: any) {
  const { colors } = useAppTheme();
  const { settings } = useAppStore();
  const { onlineProducts, isLoadingOnlineProducts, fetchOnlineProducts, deleteOnlineProduct } = useOnlineShopStore();
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { extended, onScroll } = useFabScroll();
  const importSheetRef = useRef<AppBottomSheetRef>(null);
  const s = makeStyles(colors);

  // See HeaderSearchToggle.tsx for how/why this expands the way it does.
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => <HeaderSearchToggle onQueryChange={setSearch} placeholder="Search online listings…" />,
    });
  }, [navigation]);

  // This tab sits in a `lazy: false` navigator (needed so the online-portion
  // tab bar can animate its slide/gap — see AppNavigator), so it mounts
  // immediately alongside Dashboard/Orders instead of only when visited.
  // Gating the fetch on focus keeps that mount cheap and avoids firing this
  // network call the moment Online mode is first entered, before the
  // shopkeeper has even looked at this tab.
  const isFocused = useIsFocused();

  useEffect(() => {
    if (isFocused) fetchOnlineProducts();
  }, [isFocused]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchOnlineProducts();
    setRefreshing(false);
  }, [fetchOnlineProducts]);

  const filtered = useMemo(() => {
    if (!search.trim()) return onlineProducts;
    const q = search.toLowerCase();
    return onlineProducts.filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }, [onlineProducts, search]);

  const handleAdd = () => {
    Alert.alert('Add online product', 'Start from a product you already sell in-store, or create a brand-new online-only listing.', [
      { text: 'Import from local shop', onPress: () => importSheetRef.current?.expand() },
      { text: 'Create new product', onPress: () => navigation.navigate('OnlineProductForm', {}) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleImportPick = (product: Product) => {
    importSheetRef.current?.close();
    navigation.navigate('OnlineProductForm', { importFrom: product });
  };

  const handleDelete = (product: OnlineProduct) => {
    Alert.alert('Remove listing?', `"${product.name}" will be removed from your online shop. This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          setDeletingId(product.id);
          try {
            await deleteOnlineProduct(product.id);
            toast.success('Listing removed');
          } catch (e: any) {
            toast.error('Could not remove listing', { description: e?.message });
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  };

  const visibleCount = onlineProducts.filter((p) => p.isVisible).length;

  if (isLoadingOnlineProducts) {
    return <OnlineInventorySkeleton />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>

      {filtered.length === 0 ? (
        <View style={s.emptyWrap}>
          <Ionicons name="storefront-outline" size={40} color={colors.textMuted} />
          <Text style={[s.emptyTitle, { color: colors.text }]}>
            {onlineProducts.length === 0 ? 'No listings yet' : 'No matches'}
          </Text>
          <Text style={[s.emptySub, { color: colors.textMuted }]}>
            {onlineProducts.length === 0 ? 'Tap the + button to list your first product online.' : 'Try a different search.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: 10, paddingTop: 10, paddingBottom: 120 }}
          onScroll={onScroll}
          scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
          renderItem={({ item: product }) => {
            const isDeleting = deletingId === product.id;
            return (
              <TouchableOpacity
                style={[s.card, { backgroundColor: colors.surface }]}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('OnlineProductForm', { editing: product })}
              >
                <View style={s.cardMain}>
                  {product.imageUrl ? (
                    <Image source={{ uri: product.imageUrl }} style={s.thumb} />
                  ) : (
                    <View style={[s.thumb, s.thumbPlaceholder, { backgroundColor: colors.surfaceHigh }]}>
                      <Ionicons name="image-outline" size={18} color={colors.textMuted} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[s.productName, { color: colors.text }]} numberOfLines={1}>{product.name}</Text>
                    <Text style={[s.productMeta, { color: colors.textMuted }]}>
                      {product.category} · {product.quantity} {product.unit} in stock
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      {product.onlinePrice != null ? (
                        <>
                          <Text style={[s.priceStrike, { color: colors.textMuted }]}>{formatCurrency(product.storePrice, settings.currency)}</Text>
                          <Text style={[s.priceNow, { color: colors.primary }]}>{formatCurrency(product.onlinePrice, settings.currency)}</Text>
                        </>
                      ) : (
                        <Text style={[s.priceNow, { color: colors.text }]}>{formatCurrency(product.storePrice, settings.currency)}</Text>
                      )}
                    </View>
                  </View>
                  <View style={[s.visBadge, { backgroundColor: product.isVisible ? colors.success + '1A' : colors.border + '40' }]}>
                    <Ionicons name={product.isVisible ? 'eye' : 'eye-off-outline'} size={14} color={product.isVisible ? colors.success : colors.textMuted} />
                  </View>
                </View>

                <View style={[s.actionsRow, { borderTopColor: colors.border }]}>
                  <TouchableOpacity style={s.actionBtn} onPress={() => navigation.navigate('OnlineProductForm', { editing: product })}>
                    <Ionicons name="pencil-outline" size={15} color={colors.primary} />
                    <Text style={[s.actionText, { color: colors.primary }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actionBtn} onPress={() => handleDelete(product)} disabled={isDeleting}>
                    {isDeleting ? (
                      <ActivityIndicator size="small" color={colors.danger} />
                    ) : (
                      <>
                        <Ionicons name="trash-outline" size={15} color={colors.danger} />
                        <Text style={[s.actionText, { color: colors.danger }]}>Remove</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          }}
          ListHeaderComponent={      
          <View style={[s.header]}>
            <View style={s.headerRow}>
              <Ionicons name="eye-outline" size={16} color={colors.primary} />
              <Text style={[s.summaryText, { color: colors.text, flex: 1 }]}>
                <Text style={{ color: colors.primary, fontFamily: fonts.bold }}>{visibleCount}</Text> of {onlineProducts.length} listings visible online
              </Text>
            </View>
          </View>
          }
        />
      )}

      <CollapsibleFab icon="add" label="Add Product" extended={extended} onPress={handleAdd} bottom={90} />

      <ImportPickerSheet sheetRef={importSheetRef} onPick={handleImportPick} />
    </View>
  );
}

// Search list of LOCAL products, used only to one-time prefill a new online
// listing — picking one never creates or keeps any ongoing link. Same
// BottomSheet convention as InventoryScreen's stock/menu sheets, instead of
// a full-screen modal.
function ImportPickerSheet({ sheetRef, onPick }: {
  sheetRef: React.RefObject<AppBottomSheetRef | null>; onPick: (p: Product) => void;
}) {
  const { colors } = useAppTheme();
  const { products } = useAppStore();
  const [query, setQuery] = useState('');
  const s = makeStyles(colors);

  const filtered = useMemo(() => {
    if (!query.trim()) return products;
    const q = query.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }, [products, query]);

  return (
    <AppBottomSheet ref={sheetRef}>
      {/* Single BottomSheetScrollView holding everything — title, search
          input, and rows all mapped inline. This is the one pattern already
          proven to work in this app (InventoryScreen's stock-adjust sheet
          mixes text + a TextInput the same way). BottomSheetFlatList as a
          sibling or via ListHeaderComponent both left the input unfocusable,
          so this picker avoids virtualization entirely — the local product
          list here is small enough that a plain mapped ScrollView is fine. */}
      <BottomSheetScrollView contentContainerStyle={s.pickerHeader} keyboardShouldPersistTaps="handled">
        <Text style={[s.pickerTitle, { color: colors.text }]}>Import from local shop</Text>
        <View style={[s.searchBox, { backgroundColor: colors.surfaceHigh, borderColor: colors.border, marginTop: 12, marginBottom: 8 }]}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
          <BottomSheetTextInput
            style={[s.searchInput, { color: colors.text }]}
            placeholder="Search your products…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
          />
        </View>

        {filtered.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title="No products found"
            subtitle={query.trim() ? `Nothing matches "${query.trim()}".` : 'You don\'t have any local products yet.'}
          />
        ) : (
          filtered.map((item) => (
            <TouchableOpacity key={item.id} style={[s.pickerRow, { borderBottomColor: colors.border }]} onPress={() => onPick(item)}>
              <View style={{ flex: 1 }}>
                <Text style={[s.productName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[s.productMeta, { color: colors.textMuted }]}>{item.category} · {item.quantity} {item.unit}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ))
        )}
      </BottomSheetScrollView>
    </AppBottomSheet>
  );
}

const makeStyles = (c: any) =>
  StyleSheet.create({
    header: { paddingBottom: 8, paddingHorizontal: 8 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    summaryText: { fontFamily: fonts.medium, fontSize: 13 },
    searchBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1 },
    searchInput: { flex: 1, fontSize: 14, padding: 0, fontFamily: fonts.regular },

    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, gap: 10, marginTop: -60 },
    emptyTitle: { fontFamily: fonts.extraBold, fontSize: 16 },
    emptySub: { fontFamily: fonts.medium, fontSize: 13, textAlign: 'center' },

    card: { borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
    cardMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    thumb: { width: 48, height: 48, borderRadius: 10 },
    thumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
    productName: { fontFamily: fonts.bold, fontSize: 15 },
    productMeta: { fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
    priceStrike: { fontFamily: fonts.regular, fontSize: 12, textDecorationLine: 'line-through' },
    priceNow: { fontFamily: fonts.bold, fontSize: 14 },
    visBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

    actionsRow: { flexDirection: 'row', marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 20 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    actionText: { fontFamily: fonts.bold, fontSize: 13 },

    pickerHeader: { paddingHorizontal: 16, paddingBottom: 24 },
    pickerTitle: { fontFamily: fonts.extraBold, fontSize: 17 },
    pickerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  });
