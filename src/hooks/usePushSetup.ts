import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { registerForPushNotifications } from '../services/pushNotifications';
import { useOnlineShopStore } from '../stores/useOnlineShopStore';
import { navigateTo, switchAppMode } from '../navigation/navigationRef';

export function usePushSetup() {
  const { config, fetchShopConfig, savePushToken, saveConfigToSupabase } = useOnlineShopStore();
  const responseListenerRef = useRef<Notifications.EventSubscription | null>(null);

  // Config is no longer preloaded from local storage at launch — fetch it
  // here directly instead of assuming some other screen already did.
  useEffect(() => {
    fetchShopConfig();
  }, []);

  useEffect(() => {
    // Only bother registering if online shop has been set up
    if (!config.shopId) return;

    (async () => {
      const token = await registerForPushNotifications();
      if (!token || token === config.expoPushToken) return;

      savePushToken(token);
      // persist to Supabase so edge function can find it
      saveConfigToSupabase().catch(() => null);
    })();
  }, [config.shopId]);

  useEffect(() => {
    // Handles tapping a notification while app is running or in background
    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as any;
        if (data?.orderId) {
          // Switch portions first (a fresh mount of OnlineMainTabs), then
          // drill into the Orders tab's stack once it exists — mirrors the
          // old tab-then-screen delay, just one step deeper now that Online
          // Shop is its own portion instead of living under More.
          switchAppMode('online');
          setTimeout(() => navigateTo('OnlineOrders', { screen: 'OnlineOrderDetail', params: { orderId: data.orderId } }), 350);
        } else if (data?.screen === 'OnlineOrders') {
          switchAppMode('online');
          setTimeout(() => navigateTo('OnlineOrders'), 350);
        }
      }
    );

    return () => {
      responseListenerRef.current?.remove();
    };
  }, []);
}
