// Dynamic Island / Lock Screen Live Activity showing pending online orders.
//
// IMPORTANT — this file cannot be fully verified from this (Windows) machine,
// but the runtime crash from the first Mac build attempt WAS diagnosed by
// reading the actual installed source (not guessed):
//
//   node_modules/expo-widgets/src/Widgets.ts casts `layout as unknown as
//   string` when constructing the native LiveActivityFactory — a no-op at
//   runtime. The native side (WidgetsDynamicView.swift, via
//   WidgetsStorage.getString(forKey: "__expo_widgets_<name>_layout")) expects
//   a real STRING: the function's *source code*, to be evaluated later inside
//   an isolated JS context (see node_modules/expo-widgets/bundle/index.ts,
//   which assigns `@expo/ui/swift-ui`'s exports onto `globalThis` for that
//   evaluation). That stringification is done by a dedicated Babel plugin —
//   node_modules/babel-preset-expo/build/plugins/widgets-plugin.js — which
//   only fires on a function whose body's FIRST statement is the literal
//   directive `'widget';` (exactly like Reanimated's `'worklet';` directive).
//   That directive was missing below, so the raw function reached the native
//   constructor unstringified and crashed
//   (ArgumentCastException: "the 2nd argument cannot be cast to type String").
//
// Two consequences of "the function becomes a standalone string, evaluated in
// an isolated global scope" that shape everything below:
//   1. Only `@expo/ui/swift-ui` (NOT the universal `@expo/ui` layer used
//      elsewhere in this app, e.g. LiquidButton) is available as globals in
//      that scope — so this imports from `@expo/ui/swift-ui` /
//      `@expo/ui/swift-ui/modifiers` specifically. No `Icon` component exists
//      there; SF Symbols render via `Image({ systemName, size, color })`.
//   2. The stringified function can't close over anything from this file's
//      outer module scope (imports aside — see note below) — so ALL constants
//      (colors, etc.) must be declared *inside* `PendingOrdersLayout`, not at
//      module level.
// The `@expo/ui/swift-ui` import itself stays at module scope purely so
// TypeScript can type-check the JSX below before Babel replaces the function
// with a string — it has no effect at runtime once stringified.
import { Text, HStack, VStack, Spacer, Image } from '@expo/ui/swift-ui';
import { font, foregroundColor, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';

export type PendingOrdersActivityProps = {
  pendingCount: number;
  shopName: string;
};

// Must match the `"name"` field of the matching entry in app.json's
// `expo-widgets` plugin config (`widgets: [{ name: "PendingOrdersActivity", ... }]`).
const ACTIVITY_NAME = 'PendingOrdersActivity';

function PendingOrdersLayout({ pendingCount, shopName }: PendingOrdersActivityProps) {
  'widget';

  const ACCENT = '#5B7567'; // sage primary — matches theme/colors.ts LIGHT.primary
  const MUTED = '#8E8E93'; // iOS secondary-label gray
  const label = pendingCount === 1 ? '1 pending order' : `${pendingCount} pending orders`;
  const count = String(pendingCount);

  return {
    // Lock Screen banner — the widest surface, most room for context.
    banner: (
      <HStack alignment="center" modifiers={[padding({ all: 12 })]}>
        <Image systemName="bag.fill" color={ACCENT} size={22} />
        <Spacer minLength={10} />
        <VStack alignment="leading">
          <Text modifiers={[font({ weight: 'bold', size: 15 })]}>{label}</Text>
          <Text modifiers={[font({ size: 12 }), foregroundColor(MUTED)]}>{shopName}</Text>
        </VStack>
      </HStack>
    ),

    // Compact Dynamic Island — small icon + count either side of the pill.
    compactLeading: <Image systemName="bag.fill" color={ACCENT} size={16} />,
    compactTrailing: <Text modifiers={[font({ weight: 'bold', size: 14 })]}>{count}</Text>,

    // Smallest Dynamic Island form (when multiple activities are competing
    // for space) — just the count badge.
    minimal: <Text modifiers={[font({ weight: 'bold', size: 13 })]}>{count}</Text>,

    // Expanded Dynamic Island (long-press) — full context, same shape as
    // the banner but tuned for the expanded region's layout slots.
    expandedLeading: <Image systemName="bag.fill" color={ACCENT} size={20} />,
    expandedTrailing: <Text modifiers={[font({ weight: 'bold', size: 16 })]}>{count}</Text>,
    expandedBottom: (
      <Text modifiers={[font({ size: 13 }), foregroundColor(MUTED)]}>{`${label} · ${shopName}`}</Text>
    ),
  };
}

export const PendingOrdersActivity = createLiveActivity<PendingOrdersActivityProps>(
  ACTIVITY_NAME,
  PendingOrdersLayout
);
