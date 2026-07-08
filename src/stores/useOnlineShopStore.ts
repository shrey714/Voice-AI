import { create } from 'zustand';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../lib/supabase';
import { useAppStore } from './useAppStore';
import { generateId } from '../utils/helpers';
import {
  OnlineShopConfig,
  OnlineOrder,
  OnlineProduct,
  OrderStatus,
  DEFAULT_SHOP_CONFIG,
} from '../types/online';

/**
 * Online-store state is a thin, in-memory cache of Supabase — never
 * persisted to AsyncStorage. Every screen fetches fresh from the server on
 * mount instead of trusting a locally-remembered copy, so the shopkeeper
 * always sees actual server state (their own edits from elsewhere, or ones
 * made directly in Supabase, show up immediately instead of being silently
 * overwritten by a stale local copy on the next save).
 */
// Input for creating/editing an online listing — `localImageUri` is an
// optional on-device file path (from the image picker) still needing upload;
// `imageUrl` is used as-is when it's already a remote URL (e.g. unchanged on edit).
export type OnlineProductInput = Omit<OnlineProduct, 'id' | 'imageUrl'> & {
  imageUrl: string | null;
  localImageUri?: string;
};

interface OnlineShopState {
  config: OnlineShopConfig;
  onlineProducts: OnlineProduct[];
  orders: OnlineOrder[];
  // Gates the full-screen skeleton — true only until each data type's FIRST
  // successful (or failed) fetch this session. Every fetch after that
  // (a save's re-sync, another screen mounting, pull-to-refresh) updates
  // data in place without flipping this back on, so it never re-triggers
  // a full skeleton/remount for data we already have on screen.
  isLoadingConfig: boolean;
  isLoadingOnlineProducts: boolean;
  isLoadingOrders: boolean;
  hasLoadedConfig: boolean;
  hasLoadedOnlineProducts: boolean;
  hasLoadedOrders: boolean;
  isSavingConfig: boolean;
  isSavingProduct: boolean;
  lastError: string | null;

  // Config — fetched by owner_user_id, not a locally cached shop id.
  fetchShopConfig: () => Promise<void>;
  updateConfig: (patch: Partial<OnlineShopConfig>) => void;
  saveConfigToSupabase: () => Promise<void>;

  // Online catalog — independent listings, no relation to local inventory.
  // Import-from-local is just a one-time prefill the caller does before
  // calling createOnlineProduct; nothing here ever reads local `products`.
  fetchOnlineProducts: () => Promise<void>;
  createOnlineProduct: (input: OnlineProductInput) => Promise<void>;
  updateOnlineProduct: (id: string, input: OnlineProductInput) => Promise<void>;
  deleteOnlineProduct: (id: string) => Promise<void>;

  // Orders
  fetchOrders: (shopId: string) => Promise<void>;
  fetchOrderById: (orderId: string) => Promise<OnlineOrder | null>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<void>;
  upsertOrder: (order: OnlineOrder) => void;

  // Push token
  savePushToken: (token: string) => void;
}

// Supabase is the source of truth for the shop profile; the local SQLite
// `settings` table is just an offline-read cache so billing/invoices still
// show current shop info without a network round-trip. Called after every
// successful fetch/save so the cache never goes stale by more than one sync.
function mirrorCoreToLocalSettings(config: OnlineShopConfig) {
  useAppStore.getState().updateSettings({
    shopName: config.shopName,
    ownerName: config.ownerName,
    phone: config.phone,
    address: config.addressText,
    upiId: config.upiId,
    gstRegistered: config.gstRegistered,
    gstin: config.gstin,
    onlineShopEnabled: config.onlineShopEnabled,
    // A row existing at all means this shopkeeper already finished setup
    // before (on this device or another) — skip onboarding on this device too.
    onboardingDone: true,
  });
}

function mapShopRow(row: any): OnlineShopConfig {
  return {
    shopId: row.id,
    shopName: row.shop_name,
    ownerName: row.owner_name ?? '',
    phone: row.phone ?? '',
    upiId: row.upi_id ?? '',
    gstRegistered: row.gst_registered ?? false,
    gstin: row.gstin ?? '',
    onlineShopEnabled: row.online_shop_enabled ?? false,
    isOnlineEnabled: row.is_enabled,
    shopSlug: row.shop_slug,
    description: row.description ?? '',
    schedule: row.schedule ?? DEFAULT_SHOP_CONFIG.schedule,
    manualOverride: row.manual_override ?? null,
    orderTimeoutMinutes: row.order_timeout_minutes ?? 10,
    minOrderAmount: row.min_order_amount ?? 0,
    deliveryEnabled: row.delivery_enabled ?? false,
    deliveryFee: row.delivery_fee ?? 0,
    expoPushToken: row.expo_push_token ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    addressText: row.address_text ?? '',
    deliveryRadiusKm: row.delivery_radius_km ?? null,
  };
}

function mapProductRow(row: any): OnlineProduct {
  return {
    id: row.product_id,
    name: row.name,
    category: row.category ?? '',
    storePrice: row.store_price ?? 0,
    onlinePrice: row.online_price,
    quantity: row.quantity ?? 0,
    unit: row.unit ?? 'pcs',
    imageUrl: row.image_url ?? null,
    isVisible: row.is_visible,
  };
}

// Uploads a freshly-picked on-device image to Supabase Storage and returns
// its public URL; passes an already-remote `imageUrl` through unchanged (or
// null if the listing has no photo). Shared by create and update so an edit
// that doesn't touch the photo doesn't re-upload it.
async function resolveProductImage(shopId: string, productId: string, input: OnlineProductInput): Promise<string | null> {
  if (!input.localImageUri) return input.imageUrl;
  try {
    const path = `shops/${shopId}/${productId}.jpg`;
    const base64 = await readAsStringAsync(input.localImageUri, { encoding: 'base64' });
    const { error } = await supabase.storage
      .from('online-shop-images')
      .upload(path, decode(base64), { upsert: true, contentType: 'image/jpeg' });
    if (error) throw error;
    const { data } = supabase.storage.from('online-shop-images').getPublicUrl(path);
    return data.publicUrl;
  } catch (e) {
    console.warn('[OnlineProduct] Image upload failed for', productId, e);
    return input.imageUrl;
  }
}

export const useOnlineShopStore = create<OnlineShopState>()((set, get) => ({
  config: DEFAULT_SHOP_CONFIG,
  onlineProducts: [],
  orders: [],
  // Start true, not false — every screen that reads config/onlineProducts
  // fetches on mount, so the *first* render should already show the loading
  // state. Defaulting to false meant one frame of "not loading" (showing
  // empty/default content) before the mount effect flipped it true — a
  // flash between wrong content and the loader before the real data arrived.
  isLoadingConfig: true,
  isLoadingOnlineProducts: true,
  isLoadingOrders: true,
  hasLoadedConfig: false,
  hasLoadedOnlineProducts: false,
  hasLoadedOrders: false,
  isSavingProduct: false,
  isSavingConfig: false,
  lastError: null,

  fetchShopConfig: async () => {
    const isFirstLoad = !get().hasLoadedConfig;
    if (isFirstLoad) set({ isLoadingConfig: true });
    set({ lastError: null });
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) { set({ config: DEFAULT_SHOP_CONFIG }); return; }

      const { data, error } = await supabase
        .from('online_shops')
        .select('*')
        .eq('owner_user_id', uid)
        .maybeSingle();
      if (error) throw error;

      const nextConfig = data ? mapShopRow(data) : DEFAULT_SHOP_CONFIG;
      set({ config: nextConfig });
      if (data) mirrorCoreToLocalSettings(nextConfig);
    } catch (e: any) {
      set({ lastError: e?.message ?? 'Could not load shop settings' });
    } finally {
      set({ hasLoadedConfig: true });
      if (isFirstLoad) set({ isLoadingConfig: false });
    }
  },

  updateConfig: (patch) =>
    set((s) => ({ config: { ...s.config, ...patch } })),

  saveConfigToSupabase: async () => {
    const { config } = get();
    set({ isSavingConfig: true, lastError: null });
    try {
      if (config.shopId) {
        const { error } = await supabase
          .from('online_shops')
          .update({
            updated_at: new Date().toISOString(),
            shop_name: config.shopName,
            owner_name: config.ownerName,
            phone: config.phone,
            upi_id: config.upiId,
            gst_registered: config.gstRegistered,
            gstin: config.gstin,
            online_shop_enabled: config.onlineShopEnabled,
            is_enabled: config.isOnlineEnabled,
            description: config.description,
            schedule: config.schedule,
            manual_override: config.manualOverride,
            order_timeout_minutes: config.orderTimeoutMinutes,
            min_order_amount: config.minOrderAmount,
            delivery_enabled: config.deliveryEnabled,
            delivery_fee: config.deliveryFee,
            expo_push_token: config.expoPushToken,
            latitude: config.latitude,
            longitude: config.longitude,
            address_text: config.addressText,
            delivery_radius_km: config.deliveryRadiusKm,
          })
          .eq('id', config.shopId);
        if (error) throw error;
      } else {
        const { data: userData } = await supabase.auth.getUser();
        const { data, error } = await supabase
          .from('online_shops')
          .insert({
            shop_slug: config.shopSlug,
            shop_name: config.shopName,
            owner_name: config.ownerName,
            phone: config.phone,
            upi_id: config.upiId,
            gst_registered: config.gstRegistered,
            gstin: config.gstin,
            online_shop_enabled: config.onlineShopEnabled,
            description: config.description,
            schedule: config.schedule,
            manual_override: config.manualOverride,
            order_timeout_minutes: config.orderTimeoutMinutes,
            min_order_amount: config.minOrderAmount,
            delivery_enabled: config.deliveryEnabled,
            delivery_fee: config.deliveryFee,
            expo_push_token: config.expoPushToken,
            latitude: config.latitude,
            longitude: config.longitude,
            address_text: config.addressText,
            delivery_radius_km: config.deliveryRadiusKm,
            is_enabled: config.isOnlineEnabled,
            owner_user_id: userData.user?.id ?? null,
          })
          .select('id')
          .single();
        if (error) throw error;
        set((s) => ({ config: { ...s.config, shopId: data.id } }));
      }
      // Re-sync from the server after a save so the local copy always
      // reflects what's actually stored, not just what we optimistically sent
      // — this also mirrors the core fields into local settings (see
      // fetchShopConfig), so offline screens keep showing current info.
      await get().fetchShopConfig();
    } catch (e: any) {
      set({ lastError: e?.message ?? 'Save failed' });
      throw e;
    } finally {
      set({ isSavingConfig: false });
    }
  },

  fetchOnlineProducts: async () => {
    const { config } = get();
    if (!config.shopId) { set({ onlineProducts: [], hasLoadedOnlineProducts: true, isLoadingOnlineProducts: false }); return; }
    const isFirstLoad = !get().hasLoadedOnlineProducts;
    if (isFirstLoad) set({ isLoadingOnlineProducts: true });
    set({ lastError: null });
    try {
      const { data, error } = await supabase
        .from('online_products')
        .select('*')
        .eq('shop_id', config.shopId)
        .order('name', { ascending: true });
      if (error) throw error;
      set({ onlineProducts: (data ?? []).map(mapProductRow) });
    } catch (e: any) {
      set({ lastError: e?.message ?? 'Could not load online products' });
    } finally {
      set({ hasLoadedOnlineProducts: true });
      if (isFirstLoad) set({ isLoadingOnlineProducts: false });
    }
  },

  createOnlineProduct: async (input) => {
    const { config } = get();
    if (!config.shopId) throw new Error('Set up your online shop before adding products.');
    set({ isSavingProduct: true, lastError: null });
    try {
      const id = generateId();
      const imageUrl = await resolveProductImage(config.shopId, id, input);
      const { error } = await supabase.from('online_products').insert({
        shop_id: config.shopId,
        product_id: id,
        name: input.name,
        category: input.category,
        store_price: input.storePrice,
        online_price: input.onlinePrice,
        quantity: input.quantity,
        unit: input.unit,
        image_url: imageUrl,
        is_visible: input.isVisible,
      });
      if (error) throw error;
      await get().fetchOnlineProducts();
    } catch (e: any) {
      set({ lastError: e?.message ?? 'Could not add product' });
      throw e;
    } finally {
      set({ isSavingProduct: false });
    }
  },

  updateOnlineProduct: async (id, input) => {
    const { config } = get();
    if (!config.shopId) throw new Error('Set up your online shop before editing products.');
    set({ isSavingProduct: true, lastError: null });
    try {
      const imageUrl = await resolveProductImage(config.shopId, id, input);
      const { error } = await supabase
        .from('online_products')
        .update({
          name: input.name,
          category: input.category,
          store_price: input.storePrice,
          online_price: input.onlinePrice,
          quantity: input.quantity,
          unit: input.unit,
          image_url: imageUrl,
          is_visible: input.isVisible,
        })
        .eq('shop_id', config.shopId)
        .eq('product_id', id);
      if (error) throw error;
      await get().fetchOnlineProducts();
    } catch (e: any) {
      set({ lastError: e?.message ?? 'Could not update product' });
      throw e;
    } finally {
      set({ isSavingProduct: false });
    }
  },

  deleteOnlineProduct: async (id) => {
    const { config } = get();
    if (!config.shopId) return;
    const previous = get().onlineProducts;
    set({ onlineProducts: previous.filter((p) => p.id !== id) });
    const { error } = await supabase
      .from('online_products')
      .delete()
      .eq('shop_id', config.shopId)
      .eq('product_id', id);
    if (error) {
      set({ onlineProducts: previous, lastError: error.message });
      throw error;
    }
  },

  fetchOrders: async (shopId) => {
    const isFirstLoad = !get().hasLoadedOrders;
    if (isFirstLoad) set({ isLoadingOrders: true });
    set({ lastError: null });
    try {
      const { data, error } = await supabase
        .from('online_orders')
        .select('*')
        .eq('shop_id', shopId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      const orders: OnlineOrder[] = (data ?? []).map(mapRow);
      set({ orders });
    } catch (e: any) {
      set({ lastError: e?.message ?? 'Fetch failed' });
    } finally {
      set({ hasLoadedOrders: true });
      if (isFirstLoad) set({ isLoadingOrders: false });
    }
  },

  // Direct single-order fetch — needed when a screen is reached without
  // fetchOrders having populated the store yet (e.g. tapping a push
  // notification straight into the order detail screen on cold start).
  fetchOrderById: async (orderId) => {
    const { data, error } = await supabase
      .from('online_orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();
    if (error || !data) return null;
    const order = mapRow(data);
    get().upsertOrder(order);
    return order;
  },

  updateOrderStatus: async (orderId, status) => {
    const patch: Record<string, any> = { status, updated_at: new Date().toISOString() };
    if (status === 'accepted') patch.accepted_at = new Date().toISOString();
    if (status === 'completed') patch.completed_at = new Date().toISOString();

    const { error } = await supabase
      .from('online_orders')
      .update(patch)
      .eq('id', orderId);
    if (error) throw error;

    set((s) => ({
      orders: s.orders.map((o) =>
        o.id === orderId ? { ...o, status, updatedAt: patch.updated_at, ...mapPatch(patch) } : o
      ),
    }));
  },

  upsertOrder: (order) =>
    set((s) => {
      const idx = s.orders.findIndex((o) => o.id === order.id);
      if (idx >= 0) {
        const updated = [...s.orders];
        updated[idx] = order;
        return { orders: updated };
      }
      return { orders: [order, ...s.orders] };
    }),

  savePushToken: (token) =>
    set((s) => ({ config: { ...s.config, expoPushToken: token } })),
}));

function mapRow(row: any): OnlineOrder {
  return {
    id: row.id,
    shopId: row.shop_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone ?? null,
    customerAddress: row.customer_address ?? null,
    items: row.items ?? [],
    subtotal: row.subtotal,
    deliveryFee: row.delivery_fee ?? 0,
    total: row.total,
    status: row.status,
    note: row.note ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at ?? null,
    completedAt: row.completed_at ?? null,
  };
}

function mapPatch(patch: Record<string, any>): Partial<OnlineOrder> {
  const out: Partial<OnlineOrder> = {};
  if (patch.accepted_at) out.acceptedAt = patch.accepted_at;
  if (patch.completed_at) out.completedAt = patch.completed_at;
  return out;
}
