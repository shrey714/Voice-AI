// Dynamic Island / Lock Screen Live Activity showing pending online orders.
//
// IMPORTANT — this file cannot be verified from this (Windows) machine.
// `expo-widgets` needs a real iOS prebuild (Xcode/CocoaPods) to compile this
// into the widget extension's native SwiftUI, which only works on macOS —
// see the "expo prebuild -p ios" output when run from Windows. Everything
// below is written directly against the installed package's real type
// definitions (node_modules/expo-widgets/build/Widgets.d.ts /
// Widgets.types.d.ts), not guessed from docs prose, but the actual visual
// result and whether `@expo/ui` primitives render correctly inside a Live
// Activity's native process still needs confirming on a Mac build.
//
// Known open risk (flagged before this was written, still unresolved): this
// app's top-level `@expo/ui` is `~56.0.21` (stable), but `expo-widgets`
// bundles its own nested `@expo/ui@56.0.0-canary-...`. The `Text`/`Row`/
// `Column` imports below resolve to the STABLE top-level `@expo/ui` (normal
// Node module resolution from `src/`), which may not exactly match what the
// widget extension's native runtime (built from the nested canary) expects.
// If the Mac build fails or renders wrong, this version mismatch is the
// first thing to check.
import { Text, Row, Column, Spacer, Icon } from '@expo/ui';
import { createLiveActivity } from 'expo-widgets';

export type PendingOrdersActivityProps = {
  pendingCount: number;
  shopName: string;
};

// Must match the `"name"` field of the matching entry in app.json's
// `expo-widgets` plugin config (`widgets: [{ name: "PendingOrdersActivity", ... }]`).
const ACTIVITY_NAME = 'PendingOrdersActivity';

const ACCENT = '#5B7567'; // sage primary — matches theme/colors.ts LIGHT.primary

const MUTED = '#8E8E93'; // iOS secondary-label gray

function PendingOrdersLayout({ pendingCount, shopName }: PendingOrdersActivityProps) {
  const label = pendingCount === 1 ? '1 pending order' : `${pendingCount} pending orders`;
  const count = String(pendingCount);

  return {
    // Lock Screen banner — the widest surface, most room for context.
    banner: (
      <Row style={{ padding: 12 }} alignment="center">
        <Icon name="bag.fill" color={ACCENT} size={22} />
        <Spacer size={10} />
        <Column>
          <Text textStyle={{ fontWeight: 'bold', fontSize: 15 }}>{label}</Text>
          <Text textStyle={{ fontSize: 12, color: MUTED }}>{shopName}</Text>
        </Column>
      </Row>
    ),

    // Compact Dynamic Island — small icon + count either side of the pill.
    compactLeading: <Icon name="bag.fill" color={ACCENT} size={16} />,
    compactTrailing: <Text textStyle={{ fontWeight: 'bold', fontSize: 14 }}>{count}</Text>,

    // Smallest Dynamic Island form (when multiple activities are competing
    // for space) — just the count badge.
    minimal: <Text textStyle={{ fontWeight: 'bold', fontSize: 13 }}>{count}</Text>,

    // Expanded Dynamic Island (long-press) — full context, same shape as
    // the banner but tuned for the expanded region's layout slots.
    expandedLeading: <Icon name="bag.fill" color={ACCENT} size={20} />,
    expandedTrailing: <Text textStyle={{ fontWeight: 'bold', fontSize: 16 }}>{count}</Text>,
    expandedBottom: <Text textStyle={{ fontSize: 13, color: MUTED }}>{`${label} · ${shopName}`}</Text>,
  };
}

export const PendingOrdersActivity = createLiveActivity<PendingOrdersActivityProps>(
  ACTIVITY_NAME,
  PendingOrdersLayout
);
