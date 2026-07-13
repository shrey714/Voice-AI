import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { View } from 'react-native';
import { BottomSheet as UniversalBottomSheet, RNHostView, type SnapPoint } from '@expo/ui';

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
   * content — pass an explicit fraction (0-1 of screen height) for content
   * that needs a fixed/large area (e.g. a long scrollable list).
   */
  heightFraction?: number;
}

/**
 * A bottom sheet that renders as a real native iOS 26 Liquid Glass sheet and
 * a real native Material 3 modal bottom sheet on Android — via `@expo/ui`'s
 * stable SDK 56 universal `BottomSheet` (`@expo/ui`, not the old
 * platform-split `@expo/ui/swift-ui` / `@expo/ui/jetpack-compose` imports).
 *
 * The universal component owns its own animation-aware mount/unmount
 * lifecycle internally (confirmed by reading its source: Android's
 * implementation only unmounts after its own `hide()` promise resolves,
 * iOS's forwards `onIsPresentedChange` straight to `onDismiss`), which is
 * exactly the "wait for the native close animation to finish before tearing
 * down, whether the user dragged the sheet down OR tapped a Cancel/Confirm
 * button inside it" behavior this component used to hand-roll itself with a
 * `mounted`/`presented` two-state dance and a fallback timeout — that's no
 * longer needed here. Its internal anchor `Host` is also always
 * `pointerEvents: 'none'` (not the previous `'box-none'`), which is correct
 * because SwiftUI/Compose sheet presentations render in their own
 * presentation layer above the view tree, not as a normal hit-testable
 * subview — so this component is always mounted (just toggling
 * `isPresented`), not conditionally unmounted like before.
 *
 * Existing React Native content (forms, lists, whatever) is bridged in
 * unchanged via `RNHostView` — the reverse of `Host`, it mounts a regular RN
 * view tree inside the native SwiftUI/Compose hierarchy.
 *
 * Every sheet in the app uses this (the old gorhom-based `AppBottomSheet` has
 * been removed — see AGENTS.md). Native sheets are always edge-to-edge, and
 * only support a single `heightFraction`, not multiple snap points.
 */
const LiquidBottomSheet = forwardRef<LiquidBottomSheetRef, LiquidBottomSheetProps>(
  ({ children, onDismiss, heightFraction }, ref) => {
    const [isPresented, setIsPresented] = useState(false);

    useImperativeHandle(ref, () => ({
      expand: () => setIsPresented(true),
      present: () => setIsPresented(true),
      close: () => setIsPresented(false),
      dismiss: () => setIsPresented(false),
    }));

    const snapPoints: SnapPoint[] | undefined = heightFraction ? [{ fraction: heightFraction }] : undefined;

    return (
      <UniversalBottomSheet
        isPresented={isPresented}
        onDismiss={() => { setIsPresented(false); onDismiss?.(); }}
        snapPoints={snapPoints}
      >
        <RNHostView matchContents>
          <View>{children}</View>
        </RNHostView>
      </UniversalBottomSheet>
    );
  }
);

LiquidBottomSheet.displayName = 'LiquidBottomSheet';

export default LiquidBottomSheet;
