import React, { useState } from 'react';
import { Platform, TouchableOpacity, View, LayoutChangeEvent } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { type SFSymbol } from 'sf-symbols-typescript';
import { Host, Button, Icon, Row, Text as UniversalText } from '@expo/ui';
import { buttonStyle, tint, opacity, frame, cornerRadius } from '@expo/ui/swift-ui/modifiers';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';

export type LiquidButtonVariant = 'glass' | 'glassProminent' | 'destructive';

// The `icon` prop is an SF Symbol name (iOS-only concept) — Android has no
// equivalent, so it's mapped to the matching Ionicons name for the plain RN
// `Ionicons` component used on Android (see the Android render branch
// below). Unmapped/future symbols fall back to text-only on Android (safer
// than guessing a mismatched icon).
const SF_TO_IONICONS: Partial<Record<SFSymbol, React.ComponentProps<typeof Ionicons>['name']>> = {
  'arrow.right': 'arrow-forward',
  'arrow.uturn.backward': 'arrow-undo',
  'bag.fill': 'bag',
  'checkmark': 'checkmark',
  'checkmark.circle': 'checkmark-circle-outline',
  'checkmark.circle.fill': 'checkmark-circle',
  'doc.text': 'document-text-outline',
  'eye': 'eye-outline',
  'icloud.and.arrow.down': 'cloud-download-outline',
  'icloud.and.arrow.up': 'cloud-upload-outline',
  'location.fill': 'location',
  'lock.fill': 'lock-closed',
  'play.fill': 'play',
  'plus': 'add',
  'qrcode': 'qr-code-outline',
  'square.and.arrow.down': 'download-outline',
  'square.and.arrow.up': 'share-outline',
  'square.grid.2x2': 'grid-outline',
  'xmark': 'close',
};

/**
 * A button that renders as real native iOS 26 Liquid Glass on iOS via
 * `@expo/ui`'s universal `Button`. Android renders as a plain RN
 * `TouchableOpacity` pill instead of `@expo/ui`'s universal Jetpack Compose
 * `Button`: that Compose `Button` carries its own default Material
 * shape/min-size/elevation that manual `clip`/`background` overrides never
 * fully suppressed — visible as a gray box behind the intended pill shape,
 * same issue `LiquidHeaderIconButton` had. A plain RN touchable has no such
 * intrinsics to fight.
 *
 * Every variant uses the SAME native style on iOS — only the tint color
 * differs. `glass` (unfilled/outline) and `glassProminent` (filled) are
 * genuinely two different native styles with their own internal
 * sizing/chrome, and no amount of manually layering a background/frame onto
 * `glass` ever made it render at the same size as `glassProminent` — they're
 * just not the same shape under the hood. Forcing every variant through the
 * identical style, and only varying the tint (a muted `surfaceHigh` grey for
 * `glass`/secondary actions), is what actually guarantees Cancel/Save-style
 * button pairs come out pixel-identical in size.
 *
 * For `fullWidth`, the native `frame`/`width` modifiers need a concrete
 * pixel width, not `maxWidth: Infinity` (doesn't survive the JSON bridge)
 * — this measures its own available width via `onLayout` and passes a
 * concrete pixel width.
 */
export default function LiquidButton({
  title,
  onPress,
  icon,
  variant = 'glassProminent',
  tintColor: tintColorOverride,
  textColor: textColorOverride,
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
  /**
   * Overrides the variant's default text/icon color (`'#fff'` for
   * `glassProminent`/`destructive`, `colors.text` for `glass`). Needed
   * whenever `tintColor` is overridden to something light (e.g. a cream
   * pill on a colored background) — the default white text would otherwise
   * render at near-zero contrast against it.
   */
  textColor?: string;
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
  const fg = textColorOverride ?? (variant === 'glass' ? colors.text : '#fff');

  const onRowLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== rowWidth) setRowWidth(w);
  };
  // `onLayout`'s reported width is the wrapping View's own full box — it is
  // NOT reduced by that same View's own `paddingHorizontal`/`padding` (RN
  // gives the assigned box size, not the post-padding content size). Since
  // `style` (which may carry a caller's own padding, e.g. a `btnRow: {
  // paddingHorizontal: 8 }`) is applied to this SAME wrapping View, using
  // the raw `rowWidth` as the pill's own width made it exactly
  // `paddingLeft + paddingRight` wider than the space actually available
  // inside the padding — the pill's right edge bled past the padded
  // content edge and got visibly clipped there (e.g. Supplier/Expense
  // forms' "Save" button). Subtracting the caller's own horizontal padding
  // back out gives the real available content width.
  const stylePaddingH = (s: any): number => {
    if (!s) return 0;
    if (Array.isArray(s)) return s.reduce((sum: number, x: any) => sum + stylePaddingH(x), 0);
    const left = s.paddingLeft ?? s.paddingHorizontal ?? s.padding ?? 0;
    const right = s.paddingRight ?? s.paddingHorizontal ?? s.padding ?? 0;
    return left + right;
  };
  const contentWidth = Math.max(0, rowWidth - stylePaddingH(style));
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
  const targetWidth = fullWidth ? contentWidth : compactWidth;

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

  if (Platform.OS !== 'ios') {
    const ionicon = icon ? SF_TO_IONICONS[icon] : undefined;
    return (
      <View style={[fullWidth ? { width: '100%' } : { alignSelf: 'flex-start' }, { height }, style]} onLayout={fullWidth ? onRowLayout : undefined}>
        <TouchableOpacity
          onPress={isDisabled ? undefined : onPress}
          activeOpacity={0.8}
          style={{
            // A plain RN view, unlike the iOS Host/native modifiers below —
            // percentage width here lets Yoga account for the wrapping
            // View's own padding automatically, so `fullWidth` needs no
            // manual padding subtraction at all on Android.
            width: fullWidth ? '100%' : targetWidth,
            height,
            borderRadius: height / 2,
            backgroundColor: tintColor + (isDisabled ? '80' : 'FF'),
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {ionicon && <Ionicons name={ionicon} size={18} color={fg} />}
          <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: fg }}>
            {loading ? 'Loading…' : title}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

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
          variant="text"
          onPress={isDisabled ? undefined : onPress}
          modifiers={[
            // `frame` first, same reasoning as LiquidTextField: modifiers
            // apply to the view's size at that point, so anything sizing or
            // painting the box needs the concrete pixel size locked in
            // before it, not after.
            frame({ width: targetWidth, height }),
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
          ]}
        >
          <Row alignment="center" spacing={8}>
            {icon && <Icon name={icon} size={18} color={fg} />}
            <UniversalText textStyle={{ fontFamily: fonts.bold, fontSize: 15, color: fg }}>
              {loading ? 'Loading…' : title}
            </UniversalText>
          </Row>
        </Button>
      </Host>
    </View>
  );
}
