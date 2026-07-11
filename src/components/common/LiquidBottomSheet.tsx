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
 * NOT a drop-in replacement for every `AppBottomSheet` usage yet: gorhom's
 * `BottomSheetTextInput`/`BottomSheetScrollView` only work inside gorhom's
 * own sheet context and must be swapped for plain equivalents (e.g.
 * `LiquidTextField`) before converting a screen that uses them — this is
 * intentionally being proven on simple, no-text-input sheets first (see
 * DatePickerSheet) before touching anything with keyboard interaction.
 * There's also no native equivalent for `AppBottomSheet`'s `detached`
 * (floating rounded-card) variant — native sheets are always edge-to-edge.
 */
const LiquidBottomSheet = forwardRef<LiquidBottomSheetRef, LiquidBottomSheetProps>(
  ({ children, onDismiss, heightFraction }, ref) => {
    const { colors } = useAppTheme();
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

    if (Platform.OS === 'ios') {
      const detents: PresentationDetent[] = heightFraction ? [{ fraction: heightFraction }] : ['medium', 'large'];
      return (
        <IOSHost style={[StyleSheet.absoluteFillObject, { pointerEvents: 'box-none' }]}>
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

    if (!isOpen) return null;
    return (
      <AndroidHost style={[StyleSheet.absoluteFillObject, { pointerEvents: 'box-none' }]}>
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
