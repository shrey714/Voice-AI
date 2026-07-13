import React from "react";
import { View, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { MotiView } from "moti";
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from "../stores/useAppStore";
import { useAppTheme } from "../theme";
import { fonts } from "../theme/typography";
import { formatCurrency, startOfDay, endOfDay } from "../utils/helpers";
import { computeSalesStats, makeCostOf } from "../utils/stats";
import { useTranslation } from "../hooks/useTranslation";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

type Item = { label: string; sub: string; icon: IoniconsName; screen: string };

export default function MenuScreen({ navigation }: any) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const { bills, products, returns, settings } = useAppStore(
    useShallow(state => ({
      bills: state.bills,
      products: state.products,
      returns: state.returns,
      settings: state.settings,
    }))
  );

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

  const todayRevenue = computeSalesStats({
    bills, returns, from: startOfDay(), to: endOfDay(), costOf: makeCostOf(products),
  }).revenue;
  const lowStock = products.filter((p) => p.quantity <= p.lowStockThreshold).length;

  const Row = ({ item, last }: { item: Item; last?: boolean }) => (
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
  );

  return (
    <View style={{ backgroundColor: colors.bg, flex: 1 }}>

        {/* Stats card */}
        <View
          style={[s.statsCard, { backgroundColor: colors.surface }]}
        >
          <View style={s.statItem}>
            <Text style={[s.statVal, { color: colors.primary }]}>{products.length}</Text>
            <Text style={[s.statLbl, { color: colors.textMuted }]}>{t('products')}</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: colors.border }]} />
          <View style={s.statItem}>
            <Text style={[s.statVal, { color: colors.success }]}>{formatCurrency(todayRevenue, settings.currency)}</Text>
            <Text style={[s.statLbl, { color: colors.textMuted }]}>{t('today')}</Text>
          </View>
          <View style={[s.statDivider, { backgroundColor: colors.border }]} />
          <View style={s.statItem}>
            <Text style={[s.statVal, { color: lowStock > 0 ? colors.warning : colors.success }]}>{lowStock}</Text>
            <Text style={[s.statLbl, { color: colors.textMuted }]}>{t('lowStock')}</Text>
          </View>
        </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>

        {/* Grouped feature sections */}
        {SECTIONS.map((section, si) => (
          <MotiView
            key={section.title}
            from={{ opacity: 0, translateY: 10 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: "timing", duration: 300, delay: 80 + si * 70 }}
          >
            <Text style={[s.groupLabel, { color: colors.textMuted }]}>{section.title}</Text>
            <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {section.items.map((item, i) => (
                <Row key={item.label} item={item} last={i === section.items.length - 1} />
              ))}
            </View>
          </MotiView>
        ))}
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: any) =>
  StyleSheet.create({
    statsCard: {
      flexDirection: "row",
      paddingHorizontal: 18,
      paddingVertical: 11,
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 18
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
  });
