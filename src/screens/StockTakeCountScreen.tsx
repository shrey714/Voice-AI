import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View, SectionList, StyleSheet, TouchableOpacity,
  TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useAppStore } from '../stores/useAppStore';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';
import { StockTakeItem } from '../types';

interface Section {
  title: string;
  data: StockTakeItem[];
}

export default function StockTakeCountScreen({ navigation }: any) {
  const { colors } = useAppTheme();
  const { stockTakeItems, activeStockTake, updateStockTakeCount } = useAppStore();

  // Local string values for controlled inputs — avoids setState cascade on every keystroke
  const [inputValues, setInputValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const item of stockTakeItems) {
      init[item.id] = item.countedQty !== null ? String(item.countedQty) : '';
    }
    return init;
  });

  // Debounce per-item DB writes
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleCountChange = useCallback((itemId: string, text: string) => {
    const clean = text.replace(/[^0-9]/g, '');
    setInputValues(prev => ({ ...prev, [itemId]: clean }));
    if (debounceRefs.current[itemId]) clearTimeout(debounceRefs.current[itemId]);
    debounceRefs.current[itemId] = setTimeout(() => {
      const qty = clean === '' ? null : parseInt(clean) || 0;
      updateStockTakeCount(itemId, qty);
    }, 300);
  }, [updateStockTakeCount]);

  // Group items by category
  const sections: Section[] = useMemo(() => {
    const map: Record<string, StockTakeItem[]> = {};
    for (const item of stockTakeItems) {
      if (!map[item.category]) map[item.category] = [];
      map[item.category].push(item);
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([title, data]) => ({ title, data }));
  }, [stockTakeItems]);

  const countedCount = useMemo(() =>
    Object.values(inputValues).filter(v => v !== '').length,
    [inputValues]
  );

  const handleReview = () => {
    if (countedCount === 0) {
      Alert.alert('Nothing Counted', 'Enter at least one product count before reviewing.');
      return;
    }
    navigation.navigate('StockTakeReview');
  };

  const progress = stockTakeItems.length > 0 ? countedCount / stockTakeItems.length : 0;
  const s = makeStyles(colors);

  const renderSectionHeader = useCallback(({ section }: { section: Section }) => (
    <View style={[s.sectionHeader, { backgroundColor: colors.bg }]}>
      <Text style={[s.sectionTitle, { color: colors.primary }]}>{section.title}</Text>
      <Text style={[s.sectionCount, { color: colors.textMuted }]}>
        {section.data.filter(i => inputValues[i.id] !== '').length}/{section.data.length}
      </Text>
    </View>
  ), [colors, inputValues]);

  const renderItem = useCallback(({ item }: { item: StockTakeItem }) => {
    const val = inputValues[item.id] ?? '';
    const counted = val !== '' ? parseInt(val) || 0 : null;
    const diff = counted !== null ? counted - item.systemQty : null;

    return (
      <View style={[s.row, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.productName, { color: colors.text }]} numberOfLines={1}>{item.productName}</Text>
          <Text style={[s.systemQty, { color: colors.textMuted }]}>System: {item.systemQty}</Text>
        </View>
        <TextInput
          style={[s.countInput, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: val !== '' ? colors.primary : colors.border }]}
          value={val}
          onChangeText={text => handleCountChange(item.id, text)}
          placeholder="—"
          placeholderTextColor={colors.textMuted}
          keyboardType="numeric"
          selectTextOnFocus
          returnKeyType="done"
        />
        {diff === null ? (
          <View style={s.diffPlaceholder} />
        ) : diff === 0 ? (
          <View style={[s.diffBadge, { backgroundColor: colors.success + '18' }]}>
            <Ionicons name="checkmark" size={13} color={colors.success} />
          </View>
        ) : diff > 0 ? (
          <View style={[s.diffBadge, { backgroundColor: colors.success + '18' }]}>
            <Text style={[s.diffText, { color: colors.success }]}>+{diff}</Text>
          </View>
        ) : (
          <View style={[s.diffBadge, { backgroundColor: colors.danger + '18' }]}>
            <Text style={[s.diffText, { color: colors.danger }]}>{diff}</Text>
          </View>
        )}
      </View>
    );
  }, [inputValues, colors, handleCountChange]);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Progress header */}
      <View style={[s.progressBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={{ flex: 1 }}>
          <View style={[s.progressTrack, { backgroundColor: colors.border }]}>
            <View style={[s.progressFill, { backgroundColor: colors.primary, width: `${Math.round(progress * 100)}%` as any }]} />
          </View>
          <Text style={[s.progressLabel, { color: colors.textSub }]}>
            {countedCount} of {stockTakeItems.length} counted
            {activeStockTake?.scope !== 'all' ? ` · ${activeStockTake?.scope}` : ''}
          </Text>
        </View>
      </View>

      {/* Column labels */}
      <View style={[s.colHeader, { backgroundColor: colors.surfaceHigh, borderBottomColor: colors.border }]}>
        <Text style={[s.colLabel, { color: colors.textMuted, flex: 1 }]}>PRODUCT</Text>
        <Text style={[s.colLabel, { color: colors.textMuted, width: 64, textAlign: 'center' }]}>COUNT</Text>
        <Text style={[s.colLabel, { color: colors.textMuted, width: 50, textAlign: 'center' }]}>DIFF</Text>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        renderSectionHeader={renderSectionHeader}
        renderItem={renderItem}
        extraData={inputValues}
        stickySectionHeadersEnabled
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 140 }}
      />

      {/* Floating review button */}
      <View style={[s.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TouchableOpacity
          style={[s.reviewBtn, { backgroundColor: countedCount > 0 ? colors.primary : colors.surfaceHigh }]}
          onPress={handleReview}
          disabled={countedCount === 0}
        >
          <Ionicons name="eye-outline" size={18} color={countedCount > 0 ? '#fff' : colors.textMuted} />
          <Text style={[s.reviewBtnText, { color: countedCount > 0 ? '#fff' : colors.textMuted }]}>
            {countedCount > 0 ? `Review ${countedCount} counted` : 'Count some products first'}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  progressBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  progressTrack: { height: 5, borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
  progressFill: { height: '100%', borderRadius: 4 },
  progressLabel: { fontFamily: fonts.semiBold, fontSize: 12 },

  colHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  colLabel: { fontFamily: fonts.extraBold, fontSize: 10, letterSpacing: 0.6 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border + '60' },
  sectionTitle: { fontFamily: fonts.extraBold, fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase' },
  sectionCount: { fontFamily: fonts.semiBold, fontSize: 12 },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  productName: { fontFamily: fonts.bold, fontSize: 14 },
  systemQty: { fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  countInput: { width: 64, borderRadius: 8, borderWidth: 1.5, paddingHorizontal: 8, paddingVertical: 7, textAlign: 'center', fontFamily: fonts.extraBold, fontSize: 15 },
  diffPlaceholder: { width: 50 },
  diffBadge: { width: 50, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  diffText: { fontFamily: fonts.extraBold, fontSize: 13 },

  footer: {  padding: 14, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, display:'flex', alignItems:'center', justifyContent:'center' },
  reviewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10 },
  reviewBtnText: { fontFamily: fonts.extraBold, fontSize: 15 },
});
