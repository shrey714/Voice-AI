import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

/** True once we've confirmed a working internet connection. Starts `false`
 * so screens that require connectivity to save (e.g. shop profile) don't
 * flash an enabled Save button before the first NetInfo check resolves. */
export function useIsOnline(): boolean {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    });
    NetInfo.fetch().then((state) => {
      setIsOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    });
    return unsubscribe;
  }, []);

  return isOnline;
}
