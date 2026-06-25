import React from "react";
import { View, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { Text } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { MotiView } from "moti";
import { useAppStore } from "../stores/useAppStore";
import { useAppTheme } from "../theme";
import { fonts } from "../theme/typography";
import PressableScale from "../components/common/PressableScale";
import FadeSlideIn from "../components/common/FadeSlideIn";
import { formatCurrency, startOfDay, endOfDay } from "../utils/helpers";

type IoniconsName = React.ComponentProps<typeof Ionicons>["name"];

const MENU_ITEMS: {
  label: string;
  sub: string;
  icon: IoniconsName;
  screen: string;
}[] = [
  {
    label: "Analytics",
    sub: "Revenue & profit charts",
    icon: "bar-chart-outline",
    screen: "Analytics",
  },
  {
    label: "Export Reports",
    sub: "PDF & CSV · P&L, GST, Inventory",
    icon: "share-outline",
    screen: "Exports",
  },
  {
    label: "Expenses",
    sub: "Track shop costs",
    icon: "wallet-outline",
    screen: "Expenses",
  },
  {
    label: "Udhaar",
    sub: "Customer credit book",
    icon: "book-outline",
    screen: "Udhaar",
  },
  {
    label: "Suppliers",
    sub: "Manage your vendors",
    icon: "business-outline",
    screen: "Supplier",
  },
  {
    label: "Purchases",
    sub: "Stock receipts & payables",
    icon: "receipt-outline",
    screen: "Purchases",
  },
  {
    label: "Stock Take",
    sub: "Count shelves & fix discrepancies",
    icon: "checkmark-circle-outline",
    screen: "StockTake",
  },
  {
    label: "Settings",
    sub: "Shop info, theme, AI keys",
    icon: "settings-outline",
    screen: "Settings",
  },
];

export default function MenuScreen({ navigation }: any) {
  const { colors } = useAppTheme();
  const { bills, products, settings } = useAppStore();

  const todayRevenue = bills
    .filter((b) => b.createdAt >= startOfDay() && b.createdAt <= endOfDay())
    .reduce((s, b) => s + b.total, 0);
  const lowStock = products.filter(
    (p) => p.quantity <= p.lowStockThreshold,
  ).length;

  const s = makeStyles(colors);

  return (
    <View style={[{ backgroundColor: colors.bg, flex: 1 }]}>
      <MotiView
        from={{ opacity: 0, translateY: -12 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: "timing", duration: 400 }}
        style={[
          s.statsBanner,
          { backgroundColor: colors.surface, borderBottomColor: colors.border },
        ]}
      >
        <View style={s.statItem}>
          <Text style={[s.statVal, { color: colors.primary }]}>
            {products.length}
          </Text>
          <Text style={[s.statLbl, { color: colors.textMuted }]}>Products</Text>
        </View>
        <View style={[s.statDivider, { backgroundColor: colors.border }]} />
        <View style={s.statItem}>
          <Text style={[s.statVal, { color: colors.success }]}>
            {formatCurrency(todayRevenue, settings.currency)}
          </Text>
          <Text style={[s.statLbl, { color: colors.textMuted }]}>Today</Text>
        </View>
        <View style={[s.statDivider, { backgroundColor: colors.border }]} />
        <View style={s.statItem}>
          <Text
            style={[
              s.statVal,
              { color: lowStock > 0 ? colors.warning : colors.success },
            ]}
          >
            {lowStock}
          </Text>
          <Text style={[s.statLbl, { color: colors.textMuted }]}>
            Low Stock
          </Text>
        </View>
      </MotiView>
      <ScrollView
        style={[s.container, { backgroundColor: colors.bg }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Mini stats banner */}

        <Text style={[s.sectionTitle, { color: colors.textSub }]}>
          FEATURES
        </Text>

        {MENU_ITEMS.map((item, i) => (
          <FadeSlideIn key={item.label} index={i}>
            <PressableScale
              style={[s.menuCard, { backgroundColor: colors.surface }]}
              onPress={() => navigation.navigate(item.screen)}
            >
              <View
                style={[s.menuIcon, { backgroundColor: colors.primaryLight }]}
              >
                <Ionicons name={item.icon} size={26} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.menuLabel, { color: colors.text }]}>
                  {item.label}
                </Text>
                <Text style={[s.menuSub, { color: colors.textMuted }]}>
                  {item.sub}
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={20}
                color={colors.textMuted}
              />
            </PressableScale>
          </FadeSlideIn>
        ))}

        <View style={{ height: 110 }} />
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: any) =>
  StyleSheet.create({
    container: { flex: 1 },

    // Stats banner — Swiggy-style metric cards
    statsBanner: {
      flexDirection: "row",
      paddingHorizontal: 18,
      paddingVertical: 11,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    statItem: { flex: 1, alignItems: "center" },
    statVal: { fontFamily: fonts.display, fontSize: 18 },
    statLbl: {
      fontFamily: fonts.medium,
      fontSize: 12,
      marginTop: 6,
      color: c.textMuted,
    },
    statDivider: {
      width: StyleSheet.hairlineWidth,
      marginVertical: 2,
      alignSelf: "stretch",
    },

    // Section title — cleaner, bolder
    sectionTitle: {
      fontFamily: fonts.extraBold,
      fontSize: 12,
      letterSpacing: 0.8,
      paddingHorizontal: 8,
      marginTop: 8,
      marginBottom: 8,
      textTransform: "uppercase",
      color: c.textSub,
    },

    // Menu cards — bigger icons, better spacing
    menuCard: {
      flexDirection: "row",
      alignItems: "center",
      marginHorizontal: 8,
      marginBottom: 8,
      borderRadius: 10,
      padding: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    menuIcon: {
      width: 56,
      height: 56,
      borderRadius: 16,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 16,
    },
    menuLabel: { fontFamily: fonts.bold, fontSize: 15 },
    menuSub: { fontFamily: fonts.regular, fontSize: 12, marginTop: 4 },
  });
