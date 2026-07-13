import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { Product } from '../../types';
import { formatCurrency } from '../../utils/helpers';
import { fonts } from '../../theme/typography';
import FadeSlideIn from '../common/FadeSlideIn';

const ACCENT = '#5B7567'; // sage primary fallback
const avatarColor = (name: string) => ACCENT;
const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

interface Props {
  product: Product;
  currency: string;
  colors: any;
  // Item-aware (takes the product, not pre-bound) so a caller rendering a
  // `FlatList` of these can pass a single stable top-level callback
  // (e.g. `onAddStock={openStockSheet}`) instead of a fresh inline closure
  // per row per render — the latter defeats this component's own `React.memo`
  // below regardless of what it does internally, since a "new" function prop
  // every render always fails memo's shallow-equality check.
  onAddStock: (product: Product) => void;
  onMenu: (product: Product) => void;
  index?: number;
  /** When true, wraps in FadeSlideIn; set false when used inside a BottomSheet scroll view */
  animated?: boolean;
  showMargin?: boolean;
}

function ProductCard({ product: item, currency, colors, onAddStock, onMenu, index = 0, animated = true, showMargin = true }: Props) {
  const out = item.quantity <= 0;
  const isLow = !out && item.quantity <= item.lowStockThreshold;
  const margin = item.costPrice > 0
    ? (((item.sellingPrice - item.costPrice) / item.costPrice) * 100).toFixed(0)
    : null;

  const pill = out
    ? { bg: colors.danger + '1A', dot: colors.danger, text: colors.danger, label: 'Out of stock' }
    : isLow
    ? { bg: colors.warning + '1A', dot: colors.warning, text: colors.warning, label: `Low · ${item.quantity} left` }
    : { bg: colors.success + '1A', dot: colors.success, text: colors.success, label: `${item.quantity} in stock` };

  const now = Date.now();
  const daysLeft = item.expiryDate ? Math.ceil((item.expiryDate - now) / 86400000) : null;
  const expiryPill = daysLeft === null ? null
    : daysLeft <= 0
      ? { bg: colors.danger + '1A', icon: 'alert-circle' as const, text: colors.danger, label: 'Expired' }
      : daysLeft <= 7
        ? { bg: colors.danger + '1A', icon: 'time-outline' as const, text: colors.danger, label: `Expires in ${daysLeft}d` }
        : daysLeft <= 30
          ? { bg: colors.warning + '1A', icon: 'time-outline' as const, text: colors.warning, label: `Expires in ${daysLeft}d` }
          : { bg: colors.textMuted + '18', icon: 'calendar-outline' as const, text: colors.textMuted, label: `Exp ${new Date(item.expiryDate!).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` };

  const ac = colors.primary;
  const s = makeStyles(colors);

  const card = (
    <View style={[s.productCard, { backgroundColor: colors.surface }]}>
      {item.imageUri ? (
        <Image source={{ uri: item.imageUri }} style={s.thumb} />
      ) : (
        <View style={[s.thumb, { backgroundColor: ac + '22', justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={[s.thumbInitials, { color: ac }]}>{initials(item.name)}</Text>
        </View>
      )}

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.productName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[s.productMeta, { color: colors.textMuted }]} numberOfLines={1}>{item.category} · {item.unit}</Text>
        <MotiView
          key={out ? 'out' : isLow ? 'low' : 'in'}
          from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 240 }}
          style={[s.stockPill, { backgroundColor: pill.bg }]}
        >
          {out
            ? <Ionicons name="close-circle" size={11} color={pill.dot} />
            : isLow
            ? <Ionicons name="warning" size={11} color={pill.dot} />
            : <View style={[s.stockDot, { backgroundColor: pill.dot }]} />}
          <Text style={[s.stockPillText, { color: pill.text }]}>{pill.label}</Text>
        </MotiView>
        {expiryPill && (
          <MotiView
            key={`exp-${daysLeft}`}
            from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 240 }}
            style={[s.stockPill, { backgroundColor: expiryPill.bg, marginTop: 4 }]}
          >
            <Ionicons name={expiryPill.icon} size={11} color={expiryPill.text} />
            <Text style={[s.stockPillText, { color: expiryPill.text }]}>{expiryPill.label}</Text>
          </MotiView>
        )}
      </View>

      <View style={s.productRight}>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[s.productSell, { color: colors.text }]}>{formatCurrency(item.sellingPrice, currency)}</Text>
          {margin && showMargin ? <Text style={[s.productMargin, { color: colors.success }]}>+{margin}% margin</Text> : null}
        </View>
        <View style={s.productActions}>
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.primary }]} onPress={() => onAddStock(item)}>
            <Ionicons name="add" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.surfaceHigh }]} onPress={() => onMenu(item)}>
            <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSub} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  if (!animated) return card;
  return <FadeSlideIn index={index}>{card}</FadeSlideIn>;
}

// Memoized — this renders inside a `FlatList` (InventoryScreen), so without
// this every row re-renders on any state change anywhere upstream, not just
// when its own `product` data actually changes. Only pays off if the
// caller's `onAddStock`/`onMenu` callbacks are also stable (`useCallback`)
// — an inline arrow function recreated every render defeats this either way.
export default React.memo(ProductCard);

const makeStyles = (c: any) => StyleSheet.create({
  productCard: { flexDirection: 'row', borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, alignItems: 'center', gap: 12 },
  thumb: { width: 48, height: 48, borderRadius: 14 },
  thumbInitials: { fontFamily: fonts.extraBold, fontSize: 18 },
  productName: { fontFamily: fonts.bold, fontSize: 15 },
  productMeta: { fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  stockPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, marginTop: 8 },
  stockDot: { width: 6, height: 6, borderRadius: 3 },
  stockPillText: { fontFamily: fonts.bold, fontSize: 11 },
  productRight: { alignItems: 'flex-end', gap: 10 },
  productSell: { fontFamily: fonts.extraBold, fontSize: 16 },
  productMargin: { fontFamily: fonts.semiBold, fontSize: 11, marginTop: 2 },
  productActions: { flexDirection: 'row', gap: 6 },
  actionBtn: { width: 32, height: 32, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
});
