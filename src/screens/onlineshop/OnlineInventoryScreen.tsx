import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import {
  View,
  FlatList,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { useIsFocused, useFocusEffect } from "@react-navigation/native";
import LiquidBottomSheet, {
  LiquidBottomSheetRef,
} from "../../components/common/LiquidBottomSheet";
import LiquidTextField from "../../components/common/LiquidTextField";
import SheetHeader, {
  SHEET_PADDING,
} from "../../components/common/SheetHeader";
import { useAppTheme } from "../../theme";
import { fonts } from "../../theme/typography";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../../stores/useAppStore";
import { useOnlineShopStore } from "../../stores/useOnlineShopStore";
import { OnlineInventorySkeleton } from "../../components/common/Skeleton";
import EmptyState from "../../components/common/EmptyState";
import CollapsibleFab, {
  useFabScroll,
} from "../../components/common/CollapsibleFab";
import InlineSearchBar from "../../components/common/InlineSearchBar";
import LiquidHeaderIconButton from "../../components/common/LiquidHeaderIconButton";
import { formatCurrency } from "../../utils/helpers";
import { OnlineProduct } from "../../types/online";
import { Product } from "../../types";
import { toast } from "../../utils/toast";
import { useConfirm } from "../../components/common/ConfirmDialogProvider";

// Extracted + memoized — renders inside a `FlatList`; `onEdit`/`onDelete` are
// stable top-level callbacks (passed directly, not wrapped in a fresh
// per-row closure) so `React.memo`'s shallow-equality check can actually
// skip re-rendering unchanged rows.
const OnlineProductRow = React.memo(function OnlineProductRow({
  product,
  colors,
  s,
  currency,
  isDeleting,
  onEdit,
  onDelete,
}: {
  product: OnlineProduct;
  colors: any;
  s: any;
  currency: string;
  isDeleting: boolean;
  onEdit: (p: OnlineProduct) => void;
  onDelete: (p: OnlineProduct) => void;
}) {
  return (
    <TouchableOpacity
      style={[s.card, { backgroundColor: colors.surface }]}
      activeOpacity={0.7}
      onPress={() => onEdit(product)}
    >
      <View style={s.cardMain}>
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} style={s.thumb} />
        ) : (
          <View
            style={[
              s.thumb,
              s.thumbPlaceholder,
              { backgroundColor: colors.surfaceHigh },
            ]}
          >
            <Ionicons name="image-outline" size={18} color={colors.textMuted} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text
            style={[s.productName, { color: colors.text }]}
            numberOfLines={1}
          >
            {product.name}
          </Text>
          <Text style={[s.productMeta, { color: colors.textMuted }]}>
            {product.category} · {product.quantity} {product.unit} in stock
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginTop: 2,
            }}
          >
            {product.onlinePrice != null ? (
              <>
                <Text style={[s.priceStrike, { color: colors.textMuted }]}>
                  {formatCurrency(product.storePrice, currency)}
                </Text>
                <Text style={[s.priceNow, { color: colors.primary }]}>
                  {formatCurrency(product.onlinePrice, currency)}
                </Text>
              </>
            ) : (
              <Text style={[s.priceNow, { color: colors.text }]}>
                {formatCurrency(product.storePrice, currency)}
              </Text>
            )}
          </View>
        </View>
        <View
          style={[
            s.visBadge,
            {
              backgroundColor: product.isVisible
                ? colors.success + "1A"
                : colors.border + "40",
            },
          ]}
        >
          <Ionicons
            name={product.isVisible ? "eye" : "eye-off-outline"}
            size={14}
            color={product.isVisible ? colors.success : colors.textMuted}
          />
        </View>
      </View>

      <View style={[s.actionsRow, { borderTopColor: colors.border }]}>
        <TouchableOpacity style={s.actionBtn} onPress={() => onEdit(product)}>
          <Ionicons name="pencil-outline" size={15} color={colors.primary} />
          <Text style={[s.actionText, { color: colors.primary }]}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={s.actionBtn}
          onPress={() => onDelete(product)}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color={colors.danger} />
          ) : (
            <>
              <Ionicons name="trash-outline" size={15} color={colors.danger} />
              <Text style={[s.actionText, { color: colors.danger }]}>
                Remove
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});

/**
 * Online catalog — a fully independent list of listings, fetched straight
 * from Supabase `online_products`. There is no relation to local inventory:
 * "Import from local shop" only prefills a one-time copy when creating a new
 * listing, it never keeps the two in sync afterwards.
 */
export default function OnlineInventoryScreen({ navigation }: any) {
  const { colors } = useAppTheme();
  const { settings } = useAppStore(
    useShallow((state) => ({
      settings: state.settings,
    })),
  );
  const { confirm, confirmActions } = useConfirm();
  const {
    onlineProducts,
    isLoadingOnlineProducts,
    fetchOnlineProducts,
    deleteOnlineProduct,
  } = useOnlineShopStore(
    useShallow((state) => ({
      onlineProducts: state.onlineProducts,
      isLoadingOnlineProducts: state.isLoadingOnlineProducts,
      fetchOnlineProducts: state.fetchOnlineProducts,
      deleteOnlineProduct: state.deleteOnlineProduct,
    })),
  );
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { extended, onScroll } = useFabScroll();
  const importSheetRef = useRef<LiquidBottomSheetRef>(null);
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  // Same as InventoryScreen: `headerTransparent` no longer reserves layout
  // space for the native header on either platform, so content needs to
  // compensate manually. 44 is UIKit's standard compact nav bar height on
  // iOS; 56 is Material's standard app-bar height on Android. `insets.top`
  // covers the status bar/notch on both.
  const headerCompensation = insets.top + (Platform.OS === "ios" ? 44 : 56);

  useEffect(() => {
    navigation.setOptions({
      headerTransparent: true,
      headerStyle: { backgroundColor: "transparent" },
      headerRight: () => (
        <LiquidHeaderIconButton
          icon="magnifyingglass"
          androidIcon="search-outline"
          onPress={() => setSearchOpen((v) => !v)}
        />
      ),
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
    return onlineProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q),
    );
  }, [onlineProducts, search]);

  const handleAdd = useCallback(() => {
    confirmActions({
      title: "Add online product",
      message:
        "Start from a product you already sell in-store, or create a brand-new online-only listing.",
      actions: [
        { label: "Import from local shop", value: "import" },
        { label: "Create new product", value: "create" },
      ],
    }).then((choice) => {
      if (choice === "import") importSheetRef.current?.expand();
      else if (choice === "create")
        navigation.navigate("OnlineProductForm", {});
    });
  }, [confirmActions, navigation]);

  // `bottomAccessory` (iOS 26+ only) — same conversion as InventoryScreen.
  // A **Tab**-level option, one navigator up from this screen's own Stack,
  // hence `getParent()`. Android's classic tab navigator has no such
  // option, so it keeps the existing `CollapsibleFab` below instead.
  // Scoped with `useFocusEffect` (set on focus, cleared on blur), not a
  // plain mount effect — this screen's tab stack also has OnlineProductForm,
  // where this "Add Product" accessory shouldn't keep floating (a stale
  // closure) after navigating there. See ShopInfoScreen/ExpensesScreen for
  // the same fix.
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "ios") return;
      const parent = navigation.getParent();
      parent?.setOptions({
        bottomAccessory: ({ placement }: { placement: "regular" | "inline" }) => (
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 8,
              alignItems: "flex-end",
            }}
          >
            <TouchableOpacity
              onPress={handleAdd}
              style={{
                width: "100%",
                height: "100%",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                borderRadius: 24,
                paddingHorizontal: 18,
              }}
              accessibilityLabel="Add Product"
              accessibilityRole="button"
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text
                style={{ color: "#fff", fontFamily: fonts.bold, fontSize: 14 }}
              >
                Add Product
              </Text>
            </TouchableOpacity>
          </View>
        ),
      });
      return () => { parent?.setOptions({ bottomAccessory: undefined }); };
    }, [navigation, handleAdd, colors])
  );

  const handleImportPick = (product: Product) => {
    importSheetRef.current?.close();
    navigation.navigate("OnlineProductForm", { importFrom: product });
  };

  const handleDelete = useCallback(
    async (product: OnlineProduct) => {
      const ok = await confirm({
        title: "Remove listing?",
        message: `"${product.name}" will be removed from your online shop. This cannot be undone.`,
        confirmLabel: "Remove",
        destructive: true,
      });
      if (!ok) return;
      setDeletingId(product.id);
      try {
        await deleteOnlineProduct(product.id);
        toast.success("Listing removed");
      } catch (e: any) {
        toast.error("Could not remove listing", { description: e?.message });
      } finally {
        setDeletingId(null);
      }
    },
    [confirm],
  );

  const openEditProduct = useCallback(
    (product: OnlineProduct) => {
      navigation.navigate("OnlineProductForm", { editing: product });
    },
    [navigation],
  );

  const renderProductItem = useCallback(
    ({ item }: { item: OnlineProduct }) => (
      <OnlineProductRow
        product={item}
        colors={colors}
        s={s}
        currency={settings.currency}
        isDeleting={deletingId === item.id}
        onEdit={openEditProduct}
        onDelete={handleDelete}
      />
    ),
    [colors, s, settings.currency, deletingId, openEditProduct, handleDelete],
  );

  const visibleCount = onlineProducts.filter((p) => p.isVisible).length;

  return (
    <>
      {searchOpen && (
        // `headerTransparent` means this row is no longer pushed below a
        // solid header by normal flow — see InventoryScreen's identical
        // comment for the full explanation.
        <View
          style={
            Platform.OS === "ios"
              ? { marginTop: headerCompensation }
              : undefined
          }
        >
          <InlineSearchBar
            value={search}
            onChangeText={setSearch}
            placeholder="Search online listings…"
            onClose={() => setSearchOpen(false)}
          />
        </View>
      )}

      <FlatList
        data={filtered}
        style={{ flex: 1 }}
        keyExtractor={(p) => p.id}
        // Manual `headerCompensation` IS needed here, unlike
        // InventoryScreen — `isLoadingOnlineProducts` is a network fetch
        // (this screen's `OnlineInventorySkeleton` early-return has no
        // `FlatList` in it at all, visible for a real stretch of time),
        // so iOS's one-time "detect the first-descendant scroll view for
        // automatic inset" pass likely runs while only the skeleton is
        // mounted and finds nothing — the real `FlatList` that appears
        // later never gets the automatic inset. InventoryScreen's
        // equivalent gate is local SQLite data that resolves near-
        // instantly, so that race essentially never loses there.
        contentContainerStyle={{
          paddingHorizontal: 10,
          paddingTop: 8,
          paddingBottom: 120,
          flexGrow: 1,
        }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        renderItem={renderProductItem}
        ListHeaderComponent={
          <View style={[s.header]}>
            <View style={s.headerRow}>
              <Ionicons name="eye-outline" size={16} color={colors.primary} />
              <Text style={[s.summaryText, { color: colors.text, flex: 1 }]}>
                <Text style={{ color: colors.primary, fontFamily: fonts.bold }}>
                  {visibleCount}
                </Text>{" "}
                of {onlineProducts.length} listings visible online
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          isLoadingOnlineProducts ? (
            <OnlineInventorySkeleton />
          ) : (
            <EmptyState
              icon="bag-outline"
              title={
                onlineProducts.length === 0 ? "No listings yet" : "No matches"
              }
              subtitle={
                onlineProducts.length === 0
                  ? "Tap the + button to list your first product online."
                  : "Try a different search."
              }
            />
          )
        }
      />

      {/* iOS gets the native `bottomAccessory` (set up above via
          `navigation.getParent()?.setOptions`) instead — Android has no
          such API, so it keeps this floating overlay. */}
      {Platform.OS !== "ios" && (
        <CollapsibleFab
          icon="add"
          label="Add Product"
          extended={extended}
          onPress={handleAdd}
          bottom={24}
        />
      )}

      <ImportPickerSheet sheetRef={importSheetRef} onPick={handleImportPick} />
    </>
  );
}

// Search list of LOCAL products, used only to one-time prefill a new online
// listing — picking one never creates or keeps any ongoing link. Same
// BottomSheet convention as InventoryScreen's stock/menu sheets, instead of
// a full-screen modal.
function ImportPickerSheet({
  sheetRef,
  onPick,
}: {
  sheetRef: React.RefObject<LiquidBottomSheetRef | null>;
  onPick: (p: Product) => void;
}) {
  const { colors } = useAppTheme();
  const { products } = useAppStore(
    useShallow((state) => ({
      products: state.products,
    })),
  );
  const [query, setQuery] = useState("");
  const s = makeStyles(colors);

  const filtered = useMemo(() => {
    if (!query.trim()) return products;
    const q = query.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q),
    );
  }, [products, query]);

  return (
    <LiquidBottomSheet ref={sheetRef}>
      <SheetHeader
        title="Import from local shop"
        onClose={() => sheetRef.current?.close()}
      />
      {/* Single ScrollView holding everything — search input and rows all
          mapped inline (not virtualized) — the local product list here is
          small enough that this is fine, and avoids any risk of a separate
          FlatList fighting the search input for keyboard focus. */}
      <ScrollView
        contentContainerStyle={s.pickerHeader}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ marginBottom: 8 }}>
          <LiquidTextField
            value={query}
            onChangeText={setQuery}
            placeholder="Search your products…"
          />
        </View>

        {filtered.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title="No products found"
            subtitle={
              query.trim()
                ? `Nothing matches "${query.trim()}".`
                : "You don't have any local products yet."
            }
          />
        ) : (
          filtered.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[s.pickerRow, { borderBottomColor: colors.border }]}
              onPress={() => onPick(item)}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[s.productName, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                <Text style={[s.productMeta, { color: colors.textMuted }]}>
                  {item.category} · {item.quantity} {item.unit}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textMuted}
              />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </LiquidBottomSheet>
  );
}

const makeStyles = (c: any) =>
  StyleSheet.create({
    header: { paddingBottom: 8, paddingHorizontal: 8 },
    headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    summaryText: { fontFamily: fonts.medium, fontSize: 13 },
    searchBox: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      padding: 0,
      fontFamily: fonts.regular,
    },

    emptyWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 30,
      gap: 10,
      marginTop: -60,
    },
    emptyTitle: { fontFamily: fonts.extraBold, fontSize: 16 },
    emptySub: { fontFamily: fonts.medium, fontSize: 13, textAlign: "center" },

    card: {
      borderRadius: 12,
      padding: 12,
      marginBottom: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    cardMain: { flexDirection: "row", alignItems: "center", gap: 10 },
    thumb: { width: 48, height: 48, borderRadius: 10 },
    thumbPlaceholder: { alignItems: "center", justifyContent: "center" },
    productName: { fontFamily: fonts.bold, fontSize: 15 },
    productMeta: { fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
    priceStrike: {
      fontFamily: fonts.regular,
      fontSize: 12,
      textDecorationLine: "line-through",
    },
    priceNow: { fontFamily: fonts.bold, fontSize: 14 },
    visBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },

    actionsRow: {
      flexDirection: "row",
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      gap: 20,
    },
    actionBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
    actionText: { fontFamily: fonts.bold, fontSize: 13 },

    pickerHeader: { paddingHorizontal: SHEET_PADDING, paddingBottom: 24 },
    pickerRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
  });
