import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, TextInput, Linking, Alert } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../stores/useAppStore';
import { Product } from '../types';
import { buildReorderMessage, whatsappUrl } from '../utils/reminder';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';
import LiquidButton from '../components/common/LiquidButton';
import EmptyState from '../components/common/EmptyState';
import { useTranslation } from '../hooks/useTranslation';

const NO_SUPPLIER = '__none__';
// Suggested reorder qty: refill to 2× the low-stock threshold.
const suggestQty = (p: Product) => Math.max(1, p.lowStockThreshold * 2 - p.quantity);

export default function ReorderScreen({ navigation }: any) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const { products, suppliers, settings } = useAppStore(
    useShallow(state => ({
      products: state.products,
      suppliers: state.suppliers,
      settings: state.settings,
    }))
  );
  const s = makeStyles(colors);

  useEffect(() => {
    navigation.setOptions({
      headerTransparent: true,
      headerStyle: { backgroundColor: 'transparent' },
    });
  }, [navigation]);

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
      shop: settings.shopName || t('ourShop'),
      lang: settings.reorderLang || 'hinglish',
      template: settings.reorderTemplate,
      supplier: supplier?.name,
      items: items.map(p => ({ name: p.name, qty: getQty(p), unit: p.unit })),
    });
    Linking.openURL(whatsappUrl(supplier?.phone, msg)).catch(() =>
      Alert.alert(t('whatsappNotFound'), t('installWhatsappMsg')));
  };

  const draftPurchase = (key: string, items: Product[]) => {
    navigation.navigate('PurchaseForm', {
      supplierId: key === NO_SUPPLIER ? undefined : key,
      items: items.map(p => ({ productId: p.id, quantity: getQty(p) })),
    });
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 12, paddingBottom: 130, flexGrow: 1 }}>
      {lowStock.length === 0 ? (
        <EmptyState icon="checkmark-circle-outline" title={t('stockLooksHealthy')} subtitle={t('noItemsBelowLevel')} />
      ) : (
        <>
        <Text style={[s.intro, { color: colors.textMuted }]}>
          {t('itemsLowOnStockIntro').replace('{count}', String(lowStock.length)).replace('{plural}', lowStock.length > 1 ? 's' : '')}
        </Text>

        {groups.map(([key, items], gi) => {
          const supplier = supplierFor(key);
          const name = supplier?.name || t('noSupplierAssigned');
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
                    {items.length} item{items.length > 1 ? 's' : ''}{supplier?.phone ? ` · ${supplier.phone}` : !supplier ? ` · ${t('pickContactInWhatsApp')}` : ` · ${t('noPhone')}`}
                  </Text>
                </View>
              </View>

              {/* Items with qty steppers */}
              {items.map((p) => (
                <View key={p.id} style={[s.itemRow, { borderTopColor: colors.border }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.itemName, { color: colors.text }]} numberOfLines={1}>{p.name}</Text>
                    <Text style={[s.itemSub, { color: colors.textMuted }]}>{t('instockLabel')} {p.quantity} {p.unit} · {t('alertLabel')} {p.lowStockThreshold}</Text>
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
                {/* No standard SF Symbol for the WhatsApp logo — text-only
                    (WhatsApp-green tint) on iOS rather than a mismatched icon. */}
                <LiquidButton title={t('whatsappReorder')} onPress={() => whatsappReorder(key, items)} tintColor="#25D366" style={{ flex: 1 }} />
                <LiquidButton title={t('draftPurchase')} icon="doc.text" onPress={() => draftPurchase(key, items)} variant="glassProminent" style={{ flex: 1 }} />
              </View>
            </MotiView>
          );
        })}
        </>
      )}
    </ScrollView>
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
