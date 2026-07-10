import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { BackHandler, Dimensions, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModalProps,
} from '@gorhom/bottom-sheet';
import { useAppTheme } from '../../theme';

/**
 * AppBottomSheet — the only bottom sheet component this codebase should use.
 *
 * WHY THIS EXISTS (read before reaching for the plain `BottomSheet` again):
 * The plain (inline) `BottomSheet` from @gorhom/bottom-sheet renders inside the screen's
 * own view tree, which sits inside the app's swipeable tab pager (react-native-tab-view).
 * On Android, RNGH's gesture arena doesn't cleanly resolve the pager's pan handler against
 * the sheet's own pan-down-to-close / backdrop-tap gestures, so both stop working — iOS's
 * gesture system tolerates the nesting, Android doesn't. `BottomSheetModal` sidesteps this
 * entirely because it renders through a portal at the app root (see BottomSheetModalProvider
 * in App.tsx), outside the pager's gesture tree — this is why the calendar sheet always
 * worked fine on both platforms.
 *
 * ALWAYS use <AppBottomSheet> instead of raw <BottomSheet> / <BottomSheetModal> here.
 */

export interface AppBottomSheetRef {
  /** Open the sheet. */
  expand: () => void;
  present: () => void;
  /** Close the sheet. */
  close: () => void;
  dismiss: () => void;
  snapToIndex: (index: number) => void;
}

export interface AppBottomSheetProps
  extends Omit<
    BottomSheetModalProps,
    'backdropComponent' | 'onDismiss' | 'children'
  > {
  children: BottomSheetModalProps['children'];
  /** Called when the sheet has fully closed (mirrors BottomSheetModal's onDismiss). */
  onDismiss?: () => void;
  /** Opacity of the dim backdrop behind the sheet. Default 0.5. */
  backdropOpacity?: number;
  /** Override to disable tap-outside-to-close (rare). Default true. */
  closeOnBackdropPress?: boolean;
  /** Cap for dynamic sizing, as a fraction of screen height (0-1). Default 0.92 (92%). */
  maxDynamicContentSizeRatio?: number;
  /**
   * Horizontal margin applied around the floating (detached) sheet.
   * @default 16
   */
  horizontalMargin?: number;
}

/**
 * Content-driven height by default: the sheet grows/shrinks to fit its children instead of
 * needing hand-picked snapPoints per screen. Pass `snapPoints` explicitly to opt back into
 * fixed-height behaviour (e.g. long scrollable lists that should just take up most of the
 * screen regardless of content length).
 *
 * Flush-to-edge drawer by default (matches the classic bottom sheet look, and is the right
 * choice for anything tall/scrollable — detail views, long forms, filter panels, lists).
 * Pass `detached` to float it as a fully-rounded card instead — reserve that for small or
 * fixed-content sheets (an action menu, a 1-2 field quick form, a calendar picker) where a
 * compact floating card reads better than a drawer that only fills a third of the screen.
 */
const AppBottomSheet = forwardRef<AppBottomSheetRef, AppBottomSheetProps>(
  (
    {
      children,
      onDismiss,
      backdropOpacity = 0.5,
      closeOnBackdropPress = true,
      maxDynamicContentSizeRatio = 0.92,
      horizontalMargin = 16,
      snapPoints,
      enableDynamicSizing,
      enablePanDownToClose = true,
      detached = false,
      bottomInset,
      keyboardBehavior = 'interactive',
      keyboardBlurBehavior = 'restore',
      // Must mirror AndroidManifest's windowSoftInputMode (currently "adjustPan",
      // set via app.json's android.softwareKeyboardLayoutMode) — @gorhom/bottom-sheet
      // uses this to replicate the manifest's mode in its own JS-driven resize
      // logic, so it needs to know which native mode is actually active.
      android_keyboardInputMode = 'adjustPan',
      backgroundStyle,
      handleIndicatorStyle,
      style,
      onChange,
      ...rest
    },
    ref
  ) => {
    const { colors } = useAppTheme();
    const insets = useSafeAreaInsets();
    const sheetRef = useRef<BottomSheetModal>(null);
    const [isOpen, setIsOpen] = useState(false);
    // Clears the home indicator / nav bar with a bit of breathing room above it.
    const defaultBottomInset = insets.bottom + 12;

    const usesDynamicSizing = enableDynamicSizing ?? !snapPoints;

    useImperativeHandle(ref, () => ({
      expand: () => sheetRef.current?.present(),
      present: () => sheetRef.current?.present(),
      close: () => sheetRef.current?.dismiss(),
      dismiss: () => sheetRef.current?.dismiss(),
      snapToIndex: (index: number) => sheetRef.current?.snapToIndex(index),
    }));

    // Android hardware back closes the sheet instead of navigating the screen back.
    useEffect(() => {
      if (!isOpen) return;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        sheetRef.current?.dismiss();
        return true;
      });
      return () => sub.remove();
    }, [isOpen]);

    const handleChange = useCallback(
      (index: number) => {
        setIsOpen(index >= 0);
        (onChange as ((index: number) => void) | undefined)?.(index);
      },
      [onChange]
    );

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={backdropOpacity}
          pressBehavior={closeOnBackdropPress ? 'close' : 'none'}
        />
      ),
      [backdropOpacity, closeOnBackdropPress]
    );

    return (
      <BottomSheetModal
        ref={sheetRef}
        index={0}
        snapPoints={snapPoints}
        enableDynamicSizing={usesDynamicSizing}
        maxDynamicContentSize={
          usesDynamicSizing
            ? Dimensions.get('window').height * maxDynamicContentSizeRatio
            : undefined
        }
        enablePanDownToClose={enablePanDownToClose}
        detached={detached}
        bottomInset={detached ? bottomInset ?? defaultBottomInset : bottomInset}
        style={detached ? [{ marginHorizontal: horizontalMargin }, style as StyleProp<ViewStyle>] : style}
        backdropComponent={renderBackdrop}
        backgroundStyle={backgroundStyle ?? { backgroundColor: colors.surface }}
        handleIndicatorStyle={
          handleIndicatorStyle ?? { backgroundColor: colors.primary, width: 40 }
        }
        keyboardBehavior={keyboardBehavior}
        keyboardBlurBehavior={keyboardBlurBehavior}
        android_keyboardInputMode={android_keyboardInputMode}
        onChange={handleChange}
        onDismiss={onDismiss}
        {...rest}
      >
        {children}
      </BottomSheetModal>
    );
  }
);

AppBottomSheet.displayName = 'AppBottomSheet';

export default AppBottomSheet;
