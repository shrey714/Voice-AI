import React, { useState, useCallback, useRef } from 'react';
import { StyleSheet, TouchableOpacity, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, interpolate, runOnJS } from 'react-native-reanimated';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';

const SEARCH_COLLAPSED_W = 38;

/**
 * A header search button that expands in place into a full-width input —
 * drop into any screen's `headerRight` via `navigation.setOptions`:
 *
 *   useEffect(() => {
 *     navigation.setOptions({
 *       headerRight: () => <HeaderSearchToggle onQueryChange={setSearch} placeholder="Search…" />,
 *     });
 *   }, [navigation]);
 *
 * Renders the same component instance across every `setOptions` call (as
 * long as it's used at the same header position each time), so its
 * open/query state and animation survive re-renders of the calling screen.
 *
 * Implementation notes (don't "simplify" these away without re-testing on
 * device — each one fixes a specific bug found the hard way):
 * - `position: absolute` on the box takes it out of the header row's flex
 *   flow, so the header title (flex:1) doesn't race it for space as the
 *   width animates — without this the title would balloon into unclaimed
 *   space mid-animation then get compressed back, causing a visible
 *   shift/gap. The box is positioned against `styles.wrapper`, a plain
 *   (non-absolute) `height: 38` element rendered alongside it — NOT against
 *   whatever header slot renders this component. That matters because
 *   native-stack's built-in native header (iOS) gives `headerRight` an
 *   intrinsic-content-sized container, not a guaranteed fixed-height one
 *   like the app's old custom AppHeader — a `top: '50%'` trick against a
 *   0-height parent would collapse this to nothing.
 * - Both the collapsed icon and the expanded input+close row stay mounted
 *   the whole time, cross-fading via opacity derived from the same width
 *   shared value — conditionally mounting/unmounting them on a boolean
 *   caused flicker, since React would swap children (and move keyboard
 *   focus) before the width animation had actually finished.
 * - Focus is triggered from the animation's own `withTiming` completion
 *   callback, not a separate `setTimeout`, so it can't fire early or race
 *   the animation.
 */
// AppHeader's back button (icon 24 + marginRight:8 - marginLeft:-4, see
// AppHeader.tsx's backBtn style) eats this much width from the row when
// present. Screens that aren't the first in their stack get a back arrow, so
// their expanded width needs to account for it too — otherwise the box comes
// up short and leaves a sliver of the arrow poking out on the left.
const BACK_BUTTON_RESERVE = 28;

export default function HeaderSearchToggle({
  onQueryChange,
  placeholder = 'Search…',
  rightOffset = 0,
  hasBackButton = false,
}: {
  onQueryChange: (q: string) => void;
  placeholder?: string;
  /** Reserves space to the right (e.g. for a sibling button pinned to the
   *  true header edge) — the box rests and expands leftward from this
   *  offset instead of the header's actual right edge. */
  rightOffset?: number;
  /** Set this true when the screen isn't the first in its stack (so
   *  AppHeader renders a back arrow) — reserves that arrow's width so the
   *  expanded box doesn't overlap/expose a sliver of it. */
  hasBackButton?: boolean;
}) {
  const { colors } = useAppTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const width = useSharedValue(SEARCH_COLLAPSED_W);
  const inputRef = useRef<TextInput>(null);

  const focusInput = useCallback(() => inputRef.current?.focus(), []);

  const openBox = useCallback(() => {
    const backReserve = hasBackButton ? BACK_BUTTON_RESERVE : 0;
    width.value = withTiming(screenWidth - 32 - rightOffset - backReserve, { duration: 280 }, (finished) => {
      if (finished) runOnJS(focusInput)();
    });
  }, [width, screenWidth, rightOffset, hasBackButton, focusInput]);

  const closeBox = useCallback(() => {
    width.value = withTiming(SEARCH_COLLAPSED_W, { duration: 240 });
    setQuery('');
    onQueryChange('');
  }, [width, onQueryChange]);

  const boxStyle = useAnimatedStyle(() => ({ width: width.value }));
  const collapsedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(width.value, [SEARCH_COLLAPSED_W, SEARCH_COLLAPSED_W + 40], [1, 0], 'clamp'),
  }));
  const expandedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(width.value, [SEARCH_COLLAPSED_W, SEARCH_COLLAPSED_W + 40], [0, 1], 'clamp'),
  }));
  const collapsedPointerEvents = useAnimatedStyle(() => ({
    display: width.value > SEARCH_COLLAPSED_W + 40 ? 'none' : 'flex',
  }));
  const expandedPointerEvents = useAnimatedStyle(() => ({
    display: width.value <= SEARCH_COLLAPSED_W + 40 ? 'none' : 'flex',
  }));

  return (
    <View style={styles.wrapper}>
      <Animated.View style={[styles.box, boxStyle, { right: rightOffset, backgroundColor: colors.surfaceHigh, borderColor: colors.border }]}>
        <Animated.View style={[StyleSheet.absoluteFillObject, collapsedStyle, collapsedPointerEvents]}>
          <TouchableOpacity onPress={openBox} style={styles.collapsedBtn} hitSlop={8}>
            <Ionicons name="search-outline" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </Animated.View>

        <Animated.View style={[styles.expandedRow, expandedStyle, expandedPointerEvents]}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            ref={inputRef}
            style={[styles.input, { color: colors.text }]}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={(t) => { setQuery(t); onQueryChange(t); }}
            returnKeyType="search"
          />
          <TouchableOpacity onPress={closeBox} hitSlop={8}>
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Plain (non-absolute) fixed-height element — establishes real layout
  // space regardless of what container renders this component, so `box`
  // below has something reliable to position itself against.
  wrapper: { height: 38, justifyContent: 'center' },
  box: {
    position: 'absolute', height: 38, top: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 8, overflow: 'hidden',
  },
  collapsedBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  expandedRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  input: { flex: 1, fontSize: 14, padding: 0, fontFamily: fonts.regular },
});
