import { createRef } from 'react';
import { NavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createRef<NavigationContainerRef<any>>();

export function navigateTo(screen: string, params?: Record<string, any>) {
  navigationRef.current?.navigate(screen as any, params);
}

// The Local/Online portion switch lives as plain state in AppNavigator (see
// its comment for why), not as a navigable route — so code outside that
// component (push-notification deep links, Home's CTA card) needs a way to
// flip it without prop-drilling. AppNavigator registers its setter here once
// on mount; callers just fire-and-forget.
type Mode = 'local' | 'online';
let modeSwitcher: ((mode: Mode) => void) | null = null;

export function registerModeSwitcher(fn: (mode: Mode) => void) {
  modeSwitcher = fn;
}

export function switchAppMode(mode: Mode) {
  modeSwitcher?.(mode);
}
