import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { useAppStore } from '../stores/useAppStore';
import { computeSalesStats, makeCostOf } from '../utils/stats';
import { formatCurrency, startOfDay, endOfDay, generateId } from '../utils/helpers';
import { toast } from '../utils/toast';
import * as db from '../db/database';
import { DayClose } from '../types';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';

const DENOMS = [500, 200, 100, 50, 20, 10, 5, 2, 1];

export default function DayCloseScreen() {
  const { colors } = useAppTheme();
  const { bills, returns, expenses, products, settings } = useAppStore();
  const s = makeStyles(colors);

  // Today's cash position (netted of returns) from the shared stats helper.
  const today = useMemo(() => {
    const stats = computeSalesStats({ bills, returns, from: startOfDay(), to: endOfDay(), costOf: makeCostOf(products) });
    const expensesToday = expenses.filter(e => e.createdAt >= startOfDay() && e.createdAt <= endOfDay()).reduce((sum, e) => sum + e.amount, 0);
    return { stats, expensesToday };
  }, [bills, returns, products, expenses]);

  const cashSales = today.stats.paymentSplit.cash;
  const todayId = String(startOfDay());

  const [openingCash, setOpeningCash] = useState('0');
  const [cashOut, setCashOut] = useState('0');
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [showDenom, setShowDenom] = useState(false);
  const [denoms, setDenoms] = useState<Record<number, string>>({});
  const [history, setHistory] = useState<DayClose[]>([]);

  useEffect(() => {
    (async () => {
      const all = await db.getAllDayCloses();
      setHistory(all);
      const existing = all.find(c => c.id === todayId);
      if (existing) {
        setOpeningCash(String(existing.openingCash));
        setCashOut(String(existing.cashOut));
        setCounted(String(existing.counted));
        setNote(existing.note || '');
      } else {
        const prev = all.find(c => c.date < startOfDay()); // sorted desc → first older = last close
        setOpeningCash(String(Math.round(prev?.counted ?? 0)));
        setCashOut(String(Math.round(today.expensesToday)));
      }
    })();
  }, []);

  const opening = parseFloat(openingCash) || 0;
  const out = parseFloat(cashOut) || 0;
  const expected = opening + cashSales - out;
  const countedNum = parseFloat(counted) || 0;
  const diff = countedNum - expected;
  const denomTotal = DENOMS.reduce((sum, d) => sum + d * (parseInt(denoms[d] || '0') || 0), 0);

  const diffColor = Math.abs(diff) < 0.5 ? colors.textMuted : diff > 0 ? colors.success : colors.danger;
  const diffLabel = Math.abs(diff) < 0.5 ? 'Tallied ✓' : diff > 0 ? 'Over (extra cash)' : 'Short';

  const onSave = async () => {
    const dc: DayClose = {
      id: todayId, date: startOfDay(), openingCash: opening, cashSales, cashOut: out,
      expected, counted: countedNum, difference: diff, note: note.trim() || undefined, createdAt: Date.now(),
    };
    await db.upsertDayClose(dc);
    toast.success('Day closed', { description: Math.abs(diff) < 0.5 ? 'Drawer tallied perfectly.' : `${diff > 0 ? 'Over' : 'Short'} by ${formatCurrency(Math.abs(diff), settings.currency)}` });
    setHistory(await db.getAllDayCloses());
  };

  const Row = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <View style={s.refRow}>
      <Text style={[s.refLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[s.refVal, { color: color || colors.text }]}>{value}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 14, paddingBottom: 130 }} keyboardShouldPersistTaps="handled">

        {/* Expected drawer hero */}
        <MotiView from={{ opacity: 0, translateY: 8 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 300 }}
          style={[s.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.heroLbl, { color: colors.textMuted }]}>EXPECTED IN DRAWER</Text>
          <Text style={[s.heroAmt, { color: colors.primary }]}>{formatCurrency(expected, settings.currency)}</Text>
          <Text style={[s.heroSub, { color: colors.textMuted }]}>Opening + cash sales − cash out</Text>
        </MotiView>

        {/* Inputs */}
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.inRow}>
            <Text style={[s.inLabel, { color: colors.text }]}>Opening cash</Text>
            <TextInput style={[s.inField, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceHigh }]}
              value={openingCash} onChangeText={setOpeningCash} keyboardType="numeric" selectTextOnFocus placeholder="0" placeholderTextColor={colors.textMuted} />
          </View>
          <View style={[s.inRow, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <Text style={[s.inLabel, { color: colors.text }]}>Cash sales <Text style={{ color: colors.textMuted, fontSize: 11 }}>(auto)</Text></Text>
            <Text style={[s.inAuto, { color: colors.success }]}>+{formatCurrency(cashSales, settings.currency)}</Text>
          </View>
          <View style={[s.inRow, { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <Text style={[s.inLabel, { color: colors.text }]}>Cash paid out</Text>
            <TextInput style={[s.inField, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceHigh }]}
              value={cashOut} onChangeText={setCashOut} keyboardType="numeric" selectTextOnFocus placeholder="0" placeholderTextColor={colors.textMuted} />
          </View>
        </View>

        {/* Counted */}
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.inRow}>
            <Text style={[s.inLabel, { color: colors.text }]}>Counted cash</Text>
            <TextInput style={[s.inField, { color: colors.text, borderColor: colors.primary, backgroundColor: colors.surfaceHigh, fontFamily: fonts.bold }]}
              value={counted} onChangeText={setCounted} keyboardType="numeric" selectTextOnFocus placeholder="enter total" placeholderTextColor={colors.textMuted} />
          </View>
          <TouchableOpacity style={s.denomToggle} onPress={() => setShowDenom(v => !v)}>
            <Ionicons name="calculator-outline" size={15} color={colors.primary} />
            <Text style={[s.denomToggleText, { color: colors.primary }]}>{showDenom ? 'Hide' : 'Count by'} denominations</Text>
            <Ionicons name={showDenom ? 'chevron-up' : 'chevron-down'} size={15} color={colors.primary} />
          </TouchableOpacity>
          {showDenom && (
            <View style={{ marginTop: 4 }}>
              {DENOMS.map(d => (
                <View key={d} style={s.denomRow}>
                  <Text style={[s.denomNote, { color: colors.text }]}>₹{d}</Text>
                  <Ionicons name="close" size={12} color={colors.textMuted} />
                  <TextInput style={[s.denomInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceHigh }]}
                    value={denoms[d] || ''} onChangeText={(t) => setDenoms(prev => ({ ...prev, [d]: t.replace(/\D/g, '') }))}
                    keyboardType="number-pad" placeholder="0" placeholderTextColor={colors.textMuted} />
                  <Text style={[s.denomSub, { color: colors.textMuted }]}>{formatCurrency(d * (parseInt(denoms[d] || '0') || 0), settings.currency)}</Text>
                </View>
              ))}
              <TouchableOpacity style={[s.denomApply, { backgroundColor: colors.primaryLight }]} onPress={() => setCounted(String(denomTotal))}>
                <Text style={[s.denomApplyText, { color: colors.primary }]}>Use total {formatCurrency(denomTotal, settings.currency)}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Difference */}
        <View style={[s.diffBanner, { backgroundColor: diffColor + '14', borderColor: diffColor + '40' }]}>
          <View>
            <Text style={[s.diffLbl, { color: colors.textMuted }]}>{diffLabel}</Text>
            <Text style={[s.diffAmt, { color: diffColor }]}>{diff === 0 ? formatCurrency(0, settings.currency) : `${diff > 0 ? '+' : '−'}${formatCurrency(Math.abs(diff), settings.currency)}`}</Text>
          </View>
          <Ionicons name={Math.abs(diff) < 0.5 ? 'checkmark-circle' : 'alert-circle'} size={30} color={diffColor} />
        </View>

        <TextInput style={[s.noteField, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          value={note} onChangeText={setNote} placeholder="Note (optional) — e.g. reason for shortfall" placeholderTextColor={colors.textMuted} multiline />

        {/* Reference */}
        <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border, paddingVertical: 4 }]}>
          <Text style={[s.refHead, { color: colors.textMuted }]}>TODAY · FOR REFERENCE</Text>
          <Row label="Total sales (net)" value={formatCurrency(today.stats.revenue, settings.currency)} />
          <Row label="UPI sales" value={formatCurrency(today.stats.paymentSplit.upi, settings.currency)} />
          <Row label="Credit given (udhaar)" value={formatCurrency(today.stats.paymentSplit.credit, settings.currency)} />
          <Row label="Bills" value={String(today.stats.billCount)} />
        </View>

        <TouchableOpacity style={[s.saveBtn, { backgroundColor: colors.primary }]} onPress={onSave} activeOpacity={0.9}>
          <Ionicons name="lock-closed-outline" size={18} color="#fff" />
          <Text style={s.saveText}>{history.some(c => c.id === todayId) ? 'Update day close' : 'Close the day'}</Text>
        </TouchableOpacity>

        {/* History */}
        {history.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <Text style={[s.refHead, { color: colors.textMuted, marginLeft: 4 }]}>PAST CLOSES</Text>
            {history.slice(0, 30).map(c => {
              const col = Math.abs(c.difference) < 0.5 ? colors.textMuted : c.difference > 0 ? colors.success : colors.danger;
              return (
                <View key={c.id} style={[s.histRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.histDate, { color: colors.text }]}>{new Date(c.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
                    <Text style={[s.histSub, { color: colors.textMuted }]}>Counted {formatCurrency(c.counted, settings.currency)} · expected {formatCurrency(c.expected, settings.currency)}</Text>
                  </View>
                  <Text style={[s.histDiff, { color: col }]}>{Math.abs(c.difference) < 0.5 ? '✓' : `${c.difference > 0 ? '+' : '−'}${formatCurrency(Math.abs(c.difference), settings.currency)}`}</Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  hero: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 18, alignItems: 'center', marginBottom: 14 },
  heroLbl: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1 },
  heroAmt: { fontFamily: fonts.display, fontSize: 34, marginTop: 6 },
  heroSub: { fontFamily: fonts.medium, fontSize: 11.5, marginTop: 4 },

  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, marginBottom: 12, overflow: 'hidden' },
  inRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, gap: 12 },
  inLabel: { fontFamily: fonts.semiBold, fontSize: 14.5, flex: 1 },
  inField: { minWidth: 110, textAlign: 'right', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 15, fontFamily: fonts.semiBold },
  inAuto: { fontFamily: fonts.bold, fontSize: 15 },

  denomToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  denomToggleText: { fontFamily: fonts.semiBold, fontSize: 13, flex: 1 },
  denomRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  denomNote: { fontFamily: fonts.bold, fontSize: 14, width: 44 },
  denomInput: { width: 64, textAlign: 'center', borderWidth: 1, borderRadius: 9, paddingVertical: 6, fontSize: 14, fontFamily: fonts.semiBold },
  denomSub: { fontFamily: fonts.medium, fontSize: 12.5, flex: 1, textAlign: 'right' },
  denomApply: { borderRadius: 11, paddingVertical: 11, alignItems: 'center', marginTop: 8, marginBottom: 4 },
  denomApplyText: { fontFamily: fonts.bold, fontSize: 13 },

  diffBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, marginBottom: 12 },
  diffLbl: { fontFamily: fonts.semiBold, fontSize: 12 },
  diffAmt: { fontFamily: fonts.display, fontSize: 26, marginTop: 4 },

  noteField: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 13, fontSize: 14, fontFamily: fonts.regular, minHeight: 48, marginBottom: 12, textAlignVertical: 'top' },

  refHead: { fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 1, marginTop: 12, marginBottom: 4, marginLeft: 2 },
  refRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 },
  refLabel: { fontFamily: fonts.medium, fontSize: 13.5 },
  refVal: { fontFamily: fonts.bold, fontSize: 13.5 },

  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 15, paddingVertical: 15, marginTop: 6 },
  saveText: { fontFamily: fonts.bold, fontSize: 15, color: '#fff' },

  histRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12, marginBottom: 8 },
  histDate: { fontFamily: fonts.bold, fontSize: 14 },
  histSub: { fontFamily: fonts.medium, fontSize: 11.5, marginTop: 2 },
  histDiff: { fontFamily: fonts.bold, fontSize: 14 },
});
