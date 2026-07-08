import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  withSpring,
  withTiming,
  useAnimatedStyle,
  useDerivedValue,
  interpolate,
  SharedValue,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme, DarkTheme, useNavigationState } from '@react-navigation/native';
import { navigationRef } from './navigationRef';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { MotiView, AnimatePresence } from 'moti';
import * as Haptics from 'expo-haptics';

import DashboardScreen from '../screens/DashboardScreen';
import AskAiScreen from '../screens/AskAiScreen';
import BillingScreen from '../screens/billing/BillingScreen';
import BillHistoryScreen from '../screens/billing/BillHistoryScreen';
import InventoryScreen from '../screens/inventory/InventoryScreen';
import CsvImportScreen from '../screens/inventory/CsvImportScreen';
import ProductFormScreen from '../screens/inventory/ProductFormScreen';
import AnalyticsScreen from '../screens/AnalyticsScreen';
import ExpensesScreen from '../screens/ExpensesScreen';
import SettingsScreen from '../screens/SettingsScreen';
import UdhaarScreen from '../screens/UdhaarScreen';
import SupplierScreen from '../screens/SupplierScreen';
import PurchasesScreen from '../screens/PurchasesScreen';
import PurchaseFormScreen from '../screens/PurchaseFormScreen';
import StockTakeScreen from '../screens/StockTakeScreen';
import StockTakeCountScreen from '../screens/StockTakeCountScreen';
import StockTakeReviewScreen from '../screens/StockTakeReviewScreen';
import StockTakeHistoryScreen from '../screens/StockTakeHistoryScreen';
import ExportsScreen from '../screens/ExportsScreen';
import ManageOptionsScreen from '../screens/ManageOptionsScreen';
import ShopInfoScreen from '../screens/ShopInfoScreen';
import ReminderSettingsScreen from '../screens/ReminderSettingsScreen';
import ReorderScreen from '../screens/ReorderScreen';
import DayCloseScreen from '../screens/DayCloseScreen';
import QuickEditScreen from '../screens/inventory/QuickEditScreen';
import BackupRestoreScreen from '../screens/BackupRestoreScreen';
import MenuScreen from '../screens/MenuScreen';
import OnlineShopDashboard from '../screens/onlineshop/OnlineShopDashboard';
import OnlineOrdersScreen from '../screens/onlineshop/OnlineOrdersScreen';
import OnlineOrderDetailScreen from '../screens/onlineshop/OnlineOrderDetailScreen';
import OnlineInventoryScreen from '../screens/onlineshop/OnlineInventoryScreen';
import OnlineProductFormScreen from '../screens/onlineshop/OnlineProductFormScreen';
import AppHeader from '../components/common/AppHeader';
import { Toaster } from 'sonner-native';
import { useAppTheme } from '../theme';
import { useAppStore } from '../stores/useAppStore';
import { useScreenRadius } from '../utils/screenRadius';
import { registerModeSwitcher } from './navigationRef';
import PressableScale from '../components/common/PressableScale';

const TopTab = createMaterialTopTabNavigator();
// The one true root navigator directly under NavigationContainer — Local and
// Online are its two screens. React Navigation only allows a single navigator
// per Screen/container; nesting them here (rather than as two sibling
// navigators both directly under NavigationContainer) is what keeps each
// portion mounted-but-hidden instead of unmounted, using react-navigation's
// own supported "lazy mount once, never unmount on blur" behavior.
const RootTab = createMaterialTopTabNavigator();
const HomeStack = createNativeStackNavigator();
const BillingStack = createNativeStackNavigator();
const InventoryStack = createNativeStackNavigator();
const RecordsStack = createNativeStackNavigator();
const MenuStack = createNativeStackNavigator();
const OnlineDashboardStack = createNativeStackNavigator();
const OnlineOrdersStack = createNativeStackNavigator();
const OnlineInventoryStack = createNativeStackNavigator();

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function HomeStackNav({ colors }: { colors: any }) {
  return (
    <HomeStack.Navigator screenOptions={{...headerOpts(colors), animation: 'slide_from_right'}}>
      <HomeStack.Screen name="DashboardMain" component={DashboardScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="AskAi" component={AskAiScreen} options={{ title: 'Ask AI' }} />
    </HomeStack.Navigator>
  );
}

function BillingStackNav({ colors }: { colors: any }) {
  return (
    <BillingStack.Navigator screenOptions={headerOpts(colors)}>
      <BillingStack.Screen name="BillingMain" component={BillingScreen} options={{ title: 'New Bill' }} />
    </BillingStack.Navigator>
  );
}

function InventoryStackNav({ colors }: { colors: any }) {
  return (
    <InventoryStack.Navigator screenOptions={headerOpts(colors)}>
      <InventoryStack.Screen name="InventoryMain" component={InventoryScreen} options={{ title: 'Inventory' }} />
      <InventoryStack.Screen name="ProductForm" component={ProductFormScreen} options={{ roundedBottom: true } as any} />
      <InventoryStack.Screen name="CsvImport" component={CsvImportScreen} options={{ title: 'Bulk Import CSV', roundedBottom: true } as any} />
    </InventoryStack.Navigator>
  );
}

function RecordsStackNav({ colors }: { colors: any }) {
  return (
    <RecordsStack.Navigator screenOptions={headerOpts(colors)}>
      <RecordsStack.Screen name="RecordsMain" component={BillHistoryScreen} options={{ title: 'Bill History' }} />
    </RecordsStack.Navigator>
  );
}

function MenuStackNav({ colors }: { colors: any }) {
  return (
    <MenuStack.Navigator screenOptions={{...headerOpts(colors), 
      // animation: 'slide_from_right', 
      // presentation: 'card'
    }}>
      <MenuStack.Screen name="MenuMain" component={MenuScreen} options={{ title: 'More' }} />
      <MenuStack.Screen name="Analytics" component={AnalyticsScreen} options={{ title: 'Analytics' }} />
      <MenuStack.Screen name="Exports" component={ExportsScreen} options={{ title: 'Export Reports' }} />
      <MenuStack.Screen name="Expenses" component={ExpensesScreen} options={{ title: 'Expenses' }} />
      <MenuStack.Screen name="DayClose" component={DayCloseScreen} options={{ title: 'Day Close' }} />
      <MenuStack.Screen name="Udhaar" component={UdhaarScreen} options={{ title: 'Udhaar · Credit' }} />
      <MenuStack.Screen name="Supplier" component={SupplierScreen} options={{ title: 'Suppliers', roundedBottom: true } as any} />
      <MenuStack.Screen name="Purchases" component={PurchasesScreen} options={{ title: 'Purchases', roundedBottom: true } as any} />
      <MenuStack.Screen name="PurchaseForm" component={PurchaseFormScreen} options={{ title: 'New Purchase / GRN' }} />
      <MenuStack.Screen name="Reorder" component={ReorderScreen} options={{ title: 'Reorder Stock', roundedBottom: true } as any} />
      <MenuStack.Screen name="QuickEdit" component={QuickEditScreen} options={{ title: 'Quick Edit', roundedBottom: true } as any} />
      <MenuStack.Screen name="StockTake" component={StockTakeScreen} options={{ title: 'Stock Take', roundedBottom: true } as any} />
      <MenuStack.Screen name="StockTakeHistory" component={StockTakeHistoryScreen} options={{ title: 'Past Stock Takes', roundedBottom: true } as any} />
      <MenuStack.Screen name="StockTakeCount" component={StockTakeCountScreen} options={{ title: 'Count Stock', roundedBottom: true } as any} />
      <MenuStack.Screen name="StockTakeReview" component={StockTakeReviewScreen} options={{ title: 'Review & Commit', roundedBottom: true } as any} />
      <MenuStack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      <MenuStack.Screen name="ShopInfo" component={ShopInfoScreen} options={{ title: 'Shop Information', roundedBottom: true } as any} />
      <MenuStack.Screen name="ManageOptions" component={ManageOptionsScreen} options={{ title: 'Preferences', roundedBottom: true } as any} />
      <MenuStack.Screen name="ReminderSettings" component={ReminderSettingsScreen} options={{ title: 'WhatsApp Messages', roundedBottom: true } as any} />
      <MenuStack.Screen name="BackupRestore" component={BackupRestoreScreen} options={{ title: 'Backup & Restore', roundedBottom: true } as any} />
    </MenuStack.Navigator>
  );
}

// Online portion — a fully separate set of stacks/tabs from the local one
// (see MainTabs/OnlineMainTabs below). ShopInfo is registered here too since
// it's the one screen common to both portions — reused as-is, not shared
// via cross-navigator navigation, since it always re-fetches from Supabase
// on mount anyway.
function OnlineDashboardStackNav({ colors }: { colors: any }) {
  return (
    <OnlineDashboardStack.Navigator screenOptions={headerOpts(colors)}>
      <OnlineDashboardStack.Screen name="OnlineShopDashboardMain" component={OnlineShopDashboard} options={{ headerShown: false }} />
      <OnlineDashboardStack.Screen name="ShopInfo" component={ShopInfoScreen} options={{ title: 'Shop Information', roundedBottom: true } as any} />
    </OnlineDashboardStack.Navigator>
  );
}

function OnlineOrdersStackNav({ colors }: { colors: any }) {
  return (
    <OnlineOrdersStack.Navigator screenOptions={headerOpts(colors)}>
      <OnlineOrdersStack.Screen name="OnlineOrdersMain" component={OnlineOrdersScreen} options={{ title: 'Online Orders', roundedBottom: true } as any} />
      <OnlineOrdersStack.Screen name="OnlineOrderDetail" component={OnlineOrderDetailScreen} options={{ title: 'Order Detail', roundedBottom: true } as any} />
    </OnlineOrdersStack.Navigator>
  );
}

function OnlineInventoryStackNav({ colors }: { colors: any }) {
  return (
    <OnlineInventoryStack.Navigator screenOptions={headerOpts(colors)}>
      <OnlineInventoryStack.Screen name="OnlineInventoryMain" component={OnlineInventoryScreen} options={{ title: 'Online Products', roundedBottom: true } as any} />
      <OnlineInventoryStack.Screen name="OnlineProductForm" component={OnlineProductFormScreen} options={{ title: 'Online Product', roundedBottom: true } as any} />
    </OnlineInventoryStack.Navigator>
  );
}

// One header for the whole app — every stack/tab renders the same <AppHeader>,
// so font, height, and theme are identical everywhere. See AppHeader.tsx.
const headerOpts = (_colors?: any) => ({
  header: (props: any) => <AppHeader {...props} />,
});

const FULLSCREEN_SCREENS = new Set(['StockTake', 'StockTakeCount', 'StockTakeReview', 'StockTakeHistory', 'AskAi', 'QuickEdit']);

// Wraps a tab page in an opaque, corner-clipped card. The corner radius is the
// device's *actual* screen radius (resolved async from the native module, with a
// tuned fallback), so pages sit flush at rest and read as rounded "cards"
// mid-swipe. The black pager backdrop shows through the pageMargin gap + corners.
function RoundedScene({ colors, children }: { colors: any; children: React.ReactNode }) {
  const radius = useScreenRadius();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, borderRadius: radius, overflow: 'hidden' }}>
      {children}
    </View>
  );
}

// Walks the nested nav state to find the deepest active route name.
function getDeepActiveRoute(route: any): string {
  if (!route.state) return route.name;
  const { routes, index } = route.state;
  return getDeepActiveRoute(routes[index ?? 0]);
}

// Instagram-style icon set: outline when inactive, filled when active.
const TAB_ICONS: Record<string, { off: IoniconsName; on: IoniconsName }> = {
  Home:      { off: 'home-outline',        on: 'home' },
  Inventory: { off: 'cube-outline',        on: 'cube' },
  Billing:   { off: 'cart-outline',        on: 'cart' },
  Records:   { off: 'stats-chart-outline', on: 'stats-chart' },
  More:      { off: 'grid-outline',        on: 'grid' },
  OnlineDashboard: { off: 'storefront-outline', on: 'storefront' },
  OnlineOrders:    { off: 'bag-handle-outline',  on: 'bag-handle' },
  OnlineInventory: { off: 'cube-outline',        on: 'cube' },
};

const ICON_SIZE = 26;

// Base outline icon with one clipped filled layer on top. The outline is always
// present at full 26px width, and the filled icon is clipped to show only where
// the pill currently is. Zero gaps, zero bleed-through, and both layers are
// rendered at the identical baseline position.
function AnimatedTabIcon({
  pillProgress,
  index,
  pillWidth,
  ic,
  onPress,
  colors,
}: {
  pillProgress: SharedValue<number>;
  index: number;
  pillWidth: number;
  ic: { on: IoniconsName; off: IoniconsName };
  onPress: () => void;
  colors: any;
}) {
  const clip = useDerivedValue(() => {
    const W = pillWidth;
    if (W <= 0) return { clipL: 0, clipW: 0 };
    const p = pillProgress.value;
    const overlapL = Math.max(0, (p - index) * W);
    const overlapR = Math.min(W, (p + 1 - index) * W);
    const iconOffset = (W - ICON_SIZE) / 2;
    const clipL = Math.max(0, overlapL - iconOffset);
    const clipR = Math.min(ICON_SIZE, overlapR - iconOffset);
    return { clipL, clipW: Math.max(0, clipR - clipL) };
  });

  const filledClipStyle = useAnimatedStyle(() => ({
    left: clip.value.clipL,
    width: clip.value.clipW,
  }));

  const filledInnerStyle = useAnimatedStyle(() => ({
    left: -clip.value.clipL,
  }));

  return (
    <TouchableOpacity style={styles.barItem} onPress={onPress} activeOpacity={0.7}>
      <View style={{ width: ICON_SIZE, height: ICON_SIZE }}>
        {/* Base: filled icon in muted color — same metrics as the clipped layer below */}
        <Ionicons
          name={ic.on}
          size={ICON_SIZE}
          color={colors.textMuted}
          style={{ position: 'absolute' }}
        />

        {/* Primary: filled icon clipped to only show where the pill is */}
        <Animated.View
          style={[
            { position: 'absolute', top: 0, height: ICON_SIZE, overflow: 'hidden' },
            filledClipStyle,
          ]}
        >
          {/* Explicit width/height so the glyph always renders full-size and only
              the parent window clips it — without this, Yoga collapses the inner
              view to the clip width and squeezes the glyph into a thin sliver. */}
          <Animated.View
            style={[
              { position: 'absolute', top: 0, width: ICON_SIZE, height: ICON_SIZE },
              filledInnerStyle,
            ]}
          >
            <Ionicons name={ic.on} size={ICON_SIZE} color={colors.primary} />
          </Animated.View>
        </Animated.View>
      </View>
    </TouchableOpacity>
  );
}

// Small frosted-glass circle beside the main pill — switches between the
// Local and Online portions. Deliberately NOT one of the swipeable tabs (see
// AppNavigator's mode state): it sits outside UnifiedBottomBar's route-driven pill
// math entirely, styled to match but structurally independent.
//
// Simple crossfade between storefront/home — outgoing glyph fades out as the
// incoming one fades in. No rotation, no blur.
function ModeSwitchButton({ icon, onPress, colors, isDark }: { icon: IoniconsName; onPress: () => void; colors: any; isDark: boolean }) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.9}>
      <BlurView
        intensity={50}
        tint={isDark ? 'dark' : 'light'}
        experimentalBlurMethod="dimezisBlurView"
        style={[styles.switchBtn, { borderColor: colors.border, backgroundColor: colors.surface + '40' }]}
      >
        <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
          {/* AnimatePresence overlaps the outgoing/incoming icon's exit/enter
              instead of us manually juggling a shared value + two pieces of
              React state — that manual approach had a one-frame race where
              the new icon could pop in at full opacity before its fade-in
              actually started, reading as a flicker. */}
          <AnimatePresence>
            <MotiView
              key={icon}
              style={StyleSheet.absoluteFill}
              from={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'timing', duration: 220 }}
            >
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={icon} size={22} color={colors.primary} />
              </View>
            </MotiView>
          </AnimatePresence>
        </View>
      </BlurView>
    </PressableScale>
  );
}

// Bridges a TopTab.Navigator's own tabBar render prop up to the persistent
// UnifiedBottomBar below, without rendering anything itself. The `useEffect`
// (not a plain call during render) defers the parent state update to after
// this commits — calling it straight from the render body would be a
// "setState while rendering a different component" violation, since
// react-navigation invokes `tabBar` synchronously as part of its own render.
function TabBarBridge({ state, navigation, onReport }: any) {
  // Deps on `state`/`navigation` themselves (not a no-array effect) — react-navigation
  // only gives these new references when something actually changed, so this only
  // re-reports on real nav updates. A no-deps effect would construct a fresh
  // `{state, navigation}` object every render, making the parent's setState always
  // look "changed" and re-render this right back into the effect — infinite loop.
  useEffect(() => { onReport({ state, navigation }); }, [state, navigation, onReport]);
  return null;
}

// Instagram-style floating bottom bar: a rounded "pill" with evenly-spaced flat
// icons. One persistent instance shared by both the Local and Online portions
// (see AppNavigator) — the frosted BlurView, gesture detector and sliding pill
// never remount when switching portions (a real BlurView remount was the
// actual source of the switch feeling laggy); only the icon row cross-fades
// between the two route sets.
function UnifiedBottomBar({ mode, local, online, colors, isDark, modeSwitch }: any) {
  const insets = useSafeAreaInsets();
  const active = mode === 'local' ? local : online;

  const prevIndex = useRef(active?.state.index ?? 0);
  const prevMode = useRef(mode);
  const [barWidth, setBarWidth] = useState(0);
  // Fractional pill position (0 = first tab, numTabs-1 = last tab).
  const pillProgress = useSharedValue<number>(active?.state.index ?? 0);
  // Records pill position at the start of each drag so onUpdate can add delta.
  const dragStartProgress = useSharedValue(0);

  const numTabs = active?.state.routes.length ?? 1;
  const pillWidth = barWidth > 0 ? (barWidth - 6) / numTabs : 0;
  // Animated copy of `pillWidth` — Local (5 tabs) and Online (3 tabs) have
  // different pill widths, so this tweens smoothly on a mode switch instead
  // of snapping straight to the new size.
  const pillWidthSV = useSharedValue(pillWidth);
  useEffect(() => {
    pillWidthSV.value = withTiming(pillWidth, { duration: 280 });
  }, [pillWidth]);

  useEffect(() => {
    if (!active) return;
    if (prevMode.current !== mode) {
      // Crossing portions — same light intensity as the ordinary tab-change
      // tick, but a two-pulse "duk-duk" rhythm instead of a single tap, so
      // it reads as a distinct kind of change (Local <-> Online) rather than
      // just a stronger version of the same tick. Then glide to the new
      // index/width together (see pillWidthSV above) rather than snapping;
      // the icon row cross-fades separately below so it doesn't read as
      // sliding through tabs that don't exist in the other portion.
      prevMode.current = mode;
      prevIndex.current = active.state.index;
      Haptics.selectionAsync();
      setTimeout(() => Haptics.selectionAsync(), 90);
      pillProgress.value = withSpring(active.state.index, { damping: 22, stiffness: 180, mass: 0.9 });
      return;
    }
    if (prevIndex.current !== active.state.index) {
      prevIndex.current = active.state.index;
      Haptics.selectionAsync();
      pillProgress.value = withSpring(active.state.index, {
        damping: 20, stiffness: 200, mass: 0.8,
      });
    }
  }, [active?.state.index, mode]);

  const activeRoute = active ? getDeepActiveRoute(active.state.routes[active.state.index]) : '';
  const isHidden = FULLSCREEN_SCREENS.has(activeRoute);

  const pillAnimStyle = useAnimatedStyle(() => ({
    width: pillWidthSV.value,
    transform: [{ translateX: 3 + pillProgress.value * pillWidthSV.value }],
  }));

  // Called from the worklet (UI thread) → runs navigation on JS thread.
  const navigateToTab = useCallback((tabIndex: number) => {
    const route = active?.state.routes[tabIndex];
    if (route) active.navigation.navigate(route.name);
  }, [active]);

  const panGesture = Gesture.Pan()
    // Only activate after an intentional horizontal swipe — taps fall through to icons.
    .activeOffsetX([-6, 6])
    .failOffsetY([-20, 20])
    .onBegin(() => {
      dragStartProgress.value = pillProgress.value;
    })
    .onUpdate((e) => {
      if (pillWidth <= 0) return;
      const next = dragStartProgress.value + e.translationX / pillWidth;
      pillProgress.value = Math.max(0, Math.min(numTabs - 1, next));
    })
    .onEnd(() => {
      const target = Math.max(0, Math.min(numTabs - 1, Math.round(pillProgress.value)));
      pillProgress.value = withSpring(target, { damping: 20, stiffness: 200, mass: 0.8 });
      runOnJS(navigateToTab)(target);
    })
    .onTouchesCancelled(() => {
      // Snap back to nearest on interrupt (e.g. incoming call).
      const target = Math.max(0, Math.min(numTabs - 1, Math.round(pillProgress.value)));
      pillProgress.value = withSpring(target, { damping: 20, stiffness: 200, mass: 0.8 });
    });

  return (
    <MotiView
      from={{ translateY: 24, opacity: 0 }}
      animate={{ translateY: isHidden ? 120 : 0, opacity: isHidden ? 0 : 1 }}
      transition={{ type: 'timing', duration: 300 }}
      style={[styles.barWrap, { paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom - 10, 10) : 20 }]}
      pointerEvents={isHidden ? 'none' : 'box-none'}
    >
      <View style={styles.barRow}>
        <GestureDetector gesture={panGesture}>
        <BlurView
          intensity={50}
          tint={isDark ? 'dark' : 'light'}
          experimentalBlurMethod="dimezisBlurView"
          style={[styles.bar, { flex: 1, borderColor: colors.border, backgroundColor: colors.surface + '40' }]}
          onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        >
          {/* Sliding pill — behind the icons */}
          {pillWidth > 0 && (
            <Animated.View
              style={[
                styles.slidingPill,
                { backgroundColor: colors.primaryLight + '90' },
                pillAnimStyle,
              ]}
              pointerEvents="none"
            />
          )}

          {/* Icon row cross-fades between the Local and Online route sets;
              the BlurView/pill/gesture above stay mounted throughout. */}
          <AnimatePresence exitBeforeEnter>
            {active && (
              <MotiView
                key={mode}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}
                from={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'timing', duration: 160 }}
                exitTransition={{ type: 'timing', duration: 120 }}
              >
                {active.state.routes.map((route: any, index: number) => {
                  const ic = TAB_ICONS[route.name];
                  const onPress = () => {
                    const event = active.navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                    if (active.state.index !== index && !event.defaultPrevented) active.navigation.navigate(route.name);
                  };
                  return (
                    <AnimatedTabIcon
                      key={route.key}
                      pillProgress={pillProgress}
                      index={index}
                      pillWidth={pillWidth}
                      ic={ic}
                      onPress={onPress}
                      colors={colors}
                    />
                  );
                })}
              </MotiView>
            )}
          </AnimatePresence>
        </BlurView>
        </GestureDetector>
        {modeSwitch}
      </View>
    </MotiView>
  );
}

// Must be rendered inside NavigationContainer so useNavigationState works.
// Reports its tab-bar state up to AppNavigator's persistent UnifiedBottomBar
// instead of rendering its own bar (see TabBarBridge/UnifiedBottomBar above).
function MainTabs({ colors, isDark, onReport }: { colors: any; isDark: boolean; onReport: (bar: any) => void }) {
  const navState = useNavigationState(s => s);
  const activeRoute = navState ? getDeepActiveRoute(navState.routes[navState.index]) : '';
  const swipeEnabled = !FULLSCREEN_SCREENS.has(activeRoute);

  return (
    <TopTab.Navigator
      tabBarPosition="bottom"
      tabBar={(props: any) => <TabBarBridge {...props} onReport={onReport} />}
      screenOptions={{ swipeEnabled, lazy: false }}
      pageMargin={10}
      style={{ backgroundColor: '#000' }}
      sceneContainerStyle={{
        backgroundColor: 'transparent'
      }}
    >
      <TopTab.Screen name="Home">
        {() => <RoundedScene colors={colors}><HomeStackNav colors={colors} /></RoundedScene>}
      </TopTab.Screen>

      <TopTab.Screen name="Inventory">
        {() => <RoundedScene colors={colors}><InventoryStackNav colors={colors} /></RoundedScene>}
      </TopTab.Screen>

      <TopTab.Screen name="Billing">
        {() => <RoundedScene colors={colors}><BillingStackNav colors={colors} /></RoundedScene>}
      </TopTab.Screen>

      <TopTab.Screen name="Records">
        {() => <RoundedScene colors={colors}><RecordsStackNav colors={colors} /></RoundedScene>}
      </TopTab.Screen>

      <TopTab.Screen name="More">
        {() => <RoundedScene colors={colors}><MenuStackNav colors={colors} /></RoundedScene>}
      </TopTab.Screen>
    </TopTab.Navigator>
  );
}

// The Online portion — its own floating tab bar (Dashboard / Orders /
// Products), built with the exact same RoundedScene/pill-swipe machinery as
// the local one, and reporting into the same persistent UnifiedBottomBar.
function OnlineMainTabs({ colors, isDark, onReport }: { colors: any; isDark: boolean; onReport: (bar: any) => void }) {
  const navState = useNavigationState(s => s);
  const activeRoute = navState ? getDeepActiveRoute(navState.routes[navState.index]) : '';
  const swipeEnabled = !FULLSCREEN_SCREENS.has(activeRoute);

  return (
    <TopTab.Navigator
      tabBarPosition="bottom"
      tabBar={(props: any) => <TabBarBridge {...props} onReport={onReport} />}
      screenOptions={{ swipeEnabled, lazy: false }}
      pageMargin={10}
      style={{ backgroundColor: '#000' }}
      sceneContainerStyle={{ backgroundColor: 'transparent' }}
    >
      <TopTab.Screen name="OnlineDashboard">
        {() => <RoundedScene colors={colors}><OnlineDashboardStackNav colors={colors} /></RoundedScene>}
      </TopTab.Screen>

      <TopTab.Screen name="OnlineOrders">
        {() => <RoundedScene colors={colors}><OnlineOrdersStackNav colors={colors} /></RoundedScene>}
      </TopTab.Screen>

      <TopTab.Screen name="OnlineInventory">
        {() => <RoundedScene colors={colors}><OnlineInventoryStackNav colors={colors} /></RoundedScene>}
      </TopTab.Screen>
    </TopTab.Navigator>
  );
}

export default function AppNavigator() {
  const { colors, isDark } = useAppTheme();
  const onlineShopEnabled = useAppStore(s => s.settings.onlineShopEnabled);

  // Each portion's TopTab.Navigator reports its own {state, navigation} up
  // here (via TabBarBridge) instead of rendering its own bar — see
  // UnifiedBottomBar for why this is the one persistent instance for both.
  const [localBar, setLocalBar] = useState<{ state: any; navigation: any } | null>(null);
  const [onlineBar, setOnlineBar] = useState<{ state: any; navigation: any } | null>(null);
  // RootTab's own bar (also via TabBarBridge, rendering nothing) tells us
  // which portion is focused and gives us its `navigation` to actually
  // switch — `lazy: true` on RootTab.Navigator means Online mounts on first
  // visit and, per react-navigation's default (unmountOnBlur: false), simply
  // stays mounted-but-inactive after that. No manual display-toggling needed.
  const [rootBar, setRootBar] = useState<{ state: any; navigation: any } | null>(null);
  const mode: 'local' | 'online' = rootBar?.state.routeNames[rootBar.state.index] === 'Online' ? 'online' : 'local';

  // registerModeSwitcher exposes a module-level function so code outside this
  // component (Home's CTA card, push-notification deep links) can switch
  // portions without prop-drilling. Re-registered whenever rootBar changes so
  // it always navigates via the current (not a stale) navigation object.
  useEffect(() => {
    registerModeSwitcher((m) => rootBar?.navigation.navigate(m === 'online' ? 'Online' : 'Local'));
  }, [rootBar]);
  // If the shopkeeper turns the feature off while sitting in Online mode
  // (e.g. from Shop Information), fall back to Local rather than stranding
  // them on a portion that no longer has a way back in.
  useEffect(() => {
    if (!onlineShopEnabled && mode === 'online') rootBar?.navigation.navigate('Local');
  }, [onlineShopEnabled, mode, rootBar]);

  // Only shopkeepers who've turned on the Online Shop feature see a switch
  // while in Local mode — otherwise this is exactly today's single-portion
  // app. Online mode's switch always points back to Local, unconditionally.
  const modeSwitch = mode === 'local'
    ? (onlineShopEnabled ? <ModeSwitchButton icon="storefront" onPress={() => rootBar?.navigation.navigate('Online')} colors={colors} isDark={isDark} /> : undefined)
    : <ModeSwitchButton icon="home" onPress={() => rootBar?.navigation.navigate('Local')} colors={colors} isDark={isDark} />;

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      background: colors.bg,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      primary: colors.primary,
    },
  };

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <RootTab.Navigator
        tabBar={(props: any) => <TabBarBridge {...props} onReport={setRootBar} />}
        screenOptions={{ swipeEnabled: false, lazy: true }}
        // Same black-backdrop-through-a-gap treatment as the inner per-portion
        // tab bars (see MainTabs/OnlineMainTabs) — swiping is disabled here
        // (only the switch button changes portions), but the pager still
        // animates a slide on navigate(), so the gap shows during that too.
        pageMargin={10}
        style={{ backgroundColor: '#000' }}
        sceneContainerStyle={{ backgroundColor: 'transparent' }}
      >
        <RootTab.Screen name="Local">
          {() => <MainTabs colors={colors} isDark={isDark} onReport={setLocalBar} />}
        </RootTab.Screen>
        <RootTab.Screen name="Online">
          {() => <OnlineMainTabs colors={colors} isDark={isDark} onReport={setOnlineBar} />}
        </RootTab.Screen>
      </RootTab.Navigator>
      <UnifiedBottomBar mode={mode} local={localBar} online={onlineBar} colors={colors} isDark={isDark} modeSwitch={modeSwitch} />
      <Toaster
        position="top-center"
        theme={isDark ? 'dark' : 'light'}
        visibleToasts={4}
        swipeToDismissDirection="up"
        duration={2200}
      />
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  // Outer wrapper OVERLAYS the screen (absolute), with a transparent background,
  // so the screen content shows through around the floating pill. Screens reserve
  // bottom room (list paddings / lifted FABs) so nothing important hides under it.
  barWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  // Row holding the main pill + (optionally) the mode-switch circle beside it.
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Matches `.bar`'s frosted-glass treatment at a fixed circular size.
  switchBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  // The Instagram-style rounded pill.
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 58,
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden', // clip the blur to the rounded pill
    elevation: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    padding: 3
  },
  barItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  slidingPill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 50,
    marginVertical: 3
  },
});
