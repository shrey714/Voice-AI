import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  withSpring,
  useAnimatedStyle,
  useDerivedValue,
  SharedValue,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { NavigationContainer, DefaultTheme, DarkTheme, useNavigationState } from '@react-navigation/native';
import { createMaterialTopTabNavigator } from '@react-navigation/material-top-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { MotiView } from 'moti';
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
import BackupRestoreScreen from '../screens/BackupRestoreScreen';
import MenuScreen from '../screens/MenuScreen';
import AppHeader from '../components/common/AppHeader';
import { Toaster } from 'sonner-native';
import { useAppTheme } from '../theme';
import { useScreenRadius } from '../utils/screenRadius';

const TopTab = createMaterialTopTabNavigator();
const HomeStack = createNativeStackNavigator();
const BillingStack = createNativeStackNavigator();
const InventoryStack = createNativeStackNavigator();
const RecordsStack = createNativeStackNavigator();
const MenuStack = createNativeStackNavigator();

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
      <InventoryStack.Screen name="ProductForm" component={ProductFormScreen} />
      <InventoryStack.Screen name="CsvImport" component={CsvImportScreen} options={{ title: 'Bulk Import CSV' }} />
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
      <MenuStack.Screen name="Udhaar" component={UdhaarScreen} options={{ title: 'Udhaar · Credit' }} />
      <MenuStack.Screen name="Supplier" component={SupplierScreen} options={{ title: 'Suppliers' }} />
      <MenuStack.Screen name="Purchases" component={PurchasesScreen} options={{ title: 'Purchases' }} />
      <MenuStack.Screen name="PurchaseForm" component={PurchaseFormScreen} options={{ title: 'New Purchase / GRN' }} />
      <MenuStack.Screen name="Reorder" component={ReorderScreen} options={{ title: 'Reorder Stock' }} />
      <MenuStack.Screen name="StockTake" component={StockTakeScreen} options={{ title: 'Stock Take' }} />
      <MenuStack.Screen name="StockTakeHistory" component={StockTakeHistoryScreen} options={{ title: 'Past Stock Takes' }} />
      <MenuStack.Screen name="StockTakeCount" component={StockTakeCountScreen} options={{ title: 'Count Stock' }} />
      <MenuStack.Screen name="StockTakeReview" component={StockTakeReviewScreen} options={{ title: 'Review & Commit' }} />
      <MenuStack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      <MenuStack.Screen name="ShopInfo" component={ShopInfoScreen} options={{ title: 'Shop Information' }} />
      <MenuStack.Screen name="ManageOptions" component={ManageOptionsScreen} options={{ title: 'Preferences' }} />
      <MenuStack.Screen name="ReminderSettings" component={ReminderSettingsScreen} options={{ title: 'WhatsApp Messages' }} />
      <MenuStack.Screen name="BackupRestore" component={BackupRestoreScreen} options={{ title: 'Backup & Restore' }} />
    </MenuStack.Navigator>
  );
}

// One header for the whole app — every stack/tab renders the same <AppHeader>,
// so font, height, and theme are identical everywhere. See AppHeader.tsx.
const headerOpts = (_colors?: any) => ({
  header: (props: any) => <AppHeader {...props} />,
});

const FULLSCREEN_SCREENS = new Set(['StockTake', 'StockTakeCount', 'StockTakeReview', 'StockTakeHistory', 'AskAi']);

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

// Instagram-style floating bottom bar: a rounded "pill" with evenly-spaced flat
// icons. Highlights the active tab and gives a selection haptic on tab change.
function BottomBar({ state, navigation, colors, isDark }: any) {
  const insets = useSafeAreaInsets();
  const prevIndex = useRef(state.index);
  const [barWidth, setBarWidth] = useState(0);
  // Fractional pill position (0 = first tab, numTabs-1 = last tab).
  const pillProgress = useSharedValue<number>(state.index);
  // Records pill position at the start of each drag so onUpdate can add delta.
  const dragStartProgress = useSharedValue(0);

  useEffect(() => {
    if (prevIndex.current !== state.index) {
      prevIndex.current = state.index;
      Haptics.selectionAsync();
    }
    pillProgress.value = withSpring(state.index, {
      damping: 20, stiffness: 200, mass: 0.8,
    });
  }, [state.index]);

  const activeRoute = getDeepActiveRoute(state.routes[state.index]);
  const isHidden = FULLSCREEN_SCREENS.has(activeRoute);

  const numTabs = state.routes.length;
  const pillWidth = barWidth > 0 ? (barWidth - 6) / numTabs : 0;

  const pillAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: 3 + pillProgress.value * pillWidth }],
  }));

  // Called from the worklet (UI thread) → runs navigation on JS thread.
  const navigateToTab = useCallback((tabIndex: number) => {
    const route = state.routes[tabIndex];
    if (route) navigation.navigate(route.name);
  }, [state.routes, navigation]);

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
      animate={{ translateY: isHidden ? 120 : 0, opacity: isHidden ? 0 : 1 }}
      transition={{ type: 'timing', duration: 300 }}
      style={[styles.barWrap, { paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom - 10, 10) : 20 }]}
      pointerEvents={isHidden ? 'none' : 'box-none'}
    >
      <GestureDetector gesture={panGesture}>
      <BlurView
        intensity={50}
        tint={isDark ? 'dark' : 'light'}
        experimentalBlurMethod="dimezisBlurView"
        style={[styles.bar, { borderColor: colors.border, backgroundColor: colors.surface + '40' }]}
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
      >
        {/* Sliding pill — behind the icons */}
        {pillWidth > 0 && (
          <Animated.View
            style={[
              styles.slidingPill,
              { width: pillWidth, backgroundColor: colors.primaryLight + '90' },
              pillAnimStyle,
            ]}
            pointerEvents="none"
          />
        )}

        {state.routes.map((route: any, index: number) => {
          const ic = TAB_ICONS[route.name];
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (state.index !== index && !event.defaultPrevented) navigation.navigate(route.name);
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
      </BlurView>
      </GestureDetector>
    </MotiView>
  );
}

// Must be rendered inside NavigationContainer so useNavigationState works.
function MainTabs({ colors, isDark }: { colors: any; isDark: boolean }) {
  const navState = useNavigationState(s => s);
  const activeRoute = navState ? getDeepActiveRoute(navState.routes[navState.index]) : '';
  const swipeEnabled = !FULLSCREEN_SCREENS.has(activeRoute);

  return (
    <TopTab.Navigator
      tabBarPosition="bottom"
      tabBar={(props: any) => <BottomBar {...props} colors={colors} isDark={isDark} />}
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

export default function AppNavigator() {
  const { colors, isDark } = useAppTheme();

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
    <NavigationContainer theme={navTheme}>
      <MainTabs colors={colors} isDark={isDark} />
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
    paddingHorizontal: 30,
    paddingTop: 8,
    backgroundColor: 'transparent',
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
