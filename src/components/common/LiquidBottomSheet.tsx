import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import {
  Host as IOSHost,
  BottomSheet as IOSBottomSheet,
  Group as IOSGroup,
  RNHostView as IOSRNHostView,
} from '@expo/ui/swift-ui';
import { presentationDetents, presentationDragIndicator, type PresentationDetent } from '@expo/ui/swift-ui/modifiers';
import {
  Host as AndroidHost,
  ModalBottomSheet,
  RNHostView as AndroidRNHostView,
  type ModalBottomSheetRef,
} from '@expo/ui/jetpack-compose';
import { useAppTheme } from '../../theme';

export interface LiquidBottomSheetRef {
  expand: () => void;
  present: () => void;
  close: () => void;
  dismiss: () => void;
}

export interface LiquidBottomSheetProps {
  children: React.ReactNode;
  /** Called when the sheet has fully closed. */
  onDismiss?: () => void;
  /**
   * How tall the sheet grows. `undefined` (default) lets it size to fit its
   * content (iOS: `fitToContents`; Android: standard partial-expand behavior)
   * — pass an explicit fraction (0-1 of screen height) for content that
   * needs a fixed/large area (e.g. a long scrollable list).
   */
  heightFraction?: number;
}

/**
 * A bottom sheet that renders as a real native iOS 26 Liquid Glass sheet
 * (via @expo/ui's SwiftUI `BottomSheet`) and a real native Material 3 modal
 * bottom sheet on Android (via @expo/ui's Jetpack Compose `ModalBottomSheet`)
 * — same "native on both platforms, not just iOS" pattern as the app's
 * bottom tabs.
 *
 * Existing React Native content (forms, lists, whatever) is bridged in
 * unchanged via `RNHostView` — the reverse of `Host`, it mounts a regular RN
 * view tree inside the native SwiftUI/Compose hierarchy.
 *
 * Every sheet in the app now uses this (the old gorhom-based `AppBottomSheet`
 * is no longer used anywhere — kept in the codebase only in case a future
 * screen needs its `detached`/`snapPoints`/dynamic-sizing-ratio features,
 * which have no direct equivalent here: native sheets are always
 * edge-to-edge, and only support a single `heightFraction`, not multiple
 * snap points). Gorhom's `BottomSheetTextInput`/`BottomSheetScrollView` only
 * work inside gorhom's own sheet context — every former usage was swapped
 * for `LiquidTextField`/plain `ScrollView` here.
 */
const LiquidBottomSheet = forwardRef<LiquidBottomSheetRef, LiquidBottomSheetProps>(
  ({ children, onDismiss, heightFraction }, ref) => {
    const { colors, isDark } = useAppTheme();
    // `mounted` gates whether the native Host is in the React tree at all
    // (kept false whenever fully closed — see the touch-blocking comment
    // below). `presented` is the value actually bound to the native sheet's
    // `isPresented`/visibility — it's what drives the slide-down close
    // animation. These used to be the same single `isOpen` flag, which
    // meant calling `close()`/`dismiss()` set it straight to `false` and
    // *instantly* unmounted the Host mid-animation instead of letting the
    // native sheet slide out first — that's what was showing as a blank/
    // empty sheet flash every time a Cancel/X/Close button was tapped
    // (dragging the sheet down or tapping outside it never hit this path,
    // since those already went through the animation-complete callback
    // below first). Now `close()`/`dismiss()` only flip `presented` to
    // false and let the real native animation run; `mounted` only turns
    // off once that animation genuinely finishes.
    const [mounted, setMounted] = useState(false);
    const [presented, setPresented] = useState(false);
    const androidRef = useRef<ModalBottomSheetRef>(null);
    // Guards against unmounting/calling onDismiss twice when both the real
    // animation-complete callback AND the fallback timeout below end up
    // firing for the same close.
    const closedRef = useRef(false);
    // Tracks the fallback timeout below so a rapid close-then-reopen can
    // cancel a still-pending one — otherwise a stale timeout from the
    // PREVIOUS close could fire ~400ms after the sheet was freshly reopened
    // and force it shut again.
    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const finishClose = useCallback(() => {
      if (closedRef.current) return;
      closedRef.current = true;
      setPresented(false);
      setMounted(false);
      onDismiss?.();
    }, [onDismiss]);

    const open = useCallback(() => {
      if (closeTimeoutRef.current) { clearTimeout(closeTimeoutRef.current); closeTimeoutRef.current = null; }
      closedRef.current = false;
      setMounted(true);
      setPresented(true);
    }, []);

    const requestClose = useCallback(() => {
      if (Platform.OS === 'android') androidRef.current?.hide();
      setPresented(false);
      // `onIsPresentedChange`/`onDismissRequest` are designed around the
      // user dragging the sheet down or tapping outside it — that's a
      // native-gesture-initiated dismissal, and reliably calls back into
      // JS. Closing via a button INSIDE the sheet (Cancel/X/Confirm) instead
      // drives the dismissal by flipping this `presented` prop from JS,
      // and that callback does NOT reliably fire back for a JS-originated
      // change — which meant `mounted` silently got stuck at `true` forever
      // after every button-driven close. Since `mounted` gates the
      // always-invisible full-screen overlay's `pointerEvents: 'box-none'`
      // Host (see the comment on `mounted` above), getting stuck mounted
      // silently broke scrolling/taps on the ENTIRE screen underneath —
      // exactly what was reported as "screen becomes unresponsive" after
      // closing via a button. This timeout is a fallback net: if the real
      // callback hasn't fired within roughly the native dismiss animation's
      // duration, force the unmount anyway so it can never get stuck.
      closeTimeoutRef.current = setTimeout(finishClose, 400);
    }, [finishClose]);

    useImperativeHandle(ref, () => ({
      expand: open,
      present: open,
      close: requestClose,
      dismiss: requestClose,
    }));

    const handleIOSPresentedChange = useCallback((isPresented: boolean) => {
      setPresented(isPresented);
      if (!isPresented) finishClose();
    }, [finishClose]);

    const handleAndroidDismissRequest = useCallback(() => {
      finishClose();
    }, [finishClose]);

    // `Host` defaults to following the OS's system appearance if
    // `colorScheme` isn't set — but this app's dark mode is its own setting
    // (can be forced on/off independent of the system, see theme/index.tsx).
    const colorScheme = isDark ? 'dark' : 'light';

    // Only mount the native sheet apparatus while actually open (i.e. not
    // fully closed) — on BOTH platforms. This used to be Android-only
    // (`if (!isOpen) return null` was below, after the iOS branch), which
    // meant the iOS `Host` was *always* mounted as a full-screen
    // `absoluteFill` overlay with `pointerEvents: 'box-none'`, even
    // while the sheet was closed. `Host` is a custom Fabric-hosted native
    // view (bridging to a UIHostingController), not a plain RN `View` — its
    // `pointerEvents` translation to native hit-testing apparently doesn't
    // behave the same way plain RN views do, and that permanently-mounted
    // invisible overlay was swallowing touches for the ENTIRE screen
    // underneath it (broke scrolling, broke every button) on every screen
    // that used a bottom sheet — while screens with no sheet at all worked
    // perfectly. Unmounting once genuinely closed sidesteps this regardless
    // of the exact native cause, and as a side effect forces a fresh mount
    // (picking up the current `colorScheme`) each time the sheet opens,
    // instead of relying on a prop update reaching an already-mounted
    // native view correctly. Gating on `mounted` (not `presented`) is what
    // keeps the Host alive through the close *animation* — see the comment
    // on those two state variables above.
    if (!mounted) return null;

    if (Platform.OS === 'ios') {
      const detents: PresentationDetent[] = heightFraction ? [{ fraction: heightFraction }] : ['medium', 'large'];
      return (
        <IOSHost colorScheme={colorScheme} style={[StyleSheet.absoluteFill, { pointerEvents: 'box-none' }]}>
          <IOSBottomSheet isPresented={presented} onIsPresentedChange={handleIOSPresentedChange} fitToContents={!heightFraction}>
            {/* No explicit `background()` here on purpose. The earlier fix
                painted a solid theme color over this group to work around
                dark mode not reaching the sheet's system-drawn chrome — but
                that chrome (background material, grabber) is drawn by UIKit
                from the *real* window trait collection, not from anything
                SwiftUI's `.environment(\.colorScheme, …)` (which is all
                `Host`'s colorScheme prop sets — confirmed in HostView.swift)
                can reach, and painting over it produced a flat color instead
                of genuine glass, plus visibly broke on overscroll/rubber-band
                (revealing the real system background at the edges). The
                actual fix is in theme/index.tsx: `Appearance.setColorScheme()`
                now forces the app's own dark-mode setting into the real
                UIKit trait collection app-wide, so this sheet's native
                material follows it correctly on its own — no paint-over
                needed. */}
            <IOSGroup modifiers={[
              presentationDetents(detents),
              presentationDragIndicator('visible'),
            ]}>
              <IOSRNHostView matchContents>
                <View>{children}</View>
              </IOSRNHostView>
            </IOSGroup>
          </IOSBottomSheet>
        </IOSHost>
      );
    }

    return (
      <AndroidHost colorScheme={colorScheme} style={[StyleSheet.absoluteFill, { pointerEvents: 'box-none' }]}>
        <ModalBottomSheet
          ref={androidRef}
          onDismissRequest={handleAndroidDismissRequest}
          containerColor={colors.surface}
        >
          <AndroidRNHostView matchContents>
            <View>{children}</View>
          </AndroidRNHostView>
        </ModalBottomSheet>
      </AndroidHost>
    );
  }
);

LiquidBottomSheet.displayName = 'LiquidBottomSheet';

export default LiquidBottomSheet;
