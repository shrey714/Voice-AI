import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Requests permission (if needed), sets up the Android notification channel,
 * and mints an Expo push token for this install.
 *
 * Every early-return/throw is logged with a `[push]` prefix — a failure here
 * (denied permission, missing projectId, the token call itself throwing)
 * used to be silent, which made a dead/stale token in Supabase
 * indistinguishable from "registration never ran". Wrapping the whole body
 * in try/catch (not just the final token request) matters too: any of the
 * awaited calls throwing becomes an unhandled promise rejection otherwise,
 * which Metro prints as an easy-to-miss ERROR line instead of a traceable
 * warning here.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    if (!Device.isDevice) {
      console.warn('[push] skipped — running on a simulator/emulator, not a physical device');
      return null;
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    const finalStatus = existing === 'granted'
      ? existing
      : (await Notifications.requestPermissionsAsync()).status;

    if (finalStatus !== 'granted') {
      console.warn(`[push] permission not granted (status: ${finalStatus})`);
      return null;
    }

    if (Platform.OS === 'android') {
      // No `sound` key here on purpose — expo-notifications' Android channel
      // manager treats any string value (including the literal 'default') as
      // a filename to resolve against bundled sound resources; the system's
      // actual default notification sound only kicks in when the key is
      // omitted entirely. We ship no custom sound files (see app.json's
      // expo-notifications plugin `sounds: []`), so omit it here too.
      await Notifications.setNotificationChannelAsync('online-orders', {
        name: 'Online Orders',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#5B7567',
      });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn('[push] no EAS projectId found in app config — cannot request a push token');
      return null;
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch (e) {
    console.warn('[push] registerForPushNotifications() threw:', e);
    return null;
  }
}
