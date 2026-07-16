// Dynamic Island / Lock Screen Live Activity showing pending online orders.
// Confirmed working on-device (iOS Simulator, iPhone 17 Pro) as of 2026-07-16.
//
// How this actually works, since it's not obvious from the JSX alone:
// `babel-preset-expo`'s widgets-plugin (node_modules/babel-preset-expo/build/
// plugins/widgets-plugin.js) detects the `'widget';` directive as the first
// statement of a function and replaces the ENTIRE function with a string of
// its own source code — exactly like Reanimated's `'worklet';` directive.
// That string is what the native side stores and later re-evaluates (with
// fresh props) inside an isolated JS context each time the activity updates
// (node_modules/expo-widgets/bundle/index.ts assigns `@expo/ui/swift-ui`'s
// exports onto `globalThis` for that evaluation). Two consequences:
//   1. Only `@expo/ui/swift-ui` is available as globals in that scope — NOT
//      the universal `@expo/ui` layer used elsewhere in this app (e.g.
//      LiquidButton). No `Icon` component exists there; SF Symbols render
//      via `Image({ systemName, size, color })`.
//   2. The stringified function can't close over this file's outer module
//      scope — so ALL constants (colors, etc.) must be declared *inside*
//      `PendingOrdersLayout`, not at module level.
// The `@expo/ui/swift-ui` import itself stays at module scope purely so
// TypeScript can type-check the JSX below before Babel replaces the function
// with a string — it has no effect at runtime once stringified.
import { Platform } from 'react-native';
import { Text, HStack, VStack, Spacer, Image, Divider } from '@expo/ui/swift-ui';
import { font, foregroundColor, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, LiveActivityFactory } from 'expo-widgets';

export type PendingOrdersActivityProps = {
  pendingCount: number;
  shopName: string;
  // Minutes since the oldest still-pending order arrived — drives the
  // urgency color (fine → amber → clay) in the expanded view, so the
  // shopkeeper can tell "just got one" apart from "these have been sitting
  // for 20 minutes" without opening the app. 0 when there's nothing pending.
  oldestMinutesAgo: number;
};

// Must match the `"name"` field of the matching entry in app.json's
// `expo-widgets` plugin config (`widgets: [{ name: "PendingOrdersActivity", ... }]`).
const ACTIVITY_NAME = 'PendingOrdersActivity';

function PendingOrdersLayout({ pendingCount, shopName, oldestMinutesAgo }: PendingOrdersActivityProps) {
  'widget';

  const ACCENT = '#5B7567'; // sage primary — matches theme/colors.ts LIGHT.primary
  const MUTED = '#8E8E93'; // iOS secondary-label gray
  const WARNING = '#A98545'; // theme/colors.ts LIGHT.warning (muted ochre)
  const DANGER = '#A65A4D'; // theme/colors.ts LIGHT.danger (muted clay)
  const label = pendingCount === 1 ? '1 pending order' : `${pendingCount} pending orders`;
  // Capped for the compact/minimal Dynamic Island badges — a 3+ digit count
  // has no room to render cleanly in that tiny pill.
  const count = pendingCount > 99 ? '99+' : String(pendingCount);
  // Urgency escalates the longer the oldest order has sat unactioned — same
  // idea as the low-stock/expiry alert coloring elsewhere in this app.
  const waitColor = oldestMinutesAgo >= 15 ? DANGER : oldestMinutesAgo >= 5 ? WARNING : MUTED;
  const waitLabel = oldestMinutesAgo <= 0 ? 'just now' : oldestMinutesAgo === 1 ? '1 min ago' : `${oldestMinutesAgo} min ago`;

  return {
    // Lock Screen banner — the widest surface, most room for context.
    banner: (
      <HStack alignment="center" modifiers={[padding({ all: 12 })]}>
        <Image systemName="bag.fill" color={ACCENT} size={22} />
        <Spacer minLength={10} />
        <VStack alignment="leading">
          <Text modifiers={[font({ weight: 'bold', size: 15 })]}>{label}</Text>
          <Text modifiers={[font({ size: 12 }), foregroundColor(MUTED)]}>{shopName}</Text>
          <Text modifiers={[font({ size: 11 }), foregroundColor(waitColor)]}>{`Oldest waiting ${waitLabel}`}</Text>
        </VStack>
      </HStack>
    ),

    // Compact Dynamic Island — small icon + count either side of the pill.
    compactLeading: <Image systemName="bag.fill" color={ACCENT} size={16} />,
    compactTrailing: <Text modifiers={[font({ weight: 'bold', size: 14 })]}>{count}</Text>,

    // Smallest Dynamic Island form (when multiple activities are competing
    // for space) — just the count badge.
    minimal: <Text modifiers={[font({ weight: 'bold', size: 13 })]}>{count}</Text>,

    // Expanded Dynamic Island (long-press) — richer 4-region layout instead
    // of one plain line: icon on the left, the count as its own badge on the
    // right, shop name + wait-time urgency as the hero content in the
    // center, and a divider + "tap to open" hint anchoring the bottom.
    expandedLeading: <Image systemName="bag.fill" color={ACCENT} size={22} />,
    expandedTrailing: (
      <VStack alignment="trailing">
        <Text modifiers={[font({ weight: 'bold', size: 20 }), foregroundColor(ACCENT)]}>{count}</Text>
        <Text modifiers={[font({ size: 10 }), foregroundColor(MUTED)]}>orders</Text>
      </VStack>
    ),
    expandedCenter: (
      <VStack alignment="leading">
        <Text modifiers={[font({ weight: 'bold', size: 15 })]}>{shopName}</Text>
        <HStack alignment="center">
          <Image systemName="clock.fill" color={waitColor} size={11} />
          <Spacer minLength={4} />
          <Text modifiers={[font({ size: 12 }), foregroundColor(waitColor)]}>{`Oldest waiting ${waitLabel}`}</Text>
        </HStack>
      </VStack>
    ),
    expandedBottom: (
      <VStack alignment="leading" modifiers={[padding({ top: 6 })]}>
        <Divider />
        <HStack alignment="center" modifiers={[padding({ top: 6 })]}>
          <Image systemName="hand.tap.fill" color={MUTED} size={11} />
          <Spacer minLength={4} />
          <Text modifiers={[font({ size: 11 }), foregroundColor(MUTED)]}>Tap to open Shopkeeper AI</Text>
        </HStack>
      </VStack>
    ),
  };
}

// `expo-widgets` has no Android implementation of LiveActivityFactory at all
// (no matching native module class) — `createLiveActivity(...)` runs at
// MODULE LOAD TIME (this is a top-level `export const`, evaluated on import
// for both platforms, since Metro bundles the same JS unless a platform-
// specific file extension is used), so calling it unconditionally would very
// likely crash the whole app on Android at startup, not just fail to work.
// Guarded here rather than relying on call-site `Platform.OS` checks alone
// (usePendingOrdersLiveActivity.ts also guards, but that only protects
// *usage* — this protects *construction*).
export const PendingOrdersActivity: LiveActivityFactory<PendingOrdersActivityProps> | null =
  Platform.OS === 'ios' ? createLiveActivity<PendingOrdersActivityProps>(ACTIVITY_NAME, PendingOrdersLayout) : null;
