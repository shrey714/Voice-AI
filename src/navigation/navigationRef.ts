import { createRef } from 'react';
import { CommonActions, NavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createRef<NavigationContainerRef<any>>();

export function navigateTo(screen: string, params?: Record<string, any>) {
  navigationRef.current?.navigate(screen as any, params);
}

// The Local/Online portion switch resets the root stack to a single
// 'Local' | 'Online' route (see AppNavigator's RootStack.Navigator) — this
// module-level ref is what lets code outside that component (push-notification
// deep links, Home's CTA card) reach it without prop-drilling.
//
// For a deep link that also needs to land on a specific nested screen (e.g.
// a tapped order notification), don't call this and then separately
// navigateTo() the target screen — 'Online' is the root-level route, but
// anything inside it (like 'OnlineOrders') is nested further down and isn't
// reachable directly from this top-level ref. Use one fully-qualified nested
// navigateTo('Online', { screen: ..., params: { screen: ..., params: {...} } })
// call instead — see usePushSetup.ts's handleNotificationTap for the pattern.
type Mode = 'local' | 'online';

// A plain `navigate('Local' | 'Online')` was pushing a new root-stack entry
// on every toggle instead of collapsing back to the existing one — after N
// Local<->Online toggles, the hardware/gesture back button needed N presses
// to actually leave, landing on stale intermediate copies of each screen
// along the way. `reset()` sets the root stack to exactly one route (the
// target mode) every time, so there's nothing left to accumulate regardless
// of the exact cause of the push behavior.
export function switchAppMode(mode: Mode) {
  navigationRef.current?.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: mode === 'online' ? 'Online' : 'Local' }],
    })
  );
}
