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
    const [isOpen, setIsOpen] = useState(false);
    const androidRef = useRef<ModalBottomSheetRef>(null);

    useImperativeHandle(ref, () => ({
      expand: () => setIsOpen(true),
      present: () => setIsOpen(true),
      close: () => {
        if (Platform.OS === 'android') androidRef.current?.hide();
        setIsOpen(false);
      },
      dismiss: () => {
        if (Platform.OS === 'android') androidRef.current?.hide();
        setIsOpen(false);
      },
    }));

    const handleIOSPresentedChange = useCallback((presented: boolean) => {
      setIsOpen(presented);
      if (!presented) onDismiss?.();
    }, [onDismiss]);

    const handleAndroidDismissRequest = useCallback(() => {
      setIsOpen(false);
      onDismiss?.();
    }, [onDismiss]);

    // `Host` defaults to following the OS's system appearance if
    // `colorScheme` isn't set — but this app's dark mode is its own setting
    // (can be forced on/off independent of the system, see theme/index.tsx).
    const colorScheme = isDark ? 'dark' : 'light';

    // Only mount the native sheet apparatus while actually open — on BOTH
    // platforms. This used to be Android-only (`if (!isOpen) return null`
    // was below, after the iOS branch), which meant the iOS `Host` was
    // *always* mounted as a full-screen `absoluteFillObject` overlay with
    // `pointerEvents: 'box-none'`, even while the sheet was closed. `Host`
    // is a custom Fabric-hosted native view (bridging to a UIHostingController),
    // not a plain RN `View` — its `pointerEvents` translation to native
    // hit-testing apparently doesn't behave the same way plain RN views do,
    // and that permanently-mounted invisible overlay was swallowing touches
    // for the ENTIRE screen underneath it (broke scrolling, broke every
    // button) on every screen that used a bottom sheet — while screens with
    // no sheet at all worked perfectly. Unmounting entirely when closed
    // sidesteps this regardless of the exact native cause, and as a side
    // effect forces a fresh mount (picking up the current `colorScheme`)
    // each time the sheet opens, instead of relying on a prop update
    // reaching an already-mounted native view correctly.
    if (!isOpen) return null;

    if (Platform.OS === 'ios') {
      const detents: PresentationDetent[] = heightFraction ? [{ fraction: heightFraction }] : ['medium', 'large'];
      return (
        <IOSHost colorScheme={colorScheme} style={[StyleSheet.absoluteFillObject, { pointerEvents: 'box-none' }]}>
          <IOSBottomSheet isPresented={isOpen} onIsPresentedChange={handleIOSPresentedChange} fitToContents={!heightFraction}>
            <IOSGroup modifiers={[presentationDetents(detents), presentationDragIndicator('visible')]}>
              <IOSRNHostView matchContents>
                <View>{children}</View>
              </IOSRNHostView>
            </IOSGroup>
          </IOSBottomSheet>
        </IOSHost>
      );
    }

    return (
      <AndroidHost colorScheme={colorScheme} style={[StyleSheet.absoluteFillObject, { pointerEvents: 'box-none' }]}>
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
