import { useEffect, useRef } from 'react';
import { Platform, AppState } from 'react-native';
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
// account + APNs, explicitly out of scope for this pass).
//
// FOREGROUND CONSTRAINT (found via a real crash, not documentation): iOS's
// ActivityKit only allows *starting* a brand-new Live Activity while the app
// is foregrounded — `PendingOrdersActivity.start()` throws synchronously
// ("Target is not foreground", ExpoWidgets/LiveActivityFactory.swift) if
// called from the background, e.g. when a Supabase realtime event for a new
// order arrives while the shopkeeper is on another app. *Updating* an
// already-running activity works fine from the background (confirmed via
// ActivityKit's own logs). So: if a pending order arrives with no activity
// running yet and the app isn't foregrounded, we wait — the AppState
// listener below retries the moment the app becomes active again. All native
// calls are wrapped so a Live Activity failure can never crash the rest of
// the app (this bit the whole app once already, via ErrorBoundary).
export function usePendingOrdersLiveActivity() {
  const orders = useOnlineShopStore(s => s.orders);
  const shopName = useAppStore(s => s.settings.shopName) || 'Your Shop';
  const onlineShopEnabled = useAppStore(s => s.settings.onlineShopEnabled);
  const activityRef = useRef<LiveActivity<PendingOrdersActivityProps> | null>(null);
  const adoptedExisting = useRef(false);

  const pendingCount = orders.filter(o => o.status === 'pending').length;

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const sync = () => {
      try {
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
          if (activityRef.current) {
            activityRef.current.update(props).catch((err) => {
              console.warn('[LiveActivity] update failed', err);
            });
          } else if (AppState.currentState === 'active') {
            activityRef.current = PendingOrdersActivity.start(props);
          }
          // else: no activity running yet and the app isn't foregrounded —
          // leave it for the AppState listener below to retry.
        } else if (activityRef.current) {
          activityRef.current.end('default', props).catch((err) => {
            console.warn('[LiveActivity] end failed', err);
          });
          activityRef.current = null;
        }
      } catch (err) {
        console.warn('[LiveActivity] sync failed', err);
      }
    };

    sync();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => sub.remove();
  }, [pendingCount, shopName, onlineShopEnabled]);
}
