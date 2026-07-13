import React, { useState } from 'react';
import { View, LayoutChangeEvent, type ImageSourcePropType } from 'react-native';
import { Text } from 'react-native-paper';
import { type SFSymbol } from 'sf-symbols-typescript';
import { Host, Button, Icon, Row, Text as UniversalText } from '@expo/ui';
import { buttonStyle, tint, opacity, frame, cornerRadius } from '@expo/ui/swift-ui/modifiers';
import { background, border, clip, height as composeHeight, Shapes, width as composeWidth } from '@expo/ui/jetpack-compose/modifiers';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';

export type LiquidButtonVariant = 'glass' | 'glassProminent' | 'destructive';

// The `icon` prop is an SF Symbol name (iOS-only concept) — Android has no
// equivalent, so it's mapped to the matching Material Symbols XML asset for
// @expo/ui's universal `Icon` (which needs a bundled vector asset on
// Android, not an arbitrary RN icon component). Unmapped/future symbols fall
// back to text-only on Android (safer than guessing a mismatched icon).
const SF_TO_MATERIAL: Partial<Record<SFSymbol, ImageSourcePropType>> = {
  'arrow.right': require('@expo/material-symbols/arrow_forward.xml'),
  'arrow.uturn.backward': require('@expo/material-symbols/undo.xml'),
  'bag.fill': require('@expo/material-symbols/shopping_bag.xml'),
  'checkmark': require('@expo/material-symbols/check.xml'),
  'checkmark.circle': require('@expo/material-symbols/check_circle.xml'),
  'checkmark.circle.fill': require('@expo/material-symbols/check_circle.xml'),
  'doc.text': require('@expo/material-symbols/description.xml'),
  'eye': require('@expo/material-symbols/visibility.xml'),
  'icloud.and.arrow.down': require('@expo/material-symbols/cloud_download.xml'),
  'icloud.and.arrow.up': require('@expo/material-symbols/cloud_upload.xml'),
  'location.fill': require('@expo/material-symbols/my_location.xml'),
  'lock.fill': require('@expo/material-symbols/lock.xml'),
  'play.fill': require('@expo/material-symbols/play_arrow.xml'),
  'plus': require('@expo/material-symbols/add.xml'),
  'qrcode': require('@expo/material-symbols/qr_code.xml'),
  'square.and.arrow.down': require('@expo/material-symbols/download.xml'),
  'square.and.arrow.up': require('@expo/material-symbols/share.xml'),
  'square.grid.2x2': require('@expo/material-symbols/grid_view.xml'),
  'xmark': require('@expo/material-symbols/close.xml'),
};

/**
 * A button that renders as real native iOS 26 Liquid Glass on iOS and a real
 * native Jetpack Compose button on Android — one shared render path via
 * `@expo/ui`'s stable SDK 56 universal `Button`/`Icon`/`Row` (`@expo/ui`,
 * not the old platform-split `@expo/ui/swift-ui`-only iOS branch + plain RN
 * `PressableScale` Android fallback).
 *
 * Universal `Button`'s `'filled'` variant maps to SwiftUI's
 * `borderedProminent` style on iOS, not the native Liquid Glass material —
 * a user-supplied `buttonStyle` modifier takes ownership of that slot and
 * overrides it (see LiquidHeaderIconButton for the same pattern), which is
 * how this keeps the real `glassProminent` look. Every variant uses the
 * SAME native style — only the tint color differs. `glass` (unfilled/
 * outline) and `glassProminent` (filled) are genuinely two different native
 * styles with their own internal sizing/chrome, and no amount of manually
 * layering a background/frame onto `glass` ever made it render at the same
 * size as `glassProminent` — they're just not the same shape under the
 * hood. Forcing every variant through the identical style, and only varying
 * the tint (a muted `surfaceHigh` grey for `glass`/secondary actions), is
 * what actually guarantees Cancel/Save-style button pairs come out
 * pixel-identical in size.
 *
 * For `fullWidth`, the native `frame`/`width` modifiers need a concrete
 * pixel width, not `maxWidth: Infinity` (doesn't survive the JSON bridge)
 * — this measures its own available width via `onLayout` and passes a
 * concrete pixel width, same on both platforms since both now render
 * through a native `Host`.
 */
export default function LiquidButton({
  title,
  onPress,
  icon,
  variant = 'glassProminent',
  tintColor: tintColorOverride,
  disabled = false,
  loading = false,
  height = 54,
  fullWidth = true,
  style,
}: {
  title: string;
  onPress: () => void;
  icon?: SFSymbol;
  variant?: LiquidButtonVariant;
  /** Overrides the variant's default tint (primary/danger) — e.g. a success green. */
  tintColor?: string;
  disabled?: boolean;
  loading?: boolean;
  height?: number;
  fullWidth?: boolean;
  style?: any;
}) {
  const { colors } = useAppTheme();
  const isDisabled = disabled || loading;
  const [rowWidth, setRowWidth] = useState(0);
  const [labelWidth, setLabelWidth] = useState(0);

  const tintColor = tintColorOverride ?? (
    variant === 'destructive' ? colors.danger
    : variant === 'glass' ? colors.surfaceHigh
    : colors.primary
  );
  const fg = variant === 'glass' ? colors.text : '#fff';

  const onRowLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== rowWidth) setRowWidth(w);
  };
  // A caller puts two `fullWidth` buttons side by side by giving each
  // `style={{ flex: 1 }}` (e.g. Cancel/Save pairs). Forcing `width: '100%'`
  // onto the SAME wrapping View in that case fights the caller's own
  // `flex: 1` in Yoga's layout — `width: 100%` and `flex: 1` together don't
  // reliably resolve to "half the row" the way you'd expect, which is
  // exactly what was producing the "tiny pill floating in an oversized
  // empty flex slot" look. Only fall back to an explicit `width: '100%'`
  // when the caller ISN'T already sizing this via flex — letting a real
  // `flex`/`flexGrow` in `style` win outright otherwise.
  const callerControlsWidth = style && (style.flex != null || style.flexGrow != null || style.width != null);
  const outerWidthStyle = fullWidth && !callerControlsWidth ? { width: '100%' as const } : !fullWidth ? { alignSelf: 'flex-start' as const } : null;
  // For `fullWidth`, target = the row's available width. For a compact
  // button, `matchContents` (letting the native toolkit size itself to its
  // own content) turned out to be exactly as unreliable as the width-prop
  // issue below — buttons using it were rendering stuck at a tiny/near-
  // invisible size (e.g. the date-range sheet's "Confirm"). So instead of
  // trusting either the native intrinsic sizing OR a post-mount prop
  // update, a compact button's target width is computed the same way
  // CollapsibleFab measures its label: an invisible off-screen RN `Text`
  // using this same bold font, plus fixed padding/icon allowance — a
  // deterministic RN-side measurement, not a native-side guess.
  const iconAllowance = icon ? 30 : 0;
  const compactWidth = labelWidth > 0 ? Math.ceil(labelWidth) + 56 + iconAllowance : 0;
  const targetWidth = fullWidth ? rowWidth : compactWidth;

  // Reserve layout space at `height` immediately so nothing jumps once the
  // real width is measured on the first layout pass.
  if (targetWidth === 0) {
    return (
      <View style={[outerWidthStyle, { height }, style]} onLayout={fullWidth ? onRowLayout : undefined}>
        {/* `position: 'absolute'` here would make this Text NOT contribute
            to the wrapping View's size at all (absolutely positioned
            children are removed from normal layout flow) — with
            `alignSelf: 'flex-start'` and no explicit width on that wrapping
            View, it would then have nothing to size itself against and
            collapse to zero width, disappearing entirely. This is exactly
            why compact buttons in a row (e.g. a queue's "Skip" button) were
            vanishing. Keeping this Text in normal flow (just invisible via
            `opacity: 0`) means the wrapping View naturally sizes to it
            while still not being visibly double-rendered. */}
        {!fullWidth && (
          <Text
            numberOfLines={1}
            style={{ opacity: 0, fontFamily: fonts.bold, fontSize: 16 }}
            onLayout={(e) => { const w = e.nativeEvent.layout.width; if (w > 0 && w !== labelWidth) setLabelWidth(w); }}
          >{title}</Text>
        )}
      </View>
    );
  }

  const materialIcon = icon ? SF_TO_MATERIAL[icon] : undefined;

  return (
    <View style={[fullWidth ? { width: '100%' } : { alignSelf: 'flex-start' }, { height }, style]} onLayout={fullWidth ? onRowLayout : undefined}>
      {/* `key={targetWidth}` forces a fresh `Host` mount whenever the target
          width changes, instead of updating an already-mounted one's
          `style.width` prop. `Host` is a custom Fabric-hosted view — its
          native content doesn't reliably re-layout just because a size prop
          changed post-mount. If the very first layout pass ever reports a
          transient/too-small width (plausible while a bottom sheet's
          content is still settling), the button was getting stuck rendering
          small forever — a correctly-sized wrapping View around a Host that
          never actually grew, which is exactly the "small pill floating in
          a big empty box" look. Remounting on every width change guarantees
          it's always built fresh with the final correct size. */}
      <Host key={targetWidth} style={{ width: targetWidth, height }}>
        <Button
          variant="filled"
          onPress={isDisabled ? undefined : onPress}
          modifiers={[
            // `frame`/`width`+`height` first, same reasoning as
            // LiquidTextField: modifiers apply to the view's size at that
            // point, so anything sizing or painting the box needs the
            // concrete pixel size locked in before it, not after.
            frame({ width: targetWidth, height }),
            composeWidth(targetWidth),
            composeHeight(height),
            buttonStyle('glassProminent'),
            tint(tintColor),
            cornerRadius(height / 2),
            // Disabling via the native `disabled` prop above (not just a
            // dimmed opacity) lets the system override the tint with a flat
            // neutral grey for "legibility" on iOS — which on an
            // already-transparent glass sheet made disabled buttons nearly
            // invisible instead of just dim. Blocking the press via
            // `onPress={undefined}` and dimming via `opacity` instead keeps
            // our own tint color visible, just faded.
            opacity(isDisabled ? 0.4 : 1),
            // Android has no glass material — solid themed pill instead,
            // same visual language as `LiquidHeaderIconButton`'s Android
            // fallback.
            background(tintColor + (isDisabled ? '80' : 'FF')),
            border(0, 'transparent'),
            clip(Shapes.RoundedCorner(height / 2)),
          ]}
        >
          <Row alignment="center" spacing={8}>
            {materialIcon && <Icon name={{ ios: icon!, android: materialIcon }} size={18} color={fg} />}
            <UniversalText textStyle={{ fontFamily: fonts.bold, fontSize: 15, color: fg }}>
              {loading ? 'Loading…' : title}
            </UniversalText>
          </Row>
        </Button>
      </Host>
    </View>
  );
}
