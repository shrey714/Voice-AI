import { createRef } from 'react';
import { NavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createRef<NavigationContainerRef<any>>();

export function navigateTo(screen: string, params?: Record<string, any>) {
  navigationRef.current?.navigate(screen as any, params);
}

// The Local/Online portion switch IS a real navigate('Local' | 'Online') on
// the root tab navigator (see AppNavigator's RootTab.Navigator) — but code
// outside that component (push-notification deep links, Home's CTA card)
// doesn't have direct access to that navigator's `navigation` prop, only
// this module-level ref. AppNavigator registers a closure over its own
// `navigation` here once on mount; callers just fire-and-forget.
//
// For a deep link that also needs to land on a specific nested screen (e.g.
// a tapped order notification), don't call this and then separately
// navigateTo() the target screen — 'Online' is the root-level route, but
// anything inside it (like 'OnlineOrders') is nested further down and isn't
// reachable directly from this top-level ref. Use one fully-qualified nested
// navigateTo('Online', { screen: ..., params: { screen: ..., params: {...} } })
// call instead — see usePushSetup.ts's handleNotificationTap for the pattern.
type Mode = 'local' | 'online';
let modeSwitcher: ((mode: Mode) => void) | null = null;

export function registerModeSwitcher(fn: (mode: Mode) => void) {
  modeSwitcher = fn;
}

export function switchAppMode(mode: Mode) {
  modeSwitcher?.(mode);
}
