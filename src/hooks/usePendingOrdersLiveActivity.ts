import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import type { LiveActivity } from 'expo-widgets';
import { useOnlineShopStore } from '../stores/useOnlineShopStore';
import { useAppStore } from '../stores/useAppStore';
import { PendingOrdersActivity, PendingOrdersActivityProps } from '../widgets/PendingOrdersActivity';

// Keeps a single running Live Activity in sync with the count of 'pending'
// online orders — starts one when the first pending order appears, updates
// it live as the count changes, and ends it once the queue is cleared.
// iOS only (Dynamic Island / Live Activities have no Android equivalent);
// no-ops entirely on Android.
//
// NOTE: this only reflects orders while the app process is alive and this
// hook is mounted — it reads the same `useOnlineShopStore` orders array that
// `useOrderRealtime`'s Supabase channel feeds. There is no push-notification-
// driven background update wired up (that needs a paid Apple Developer
// account + APNs, explicitly out of scope for this pass) — the Live Activity
// will only reflect new orders that arrive while the app is open/foregrounded
// (or briefly backgrounded — iOS keeps the app alive for a short grace period).
export function usePendingOrdersLiveActivity() {
  const orders = useOnlineShopStore(s => s.orders);
  const shopName = useAppStore(s => s.settings.shopName) || 'Your Shop';
  const onlineShopEnabled = useAppStore(s => s.settings.onlineShopEnabled);
  const activityRef = useRef<LiveActivity<PendingOrdersActivityProps> | null>(null);
  const adoptedExisting = useRef(false);

  const pendingCount = orders.filter(o => o.status === 'pending').length;

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    // Recover a Live Activity still showing from a previous app session
    // (they persist on the Lock Screen/Dynamic Island after the app is
    // killed) instead of starting a duplicate one alongside it.
    if (!adoptedExisting.current) {
      adoptedExisting.current = true;
      const existing = PendingOrdersActivity.getInstances()[0];
      if (existing) activityRef.current = existing;
    }

    if (!onlineShopEnabled) return;

    const props: PendingOrdersActivityProps = { pendingCount, shopName };
    if (pendingCount > 0) {
      if (activityRef.current) activityRef.current.update(props);
      else activityRef.current = PendingOrdersActivity.start(props);
    } else if (activityRef.current) {
      activityRef.current.end('default', props);
      activityRef.current = null;
    }
  }, [pendingCount, shopName, onlineShopEnabled]);
}
