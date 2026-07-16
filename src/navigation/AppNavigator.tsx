import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme, getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { navigationRef, switchAppMode } from './navigationRef';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeBottomTabNavigator } from '@react-navigation/bottom-tabs/unstable';
import { Ionicons } from '@expo/vector-icons';

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
import { fonts } from '../theme/typography';
import { useAppStore } from '../stores/useAppStore';
import { useOnlineShopStore } from '../stores/useOnlineShopStore';
import { useOrderRealtime } from '../hooks/useOrderRealtime';
import { usePendingOrdersLiveActivity } from '../hooks/usePendingOrdersLiveActivity';

const RootStack = createNativeStackNavigator();
const HomeStack = createNativeStackNavigator();
const BillingStack = createNativeStackNavigator();
const InventoryStack = createNativeStackNavigator();
const MenuStack = createNativeStackNavigator();
const OnlineDashboardStack = createNativeStackNavigator();
const OnlineOrdersStack = createNativeStackNavigator();
const OnlineInventoryStack = createNativeStackNavigator();

// iOS gets the real native UITabBarController (Liquid Glass on iOS 26+) via
// React Navigation's native-bottom-tab-navigator. Its tabBarIcon only
// accepts SF Symbols / static images — arbitrary React components (Ionicons)
// aren't supported by the native renderer, so this is a deliberate, verified
// constraint, not an oversight. Android has no SF Symbols equivalent and the
// native renderer only really shines as Liquid Glass on iOS, so Android
// keeps the classic JS bottom-tabs navigator (still a React Navigation
// built-in, still Ionicons, just JS-rendered).
//
// This crashed on every cold launch ("[RNScreens] Invariant violation.
// Expected exactly 1 focused tab, got: 0") when react-native-screens was on
// 4.23.0 — @react-navigation/bottom-tabs@7.18.8's own devDependency pins
// react-native-screens@^4.25.0 (the "golden" stabilized Tabs API; JS-facing
// prop shape changed between 4.23 and 4.25, e.g. `isFocused` prop removed
// from the codegen spec), so 4.23.0 was a genuine API-shape mismatch, not an
// inherent flaw in the approach. Bumping to react-native-screens@4.25.2
// (still RN ≥0.82 compatible, no need for the 0.84+ that 4.26.0 requires)
// resolved it.
const LocalTab = Platform.OS === 'ios' ? createNativeBottomTabNavigator() : createBottomTabNavigator();
const OnlineTab = Platform.OS === 'ios' ? createNativeBottomTabNavigator() : createBottomTabNavigator();

// iOS: no `header` override at all — native-stack renders its own real
// UINavigationBar (automatic Liquid Glass translucency on iOS 26+, native
// large-type rendering, native edge-swipe-to-go-back). `title`/`headerRight`
// on individual Screens work unchanged, since native-stack reads the exact
// same option shape the old custom AppHeader did — AS LONG AS headerRight
// content uses plain flex layout, not `position: 'absolute'` percentage
// centering. Several screens' custom header buttons used exactly that
// (assuming AppHeader's specific fixed-height container, which native-stack
// doesn't provide the same way) and broke; every one of those has been
// rebuilt as a plain flex row — see InventoryScreen, BillHistoryScreen,
// OnlineInventoryScreen, OnlineOrdersScreen, PurchasesScreen, SupplierScreen.
// Android: keeps the custom AppHeader (no native Liquid Glass equivalent to
// gain there, and it already matches the app's Material-ish look).
function useHeaderOpts() {
  const { colors } = useAppTheme();
  if (Platform.OS === 'ios') {
    return {
      headerTintColor: colors.primary,
      headerTitleStyle: { fontFamily: fonts.extraBold, fontSize: 17, color: colors.text },
      headerStyle: { backgroundColor: colors.surface },
    };
  }
  return { header: (props: any) => <AppHeader {...props} /> };
}

function HomeStackNav() {
  const headerOpts = useHeaderOpts();
  return (
    <HomeStack.Navigator screenOptions={headerOpts}>
      <HomeStack.Screen name="DashboardMain" component={DashboardScreen} options={{ headerShown: false }} />
      <HomeStack.Screen name="AskAi" component={AskAiScreen} options={{ title: 'Ask AI' }} />
    </HomeStack.Navigator>
  );
}

function BillingStackNav() {
  const headerOpts = useHeaderOpts();
  return (
    <BillingStack.Navigator screenOptions={headerOpts}>
      <BillingStack.Screen name="BillingMain" component={BillingScreen} options={{ title: 'New Bill' }} />
    </BillingStack.Navigator>
  );
}

function InventoryStackNav() {
  const headerOpts = useHeaderOpts();
  return (
    <InventoryStack.Navigator screenOptions={headerOpts}>
      <InventoryStack.Screen name="InventoryMain" component={InventoryScreen} options={{ title: 'Inventory' }} />
      <InventoryStack.Screen name="ProductForm" component={ProductFormScreen} options={{ presentation: 'modal' }} />
      <InventoryStack.Screen name="CsvImport" component={CsvImportScreen} options={{ title: 'Bulk Import CSV', presentation: 'modal' }} />
    </InventoryStack.Navigator>
  );
}

function MenuStackNav() {
  const headerOpts = useHeaderOpts();
  return (
    <MenuStack.Navigator screenOptions={headerOpts}>
      <MenuStack.Screen name="MenuMain" component={MenuScreen} options={{ title: 'More' }} />
      <MenuStack.Screen name="RecordsMain" component={BillHistoryScreen} options={{ title: 'Bill History' }} />
      <MenuStack.Screen name="Analytics" component={AnalyticsScreen} options={{ title: 'Analytics' }} />
      <MenuStack.Screen name="Exports" component={ExportsScreen} options={{ title: 'Export Reports' }} />
      <MenuStack.Screen name="Expenses" component={ExpensesScreen} options={{ title: 'Expenses' }} />
      <MenuStack.Screen name="DayClose" component={DayCloseScreen} options={{ title: 'Day Close' }} />
      <MenuStack.Screen name="Udhaar" component={UdhaarScreen} options={{ title: 'Udhaar · Credit' }} />
      <MenuStack.Screen name="Supplier" component={SupplierScreen} options={{ title: 'Suppliers' }} />
      <MenuStack.Screen name="Purchases" component={PurchasesScreen} options={{ title: 'Purchases' }} />
      <MenuStack.Screen name="PurchaseForm" component={PurchaseFormScreen} options={{ title: 'New Purchase / GRN', presentation: 'modal' }} />
      <MenuStack.Screen name="Reorder" component={ReorderScreen} options={{ title: 'Reorder Stock' }} />
      <MenuStack.Screen name="QuickEdit" component={QuickEditScreen} options={{ title: 'Quick Edit', presentation: 'modal' }} />
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

// Online portion — a fully separate set of stacks/tabs from the local one.
// ShopInfo is registered here too since it's the one screen common to both
// portions — reused as-is (always re-fetches from Supabase on mount anyway).
function OnlineDashboardStackNav() {
  const headerOpts = useHeaderOpts();
  return (
    <OnlineDashboardStack.Navigator screenOptions={headerOpts}>
      <OnlineDashboardStack.Screen name="OnlineShopDashboardMain" component={OnlineShopDashboard} options={{ headerShown: false }} />
      <OnlineDashboardStack.Screen name="ShopInfo" component={ShopInfoScreen} options={{ title: 'Shop Information' }} />
    </OnlineDashboardStack.Navigator>
  );
}

function OnlineOrdersStackNav() {
  const headerOpts = useHeaderOpts();
  return (
    <OnlineOrdersStack.Navigator screenOptions={headerOpts}>
      <OnlineOrdersStack.Screen name="OnlineOrdersMain" component={OnlineOrdersScreen} options={{ title: 'Online Orders' }} />
      <OnlineOrdersStack.Screen name="OnlineOrderDetail" component={OnlineOrderDetailScreen} options={{ title: 'Order Detail' }} />
    </OnlineOrdersStack.Navigator>
  );
}

function OnlineInventoryStackNav() {
  const headerOpts = useHeaderOpts();
  return (
    <OnlineInventoryStack.Navigator screenOptions={headerOpts}>
      <OnlineInventoryStack.Screen name="OnlineInventoryMain" component={OnlineInventoryScreen} options={{ title: 'Online Products' }} />
      <OnlineInventoryStack.Screen name="OnlineProductForm" component={OnlineProductFormScreen} options={{ title: 'Online Product', presentation: 'modal' }} />
    </OnlineInventoryStack.Navigator>
  );
}

// Screens that want the tab bar out of the way entirely (full-bleed camera /
// wizard flows). getFocusedRouteNameFromRoute reads the *nested* stack's
// active screen so the tab bar can hide even though hiding is a property of
// the outer Tab.Screen, not the inner stack screen.
const FULLSCREEN_ROUTES = new Set(['AskAi', 'QuickEdit', 'StockTakeCount', 'StockTakeReview']);
function tabBarStyleFor(route: any) {
  const focused = getFocusedRouteNameFromRoute(route);
  return focused && FULLSCREEN_ROUTES.has(focused) ? { display: 'none' as const } : undefined;
}

function tabIcon(ionicon: { off: any; on: any }, sf: { off: string; on: string }) {
  if (Platform.OS === 'ios') {
    return ({ focused }: { focused: boolean }) => ({ type: 'sfSymbol' as const, name: (focused ? sf.on : sf.off) as any });
  }
  return ({ focused, color }: { focused: boolean; color: string }) => (
    <Ionicons name={focused ? ionicon.on : ionicon.off} size={24} color={color} />
  );
}

// Never actually navigated to — the tabPress listener (registered where
// these Screens are used) is the sole trigger, blocked from ever completing
// via DIFFERENT mechanisms per platform, because the two navigators aren't
// API-equivalent here:
//
//   iOS (createNativeBottomTabNavigator): `tabBarSelectionEnabled: false` in
//   the Screen's options blocks selection at the native level, so this
//   screen never mounts at all. Its tabPress event is declared
//   `canPreventDefault: false` in the type — calling e.preventDefault() on
//   it throws at runtime (confirmed the hard way first).
//
//   Android (createBottomTabNavigator, classic): does NOT support
//   `tabBarSelectionEnabled`/`tabBarSystemItem` at all (absent from its
//   options type) — they're silently ignored, so without a platform branch
//   here the tab bar actually selects and navigates to this blank screen on
//   tap, i.e. a black screen. Classic tabPress IS preventable
//   (`canPreventDefault: true`), so Android needs e.preventDefault() to
//   block that navigation — the exact opposite of what iOS needs.
//
// A third, separately-broken attempt before this one: a real, selectable
// tab whose component fired switchAppMode() from a mount effect, reasoning
// the RootStack swap would unmount it before it mattered. It doesn't:
// native-stack keeps both 'Local' and 'Online' RootStack screens mounted
// (no unmountOnBlur), so LocalTab.Navigator's own "last selected tab" state
// persisted as "SwitchToOnline" — switching back to Local later re-focused
// that exact tab, its mount effect fired again, and it immediately switched
// back to Online. Repeat forever — this is what made the screens visibly
// ping-pong on their own after a fresh launch.
function NoopScreen() {
  return null;
}

function LocalTabs() {
  const { colors } = useAppTheme();
  const onlineShopEnabled = useAppStore(s => s.settings.onlineShopEnabled);
  return (
    <LocalTab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        // iOS 26+ only (real UITabBarController minimize-on-scroll, same as
        // Apple's own apps) — Android's classic bottom-tabs navigator has no
        // such option and just ignores this, same as `tabBarSystemItem` above.
        tabBarMinimizeBehavior: 'onScrollDown',
      } as any}
    >
      <LocalTab.Screen
        name="Home"
        component={HomeStackNav}
        options={(({ route }: any) => ({
          title: 'Home',
          tabBarIcon: tabIcon({ off: 'home-outline', on: 'home' }, { off: 'house', on: 'house.fill' }),
          tabBarStyle: tabBarStyleFor(route),
        })) as any}
      />
      <LocalTab.Screen
        name="Inventory"
        component={InventoryStackNav}
        options={{ title: 'Inventory', tabBarIcon: tabIcon({ off: 'cube-outline', on: 'cube' }, { off: 'shippingbox', on: 'shippingbox.fill' }) } as any}
      />
      <LocalTab.Screen
        name="Billing"
        component={BillingStackNav}
        options={{ title: 'Billing', tabBarIcon: tabIcon({ off: 'cart-outline', on: 'cart' }, { off: 'cart', on: 'cart.fill' }) } as any}
      />
      {/* Bill History lives inside More now (MenuStackNav's "RecordsMain")
          instead of its own top-level tab — iOS's UITabBarController
          auto-collapses tabs into a system "More" overflow list once there
          are more than 5 (see RNSTabBarController.mm's extensive
          moreNavigationController handling), and Local already needed 5
          real tabs + 1 for the Online switch below. Folding this one in
          keeps the total at 5 so the switch tab reliably shows on the bar
          instead of getting buried in that overflow. */}
      <LocalTab.Screen
        name="More"
        component={MenuStackNav}
        options={(({ route }: any) => ({
          title: 'More',
          tabBarIcon: tabIcon({ off: 'grid-outline', on: 'grid' }, { off: 'square.grid.2x2', on: 'square.grid.2x2.fill' }),
          tabBarStyle: tabBarStyleFor(route),
        })) as any}
      />
      {onlineShopEnabled && (
        <LocalTab.Screen
          name="SwitchToOnline"
          component={NoopScreen}
          options={{
            title: 'Online',
            tabBarIcon: tabIcon({ off: 'storefront-outline', on: 'storefront-outline' }, { off: 'storefront', on: 'storefront' }),
            // iOS 26+: `systemItem: 'search'` is what makes the native tab
            // bar render this as a separate button beside the main pill
            // (real UITabBarController/HIG behavior, not a library
            // invention) — tabBarIcon/tabBarLabel above override its
            // default search glyph/label while keeping that placement.
            // Android's classic bottom-tabs navigator ignores this option
            // and just renders it as a normal (non-separated) 5th tab.
            tabBarSystemItem: 'search',
            // iOS-only — see NoopScreen's comment for why Android needs a
            // different (preventDefault-based) mechanism instead.
            tabBarSelectionEnabled: false,
          } as any}
          listeners={{
            tabPress: (e: any) => {
              if (Platform.OS === 'android') e.preventDefault();
              switchAppMode('online');
            },
          }}
        />
      )}
    </LocalTab.Navigator>
  );
}

function OnlineTabs() {
  const { colors } = useAppTheme();
  return (
    <OnlineTab.Navigator
      initialRouteName="OnlineDashboard"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarMinimizeBehavior: 'onScrollDown',
      } as any}
    >
      <OnlineTab.Screen
        name="OnlineDashboard"
        component={OnlineDashboardStackNav}
        options={{ title: 'Shop', tabBarIcon: tabIcon({ off: 'storefront-outline', on: 'storefront' }, { off: 'storefront', on: 'storefront.fill' }) } as any}
      />
      <OnlineTab.Screen
        name="OnlineOrders"
        component={OnlineOrdersStackNav}
        options={{ title: 'Orders', tabBarIcon: tabIcon({ off: 'bag-handle-outline', on: 'bag-handle' }, { off: 'bag', on: 'bag.fill' }) } as any}
      />
      <OnlineTab.Screen
        name="OnlineInventory"
        component={OnlineInventoryStackNav}
        options={{ title: 'Products', tabBarIcon: tabIcon({ off: 'cube-outline', on: 'cube' }, { off: 'shippingbox', on: 'shippingbox.fill' }) } as any}
      />
      <OnlineTab.Screen
        name="SwitchToLocal"
        component={NoopScreen}
        options={{
          title: 'In-Store',
          tabBarIcon: tabIcon({ off: 'home-outline', on: 'home-outline' }, { off: 'house', on: 'house' }),
          tabBarSystemItem: 'search',
          // iOS-only — see NoopScreen's comment for why Android needs a
          // different (preventDefault-based) mechanism instead.
          tabBarSelectionEnabled: false,
        } as any}
        listeners={{
          tabPress: (e: any) => {
            if (Platform.OS === 'android') e.preventDefault();
            switchAppMode('local');
          },
        }}
      />
    </OnlineTab.Navigator>
  );
}

export default function AppNavigator() {
  const { colors, isDark } = useAppTheme();
  const onlineShopEnabled = useAppStore(s => s.settings.onlineShopEnabled);
  // Tracked purely so we can auto-fall-back to Local if the shopkeeper turns
  // the Online Shop feature off while sitting inside it (see effect below) —
  // navigateTo/switchAppMode (navigationRef.ts) drive the actual navigation,
  // this is read-only bookkeeping via NavigationContainer's onStateChange.
  const [mode, setMode] = useState<'local' | 'online'>('local');

  useEffect(() => {
    if (!onlineShopEnabled && mode === 'online') {
      switchAppMode('local');
    }
  }, [onlineShopEnabled, mode]);

  // Mounted here (not inside OnlineShopDashboard, where it used to live) so
  // pending-order tracking — and the Dynamic Island Live Activity it drives —
  // keeps working regardless of which tab/mode the shopkeeper is currently
  // looking at, not just while the Online Shop Dashboard screen is focused.
  const onlineShopId = useOnlineShopStore(s => s.config.shopId);
  useOrderRealtime(onlineShopEnabled ? onlineShopId : null);
  usePendingOrdersLiveActivity();

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
    <NavigationContainer
      ref={navigationRef}
      theme={navTheme}
      onStateChange={(state) => {
        const name = state?.routes[state.index ?? 0]?.name;
        if (name === 'Online' || name === 'Local') setMode(name === 'Online' ? 'online' : 'local');
      }}
    >
      <RootStack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        <RootStack.Screen name="Local" component={LocalTabs} />
        {onlineShopEnabled && <RootStack.Screen name="Online" component={OnlineTabs} />}
      </RootStack.Navigator>
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
