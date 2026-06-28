import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../../stores/useAppStore';
import { salesHeat } from '../../utils/stats';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';

const WINDOW_DAYS = 60;
// Shop hours strip — skip the dead overnight hours so cells are readable on phones.
const START_HOUR = 6;
const END_HOUR = 23;

const fmtHour = (h: number) => `${(h % 12) || 12}${h < 12 ? 'am' : 'pm'}`;
const fmtHourLong = (h: number) => `${(h % 12) || 12} ${h < 12 ? 'AM' : 'PM'}`;

export default function BusiestHours({ onPress }: { onPress?: () => void }) {
  const { colors } = useAppTheme();
  const bills = useAppStore(s => s.bills);
  const s = makeStyles(colors);

  const data = useMemo(() => salesHeat(bills, Date.now() - WINDOW_DAYS * 86400000, Date.now()), [bills]);
  if (data.billCount < 5) return null; // not enough history to be meaningful

  const peakLabel = `${fmtHourLong(data.peakHour)}–${fmtHourLong((data.peakHour + 1) % 24)}`;
  const hoursRange: number[] = [];
  for (let h = START_HOUR; h <= END_HOUR; h++) hoursRange.push(h);

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={s.head}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <Ionicons name="time-outline" size={16} color={colors.primary} />
          <Text style={[s.title, { color: colors.text }]}>Busiest hours</Text>
        </View>
        <Text style={[s.sub, { color: colors.textMuted }]}>last {WINDOW_DAYS} days</Text>
      </View>

      {/* Heat strip */}
      <View style={s.strip}>
        {hoursRange.map(h => {
          const intensity = data.max > 0 ? data.hours[h] / data.max : 0;
          return (
            <View key={h} style={s.cellWrap}>
              <View style={[s.cell, { backgroundColor: colors.primary, opacity: 0.1 + 0.9 * intensity }]} />
            </View>
          );
        })}
      </View>
      {/* Axis labels */}
      <View style={s.axis}>
        {[6, 12, 18, 23].map(h => (
          <Text key={h} style={[s.axisLbl, { color: colors.textMuted }]}>{fmtHour(h)}</Text>
        ))}
      </View>

      <View style={s.footer}>
        <View style={[s.peakPill, { backgroundColor: colors.primaryLight }]}>
          <Ionicons name="flame" size={12} color={colors.primary} />
          <Text style={[s.peakText, { color: colors.primary }]}>Peak {peakLabel}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 14, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  title: { fontFamily: fonts.bold, fontSize: 15 },
  sub: { fontFamily: fonts.medium, fontSize: 11.5 },
  strip: { flexDirection: 'row', gap: 2, height: 34 },
  cellWrap: { flex: 1, justifyContent: 'center' },
  cell: { height: 34, borderRadius: 4 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  axisLbl: { fontFamily: fonts.medium, fontSize: 10 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  peakPill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  peakText: { fontFamily: fonts.bold, fontSize: 12.5 },
});
