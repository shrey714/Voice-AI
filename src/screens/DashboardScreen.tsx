import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Linking, Alert, RefreshControl, Dimensions, Platform, LayoutAnimation, UIManager } from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import Animated, {
  useSharedValue, useAnimatedProps, useAnimatedStyle, useAnimatedRef, useAnimatedScrollHandler, useDerivedValue,
  scrollTo, runOnJS, runOnUI, interpolate, Extrapolation, withTiming, Easing, SharedValue, measure,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import Svg, { Circle } from 'react-native-svg';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../stores/useAppStore';
import { useOnlineShopStore } from '../stores/useOnlineShopStore';
import { useTranslation } from '../hooks/useTranslation';
import { useIsOnline } from '../hooks/useIsOnline';
import { switchAppMode } from '../navigation/navigationRef';
import { isShopOpenNow } from '../utils/shopStatus';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}


const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Animated circular progress ring (fills to `progress` 0..1 on mount).
function GoalRing({ progress, size = 96, stroke = 10, color, track }: { progress: number; size?: number; stroke?: number; color: string; track: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const off = useSharedValue(circ);
  useEffect(() => {
    off.value = withTiming(circ * (1 - Math.min(Math.max(progress, 0), 1)), { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [progress, circ]);
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: off.value }));
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
      <AnimatedCircle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={circ} animatedProps={animatedProps} rotation={-90} origin={`${size / 2}, ${size / 2}`} />
    </Svg>
  );
}

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

// Quick Action tile dimensions, full (resting) vs. stuck (pinned/compact).
// The circle animates its REAL width/height (not a scale transform) — a
// scale only shrinks visually while the layout box stays full-size, which
// the collapsed item then clipped (the "button bottom cut off" bug). The
// tile also narrows so the shrunk circles pack tighter instead of leaving
// big gaps.
const QA_ITEM_FULL_H = 76;
const QA_ITEM_STUCK_H = 42;
const QA_ITEM_FULL_W = 70;
const QA_ITEM_STUCK_W = 50;
const QA_CIRCLE_FULL = 50;
const QA_CIRCLE_STUCK = 39;
// Label has fully faded by the time the tile is 60% collapsed, so it's gone
// before the row is visibly compact rather than lingering half-visible.
const QA_LABEL_FADE_END = 0.6;

// Sticky-pin tuning (px). FADE_RANGE = how much scroll before the pin point
// the collapse animates over; STICK_SNAP = end the collapse a hair before
// the exact stick point so progress reaches a clean 1; GROUP_LABEL_H = the
// resting height of the "QUICK ACTIONS" label (collapses to 0 when pinned);
// the STUCK_PAD_* give the pinned strip its breathing room.
const QA_FADE_RANGE = 44;
const QA_STICK_SNAP = 3;
const QA_GROUP_LABEL_H = 34;
const QA_STUCK_PAD_TOP = 2;
const QA_STUCK_PAD_BOTTOM = 12;
// Initial off-screen Y for the header measurement, so progress reads 0
// (fully expanded) before the first scroll frame measures the real position.
const QA_OFFSCREEN_Y = 9999;
// Height of the pinned (thin) online-shop status bar.
const ONLINE_STUCK_H = 36;

// Shared per-tile animated styles, driven by the row's 0→1 pin `progress`
// (read directly on the UI thread). Both the action tiles and the Edit tile
// shrink identically, so this lives in one place — the REAL tiles shrink in
// place, no separate compact clone swaps in.
function useQaTileStyles(progress: SharedValue<number>) {
  const itemStyle = useAnimatedStyle(() => ({
    height: interpolate(progress.value, [0, 1], [QA_ITEM_FULL_H, QA_ITEM_STUCK_H], Extrapolation.CLAMP),
    width: interpolate(progress.value, [0, 1], [QA_ITEM_FULL_W, QA_ITEM_STUCK_W], Extrapolation.CLAMP),
  }));
  const circleStyle = useAnimatedStyle(() => {
    const size = interpolate(progress.value, [0, 1], [QA_CIRCLE_FULL, QA_CIRCLE_STUCK], Extrapolation.CLAMP);
    return { width: size, height: size, borderRadius: size / 2 };
  });
  const labelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, QA_LABEL_FADE_END], [1, 0], Extrapolation.CLAMP),
  }));
  return { itemStyle, circleStyle, labelStyle };
}

// One Quick Action tile — memoized (see AGENTS.md's FlatList-row convention):
// `gradientColors`/`labelColor`/`styles`/`stickyProgress` are all stable
// references from the parent, and `onPress` is a single stable top-level
// callback, so this never re-renders on unrelated Dashboard state changes.
const QuickActionButton = React.memo(function QuickActionButton({
  action, gradientColors, labelColor, onPress, styles, stickyProgress,
}: {
  action: QuickActionDef;
  gradientColors: readonly [string, string];
  labelColor: string;
  onPress: (action: QuickActionDef) => void;
  styles: any;
  stickyProgress: SharedValue<number>;
}) {
  const { itemStyle, circleStyle, labelStyle } = useQaTileStyles(stickyProgress);
  return (
    <PressableScale onPress={() => onPress(action)}>
      <Animated.View style={[styles.qaItem, itemStyle]}>
        <AnimatedLinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.qaCircle, circleStyle]}>
          <Ionicons name={action.icon} size={24} color="#fff" />
        </AnimatedLinearGradient>
        <Animated.Text style={[styles.qaLabelAbs, { color: labelColor }, labelStyle]} numberOfLines={1}>{action.label}</Animated.Text>
      </Animated.View>
    </PressableScale>
  );
});

// The trailing "Edit" tile — same shrink/label-fade as the action tiles so
// it stays visually consistent when the row pins (previously it kept its
// label while the others faded, which read as a bug).
const QuickActionEditButton = React.memo(function QuickActionEditButton({
  onPress, colors, styles, stickyProgress,
}: {
  onPress: () => void;
  colors: any;
  styles: any;
  stickyProgress: SharedValue<number>;
}) {
  const { itemStyle, circleStyle, labelStyle } = useQaTileStyles(stickyProgress);
  return (
    <PressableScale onPress={onPress}>
      <Animated.View style={[styles.qaItem, itemStyle]}>
        <Animated.View style={[styles.qaCircle, { backgroundColor: colors.surfaceHigh, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, circleStyle]}>
          <Ionicons name="pencil-outline" size={22} color={colors.primary} />
        </Animated.View>
        <Animated.Text style={[styles.qaLabelAbs, { color: colors.textSub }, labelStyle]} numberOfLines={1}>Edit</Animated.Text>
      </Animated.View>
    </PressableScale>
  );
});

// One row inside the Quick Actions editor sheet, rendered by
// `react-native-draggable-flatlist` (genuine drag-and-drop — reanimated +
// gesture-handler under the hood, both already app dependencies; no
// hand-rolled translateY/threshold math). `drag` (call on the handle's
// onPressIn/onLongPress) hands control to the library, which live-shifts
// every other row out of the way as the dragged row moves — the "other
// items make space automatically" behavior a manual up/down or single-row
// pan gesture can't give you for free.
const DraggableQuickActionRow = React.memo(function DraggableQuickActionRow({
  pref, def, drag, isActive, colors, styles, onToggle,
}: {
  pref: QuickActionPref;
  def: QuickActionDef;
  drag: () => void;
  isActive: boolean;
  colors: any;
  styles: any;
  onToggle: (key: string) => void;
}) {
  return (
    <View style={[styles.qaEditRow, { borderBottomColor: colors.border }, isActive && styles.qaEditRowActive]}>
      <TouchableOpacity
        style={styles.qaEditCheck}
        onPress={() => onToggle(pref.key)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons
          name={pref.enabled ? 'checkmark-circle' : 'ellipse-outline'}
          size={22}
          color={pref.enabled ? colors.primary : colors.textMuted}
        />
      </TouchableOpacity>
      <View style={[styles.qaEditIcon, { backgroundColor: colors.primaryLight }]}>
        <Ionicons name={def.icon} size={17} color={colors.primary} />
      </View>
      <Text style={[styles.qaEditLabel, { color: colors.text, opacity: pref.enabled ? 1 : 0.5 }]} numberOfLines={1}>
        {def.label}
      </Text>
      <TouchableOpacity
        style={styles.qaEditHandle}
        onPressIn={drag}
        disabled={isActive}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="reorder-three-outline" size={22} color={colors.textMuted} />
      </TouchableOpacity>
    </View>
  );
});

// One page inside the widget's infinite strip — its scale is a pure function
// of how far the shared scroll position currently is from this page's own
// resting offset, so "current shrinks while leaving, next grows while
// arriving" falls out automatically from a single continuous value instead
// of two separately-animated, separately-timed states (that's what caused
// the earlier flicker: idx and a transform value being reset by two
// different, not-quite-synchronized code paths).
// Memoized — with REPEAT_COPIES pages mounted per widget, an unmemoized
// version would re-run this component (and rebuild its style object/worklet
// closure) on every parent re-render even though `scrollY` (a stable shared
// value ref) is the only thing actually driving its visuals frame-to-frame.
const WidgetPage = React.memo(function WidgetPage({ size, offset, scrollY, children }: { size: number; offset: number; scrollY: SharedValue<number>; children: React.ReactNode }) {
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(scrollY.value, [offset - size, offset, offset + size], [0.68, 1, 0.68], Extrapolation.CLAMP) }],
  }));
  // Rounded + clipped per page (not just the outer container) so a scaled-down
  // page reads as its own rounded card, not a rectangle cut off by the frame.
  // No fixed padding here — the gap between slides should only exist while
  // mid-scroll (falling out of the scale shrink centering the card in its
  // slot); a persistent inset here would leave the *resting*/current card
  // floating inside the frame instead of filling it edge-to-edge.
  //
  // renderToHardwareTextureAndroid / shouldRasterizeIOS: this view's content
  // (gradient/text) is static — only its `scale` transform changes per
  // frame. Without these, both platforms re-composite (and on Android,
  // potentially re-rasterize) the full subtree on every animation frame;
  // with them, the GPU caches one rasterized layer per page and the scroll
  // just transforms that cached texture, which is what makes transform-only
  // animations over static content cheap instead of a full repaint per frame.
  return (
    <Animated.View
      style={[{ width: size, height: size, borderRadius: 24, overflow: 'hidden' }, style]}
      renderToHardwareTextureAndroid
      shouldRasterizeIOS
    >
      {children}
    </Animated.View>
  );
});

// iOS "widget stack" — a square tile that loops infinitely in either
// direction through its pages, matching the reference frames: the departing
// page shrinks as it slides out while the arriving page grows in from the
// same edge, driven continuously by real scroll position (see WidgetPage).
// Looping is the standard "triple-copy strip + silent jump back to the
// middle copy" trick — content is identical between copies so the jump is
// invisible, and it only ever needs to fire after a single-page settle since
// pagingEnabled prevents multi-page flings from skipping past a copy edge.
// Copies of the page list laid end-to-end for the loop trick, and which copy
// (0-indexed) is "home" — a wider buffer means the silent re-center jump
// fires less often, at the cost of more simultaneously-mounted pages (each
// with its own worklet-driven style). 5 is a middle ground: for the 2-3 page
// widgets this app actually shows, that's a comfortable buffer (still 1+
// full lap before a jump is ever needed) without paying for pages that will
// essentially never be scrolled to.
const REPEAT_COPIES = 5;
const HOME_COPY = Math.floor(REPEAT_COPIES / 2);

const WidgetStack = React.memo(function WidgetStack({ size, pages, colors }: { size: number; pages: React.ReactNode[]; colors: any }) {
  const n = pages.length;
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const homeY = HOME_COPY * n * size;
  const scrollY = useSharedValue(homeY);
  const [activeIdx, setActiveIdx] = useState(0);
  const mounted = useRef(false);

  useLayoutEffect(() => {
    if (n < 2 || mounted.current) return;
    mounted.current = true;
    // Plain ref-based scrollTo (not reanimated's worklet-oriented `scrollTo`
    // helper) — calling that helper from JS-thread code like this effect and
    // the interval below turned out unreliable (auto-rotation silently not
    // firing on some runs). The animated ref's `.current` is still just the
    // underlying native ScrollView, so its own imperative `scrollTo` is the
    // proven-reliable path for JS-thread-initiated scrolls; reanimated's
    // helper is kept only inside the worklet (onMomentumEnd, UI thread) below.
    scrollRef.current?.scrollTo({ y: homeY, animated: false });
  }, [n, size]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => { scrollY.value = e.contentOffset.y; },
    onMomentumEnd: (e) => {
      let pageIdx = Math.round(e.contentOffset.y / size);
      const copyIdx = Math.floor(pageIdx / n);
      if (copyIdx !== HOME_COPY) {
        pageIdx += (HOME_COPY - copyIdx) * n;
        scrollTo(scrollRef, 0, pageIdx * size, false);
        scrollY.value = pageIdx * size;
      }
      runOnJS(setActiveIdx)(((pageIdx % n) + n) % n);
    },
  });

  // Shadow only here (can't render on a view that also clips its content via
  // overflow: 'hidden'). The border is deliberately NOT set here — a border
  // on this sizing box would shrink its content box to `size - 2*borderWidth`,
  // while every scroll/interpolation offset below is computed from the plain
  // `size` prop. That tiny, constant mismatch is exactly what was causing the
  // reported "always drifts a bit further at the top" gap: it compounds by a
  // fixed amount on every page traversed. The border is instead drawn as an
  // absolutely-positioned overlay sibling below, which doesn't participate in
  // layout at all, so it can't affect the scroll math.
  // Memoized so these two style objects/arrays aren't reallocated on every
  // render this component IS asked to do (e.g. a genuine size/theme change)
  // — cheap on its own, but free to avoid.
  const frameStyle = useMemo(() => ({ width: size, height: size, borderRadius: 24, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } }), [size]);
  const borderOverlay = useMemo(() => [StyleSheet.absoluteFill, { borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }], [colors.border]);

  if (n < 2) {
    return (
      <View style={frameStyle}>
        <View style={{ flex: 1, borderRadius: 24, overflow: 'hidden' }}>{pages[0]}</View>
        <View pointerEvents="none" style={borderOverlay} />
      </View>
    );
  }

  return (
    <View style={frameStyle}>
      <View style={{ flex: 1, borderRadius: 24, overflow: 'hidden', backgroundColor: colors.bg }}>
        <Animated.ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          pagingEnabled
          decelerationRate="fast"
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
          contentOffset={{ x: 0, y: homeY }}
          style={{ flex: 1, backgroundColor: 'transparent' }}
          removeClippedSubviews={Platform.OS === 'android'}
        >
          {Array.from({ length: n * REPEAT_COPIES }).map((_, i) => (
            <WidgetPage key={i} size={size} offset={i * size} scrollY={scrollY}>
              {pages[i % n]}
            </WidgetPage>
          ))}
        </Animated.ScrollView>
        <View style={isl.vdots} pointerEvents="none">
          {pages.map((_, i) => (
            <View key={i} style={[isl.vdot, { backgroundColor: i === activeIdx ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.4)' }]} />
          ))}
        </View>
      </View>
      <View pointerEvents="none" style={borderOverlay} />
    </View>
  );
});

const isl = StyleSheet.create({
  widget: { flex: 1, padding: 16, paddingRight: 22, justifyContent: 'space-between' },
  widgetTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  widgetLbl: { fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 1.4, color: 'rgba(255,255,255,0.75)' },
  widgetIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  widgetTitle: { fontFamily: fonts.extraBold, fontSize: 15, color: '#fff', marginTop: 8 },
  widgetText: { fontFamily: fonts.semiBold, fontSize: 12.5, lineHeight: 17, color: 'rgba(255,255,255,0.9)', marginTop: 4 },
  vdots: { position: 'absolute', right: 9, top: 0, bottom: 0, justifyContent: 'center', gap: 6 },
  vdot: { width: 6, height: 6, borderRadius: 3 },
});
import { formatCurrency, startOfDay, endOfDay } from '../utils/helpers';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';
import AnimatedNumber from '../components/common/AnimatedNumber';
import PressableScale from '../components/common/PressableScale';
import LiquidButton from '../components/common/LiquidButton';
import LiquidBottomSheet, { LiquidBottomSheetRef } from '../components/common/LiquidBottomSheet';
import SheetHeader, { SHEET_PADDING } from '../components/common/SheetHeader';
import { DashboardSkeleton } from '../components/common/Skeleton';
import {
  getQuickActionCatalog, defaultQuickActionPrefs, reconcileQuickActionPrefs, navigateToQuickAction,
  MIN_ENABLED_QUICK_ACTIONS, QuickActionDef, QuickActionPref,
} from '../config/quickActions';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { computeSalesStats, makeCostOf } from '../utils/stats';
import { whatsappUrl } from '../utils/reminder';
import { toast } from '../utils/toast';
import * as db from '../db/database';

// Big faded wordmark — same look as the old animated version's resting
// state (dot in `colors.primary` at full brightness, letters in `colors.text`
// at a fixed low opacity), just without the looping light-sweep animation.
function ShimmerBrand({ colors }: { colors: any }) {
  const brand = 'shopkeeper.ai';
  const chars = brand.split('');
  const { width } = Dimensions.get('window');
  const size = Math.min(60, Math.round((width - 36) / 7.2));
  const textStyle = { fontFamily: fonts.extraBold, fontSize: size, lineHeight: size * 1.04, includeFontPadding: false };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      {chars.map((c, i) => {
        const isDot = c === '.';
        return (
          <Text key={i} style={[textStyle, { color: isDot ? colors.primary : colors.text, opacity: isDot ? 1 : 0.25 }]}>{c}</Text>
        );
      })}
    </View>
  );
}

export default function DashboardScreen({ navigation }: any) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  // Was a bare `useAppStore()` (whole store, no selector) — any store field
  // changing anywhere in the app (a background sync, an online order
  // arriving, etc.) re-rendered this entire screen, including every one of
  // its ~20 mount-time MotiView entrance animations re-evaluating. `useShallow`
  // only re-renders when one of these specific fields actually changes
  // (shallow-compared, since a bare object-returning selector would
  // otherwise be a new reference — and therefore "changed" — on every call).
  const { products, bills, expenses, returns, loadProducts, loadBills, loadExpenses, settings } = useAppStore(
    useShallow(state => ({
      products: state.products,
      bills: state.bills,
      expenses: state.expenses,
      returns: state.returns,
      loadProducts: state.loadProducts,
      loadBills: state.loadBills,
      loadExpenses: state.loadExpenses,
      settings: state.settings,
    }))
  );
  const dataReady = useAppStore(state => state.dataReady);
  const isOnline = useIsOnline();
  const fetchShopConfig = useOnlineShopStore(state => state.fetchShopConfig);
  const onlineShopConfig = useOnlineShopStore(state => state.config);
  const isOnlineShopLive = settings.onlineShopEnabled && isShopOpenNow(onlineShopConfig);
  const [refreshing, setRefreshing] = useState(false);

  // Quick Actions — user-customizable pin/reorder list, same persisted-setting
  // pattern as MenuScreen's `menuLayoutMode` (db.getSetting/setSetting, loaded
  // once on mount, written back on every edit).
  const quickActionCatalog = useMemo(() => getQuickActionCatalog(t), [t]);
  const [quickActionPrefs, setQuickActionPrefs] = useState<QuickActionPref[]>(() => defaultQuickActionPrefs(quickActionCatalog));
  useEffect(() => {
    db.getSetting('quickActionsConfig').then(raw => {
      if (!raw) return;
      try {
        const saved: QuickActionPref[] = JSON.parse(raw);
        setQuickActionPrefs(reconcileQuickActionPrefs(saved, quickActionCatalog));
      } catch { /* corrupt/old value — keep default */ }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const persistQuickActionPrefs = (prefs: QuickActionPref[]) => {
    setQuickActionPrefs(prefs);
    db.setSetting('quickActionsConfig', JSON.stringify(prefs));
  };
  const toggleQuickAction = (key: string) => {
    const pref = quickActionPrefs.find(p => p.key === key);
    if (!pref) return;
    if (pref.enabled && quickActionPrefs.filter(p => p.enabled).length <= MIN_ENABLED_QUICK_ACTIONS) {
      toast.error(`Keep at least ${MIN_ENABLED_QUICK_ACTIONS} quick actions pinned`);
      return;
    }
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    persistQuickActionPrefs(quickActionPrefs.map(p => (p.key === key ? { ...p, enabled: !p.enabled } : p)));
  };
  const activeQuickActions = useMemo(
    () => quickActionPrefs
      .filter(p => p.enabled)
      .map(p => quickActionCatalog.find(c => c.key === p.key))
      .filter((c): c is QuickActionDef => !!c),
    [quickActionPrefs, quickActionCatalog]
  );
  const quickActionGradient = useMemo(() => [colors.primary, colors.primaryDark] as const, [colors.primary, colors.primaryDark]);
  const handleQuickActionPress = useCallback((action: QuickActionDef) => navigateToQuickAction(navigation, action.target), [navigation]);
  const quickActionsSheetRef = useRef<LiquidBottomSheetRef>(null);
  // Stable so the memoized Edit tile isn't re-rendered by a fresh inline
  // arrow on every Dashboard render.
  const openQuickActionsEditor = useCallback(() => quickActionsSheetRef.current?.expand(), []);

  // All sales numbers are netted of returns via the shared stats helper. Memoized
  // so the 9 computeSalesStats passes (today + yesterday + 7 days) don't re-run on
  // every unrelated re-render — only when bills/returns/products change.
  const { todayStats, yesterdayRevenue, week } = useMemo(() => {
    const costOf = makeCostOf(products);
    const dayMs = 86400000;
    const today = computeSalesStats({ bills, returns, from: startOfDay(), to: endOfDay(), costOf });
    const yRev = computeSalesStats({ bills, returns, from: startOfDay() - dayMs, to: startOfDay() - 1, costOf }).revenue;
    const wk = Array.from({ length: 7 }).map((_, idx) => {
      const ds = startOfDay() - (6 - idx) * dayMs;
      const rev = computeSalesStats({ bills, returns, from: ds, to: ds + dayMs - 1, costOf }).revenue;
      return {
        rev,
        label: new Date(ds).toLocaleDateString('en-IN', { weekday: 'narrow' }),
        full: new Date(ds).toLocaleDateString('en-IN', { weekday: 'long' }),
        isToday: idx === 6,
      };
    });
    return { todayStats: today, yesterdayRevenue: yRev, week: wk };
  }, [bills, returns, products]);

  const todayBills = bills.filter(b => b.createdAt >= startOfDay() && b.createdAt <= endOfDay());
  const todayRevenue = todayStats.revenue;
  const todayProfit = todayStats.profit;
  const todayExpenses = expenses.filter(e => e.createdAt >= startOfDay() && e.createdAt <= endOfDay()).reduce((s, e) => s + e.amount, 0);
  // Memoized on `products` alone (stable reference from the useShallow store
  // selector above, only changes when products actually change) — these feed
  // the insight/alert widgets' `useMemo`s below, which would otherwise still
  // recompute every render since these were plain re-filters of `products`
  // producing a new array reference every time regardless of whether the
  // underlying data changed.
  const { lowStockItems, expiringItems, expiredCount, expiringSoonCount } = useMemo(() => {
    const low = products.filter(p => p.quantity <= p.lowStockThreshold);
    const now = Date.now();
    const expiring = products
      .filter(p => p.expiryDate && p.expiryDate > 0)
      .map(p => ({ ...p, daysLeft: Math.ceil((p.expiryDate! - now) / 86400000) }))
      .filter(p => p.daysLeft <= 30)
      .sort((a, b) => a.daysLeft - b.daysLeft);
    const expired = expiring.filter(p => p.daysLeft <= 0).length;
    return { lowStockItems: low, expiringItems: expiring, expiredCount: expired, expiringSoonCount: expiring.length - expired };
  }, [products]);

  // Net top-sellers & units sold (returned quantities removed). Memoized —
  // same reasoning as lowStockItems/expiringItems above (todayStats is
  // already stable, but .slice().map() on it isn't).
  const topSelling: [string, number][] = useMemo(() => todayStats.topItems.slice(0, 5).map(it => [it.name, it.qty] as [string, number]), [todayStats]);
  const itemsSold = todayStats.itemsSold;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('goodMorning') : hour < 17 ? t('goodAfternoon') : t('goodEvening');
  const firstName = (settings.ownerName || '').trim().split(' ')[0];
  const netProfit = todayProfit - todayExpenses;

  // vs yesterday
  const deltaPct = yesterdayRevenue > 0 ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100 : null;

  const weekMax = Math.max(...week.map(d => d.rev), 1);
  const weekTotal = week.reduce((s, d) => s + d.rev, 0);

  // Daily goal
  const dailyGoal = settings.dailyGoal || 0;
  const goalProgress = dailyGoal > 0 ? todayRevenue / dailyGoal : 0;
  const goalReached = dailyGoal > 0 && todayRevenue >= dailyGoal;

  // Goal-reached toast: fire once the day's revenue crosses the goal, at most once
  // per day (persisted by date so reopening the app won't re-show it).
  const celebratedRef = useRef(false);
  useEffect(() => {
    if (!goalReached || celebratedRef.current) return;
    let cancelled = false;
    (async () => {
      const todayKey = String(startOfDay());
      const last = await db.getSetting('goalCelebratedDate');
      if (cancelled) return;
      celebratedRef.current = true;
      if (last === todayKey) return; // already shown today
      await db.setSetting('goalCelebratedDate', todayKey);
      toast.success(`🎯 ${t('goalReached')}`, { description: t('goalReachedDesc').replace('{amount}', formatCurrency(dailyGoal, settings.currency)) });
    })();
    return () => { cancelled = true; };
  }, [goalReached, dailyGoal]);

  // Smart insights — all applicable (shown in a rotating slider). Memoized so
  // the array reference stays stable across unrelated re-renders (it feeds
  // WidgetStack below, whose own memoized `pages` would otherwise still
  // recompute every time since this array was previously a fresh one each
  // render regardless).
  const margin = todayRevenue > 0 ? (todayProfit / todayRevenue) * 100 : 0;
  const bestDay = useMemo(() => week.reduce((a, b) => (b.rev > a.rev ? b : a), week[0]), [week]);
  const insights: { icon: any; text: string }[] = useMemo(() => {
    const list: { icon: any; text: string }[] = [];
    if (goalReached) list.push({ icon: 'trophy-outline', text: `You hit today's goal of ${formatCurrency(dailyGoal, settings.currency)} — great work!` });
    if (topSelling.length > 0) list.push({ icon: 'flame-outline', text: `${topSelling[0][0]} is your top seller today (${topSelling[0][1]} sold).` });
    if (deltaPct !== null) list.push({ icon: deltaPct >= 0 ? 'trending-up-outline' : 'trending-down-outline', text: deltaPct >= 0 ? `You're up ${Math.abs(deltaPct).toFixed(0)}% vs yesterday — keep it going!` : `You're down ${Math.abs(deltaPct).toFixed(0)}% vs yesterday.` });
    if (todayRevenue > 0) list.push({ icon: 'analytics-outline', text: `Today's profit margin is ${margin.toFixed(0)}%.` });
    if (weekTotal > 0 && bestDay.rev > 0 && !bestDay.isToday) list.push({ icon: 'calendar-outline', text: `Your best day this week was ${bestDay.full}. Try to beat it!` });
    if (lowStockItems.length > 0) list.push({ icon: 'cube-outline', text: `${lowStockItems.length} item${lowStockItems.length > 1 ? 's are' : ' is'} running low on stock.` });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalReached, dailyGoal, settings.currency, topSelling, deltaPct, todayRevenue, margin, weekTotal, bestDay, lowStockItems.length]);

  // Alert widget pages — one per active alert type, fed into the auto-rotating AlertsSlider. Memoized for the same reason as `insights` above.
  const alertPages: { key: string; color: string; icon: any; title: string; sub: string; onPress: () => void }[] = useMemo(() => {
    const list: { key: string; color: string; icon: any; title: string; sub: string; onPress: () => void }[] = [];
    if (lowStockItems.length > 0) {
      list.push({
        key: 'lowStock',
        color: colors.warning,
        icon: 'warning',
        title: t('itemsLowStock').replace('{count}', String(lowStockItems.length)),
        sub: `${t('tapToReorder')} · ${lowStockItems.slice(0, 3).map(p => p.name).join(', ')}`,
        onPress: () => navigation.navigate('More', { screen: 'Reorder', initial: false }),
      });
    }
    if (expiringItems.length > 0) {
      list.push({
        key: 'expiring',
        color: colors.danger,
        icon: 'calendar-outline',
        title: expiredCount > 0 && expiringSoonCount > 0
          ? `${expiredCount} ${t('expired')} · ${expiringSoonCount} ${t('expiringWithin30')}`
          : expiredCount > 0
            ? `${expiredCount} item${expiredCount > 1 ? 's' : ''} ${t('expired')}`
            : `${expiringSoonCount} item${expiringSoonCount > 1 ? 's' : ''} ${t('expiringWithin30')}`,
        sub: expiringItems.slice(0, 3).map(p => p.name).join(', '),
        onPress: () => navigation.navigate('Inventory'),
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lowStockItems, expiringItems, expiredCount, expiringSoonCount, colors]);

  // Memoized so WidgetStack (and every WidgetPage inside its 5-copy strip)
  // doesn't get a brand-new `pages` array — and therefore doesn't remount its
  // whole render tree — on every unrelated Dashboard re-render (refresh,
  // theme, store updates elsewhere). Only rebuilds when the underlying
  // insight/alert content actually changes.
  const insightPages = useMemo(() => insights.map((ins, i) => (
    <View key={i} style={{ flex: 1 }}>
      <LinearGradient colors={[colors.primary, colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={isl.widget}>
        <View style={isl.widgetTop}>
          <Text style={isl.widgetLbl}>{t('insight').toUpperCase()}</Text>
          <View style={isl.widgetIcon}><Ionicons name={ins.icon} size={15} color="#fff" /></View>
        </View>
        <Text style={isl.widgetText} numberOfLines={4}>{ins.text}</Text>
      </View>
    </View>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  )), [insights, colors]);

  const alertWidgetPages = useMemo(() => alertPages.map((p) => (
    <TouchableOpacity key={p.key} activeOpacity={0.9} onPress={p.onPress} style={{ flex: 1, backgroundColor: p.color }}>
      <View style={isl.widget}>
        <View style={isl.widgetTop}>
          <View style={isl.widgetIcon}><Ionicons name={p.icon} size={15} color="#fff" /></View>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.85)" />
        </View>
        <View>
          <Text style={isl.widgetTitle} numberOfLines={2}>{p.title}</Text>
          <Text style={isl.widgetText} numberOfLines={1}>{p.sub}</Text>
        </View>
      </View>
    </TouchableOpacity>
  // eslint-disable-next-line react-hooks/exhaustive-deps
  )), [alertPages, colors]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadProducts(), loadBills(), loadExpenses(),
        // Also pulls in shop-name/UPI/GST edits made directly in Supabase —
        // fetchShopConfig mirrors them into local settings on success.
        ...(isOnline ? [fetchShopConfig()] : []),
      ]);
    } catch {
      // ignore
    } finally {
      // On iOS, delaying the spinner dismissal by one frame after data lands
      // lets the content reflow settle before the RefreshControl animates away,
      // preventing the layout-shift glitch.
      if (Platform.OS === 'ios') {
        setTimeout(() => setRefreshing(false), 50);
      } else {
        setRefreshing(false);
      }
    }
  };

  const sendSummary = () => {
    const date = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
    const msg = [`📊 *${settings.shopName} — Daily Summary*`, `📅 ${date}`, `━━━━━━━━━━━━━`,
      `💰 Revenue: *${formatCurrency(todayRevenue, settings.currency)}*`,
      `📈 Profit: *${formatCurrency(todayProfit, settings.currency)}*`,
      `💸 Expenses: ${formatCurrency(todayExpenses, settings.currency)}`,
      `✅ Net: *${formatCurrency(todayProfit - todayExpenses, settings.currency)}*`,
      `🧾 Bills: ${todayBills.length}`,
    ].join('\n');
    Linking.openURL(whatsappUrl(settings.phone, msg)).catch(() => Alert.alert('WhatsApp not found'));
  };

  const s = useMemo(() => makeStyles(colors), [colors]);

  // Square widget size for the side-by-side insight/alert stacks: full width minus
  // the 16px screen gutters and the gap between the two widgets, split evenly.
  // The dot indicator is overlaid inside each widget, so it doesn't need its own width.
  // Rounded to a whole pixel — a fractional size here throws off the widget's
  // scroll-offset math (n * size, pageIdx * size), which otherwise misaligns
  // the "resting" scroll position by a sub-pixel amount and shows up as a
  // sliver of empty space between the card and the frame's border/top edge.
  const { width: screenW } = Dimensions.get('window');
  const widgetSize = Math.round((screenW - 16 * 2 - 12) / 2);

  const insets = useSafeAreaInsets();

  // Sticky Quick Actions — pinned via the ScrollView's own native
  // `stickyHeaderIndices={[1]}` (see below). The shrink/collapse "progress"
  // (0 = full, 1 = fully compact) is derived by MEASURING the header's real
  // on-screen Y every scroll frame with reanimated's `measure()`, instead
  // of computing it from scroll offset + guessed `contentInset` transforms
  // (which never lined up on device). As the header's top approaches its
  // stuck position (`stickTop`), progress ramps 0→1; once RN freezes it
  // there, `measure` keeps returning `stickTop`, so progress stays at 1.
  const qaRef = useAnimatedRef<Animated.View>();
  const qaHeaderY = useSharedValue(QA_OFFSCREEN_Y);
  // Where the sticky header actually freezes, which differs per platform:
  //  • iOS   — at the ScrollView's `contentInset.top` (= insets.top below), so
  //            it lands right at the safe-area boundary, under the Dynamic
  //            Island. The status-bar gap ABOVE it is filled by extending the
  //            bar's background upward (see `qaBgExtendUp`).
  //  • Android — `contentInset` is iOS-only, so the header freezes at the
  //            ScrollView frame top (y=0). Under edge-to-edge (enforced on
  //            Android 15+, which SDK 56 targets) that's UNDER the status bar,
  //            so instead of extending the background up, the bar pads its own
  //            content down by insets.top to clear the status bar.
  // Both paths end up visually identical: an opaque bar from y=0 with its
  // icons sitting just below the status bar.
  const isIOS = Platform.OS === 'ios';
  const stickTop = isIOS ? insets.top : 0;
  const qaBgExtendUp = isIOS ? insets.top : 0;
  const qaStuckPadTop = QA_STUCK_PAD_TOP + (isIOS ? 0 : insets.top);
  const qaStuckTotalH = qaStuckPadTop + QA_ITEM_STUCK_H + QA_STUCK_PAD_BOTTOM;
  // Online-shop status — a SECOND pinned bar that stacks directly under the
  // Quick Actions bar. RN's native sticky headers can't stack (a later one
  // pushes the earlier off), so this one is a custom measure-driven overlay:
  // its in-flow card is measured each frame, and as it reaches the point just
  // below the pinned Quick Actions bar it morphs into a thin status strip.
  const onlineRef = useAnimatedRef<Animated.View>();
  const onlineHeaderY = useSharedValue(QA_OFFSCREEN_Y);
  // Sits directly under the pinned Quick Actions bar. Derived from the
  // platform-correct stick point + that bar's real stuck height, so it lands
  // at the same absolute Y on both platforms.
  const onlineStickTop = stickTop + qaStuckTotalH;
  // Shared measuring worklet. The `height > 0` guard is essential: when this
  // screen is navigated away from (e.g. switching to the online shop tabs), a
  // scroll/layout event can still fire while its views are detached or
  // hidden, and `measure` then reports a 0-sized node at pageY 0 — which
  // reads as "fully pinned" and leaves the bar stuck solid on return.
  // Ignoring degenerate measurements keeps the last VALID position instead.
  const measureStickyHeaders = useCallback(() => {
    'worklet';
    const qa = measure(qaRef);
    if (qa && qa.height > 0) qaHeaderY.value = qa.pageY;
    const online = measure(onlineRef);
    if (online && online.height > 0) onlineHeaderY.value = online.pageY;
  }, []);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: () => {
      measureStickyHeaders();
    },
  });
  // Re-measure whenever the screen regains focus. Coming back from another
  // tab tree fires no scroll event, so without this the bar keeps whatever
  // state it had when last scrolled — this re-derives it from the real
  // on-screen position (the ScrollView keeps its scroll offset).
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused) return;
    const id = setTimeout(() => runOnUI(measureStickyHeaders)(), 250);
    return () => clearTimeout(id);
  }, [isFocused, measureStickyHeaders]);
  // The measured wrapper's own top edge lands right at `stickTop` when fully
  // stuck (its animated padding is internal, so it doesn't offset the top),
  // so the range ends a hair above (`+ QA_STICK_SNAP`) to guarantee a clean
  // 1 (fully compact) rather than stalling just short.
  const qaProgress = useDerivedValue(() =>
    interpolate(qaHeaderY.value, [stickTop + QA_FADE_RANGE, stickTop + QA_STICK_SNAP], [0, 1], Extrapolation.CLAMP)
  );
  // Background fades in AND extends its top edge upward by `stickTop` as the
  // row pins — so once stuck it fills the whole notch/status-bar gap above
  // the row (which the sticky header itself doesn't occupy), instead of
  // leaving the hero bleeding through there.
  const quickActionsBgStyle = useAnimatedStyle(() => ({
    opacity: qaProgress.value,
    top: interpolate(qaProgress.value, [0, 1], [0, -qaBgExtendUp], Extrapolation.CLAMP),
  }));
  // Applied to a wrapping Animated.VIEW (not the Text) — animating `height`
  // on a Text doesn't reliably drop its layout space, which left a ~30px
  // gap above the pinned icons; a view with overflow:hidden collapses cleanly.
  const quickActionsLabelStyle = useAnimatedStyle(() => ({
    height: interpolate(qaProgress.value, [0, 1], [QA_GROUP_LABEL_H, 0], Extrapolation.CLAMP),
    opacity: interpolate(qaProgress.value, [0, 0.5], [1, 0], Extrapolation.CLAMP),
  }));
  const quickActionsPadStyle = useAnimatedStyle(() => ({
    paddingTop: interpolate(qaProgress.value, [0, 1], [0, qaStuckPadTop], Extrapolation.CLAMP),
    paddingBottom: interpolate(qaProgress.value, [0, 1], [0, QA_STUCK_PAD_BOTTOM], Extrapolation.CLAMP),
  }));

  // 0→1 as the in-flow online card reaches its pin point below the Quick
  // Actions bar; drives the thin pinned status strip's reveal + morph.
  const onlineProgress = useDerivedValue(() =>
    interpolate(onlineHeaderY.value, [onlineStickTop + QA_FADE_RANGE, onlineStickTop + QA_STICK_SNAP], [0, 1], Extrapolation.CLAMP)
  );
  // The pinned strip grows its height in from 0 (so it holds no hit area and
  // takes no space until it's actually pinning) while its content fades +
  // slides up into place — a compact morph from the full card.
  const onlineBarStyle = useAnimatedStyle(() => ({
    height: interpolate(onlineProgress.value, [0, 1], [0, ONLINE_STUCK_H], Extrapolation.CLAMP),
    opacity: interpolate(onlineProgress.value, [0, 0.4], [0, 1], Extrapolation.CLAMP),
  }));
  const onlineBarContentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(onlineProgress.value, [0, 1], [8, 0], Extrapolation.CLAMP) }],
  }));

  if (!dataReady) return <DashboardSkeleton />;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={[]}>
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        scrollIndicatorInsets={{ top: 0, bottom: 0, left: 0, right: 0 }}
        // MUST be "never" — with iOS's default "automatic" behavior the system
        // ADDS its own safe-area inset on top of the explicit contentInset
        // below whenever this view is re-added to the hierarchy (returning
        // from the online tabs), doubling the offset and pushing all content
        // down by insets.top — the solid strip above the hero.
        contentInsetAdjustmentBehavior="never"
        contentInset={Platform.OS === 'ios' ? { top: insets.top } : undefined}
        contentOffset={Platform.OS === 'ios' ? { y: -insets.top, x: 0 } : undefined}
        scrollEnabled={true}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        stickyHeaderIndices={[1]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
            progressBackgroundColor={colors.surface}
          />
        }
      >
        {/* Wrapped so Quick Actions below can be the ScrollView's index-1
            direct child — `stickyHeaderIndices={[1]}` needs a literal,
            reliable index, and this 3-way split (before / Quick Actions /
            after) makes that index trivial instead of hand-counting every
            sibling (including conditionally-rendered ones). */}
        <View>
        {/* HERO — greeting + headline earnings */}
        <LinearGradient colors={[colors.primary, colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.hero, { paddingTop: insets.top + 16, marginTop: Platform.OS === 'ios' ? -insets.top : 0 }]}>
          <MotiView from={{ opacity: 0, translateY: -8 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 450 }}>
            <View style={s.heroTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.greeting}>{greeting}{firstName ? `, ${firstName}` : ''}</Text>
                <Text style={s.shopName} numberOfLines={1}>{settings.shopName}</Text>
              </View>
              <TouchableOpacity style={s.waPill} onPress={sendSummary} activeOpacity={0.85}>
                <Ionicons name="logo-whatsapp" size={15} color="#fff" />
                <Text style={s.waPillText}>Summary</Text>
              </TouchableOpacity>
            </View>

            <View style={s.earnBlock}>
              <Text style={s.earnLbl}>{t('todaysEarnings').toUpperCase()}</Text>
              <AnimatedNumber value={todayRevenue} format={(n) => formatCurrency(n, settings.currency)} style={s.earnVal} />
              {deltaPct !== null && (
                <View style={s.deltaRow}>
                  <Ionicons name={deltaPct >= 0 ? 'arrow-up' : 'arrow-down'} size={12} color={deltaPct >= 0 ? '#A5E8B5' : '#F2B8AE'} />
                  <Text style={[s.deltaPct, { color: deltaPct >= 0 ? '#A5E8B5' : '#F2B8AE' }]}>{Math.abs(deltaPct).toFixed(0)}%</Text>
                  <Text style={s.deltaMuted}>{t('vsYesterday')}</Text>
                </View>
              )}
              <View style={s.heroChips}>
                <View style={[s.chip, { backgroundColor: 'rgba(165,232,181,0.18)' }]}>
                  <Ionicons name="trending-up" size={13} color="#A5E8B5" />
                  <Text style={s.chipText}>{formatCurrency(todayProfit, settings.currency)} profit</Text>
                </View>
                <View style={[s.chip, { backgroundColor: 'rgba(244,213,138,0.18)' }]}>
                  <Ionicons name="receipt-outline" size={13} color="#F4D58A" />
                  <Text style={s.chipText}>{todayBills.length} bills</Text>
                </View>
              </View>
            </View>
          </MotiView>
        </LinearGradient>

        {/* FLOATING BENTO METRICS — overlap the hero for depth */}
        <View style={s.bentoRow}>
          {[
            { label: 'Net Profit', value: formatCurrency(netProfit, settings.currency), icon: 'wallet-outline' as const, accent: netProfit >= 0 ? colors.success : colors.danger },
            { label: 'Expenses', value: formatCurrency(todayExpenses, settings.currency), icon: 'arrow-down-circle-outline' as const, accent: colors.warning },
            { label: 'Items Sold', value: String(itemsSold), icon: 'cube-outline' as const, accent: colors.info },
          ].map((m, i) => (
            <MotiView key={m.label} style={{ flex: 1 }} from={{ opacity: 0, translateY: 16 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 380, delay: 120 + i * 70 }}>
              <View style={[s.bentoCard, { backgroundColor: colors.surface }]}>
                <View style={s.bentoTopBar}>
                  <View style={[s.bentoIcon, { backgroundColor: m.accent + '1A' }]}>
                    <Ionicons name={m.icon} size={16} color={m.accent} />
                  </View>
                  <View style={[s.bentoDot, { backgroundColor: m.accent }]} />
                </View>
                <Text style={[s.bentoVal, { color: m.accent }]} numberOfLines={1} adjustsFontSizeToFit>{m.value}</Text>
                <Text style={[s.bentoLbl, { color: colors.textMuted }]}>{m.label}</Text>
              </View>
            </MotiView>
          ))}
        </View>

        </View>

        {/* Quick Actions — the ScrollView's index-1 direct child, pinned via
            the native `stickyHeaderIndices={[1]}` below (RN's own built-in
            mechanism — no hand-rolled translateY/position math). This is the
            REAL row, not a duplicate: `qaRef` + reanimated `measure()` reads
            its live on-screen Y every scroll frame to drive `qaProgress`
            (0→1 as it approaches its stuck position), and each tile reads
            that to collapse its own height, shrink its circle, and fade its
            label — so the whole row shrinks into a thin strip in place. */}
        <Animated.View style={{ backgroundColor: colors.bg }}>
          <Animated.View style={[StyleSheet.absoluteFill, s.qaStickyBg, { backgroundColor: colors.bg, borderBottomColor: colors.border }, quickActionsBgStyle]} />
          {/* Inner wrapper holds `qaRef` for measurement AND the animated
              padding — NOT the outer sticky-header child itself. RN's sticky
              mechanism injects its own animated transform onto that outer
              child, which clobbers reanimated animated styles set directly
              there (that's why the padding/collapse didn't apply before);
              nested children like this one are untouched, so their animated
              styles work. It also moves with the sticky transform, so
              measuring it still gives the correct on-screen position. */}
          <Animated.View ref={qaRef} style={quickActionsPadStyle}>
            <Animated.View style={[s.groupLabelWrap, quickActionsLabelStyle]}>
              <Text style={[s.groupLabel, { color: colors.textMuted }]} numberOfLines={1}>
                {t('quickActions').toUpperCase()}
              </Text>
            </Animated.View>
            <FlatList
              data={activeQuickActions}
              keyExtractor={(action) => action.key}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
              renderItem={({ item }) => (
                <QuickActionButton action={item} gradientColors={quickActionGradient} labelColor={colors.textSub} onPress={handleQuickActionPress} styles={s} stickyProgress={qaProgress} />
              )}
              ListFooterComponent={
                <QuickActionEditButton onPress={openQuickActionsEditor} colors={colors} styles={s} stickyProgress={qaProgress} />
              }
            />
          </Animated.View>
        </Animated.View>

        <View>
        {/* Ask AI bar */}
        <MotiView from={{ opacity: 0, translateY: 14 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 380, delay: 200 }}>
          <PressableScale style={[s.askBar, { backgroundColor: colors.surface, borderColor: colors.primary + '40' }]} onPress={() => navigation.navigate('AskAi')}>
            <View style={[s.askIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="sparkles" size={17} color={colors.primary} />
            </View>
            <Text style={[s.askText, { color: colors.textMuted }]} numberOfLines={1}>{t('askAnything')}</Text>
            <Ionicons name="arrow-forward-circle" size={24} color={colors.primary} />
          </PressableScale>
        </MotiView>

             {/* Online Shop — live CTA if enabled, otherwise an invite to start one.
            The enabled card is wrapped in an `onlineRef` anchor so its live
            scroll position drives the thin pinned status strip below. */}
        {settings.onlineShopEnabled ? (
          <Animated.View ref={onlineRef}>
          <MotiView from={{ opacity: 0, translateY: 14 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 400, delay: 210 }}>
            <PressableScale onPress={() => switchAppMode('online')}>
              {/* Keyed remount cross-fades the whole card (gradient, dot, copy)
                  smoothly whenever live/closed actually flips, instead of an
                  instant style snap. */}
              <MotiView key={isOnlineShopLive ? 'live' : 'closed'} from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 350 }}>
                <LinearGradient
                  colors={isOnlineShopLive ? [colors.primary, colors.primaryDark] : [colors.textMuted, colors.textSub]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                  style={s.onlineShopCard}
                >
                  <View style={s.onlineShopIcon}>
                    <Ionicons name="storefront" size={22} color="#fff" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={s.onlineShopStatusRow}>
                      <View style={{ width: 7, height: 7, alignItems: 'center', justifyContent: 'center' }}>
                        {isOnlineShopLive && (
                          <MotiView
                            from={{ scale: 1, opacity: 0.6 }}
                            animate={{ scale: 2.6, opacity: 0 }}
                            transition={{ type: 'timing', duration: 1400, loop: true, repeatReverse: false }}
                            style={{ position: 'absolute', width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#A5E8B5' }}
                          />
                        )}
                        <View style={[s.onlineShopDot, { backgroundColor: isOnlineShopLive ? '#A5E8B5' : 'rgba(255,255,255,0.6)' }]} />
                      </View>
                      <Text style={s.onlineShopTitle}>Online Shop is {isOnlineShopLive ? 'LIVE' : 'CLOSED'}</Text>
                    </View>
                    <Text style={s.onlineShopSub}>
                      {isOnlineShopLive ? 'Customers can browse & order — tap to manage' : 'Not accepting orders right now — tap to reopen'}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#fff" />
                </LinearGradient>
              </MotiView>
            </PressableScale>
          </MotiView>
          </Animated.View>
        ) : (
          <MotiView from={{ opacity: 0, translateY: 14 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 400, delay: 210 }}>
            <PressableScale style={[s.onlineShopPrompt, { backgroundColor: colors.surface, borderColor: colors.primary + '40' }]} onPress={() => navigation.navigate('More', { screen: 'ShopInfo' })}>
              <View style={[s.bentoIcon, { backgroundColor: colors.primaryLight, width: 42, height: 42, borderRadius: 13 }]}>
                <Ionicons name="storefront-outline" size={22} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.goalAmount, { color: colors.text }]}>Sell online too</Text>
                <Text style={[s.goalRemain, { color: colors.textMuted }]}>Let customers browse & order from your shop</Text>
              </View>
              <View style={[s.onlineShopNewBadge, { backgroundColor: colors.primary }]}>
                <Text style={s.onlineShopNewBadgeText}>NEW</Text>
              </View>
            </PressableScale>
          </MotiView>
        )}

        {/* Daily goal ring */}
        {dailyGoal > 0 ? (
          <MotiView from={{ opacity: 0, translateY: 14 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 400, delay: 220 }}>
            <PressableScale style={[s.goalCard, { backgroundColor: colors.surface }]} onPress={() => navigation.navigate('Billing')}>
              <View style={s.goalRingWrap}>
                <GoalRing progress={goalProgress} color={goalReached ? colors.success : colors.primary} track={colors.primaryLight} />
                <View style={s.goalRingCenter}>
                  <Text style={[s.goalPct, { color: goalReached ? colors.success : colors.primary }]}>{Math.round(goalProgress * 100)}%</Text>
                </View>
              </View>
              <View style={{ flex: 1, marginLeft: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name={goalReached ? 'trophy' : 'flag'} size={14} color={goalReached ? colors.success : colors.primary} />
                  <Text style={[s.goalLbl, { color: colors.textMuted }]}>{goalReached ? t('goalReachedLabel').toUpperCase() : t('dailyGoal').toUpperCase()}</Text>
                </View>
                <Text style={[s.goalAmount, { color: colors.text }]}>
                  {formatCurrency(todayRevenue, settings.currency)}<Text style={{ color: colors.textMuted }}> of {formatCurrency(dailyGoal, settings.currency)}</Text>
                </Text>
                <Text style={[s.goalRemain, { color: goalReached ? colors.success : colors.textSub }]}>
                  {goalReached ? t('smashedTarget') : t('amountToGo').replace('{amount}', formatCurrency(dailyGoal - todayRevenue, settings.currency))}
                </Text>
              </View>
            </PressableScale>
          </MotiView>
        ) : (
          <MotiView from={{ opacity: 0, translateY: 14 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 400, delay: 220 }}>
            <PressableScale style={[s.goalPrompt, { backgroundColor: colors.surface }]} onPress={() => navigation.navigate('More', { screen: 'ManageOptions' })}>
              <View style={[s.bentoIcon, { backgroundColor: colors.primaryLight, width: 36, height: 36, borderRadius: 11 }]}>
                <Ionicons name="flag-outline" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.goalAmount, { color: colors.text }]}>{t('setDailyGoal')}</Text>
                <Text style={[s.goalRemain, { color: colors.textMuted }]}>{t('trackProgress')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </PressableScale>
          </MotiView>
        )}

        {/* Smart insights + alerts — two iOS-widget stacks side by side, each auto-rotating vertically */}
        {(insights.length > 0 || alertPages.length > 0) && (
          <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 400, delay: 280 }} style={s.widgetRow}>
            {insights.length > 0 && (
              <WidgetStack
                size={widgetSize}
                colors={colors}
                pages={insightPages}
              />
            )}
            {alertPages.length > 0 && (
              <WidgetStack
                size={widgetSize}
                colors={colors}
                pages={alertWidgetPages}
              />
            )}
          </MotiView>
        )}

        {/* 7-day revenue sparkline — tap to open Analytics */}
        {weekTotal > 0 && (
          <MotiView from={{ opacity: 0, translateY: 14 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 400, delay: 240 }}>
            <View style={[s.weekCard, { backgroundColor: colors.surface }]}>
              <View style={s.weekHead}>
                <View>
                  <Text style={[s.weekTitle, { color: colors.text }]}>{t('last7Days')}</Text>
                  <Text style={[s.weekSub, { color: colors.textMuted }]}>{t('revenueTrend')}</Text>
                </View>
              </View>
              <View style={s.weekBars}>
                {week.map((d, i) => (
                  <View key={i} style={s.weekCol}>
                    <View style={s.weekBarTrack}>
                      <MotiView
                        from={{ height: 0 }}
                        animate={{ height: Math.max(4, (d.rev / weekMax) * 64) }}
                        transition={{ type: 'timing', duration: 500, delay: 300 + i * 55 }}
                        style={s.weekBar}
                      >
                        <LinearGradient
                          colors={d.isToday ? [colors.primary, colors.primaryDark] : [colors.primaryLight, colors.primary + '40']}
                          style={StyleSheet.absoluteFill}
                        />
                      </MotiView>
                    </View>
                    <Text style={[s.weekDay, { color: d.isToday ? colors.primary : colors.textMuted, fontFamily: d.isToday ? fonts.bold : fonts.medium }]}>{d.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          </MotiView>
        )}

        {/* Top Selling */}
        {topSelling.length > 0 && (
          <View style={[s.section, { backgroundColor: colors.surface }]}>
            <Text style={[s.sectionInTitle, { color: colors.text }]}>{t('topSellingToday')}</Text>
            {topSelling.map(([name, qty], i) => (
              <MotiView key={name} from={{ opacity: 0, translateX: -10 }} animate={{ opacity: 1, translateX: 0 }}
                transition={{ type: 'timing', duration: 300, delay: i * 50 + 400 }}
                style={[s.topRow, { borderBottomColor: colors.border, borderBottomWidth: i === topSelling.length - 1 ? 0 : 0.5 }]}>
                <View style={[s.topRankBadge, { backgroundColor: i === 0 ? colors.primary : colors.primaryLight }]}>
                  <Text style={[s.topRank, { color: i === 0 ? '#fff' : colors.primary }]}>{i + 1}</Text>
                </View>
                <Text style={[s.topName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
                <View style={[s.topQtyBadge, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[s.topQty, { color: colors.primary }]}>{t('qSold').replace('{qty}', String(qty))}</Text>
                </View>
              </MotiView>
            ))}
          </View>
        )}

        {/* Recent bills */}
        {todayBills.length > 0 && (
          <View style={[s.section, { backgroundColor: colors.surface }]}>
            <View style={s.sectionRow}>
              <Text style={[s.sectionInTitle, { color: colors.text, marginBottom: 0 }]}>{t('recentBills')}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('More', { screen: 'RecordsMain' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Text style={[s.seeAll, { color: colors.primary }]}>{t('seeAll')}</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>
            {todayBills.slice(0, 5).map((bill, i) => {
              const mc = bill.paymentMode === 'cash' ? colors.success : bill.paymentMode === 'upi' ? colors.info : colors.warning;
              return (
                <MotiView key={bill.id} from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 300, delay: i * 50 + 400 }}
                  style={[s.billRow, { borderBottomColor: colors.border, borderBottomWidth: i === Math.min(todayBills.length, 5) - 1 ? 0 : 0.5 }]}>
                  <View style={[s.billMode, { backgroundColor: mc + '15' }]}>
                    <Ionicons name={bill.paymentMode === 'cash' ? 'cash-outline' : bill.paymentMode === 'upi' ? 'phone-portrait-outline' : 'document-text-outline'} size={18} color={mc} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.billTime, { color: colors.text }]}>
                      {new Date(bill.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      {bill.customerName ? `  ·  ${bill.customerName}` : ''}
                    </Text>
                    <Text style={[s.billItems, { color: colors.textSub }]} numberOfLines={1}>{bill.items.map(i => i.productName).join(', ')}</Text>
                  </View>
                  <Text style={[s.billAmt, { color: colors.primary }]}>{formatCurrency(bill.total, settings.currency)}</Text>
                </MotiView>
              );
            })}
          </View>
        )}

        {/* Empty state — no sales yet today */}
        {todayBills.length === 0 && (
          <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 400, delay: 280 }} style={[s.emptyCard, { backgroundColor: colors.surface }]}>
            <View style={[s.emptyIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="receipt-outline" size={30} color={colors.primary} />
            </View>
            <Text style={[s.emptyTitle, { color: colors.text }]}>{t('noSalesToday')}</Text>
            <Text style={[s.emptySub, { color: colors.textMuted }]}>{t('noSalesTodayDesc')}</Text>
            <LiquidButton
              title={t('newBill')}
              icon="plus"
              onPress={() => navigation.navigate('Billing')}
              variant="glassProminent"
              fullWidth={false}
              height={44}
              style={{alignSelf: 'center'}}
            />
          </MotiView>
        )}

        {/* Brand watermark footer */}
        <MotiView from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 600 }} style={s.brandWrap}>
          <Text style={[s.brandTagline, { color: colors.textMuted }]}>{t('runByVoice')}</Text>
          <ShimmerBrand colors={colors} />
        </MotiView>

        <View style={{ height: 100 }} />
        </View>
      </Animated.ScrollView>

      {/* Pinned online-shop status strip — stacks directly under the Quick
          Actions bar (`top: onlineStickTop`). Grows in from height 0 as the
          in-flow card reaches this point, so it occupies no space and blocks
          no taps until it's actually pinning. */}
      {settings.onlineShopEnabled && (
        <Animated.View style={[s.onlineStickyBar, { top: onlineStickTop, backgroundColor: colors.bg, borderBottomColor: colors.border }, onlineBarStyle]}>
          <Animated.View style={[s.onlineStickyInner, onlineBarContentStyle]}>
            <TouchableOpacity style={s.onlineStickyTouchable} onPress={() => switchAppMode('online')} activeOpacity={0.7}>
              <View style={[s.onlineShopDot, { backgroundColor: isOnlineShopLive ? colors.success : colors.textMuted }]} />
              <Text style={[s.onlineStickyText, { color: colors.text }]} numberOfLines={1}>
                Online Shop is {isOnlineShopLive ? 'LIVE' : 'CLOSED'}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      )}

      {/* Quick Actions editor — toggle which screens show + drag the handle
          to reorder. Kept as a sibling of the outer ScrollView (not a
          descendant) — nesting a vertical VirtualizedList (DraggableFlatList)
          inside a same-orientation ScrollView triggers RN's "VirtualizedLists
          should never be nested" warning even though the sheet itself renders
          in a separate native overlay, since that warning is driven by
          React context propagation through the component tree, not the
          native view hierarchy. `react-native-draggable-flatlist`
          (reanimated + gesture-handler, both already app deps) — other rows
          live-shift out of the way as the dragged row moves, instead of only
          resolving on release. */}
      <LiquidBottomSheet ref={quickActionsSheetRef} heightFraction={0.85}>
        <View style={{ flex: 1 }}>
          <SheetHeader title={t('quickActions')} onClose={() => quickActionsSheetRef.current?.close()} />
          <DraggableFlatList
            data={quickActionPrefs}
            keyExtractor={(pref) => pref.key}
            contentContainerStyle={s.qaEditContent}
            containerStyle={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            activationDistance={0}
            renderItem={({ item: pref, drag, isActive }: RenderItemParams<QuickActionPref>) => {
              const def = quickActionCatalog.find(c => c.key === pref.key);
              if (!def) return null;
              return (
                <DraggableQuickActionRow
                  pref={pref}
                  def={def}
                  drag={drag}
                  isActive={isActive}
                  colors={colors}
                  styles={s}
                  onToggle={toggleQuickAction}
                />
              );
            }}
            onDragEnd={({ data }) => persistQuickActionPrefs(data)}
          />
        </View>
      </LiquidBottomSheet>
    </SafeAreaView>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  // Brand watermark footer
  brandWrap: { marginTop: 24, paddingTop: 28, paddingBottom: 6, alignItems: 'center', justifyContent: 'flex-end' },
  brandTagline: { fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 2.5, marginBottom: 10 },

  // Hero — greeting + headline earnings
  hero: { paddingHorizontal: 20, paddingBottom: 30, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  greeting: { fontFamily: fonts.medium, fontSize: 13, color: 'rgba(255,255,255,0.72)' },
  shopName: { fontFamily: fonts.extraBold, fontSize: 22, color: '#fff', letterSpacing: -0.4, marginTop: 2 },
  waPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20 },
  waPillText: { color: '#fff', fontFamily: fonts.bold, fontSize: 12 },
  earnBlock: { marginTop: 16 },
  earnLbl: { fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 1.5, color: 'rgba(255,255,255,0.6)' },
  earnVal: { fontFamily: fonts.display, fontSize: 40, color: '#fff', marginTop: 3, letterSpacing: -1 },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 8 },
  deltaPct: { fontFamily: fonts.bold, fontSize: 12.5 },
  deltaMuted: { fontFamily: fonts.medium, fontSize: 12, color: 'rgba(255,255,255,0.6)', marginLeft: 2 },
  heroChips: { flexDirection: 'row', gap: 8, marginTop: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 11, paddingVertical: 6, borderRadius: 14 },
  chipText: { color: '#fff', fontFamily: fonts.semiBold, fontSize: 12 },

  // Floating bento metric tiles
  bentoRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: -22 },
  bentoCard: { borderRadius: 18, padding: 13, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, gap: 9, elevation: 3, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  bentoTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bentoIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  bentoDot: { width: 6, height: 6, borderRadius: 3, opacity: 0.55 },
  bentoVal: { fontFamily: fonts.extraBold, fontSize: 16 },
  bentoLbl: { fontFamily: fonts.medium, fontSize: 11 },

  // Ask AI bar
  askBar: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 14, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, borderWidth: 1 },
  askIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  askText: { flex: 1, fontFamily: fonts.medium, fontSize: 14 },

  // Online Shop CTA
  onlineShopCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 14, borderRadius: 18, padding: 16 },
  onlineShopIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  onlineShopStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  onlineShopDot: { width: 7, height: 7, borderRadius: 3.5 },
  onlineShopTitle: { fontFamily: fonts.extraBold, fontSize: 15, color: '#fff' },
  onlineShopSub: { fontFamily: fonts.medium, fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  onlineShopPrompt: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 14, borderRadius: 18, padding: 14, borderWidth: 1.5 },
  onlineShopNewBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  onlineShopNewBadgeText: { fontFamily: fonts.extraBold, fontSize: 10, letterSpacing: 0.6, color: '#fff' },

  // Daily goal ring
  goalCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 14, borderRadius: 18, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  goalRingWrap: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  goalRingCenter: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  goalPct: { fontFamily: fonts.extraBold, fontSize: 22 },
  goalLbl: { fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 1 },
  goalAmount: { fontFamily: fonts.extraBold, fontSize: 16, marginTop: 6 },
  goalRemain: { fontFamily: fonts.medium, fontSize: 12.5, marginTop: 4 },
  goalPrompt: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 14, borderRadius: 18, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },

  // 7-day sparkline
  weekCard: { marginHorizontal: 16, marginTop: 14, borderRadius: 18, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  weekHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  weekTitle: { fontFamily: fonts.extraBold, fontSize: 15 },
  weekSub: { fontFamily: fonts.medium, fontSize: 11.5, marginTop: 1 },
  weekTotal: { fontFamily: fonts.extraBold, fontSize: 16 },
  weekBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  weekCol: { flex: 1, alignItems: 'center', gap: 8 },
  weekBarTrack: { height: 64, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  weekBar: { width: '70%', borderRadius: 6, minHeight: 4, overflow: 'hidden' },
  weekDay: { fontSize: 11 },

  // Insight/alert widget stacks row
  widgetRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 14 },

  // Section titles
  sectionTitle: { fontFamily: fonts.extraBold, fontSize: 17, paddingHorizontal: 16, marginTop: 14, marginBottom: 14, letterSpacing: -0.3 },

  // Group label — same small-caps eyebrow style as MenuScreen's section headers
  groupLabel: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.8, marginLeft: 24 },
  // Collapsing wrapper for the "QUICK ACTIONS" label — owns the vertical
  // spacing (as an animated height) so the whole thing folds to 0 when the
  // row pins. justifyContent centers the label within its full-state height.
  groupLabelWrap: { overflow: 'hidden', justifyContent: 'center' },

  // Quick actions — circular gradient icon, no card background. `qaItem` has
  // an animated height (full → stuck) driven per-tile; the circle sits at
  // the top and the label is absolutely positioned at the bottom so it holds
  // NO layout height — that's what lets the tile collapse cleanly to a thin
  // icon-only strip when the row pins, instead of leaving empty label space.
  qaItem: { alignItems: 'center', width: QA_ITEM_FULL_W, paddingTop: 2, overflow: 'hidden' },
  qaCircle: { width: QA_CIRCLE_FULL, height: QA_CIRCLE_FULL, borderRadius: QA_CIRCLE_FULL / 2, justifyContent: 'center', alignItems: 'center' },
  qaLabelAbs: { position: 'absolute', bottom: 0, width: QA_ITEM_FULL_W, fontFamily: fonts.semiBold, fontSize: 11.5, textAlign: 'center' },
  // Solid fill + hairline bottom border behind the pinned row — opacity
  // fades in with `qaProgress`, so it's invisible (hero shows through) until
  // the row is actually pinning.
  qaStickyBg: { borderBottomWidth: StyleSheet.hairlineWidth },

    // Pinned online-shop status strip — thin bar stacked under the Quick
  // Actions bar. Absolute (sibling of the ScrollView), animated height in.
  onlineStickyBar: {
    position: 'absolute', left: 0, right: 0, zIndex: 40, elevation: 10,
    overflow: 'hidden', borderBottomWidth: StyleSheet.hairlineWidth,
  },
  onlineStickyInner: { flex: 1, justifyContent: 'center' },
  onlineStickyTouchable: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, height: ONLINE_STUCK_H },
  onlineStickyText: { flex: 1, fontFamily: fonts.semiBold, fontSize: 13 },

  // Quick Actions editor sheet — toggle + drag-to-reorder row.
  // Horizontal padding lives on `qaEditRow` itself (not just the list's
  // `qaEditContent`) — the row being dragged renders in
  // react-native-draggable-flatlist's own overlay layer, which sits outside
  // contentContainerStyle, so a container-level-only inset left the dragged
  // row's highlighted background spanning edge-to-edge instead of matching
  // the resting rows' inset.
  qaEditContent: { paddingBottom: 24 },
  qaEditRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: SHEET_PADDING,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  qaEditRowActive: {
    backgroundColor: c.surface, borderRadius: 12, elevation: 6,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
  },
  qaEditCheck: { width: 22, height: 22 },
  qaEditIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  qaEditLabel: { flex: 1, fontFamily: fonts.semiBold, fontSize: 14.5 },
  qaEditHandle: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  // Sections — top selling, recent bills
  section: { marginHorizontal: 16, marginTop: 14, borderRadius: 18, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, marginBottom: 0 },
  sectionInTitle: { fontFamily: fonts.extraBold, fontSize: 16, marginBottom: 14 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  seeAll: { fontFamily: fonts.bold, fontSize: 13 },

  // Top selling rows
  topRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 12 },
  topRankBadge: { width: 30, height: 30, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  topRank: { fontFamily: fonts.extraBold, fontSize: 13 },
  topName: { flex: 1, fontFamily: fonts.semiBold, fontSize: 14 },
  topQtyBadge: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 12 },
  topQty: { fontFamily: fonts.bold, fontSize: 12 },

  // Empty state
  emptyCard: { marginHorizontal: 16, marginTop: 14, borderRadius: 18, paddingVertical: 30, paddingHorizontal: 24, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  emptyIcon: { width: 62, height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontFamily: fonts.extraBold, fontSize: 17 },
  emptySub: { fontFamily: fonts.medium, fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 6, marginBottom: 18, paddingHorizontal: 8 },

  // Bill rows
  billRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 12 },
  billMode: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  billTime: { fontFamily: fonts.bold, fontSize: 13 },
  billItems: { fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  billAmt: { fontFamily: fonts.extraBold, fontSize: 15 },
});
