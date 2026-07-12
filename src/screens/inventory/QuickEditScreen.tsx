import React, { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Dimensions, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { Gesture, GestureDetector, ScrollView as GHScrollView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS, interpolate, Extrapolation } from 'react-native-reanimated';
import { useAppStore } from '../../stores/useAppStore';
import { Product } from '../../types';
import { formatCurrency } from '../../utils/helpers';
import { toast } from '../../utils/toast';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';
import LiquidButton from '../../components/common/LiquidButton';
import EmptyState from '../../components/common/EmptyState';
import { useTranslation } from '../../hooks/useTranslation';

const { width, height } = Dimensions.get('window');
const SWIPE_THRESHOLD = width * 0.28;
const GST_RATES = [0, 5, 12, 18, 28];
const EXPIRY_SOON_DAYS = 45;

type Draft = {
  name: string; category: string; unit: string;
  sellingPrice: string; costPrice: string; quantity: string; lowStockThreshold: string;
  gstRate: number; hsnCode: string; barcode: string;
  expiryDay: string; expiryMonth: string; expiryYear: string;
};

const toDraft = (p: Product): Draft => {
  let expiryDay = '', expiryMonth = '', expiryYear = '';
  if (p.expiryDate) {
    const d = new Date(p.expiryDate);
    expiryDay = String(d.getDate()).padStart(2, '0');
    expiryMonth = String(d.getMonth() + 1).padStart(2, '0');
    expiryYear = String(d.getFullYear());
  }
  return {
    name: p.name, category: p.category, unit: p.unit,
    sellingPrice: String(p.sellingPrice), costPrice: String(p.costPrice),
    quantity: String(p.quantity), lowStockThreshold: String(p.lowStockThreshold),
    gstRate: p.gstRate ?? 0, hsnCode: p.hsnCode || '', barcode: p.barcode || '',
    expiryDay, expiryMonth, expiryYear,
  };
};

// Resolve the draft's expiry to a timestamp; keep the existing value on partial/invalid input.
const resolveExpiry = (d: Draft, cur: Product): number | undefined => {
  const hasAny = d.expiryDay || d.expiryMonth || d.expiryYear;
  if (!hasAny) return undefined;
  const day = parseInt(d.expiryDay), m = parseInt(d.expiryMonth), y = parseInt(d.expiryYear);
  if (!d.expiryDay || !d.expiryMonth || d.expiryYear.length < 4 || isNaN(day) || isNaN(m) || isNaN(y)) return cur.expiryDate;
  const parsed = new Date(y, m - 1, day);
  if (parsed.getDate() !== day || parsed.getMonth() !== m - 1) return cur.expiryDate;
  parsed.setHours(0, 0, 0, 0);
  return parsed.getTime();
};

const num = (s: string) => parseFloat(s) || 0;
const int = (s: string) => parseInt(s) || 0;

const isDirty = (p: Product, d: Draft) =>
  d.name.trim() !== p.name ||
  d.category !== p.category ||
  d.unit !== p.unit ||
  num(d.sellingPrice) !== p.sellingPrice ||
  num(d.costPrice) !== p.costPrice ||
  int(d.quantity) !== p.quantity ||
  int(d.lowStockThreshold) !== p.lowStockThreshold ||
  d.gstRate !== (p.gstRate ?? 0) ||
  d.hsnCode.trim() !== (p.hsnCode || '') ||
  d.barcode.trim() !== (p.barcode || '') ||
  resolveExpiry(d, p) !== (p.expiryDate ?? undefined);

export default function QuickEditScreen({ navigation }: any) {
  const { colors } = useAppTheme();
  const { t } = useTranslation();
  const { products, updateProduct, settings } = useAppStore();
  const s = makeStyles(colors);
  const productCategories: string[] = settings.productCategories || [];
  const units: string[] = settings.units || ['pcs'];

  const [started, setStarted] = useState(false);
  const [setLabel, setSetLabel] = useState('');
  const [queue, setQueue] = useState<Product[]>([]);
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [stats, setStats] = useState({ saved: 0, skipped: 0 });

  const tx = useSharedValue(0);

  const now = Date.now();
  const lowStockList = useMemo(() => products.filter(p => p.quantity <= p.lowStockThreshold), [products]);
  const expiringList = useMemo(() => products.filter(p => p.expiryDate && p.expiryDate > 0 && (p.expiryDate - now) / 86400000 <= EXPIRY_SOON_DAYS), [products, now]);

  const catOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    products.forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1; });
    return productCategories.filter((c) => counts[c] > 0).map((c) => ({ key: c, count: counts[c] }));
  }, [products, productCategories]);

  const start = (list: Product[], label: string) => {
    if (!list.length) { toast.error(t('quickEditNothingToEditHere')); return; }
    setQueue(list); setIndex(0); setDraft(toDraft(list[0])); setStats({ saved: 0, skipped: 0 });
    setSetLabel(label); setStarted(true);
  };

  const current = queue[index];
  const currentRef = useRef<Product | undefined>(undefined);
  const draftRef = useRef<Draft | null>(null);
  currentRef.current = current;
  draftRef.current = draft;

  useEffect(() => {
    if (current) setDraft(toDraft(current));
    tx.value = 0;
  }, [index, current?.id]);

  const advance = (didSave: boolean) => {
    setStats(prev => ({ saved: prev.saved + (didSave ? 1 : 0), skipped: prev.skipped + (didSave ? 0 : 1) }));
    setIndex(i => i + 1);
  };

  const onSaveAndNext = async () => {
    const cur = currentRef.current, d = draftRef.current;
    let didSave = false;
    if (cur && d && isDirty(cur, d)) {
      if (num(d.sellingPrice) <= 0) { toast.error(t('sellingPriceMustBeGreaterThanZero')); tx.value = withSpring(0); return; }
      const bc = d.barcode.trim();
      if (bc && products.some(p => p.barcode === bc && p.id !== cur.id)) { toast.error(t('barcodeAlreadyUsed')); tx.value = withSpring(0); return; }
      await updateProduct({
        ...cur,
        name: d.name.trim() || cur.name,
        category: d.category, unit: d.unit,
        sellingPrice: num(d.sellingPrice), costPrice: num(d.costPrice),
        quantity: int(d.quantity), lowStockThreshold: int(d.lowStockThreshold),
        gstRate: d.gstRate, hsnCode: d.hsnCode.trim() || undefined, barcode: bc || undefined,
        expiryDate: resolveExpiry(d, cur),
      });
      didSave = true;
    }
    advance(didSave);
  };

  const onSkip = () => advance(false);

  const commit = (dir: 'save' | 'skip') => {
    tx.value = withTiming(dir === 'save' ? width : -width, { duration: 180 }, () => {
      runOnJS(dir === 'save' ? onSaveAndNext : onSkip)();
    });
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-18, 18])
    .failOffsetY([-14, 14])
    .onUpdate((e) => { tx.value = e.translationX; })
    .onEnd((e) => {
      if (e.translationX > SWIPE_THRESHOLD) runOnJS(commit)('save');
      else if (e.translationX < -SWIPE_THRESHOLD) runOnJS(commit)('skip');
      else tx.value = withSpring(0, { damping: 20 });
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { rotate: `${interpolate(tx.value, [-width, 0, width], [-7, 0, 7], Extrapolation.CLAMP)}deg` },
    ],
  }));
  const saveHintStyle = useAnimatedStyle(() => ({ opacity: interpolate(tx.value, [0, SWIPE_THRESHOLD], [0, 1], Extrapolation.CLAMP) }));
  const skipHintStyle = useAnimatedStyle(() => ({ opacity: interpolate(tx.value, [-SWIPE_THRESHOLD, 0], [1, 0], Extrapolation.CLAMP) }));

  const setField = (patch: Partial<Draft>) => setDraft(d => d && { ...d, ...patch });

  // ── Start screen: filters + categories ──
  if (!started) {
    const FilterRow = ({ icon, label, sub, list, color }: any) => (
      <TouchableOpacity style={[s.catRow, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => start(list, label)} activeOpacity={0.8} disabled={!list.length}>
        <View style={[s.catIcon, { backgroundColor: (color || colors.primary) + '1A' }]}>
          <Ionicons name={icon} size={18} color={color || colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.catLabel, { color: list.length ? colors.text : colors.textMuted }]}>{label}</Text>
          {sub ? <Text style={[s.catSub, { color: colors.textMuted }]}>{sub}</Text> : null}
        </View>
        <Text style={[s.catCount, { color: colors.textMuted }]}>{list.length}</Text>
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </TouchableOpacity>
    );
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          <Text style={[s.pickSub, { color: colors.textMuted }]}>{t('quickEditPickSet')}</Text>
          {products.length === 0 ? (
            <View style={{ marginTop: 40 }}><EmptyState icon="cube-outline" title={t('noProductsYet')} subtitle={t('addProductsFirst')} /></View>
          ) : (
            <>
              <Text style={[s.groupLbl, { color: colors.textMuted }]}>{t('filters')}</Text>
              <View style={{ gap: 10 }}>
                <FilterRow icon="apps" label={t('allProducts')} list={products} />
                <FilterRow icon="alert-circle" label={t('lowOnStock')} sub={t('atOrBelow')} list={lowStockList} color={colors.warning} />
                <FilterRow icon="time" label={t('expiringSoon')} sub={t('expiryWithinDays').replace('{n}', String(EXPIRY_SOON_DAYS))} list={expiringList} color={colors.danger} />
              </View>
              {catOptions.length > 0 && (
                <>
                  <Text style={[s.groupLbl, { color: colors.textMuted }]}>{t('byCategory')}</Text>
                  <View style={{ gap: 10 }}>
                    {catOptions.map(c => (
                      <FilterRow key={c.key} icon="pricetag" label={c.key} list={products.filter(p => p.category === c.key)} />
                    ))}
                  </View>
                </>
              )}
            </>
          )}
        </ScrollView>
      </View>
    );
  }

  // ── Done screen ──
  if (!current) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <MotiView from={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'timing', duration: 300 }} style={{ alignItems: 'center' }}>
          <Ionicons name="checkmark-circle" size={64} color={colors.success} />
          <Text style={[s.doneTitle, { color: colors.text }]}>{t('allDone')}</Text>
          <Text style={[s.doneSub, { color: colors.textMuted }]}>{stats.saved} {t('updated')} {t('sepDot')} {stats.skipped} {t('skipped')}</Text>
          <TouchableOpacity style={[s.doneBtn, { backgroundColor: colors.primary }]} onPress={() => setStarted(false)}>
            <Text style={s.doneBtnText}>{t('editAnotherSet')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ marginTop: 14 }} onPress={() => navigation.goBack()}>
            <Text style={{ fontFamily: fonts.semiBold, color: colors.textMuted }}>{t('done')}</Text>
          </TouchableOpacity>
        </MotiView>
      </View>
    );
  }

  const margin = num(draft?.sellingPrice || '0') - num(draft?.costPrice || '0');
  const Chip = ({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) => (
    <TouchableOpacity onPress={onPress} style={[s.chip, { backgroundColor: active ? colors.primary : colors.surfaceHigh, borderColor: active ? colors.primary : colors.border }]}>
      <Text style={[s.chipText, { color: active ? '#fff' : colors.textSub }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={s.progressWrap}>
        <Text style={[s.progressText, { color: colors.textMuted }]}>{index + 1} {t('ofText')} {queue.length} {t('sepDot')} {setLabel}</Text>
        <View style={[s.progressTrack, { backgroundColor: colors.border }]}>
          <View style={[s.progressFill, { backgroundColor: colors.primary, width: `${(index / queue.length) * 100}%` }]} />
        </View>
      </View>

      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 14 }}>
        <GestureDetector gesture={pan}>
          <Animated.View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }, cardStyle]}>
            <Animated.View style={[s.hint, s.hintSave, { borderColor: colors.success }, saveHintStyle]}><Text style={[s.hintText, { color: colors.success }]}>{t('save')}</Text></Animated.View>
            <Animated.View style={[s.hint, s.hintSkip, { borderColor: colors.textMuted }, skipHintStyle]}><Text style={[s.hintText, { color: colors.textMuted }]}>{t('skip')}</Text></Animated.View>

            <GHScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 18 }} keyboardShouldPersistTaps="handled">
              <Text style={[s.fieldLabel, { color: colors.textMuted, marginTop: 0 }]}>{t('nameLabel')}</Text>
              <TextInput style={[s.nameInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceHigh }]} value={draft?.name ?? ''} onChangeText={(v) => setField({ name: v })} />

              <Text style={[s.fieldLabel, { color: colors.textMuted }]}>{t('categoryLabel')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                {productCategories.map(cat => <Chip key={cat} active={draft?.category === cat} label={cat} onPress={() => setField({ category: cat })} />)}
              </ScrollView>

              <Text style={[s.fieldLabel, { color: colors.textMuted }]}>{t('unitLabel')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                {units.map(u => <Chip key={u} active={draft?.unit === u} label={u} onPress={() => setField({ unit: u })} />)}
              </ScrollView>

              <View style={s.grid}>
                 <NumField label={`${t('sellingLabel')} (${settings.currency})`} value={draft?.sellingPrice ?? ''} onChange={(v) => setField({ sellingPrice: v })} colors={colors} s={s} />
                 <NumField label={`${t('costLabel')} (${settings.currency})`} value={draft?.costPrice ?? ''} onChange={(v) => setField({ costPrice: v })} colors={colors} s={s} />
                 <NumField label={t('stockLabel')} value={draft?.quantity ?? ''} onChange={(v) => setField({ quantity: v.replace(/\D/g, '') })} colors={colors} s={s} />
                 <NumField label={t('lowStockThresholdLabel')} value={draft?.lowStockThreshold ?? ''} onChange={(v) => setField({ lowStockThreshold: v.replace(/\D/g, '') })} colors={colors} s={s} />
              </View>
              <Text style={[s.marginText, { color: margin >= 0 ? colors.success : colors.danger }]}>{t('marginLabel')} {formatCurrency(margin, settings.currency)}</Text>

              <Text style={[s.fieldLabel, { color: colors.textMuted }]}>{t('gstRateLabel')}</Text>
              <View style={s.chipRow}>
                {GST_RATES.map(r => <Chip key={r} active={draft?.gstRate === r} label={`${r}%`} onPress={() => setField({ gstRate: r })} />)}
              </View>

              <View style={s.grid}>
                 <View style={s.gridItem}>
                  <Text style={[s.fieldLabel, { color: colors.textMuted }]}>{t('hsnCodeLabel')}</Text>
                  <TextInput style={[s.smallInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceHigh }]} value={draft?.hsnCode ?? ''} onChangeText={(v) => setField({ hsnCode: v })} />
                </View>
                <View style={s.gridItem}>
                  <Text style={[s.fieldLabel, { color: colors.textMuted }]}>{t('barcodeLabel')}</Text>
                  <TextInput style={[s.smallInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceHigh }]} value={draft?.barcode ?? ''} onChangeText={(v) => setField({ barcode: v })} keyboardType="number-pad" />
                </View>
              </View>

              <Text style={[s.fieldLabel, { color: colors.textMuted }]}>{t('expiryLabel')}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput style={[s.dateInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceHigh }]} value={draft?.expiryDay ?? ''} onChangeText={(v) => setField({ expiryDay: v.replace(/\D/g, '').slice(0, 2) })} placeholder={t('ddPlaceholder')} placeholderTextColor={colors.textMuted} keyboardType="number-pad" />
                <TextInput style={[s.dateInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceHigh }]} value={draft?.expiryMonth ?? ''} onChangeText={(v) => setField({ expiryMonth: v.replace(/\D/g, '').slice(0, 2) })} placeholder={t('mmPlaceholder')} placeholderTextColor={colors.textMuted} keyboardType="number-pad" />
                <TextInput style={[s.dateInput, { flex: 1.4, color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceHigh }]} value={draft?.expiryYear ?? ''} onChangeText={(v) => setField({ expiryYear: v.replace(/\D/g, '').slice(0, 4) })} placeholder={t('yyyyPlaceholder')} placeholderTextColor={colors.textMuted} keyboardType="number-pad" />
              </View>
            </GHScrollView>
          </Animated.View>
        </GestureDetector>
      </View>

      <View style={[s.actions, { paddingBottom: 28 }]}>
        <TouchableOpacity style={[s.actionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => commit('skip')} activeOpacity={0.85}>
          <Ionicons name="play-skip-forward" size={20} color={colors.textMuted} />
          <Text style={[s.actionLabel, { color: colors.textMuted }]}>{t('skip')}</Text>
        </TouchableOpacity>
        <LiquidButton title={t('saveAndNext')} icon="checkmark" onPress={() => commit('save')} variant="glassProminent" style={{ flex: 1 }} />
      </View>
    </KeyboardAvoidingView>
  );
}

function NumField({ label, value, onChange, colors, s }: { label: string; value: string; onChange: (v: string) => void; colors: any; s: any }) {
  return (
    <View style={s.gridItem}>
      <Text style={[s.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <TextInput style={[s.numInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceHigh }]} value={value} onChangeText={onChange} keyboardType="numeric" selectTextOnFocus />
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  pickSub: { fontFamily: fonts.medium, fontSize: 13.5, lineHeight: 20, marginBottom: 8 },
  groupLbl: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.8, marginTop: 18, marginBottom: 8, marginLeft: 4 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth },
  catIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  catLabel: { fontFamily: fonts.bold, fontSize: 15 },
  catSub: { fontFamily: fonts.medium, fontSize: 11.5, marginTop: 1 },
  catCount: { fontFamily: fonts.bold, fontSize: 13 },

  progressWrap: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  progressText: { fontFamily: fonts.semiBold, fontSize: 12, marginBottom: 6 },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },

  card: { borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, elevation: 4, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, overflow: 'hidden' },
  hint: { position: 'absolute', top: 14, zIndex: 5, borderWidth: 2.5, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  hintSave: { right: 16, transform: [{ rotate: '12deg' }] },
  hintSkip: { left: 16, transform: [{ rotate: '-12deg' }] },
  hintText: { fontFamily: fonts.extraBold, fontSize: 16, letterSpacing: 1 },

  fieldLabel: { fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.6, marginTop: 14, marginBottom: 6 },
  nameInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, fontFamily: fonts.bold },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingRight: 8 },
  chip: { paddingHorizontal: 13, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  chipText: { fontFamily: fonts.semiBold, fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 },
  gridItem: { width: '47%', flexGrow: 1 },
  numInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, fontFamily: fonts.bold, textAlign: 'center' },
  smallInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: fonts.semiBold },
  dateInput: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 11, fontSize: 15, fontFamily: fonts.bold, textAlign: 'center' },
  marginText: { fontFamily: fonts.semiBold, fontSize: 13, marginTop: 10 },

  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 10, paddingTop: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 10, borderRadius: 10, paddingHorizontal: 10, borderWidth: StyleSheet.hairlineWidth },
  saveBtn: { flex: 1, borderWidth: 0 },
  actionLabel: { fontFamily: fonts.bold, fontSize: 15 },

  doneTitle: { fontFamily: fonts.extraBold, fontSize: 22, marginTop: 14 },
  doneSub: { fontFamily: fonts.medium, fontSize: 14, marginTop: 6 },
  doneBtn: { paddingHorizontal: 24, paddingVertical: 13, borderRadius: 14, marginTop: 24 },
  doneBtnText: { fontFamily: fonts.bold, fontSize: 15, color: '#fff' },
});
