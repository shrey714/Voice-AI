import React, { useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, TextInput, Linking, Alert } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { useAppStore } from '../stores/useAppStore';
import { Product } from '../types';
import { buildReorderMessage, whatsappUrl } from '../utils/reminder';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';
import EmptyState from '../components/common/EmptyState';

const NO_SUPPLIER = '__none__';
// Suggested reorder qty: refill to 2× the low-stock threshold.
const suggestQty = (p: Product) => Math.max(1, p.lowStockThreshold * 2 - p.quantity);

export default function ReorderScreen({ navigation }: any) {
  const { colors } = useAppTheme();
  const { products, suppliers, settings } = useAppStore();
  const s = makeStyles(colors);

  const lowStock = useMemo(() => products.filter(p => p.quantity <= p.lowStockThreshold), [products]);

  // Group low-stock items by their supplier.
  const groups = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of lowStock) {
      const key = p.supplierId || NO_SUPPLIER;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries());
  }, [lowStock]);

  // Editable per-product quantities (fall back to the suggestion).
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const getQty = (p: Product) => qtys[p.id] ?? suggestQty(p);
  const setQty = (id: string, v: number) => setQtys(prev => ({ ...prev, [id]: Math.max(1, v) }));

  const supplierFor = (key: string) => (key === NO_SUPPLIER ? null : suppliers.find(sp => sp.id === key) || null);

  const whatsappReorder = (key: string, items: Product[]) => {
    const supplier = supplierFor(key);
    const msg = buildReorderMessage({
      shop: settings.shopName || 'our shop',
      lang: settings.reorderLang || 'hinglish',
      template: settings.reorderTemplate,
      supplier: supplier?.name,
      items: items.map(p => ({ name: p.name, qty: getQty(p), unit: p.unit })),
    });
    Linking.openURL(whatsappUrl(supplier?.phone, msg)).catch(() =>
      Alert.alert('WhatsApp not found', 'Please install WhatsApp to send reorders.'));
  };

  const draftPurchase = (key: string, items: Product[]) => {
    navigation.navigate('PurchaseForm', {
      supplierId: key === NO_SUPPLIER ? undefined : key,
      items: items.map(p => ({ productId: p.id, quantity: getQty(p) })),
    });
  };

  if (lowStock.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <EmptyState icon="checkmark-circle-outline" title="Stock looks healthy" subtitle="No items are below their low-stock level right now." />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 12, paddingBottom: 130 }}>
        <Text style={[s.intro, { color: colors.textMuted }]}>
          {lowStock.length} item{lowStock.length > 1 ? 's' : ''} low on stock, grouped by supplier. Adjust quantities, then send a WhatsApp reorder or create a draft purchase.
        </Text>

        {groups.map(([key, items], gi) => {
          const supplier = supplierFor(key);
          const name = supplier?.name || 'No supplier assigned';
          return (
            <MotiView key={key} from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 280, delay: gi * 60 }}
              style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {/* Supplier header */}
              <View style={s.groupHead}>
                <View style={[s.supIcon, { backgroundColor: colors.primaryLight }]}>
                  <Ionicons name={supplier ? 'business' : 'help-circle-outline'} size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.supName, { color: colors.text }]} numberOfLines={1}>{name}</Text>
                  <Text style={[s.supSub, { color: colors.textMuted }]}>
                    {items.length} item{items.length > 1 ? 's' : ''}{supplier?.phone ? ` · ${supplier.phone}` : !supplier ? ' · pick contact in WhatsApp' : ' · no phone'}
                  </Text>
                </View>
              </View>

              {/* Items with qty steppers */}
              {items.map((p) => (
                <View key={p.id} style={[s.itemRow, { borderTopColor: colors.border }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.itemName, { color: colors.text }]} numberOfLines={1}>{p.name}</Text>
                    <Text style={[s.itemSub, { color: colors.textMuted }]}>In stock: {p.quantity} {p.unit} · alert ≤ {p.lowStockThreshold}</Text>
                  </View>
                  <View style={s.stepper}>
                    <TouchableOpacity onPress={() => setQty(p.id, getQty(p) - 1)} style={[s.stepBtn, { backgroundColor: colors.surfaceHigh }]}>
                      <Ionicons name="remove" size={16} color={colors.text} />
                    </TouchableOpacity>
                    <TextInput
                      style={[s.qtyInput, { color: colors.text }]}
                      value={String(getQty(p))}
                      onChangeText={(t) => setQty(p.id, parseInt(t.replace(/\D/g, '')) || 1)}
                      keyboardType="number-pad"
                      selectTextOnFocus
                    />
                    <TouchableOpacity onPress={() => setQty(p.id, getQty(p) + 1)} style={[s.stepBtn, { backgroundColor: colors.surfaceHigh }]}>
                      <Ionicons name="add" size={16} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}

              {/* Actions */}
              <View style={s.actions}>
                <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#25D366' }]} onPress={() => whatsappReorder(key, items)} activeOpacity={0.85}>
                  <Ionicons name="logo-whatsapp" size={16} color="#fff" />
                  <Text style={s.actionText}>WhatsApp reorder</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.primary }]} onPress={() => draftPurchase(key, items)} activeOpacity={0.85}>
                  <Ionicons name="document-text-outline" size={16} color="#fff" />
                  <Text style={s.actionText}>Draft purchase</Text>
                </TouchableOpacity>
              </View>
            </MotiView>
          );
        })}
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  intro: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 19, marginHorizontal: 6, marginBottom: 12 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 12 },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  supIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  supName: { fontFamily: fonts.bold, fontSize: 15 },
  supSub: { fontFamily: fonts.medium, fontSize: 12, marginTop: 1 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 10 },
  itemName: { fontFamily: fonts.semiBold, fontSize: 14 },
  itemSub: { fontFamily: fonts.medium, fontSize: 11.5, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  qtyInput: { minWidth: 34, textAlign: 'center', fontFamily: fonts.bold, fontSize: 15, padding: 0 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, borderRadius: 13 },
  actionText: { fontFamily: fonts.bold, fontSize: 12.5, color: '#fff' },
});
