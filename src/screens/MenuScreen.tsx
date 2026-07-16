import React, { useLayoutEffect, useState, useEffect } from "react";
import { View, StyleSheet, TouchableOpacity, ScrollView, Platform, Dimensions } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { MotiView } from "moti";
import { LinearGradient } from "expo-linear-gradient";
import { useAppTheme } from "../theme";
import { fonts } from "../theme/typography";
import { useTranslation } from "../hooks/useTranslation";
import PressableScale from "../components/common/PressableScale";
import LiquidHeaderIconButton from "../components/common/LiquidHeaderIconButton";
import * as db from "../db/database";

type LayoutMode = 'list' | 'box';

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

type Item = { label: string; sub: string; icon: IoniconsName; screen: string };

export default function MenuScreen({ navigation }: any) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  const SECTIONS: { title: string; items: Item[] }[] = [
    {
      title: t('business').toUpperCase(),
      items: [
        { label: 'Bill History', sub: 'Past sales and returns', icon: "receipt-outline", screen: "RecordsMain" },
        { label: t('analytics'), sub: t('revenueAndProfitCharts'), icon: "bar-chart-outline", screen: "Analytics" },
        { label: t('expenses'), sub: t('trackShopCosts'), icon: "wallet-outline", screen: "Expenses" },
        { label: t('dayClose'), sub: t('countCashReconcile'), icon: "lock-closed-outline", screen: "DayClose" },
        { label: 'Udhaar', sub: t('customerCreditBook'), icon: "book-outline", screen: "Udhaar" },
      ],
    },
    {
      title: t('stockAndSuppliers').toUpperCase(),
      items: [
        { label: t('suppliers'), sub: t('manageVendors'), icon: "business-outline", screen: "Supplier" },
        { label: 'Purchases', sub: t('stockReceiptsPayables'), icon: "receipt-outline", screen: "Purchases" },
        { label: 'Reorder Stock', sub: t('restockViaWhatsapp'), icon: "refresh-outline", screen: "Reorder" },
        { label: 'Stock Take', sub: t('countShelvesDiscrepancies'), icon: "checkmark-circle-outline", screen: "StockTake" },
        { label: t('quickEdit'), sub: t('swipeUpdateFast'), icon: "albums-outline", screen: "QuickEdit" },
      ],
    },
    {
      title: t('app').toUpperCase(),
      items: [
        { label: t('settings'), sub: t('shopInfoPrefsBackup'), icon: "settings-outline", screen: "Settings" },
      ],
    },
  ];
  const s = makeStyles(colors);

  // Persisted display-style preference — same pattern as ThemeProvider's
  // `theme_mode` (db.getSetting/setSetting), loaded once on mount and
  // written back whenever the shopkeeper switches it.
  const [layoutMode, setLayoutModeState] = useState<LayoutMode>('list');
  useEffect(() => {
    db.getSetting('menuLayoutMode').then(val => {
      if (val === 'list' || val === 'box') setLayoutModeState(val);
    });
  }, []);
  const setLayoutMode = (mode: LayoutMode) => {
    setLayoutModeState(mode);
    db.setSetting('menuLayoutMode', mode);
  };
  const toggleLayoutMode = () => setLayoutMode(layoutMode === 'list' ? 'box' : 'list');

  // Header-right: display-style toggle (icon reflects the CURRENT mode; tap
  // switches to the other) + a Settings shortcut — same
  // `headerTransparent` + `headerRight` combined-effect pattern as
  // BillingScreen/BillHistoryScreen's two-icon headers.
  useLayoutEffect(() => {
    navigation.setOptions({
      // iOS-only — see InventoryScreen's header comment for why.
      ...(Platform.OS === 'ios' ? { headerTransparent: true, headerStyle: { backgroundColor: 'transparent' } } : null),
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <LiquidHeaderIconButton
            icon={layoutMode === 'list' ? 'list.bullet' : 'square.grid.2x2'}
            androidIcon={layoutMode === 'list' ? 'list-outline' : 'grid-outline'}
            onPress={toggleLayoutMode}
          />
          <LiquidHeaderIconButton
            icon="gearshape"
            androidIcon="settings-outline"
            onPress={() => navigation.navigate('Settings')}
          />
        </View>
      ),
    });
  }, [navigation, layoutMode]);

  const Row = ({ item, last, index }: { item: Item; last?: boolean; index: number }) => (
    <MotiView
      from={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "timing", duration: 260, delay: index * 40 }}
    >
      <TouchableOpacity
        style={[s.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
        onPress={() => navigation.navigate(item.screen)}
        activeOpacity={0.7}
      >
        <View style={[s.iconTile, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name={item.icon} size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.rowLabel, { color: colors.text }]}>{item.label}</Text>
          <Text style={[s.rowSub, { color: colors.textMuted }]}>{item.sub}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    </MotiView>
  );

  const BoxItem = ({ item, index }: { item: Item; index: number }) => (
    <MotiView
      from={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "timing", duration: 260, delay: index * 40 }}
    >
      <PressableScale
        style={[s.box, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => navigation.navigate(item.screen)}
      >
        <LinearGradient
          colors={[colors.primary, colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.boxIconTile}
        >
          <Ionicons name={item.icon} size={22} color="#fff" />
        </LinearGradient>
        <Text style={[s.boxLabel, { color: colors.text }]} numberOfLines={2}>{item.label}</Text>
      </PressableScale>
    </MotiView>
  );

  return (
    // `ScrollView` is the root here (no wrapping `View`, and the stats card
    // moved to be its first child instead of a sibling before it) — same
    // fix as InventoryScreen/SettingsScreen: react-native-screens needs the
    // scroll view reachable as the screen's first native child for
    // `headerTransparent`/`tabBarMinimizeBehavior` to detect it.
    <ScrollView
      style={{ backgroundColor: colors.bg, flex: 1 }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 120 }}
    >

        {/* Grouped feature sections — list rows or a box grid, per the
            persisted `layoutMode` toggle in the header. */}
        {SECTIONS.map((section, si) => (
          <MotiView
            key={section.title}
            from={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 300, delay: 80 + si * 70 }}
          >
            <Text style={[s.groupLabel, { color: colors.textMuted }]}>{section.title}</Text>
            {layoutMode === 'list' ? (
              <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {section.items.map((item, i) => (
                  <Row key={item.label} item={item} last={i === section.items.length - 1} index={i} />
                ))}
              </View>
            ) : (
              <View style={s.boxGrid}>
                {section.items.map((item, i) => (
                  <BoxItem key={item.label} item={item} index={i} />
                ))}
              </View>
            )}
          </MotiView>
        ))}
      </ScrollView>
  );
}

// 3-column grid: screen width minus the grid's own 12px side margins (×2),
// minus 2 gaps between the 3 columns, split evenly.
const BOX_COLUMNS = 3;
const BOX_GAP = 12;
const BOX_WIDTH = (Dimensions.get("window").width - 12 * 2 - BOX_GAP * (BOX_COLUMNS - 1)) / BOX_COLUMNS;

const makeStyles = (c: any) =>
  StyleSheet.create({
    statsCard: {
      flexDirection: "row",
      paddingHorizontal: 18,
      paddingVertical: 11,
      borderRadius: 16,
      marginHorizontal: 12
    },
    statItem: { flex: 1, alignItems: "center" },
    statVal: { fontFamily: fonts.display, fontSize: 18 },
    statLbl: { fontFamily: fonts.medium, fontSize: 12, marginTop: 6 },
    statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 2, alignSelf: "stretch" },

    groupLabel: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.8, marginLeft: 24, marginTop: 22, marginBottom: 8 },
    card: { marginHorizontal: 12, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },

    row: { flexDirection: "row", alignItems: "center", gap: 14, padding: 14 },
    iconTile: { width: 40, height: 40, borderRadius: 12, justifyContent: "center", alignItems: "center" },
    rowLabel: { fontFamily: fonts.bold, fontSize: 15 },
    rowSub: { fontFamily: fonts.medium, fontSize: 12, marginTop: 1 },

    // Box (grid) layout — same section grouping, 3-column app-icon-style grid
    // instead of stacked rows.
    // `justifyContent: 'space-between'` stretched an incomplete last row
    // apart (e.g. 5 boxes → row of 3, then 2 pushed to opposite edges
    // instead of sitting together) — `gap` + `flex-start` with an exact
    // computed box width fixes that, since gap only adds space *between*
    // items instead of distributing leftover space across the row.
    boxGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", gap: BOX_GAP, marginHorizontal: 12 },
    box: {
      width: BOX_WIDTH, alignItems: "center", borderRadius: 20, borderWidth: StyleSheet.hairlineWidth,
      paddingVertical: 18, paddingHorizontal: 8,
      elevation: 3, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    },
    // Gradient circle (same primary→primaryDark treatment as the dashboard's
    // bento cards) instead of a flat tinted square — reads as a real "app
    // icon" tile rather than a plain list icon plucked into a grid.
    boxIconTile: { width: 50, height: 50, borderRadius: 25, justifyContent: "center", alignItems: "center", marginBottom: 10 },
    boxLabel: { fontFamily: fonts.bold, fontSize: 12.5, textAlign: "center", lineHeight: 16 },
  });
