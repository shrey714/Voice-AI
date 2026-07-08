export type OrderStatus = 'pending' | 'accepted' | 'rejected' | 'ready' | 'completed' | 'cancelled';

export interface ShopSchedule {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sun
  open: string;  // "HH:MM" 24h
  close: string; // "HH:MM" 24h
}

export interface OnlineShopConfig {
  shopId: string | null;             // Supabase shops.id; null until first setup
  // Core profile — shared with local billing (AppSettings) and mirrored there
  // after every successful save, so offline screens still show current info.
  shopName: string;
  ownerName: string;
  phone: string;
  upiId: string;
  gstRegistered: boolean;
  gstin: string;
  // Whether this shopkeeper wants the Online Shop feature at all — gates the
  // rest of these fields in the UI and the "Online Shop" Menu entry. Distinct
  // from `isOnlineEnabled`, which is the day-to-day "open for orders" toggle.
  onlineShopEnabled: boolean;
  isOnlineEnabled: boolean;
  shopSlug: string;
  description: string;
  schedule: ShopSchedule[];
  manualOverride: 'open' | 'closed' | null; // null = follow schedule
  orderTimeoutMinutes: number;
  minOrderAmount: number;
  deliveryEnabled: boolean;
  deliveryFee: number;
  expoPushToken: string | null;
  latitude: number | null;
  longitude: number | null;
  addressText: string;
  deliveryRadiusKm: number | null;
}

// An independent online-catalog listing — NOT tied to a local inventory
// product. `id` is a fresh identifier minted when the listing is created
// (whether imported from a local product as a one-time copy, or created from
// scratch); editing this never touches, and is never touched by, local
// inventory. Column names on the Supabase `online_products` row (product_id,
// store_price, etc.) are kept as-is since the customer-facing web app reads
// them directly — only their meaning changes, from "mirror of a local
// product" to "this listing's own fields".
export interface OnlineProduct {
  id: string;
  name: string;
  category: string;
  storePrice: number;          // the regular (non-discounted) online price
  onlinePrice: number | null;  // optional discounted price; null = show storePrice only
  quantity: number;            // online stock — managed independently, not synced from local
  unit: string;
  imageUrl: string | null;
  isVisible: boolean;
}

export interface OnlineOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface OnlineOrder {
  id: string;
  shopId: string;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  items: OnlineOrderItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: OrderStatus;
  note: string | null;
  createdAt: string;  // ISO from Supabase
  updatedAt: string;
  expiresAt: string;  // auto-cancel deadline
  acceptedAt: string | null;
  completedAt: string | null;
}

export const DEFAULT_SHOP_CONFIG: OnlineShopConfig = {
  shopId: null,
  shopName: '',
  ownerName: '',
  phone: '',
  upiId: '',
  gstRegistered: false,
  gstin: '',
  onlineShopEnabled: false,
  isOnlineEnabled: false,
  shopSlug: '',
  description: '',
  schedule: [
    { day: 1, open: '09:00', close: '21:00' },
    { day: 2, open: '09:00', close: '21:00' },
    { day: 3, open: '09:00', close: '21:00' },
    { day: 4, open: '09:00', close: '21:00' },
    { day: 5, open: '09:00', close: '21:00' },
    { day: 6, open: '09:00', close: '21:00' },
  ],
  manualOverride: null,
  orderTimeoutMinutes: 10,
  minOrderAmount: 0,
  deliveryEnabled: false,
  deliveryFee: 0,
  expoPushToken: null,
  latitude: null,
  longitude: null,
  addressText: '',
  deliveryRadiusKm: null,
};
