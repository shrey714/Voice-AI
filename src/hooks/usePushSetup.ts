import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { registerForPushNotifications } from '../services/pushNotifications';
import { useOnlineShopStore } from '../stores/useOnlineShopStore';
import { navigateTo } from '../navigation/navigationRef';

// Shared by both the live tap listener (app already running, foreground or
// backgrounded) and the cold-start check below (app launched BY tapping a
// notification) so the two routing paths can't drift out of sync.
//
// 'OnlineOrders' is nested two levels deep from the root navigator:
// RootTab → 'Online' → OnlineMainTabs' 'OnlineOrders' tab → its own
// OnlineOrdersStackNav → 'OnlineOrderDetail'. A previous version of this
// called switchAppMode('online') (a navigate('Online') on the root tab) and
// then, 350ms later, a SEPARATE navigateTo('OnlineOrders', ...) directly on
// the root ref — but 'OnlineOrders' isn't a root-level route name, so that
// second call always failed ("was not handled by any navigator"), delay or
// not. The fix is a single, fully-qualified nested navigate — React
// Navigation resolves the whole chain (mounting the lazy 'Online' portion if
// it hasn't been visited yet) atomically in one action; no manual delay needed.
function handleNotificationTap(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as any;
  if (data?.orderId) {
    navigateTo('Online', {
      screen: 'OnlineOrders',
      params: { screen: 'OnlineOrderDetail', params: { orderId: data.orderId } },
    });
  } else if (data?.screen === 'OnlineOrders') {
    navigateTo('Online', { screen: 'OnlineOrders' });
  }
}

// Re-derives and persists a fresh Expo push token, skipping the save if it's
// unchanged from what's already stored. Shared by the mount-time
// registration effect and the token-rotation listener below.
async function syncPushToken() {
  const token = await registerForPushNotifications();
  if (!token) return; // registerForPushNotifications already logged why
  if (token === useOnlineShopStore.getState().config.expoPushToken) return;
  try {
    await useOnlineShopStore.getState().savePushToken(token);
  } catch {
    // savePushToken already logged the failure — nothing more to do here.
  }
}

export function usePushSetup() {
  const shopId = useOnlineShopStore((s) => s.config.shopId);
  const fetchShopConfig = useOnlineShopStore((s) => s.fetchShopConfig);
  const responseListenerRef = useRef<Notifications.EventSubscription | null>(null);
  const tokenListenerRef = useRef<Notifications.EventSubscription | null>(null);

  // Config is no longer preloaded from local storage at launch — fetch it
  // here directly instead of assuming some other screen already did.
  useEffect(() => {
    fetchShopConfig();
  }, [fetchShopConfig]);

  // Only bother registering once the online shop has actually been set up —
  // there's nowhere to save a token without a shop row to attach it to. Runs
  // again whenever shopId changes (e.g. resolves after the initial fetch above).
  useEffect(() => {
    if (!shopId) return;
    syncPushToken();
  }, [shopId]);

  useEffect(() => {
    // In rare cases (Play Services reset, FCM re-registration) the
    // *underlying* native device token can roll while the app keeps running.
    // Without this listener a rotation is only ever picked up again the next
    // time `shopId` changes — for an already-signed-in shopkeeper, that could
    // be "never" until they reinstall. Note: the listener's own payload is
    // the raw native token, not the Expo-wrapped ExponentPushToken[...]
    // string the push API needs — so this re-derives via
    // registerForPushNotifications() rather than saving the payload as-is.
    tokenListenerRef.current = Notifications.addPushTokenListener(() => {
      syncPushToken();
    });
    return () => tokenListenerRef.current?.remove();
  }, []);

  useEffect(() => {
    // Tapping a notification while the app is already running (foreground or backgrounded).
    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener(handleNotificationTap);

    // Tapping a notification that COLD-STARTED the app — the listener above
    // only fires for taps received while it's already attached, which a
    // fresh launch is too late for by definition. This checks whether the
    // current launch was caused by a notification tap and replays it once
    // through the same handler. Must clear it afterwards: this value
    // persists across app restarts, so without clearing it, every *normal*
    // app open after a single notification tap would silently replay that
    // same stale navigation again.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      handleNotificationTap(response);
      Notifications.clearLastNotificationResponseAsync();
    });

    return () => {
      responseListenerRef.current?.remove();
    };
  }, []);
}
