import React, { useState, useMemo } from 'react';
import { View, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { useAppStore } from '../stores/useAppStore';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';
import { StockTakeItem } from '../types';

export default function StockTakeReviewScreen({ navigation }: any) {
  const { colors } = useAppTheme();
  const { stockTakeItems, commitStockTake, cancelStockTake } = useAppStore();
  const [showAll, setShowAll] = useState(false);
  const [committing, setCommitting] = useState(false);

  const countedItems = useMemo(() =>
    stockTakeItems.filter(i => i.countedQty !== null),
    [stockTakeItems]
  );

  const discrepancies = useMemo(() =>
    countedItems.filter(i => i.countedQty !== i.systemQty),
    [countedItems]
  );

  const summary = useMemo(() => ({
    counted: countedItems.length,
    short: countedItems.filter(i => i.countedQty! < i.systemQty).length,
    over: countedItems.filter(i => i.countedQty! > i.systemQty).length,
    exact: countedItems.filter(i => i.countedQty! === i.systemQty).length,
    skipped: stockTakeItems.length - countedItems.length,
    netAdj: countedItems.reduce((s, i) => s + (i.countedQty! - i.systemQty), 0),
  }), [countedItems, stockTakeItems]);

  const displayItems = showAll ? countedItems : discrepancies;

  const handleCommit = () => {
    if (countedItems.length === 0) {
      Alert.alert('Nothing to Commit', 'No products have been counted yet.');
      return;
    }
    Alert.alert(
      'Confirm Stock Update',
      `This will update quantities for ${countedItems.length} product${countedItems.length !== 1 ? 's' : ''} to match your counts. ${summary.skipped > 0 ? `${summary.skipped} skipped products will not be changed.` : ''}\n\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm & Update',
          style: 'destructive',
          onPress: async () => {
            setCommitting(true);
            try {
              await commitStockTake();
              navigation.navigate('StockTake');
              // Show success on the landing screen via a small alert
              setTimeout(() => {
                Alert.alert(
                  'Stock Take Complete',
                  `${summary.counted} products updated.\n${summary.short} short · ${summary.over} over · ${summary.exact} exact${summary.skipped > 0 ? ` · ${summary.skipped} skipped` : ''}`,
                  [{ text: 'Done' }]
                );
              }, 400);
            } catch {
              Alert.alert('Error', 'Failed to update inventory. Please try again.');
            } finally {
              setCommitting(false);
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item, index }: { item: StockTakeItem; index: number }) => {
    const diff = item.countedQty! - item.systemQty;
    return (
      <MotiView
        from={{ opacity: 0, translateY: 6 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 200, delay: Math.min(index * 25, 300) }}
      >
        <View style={[s.row, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.productName, { color: colors.text }]} numberOfLines={1}>{item.productName}</Text>
            <Text style={[s.category, { color: colors.textMuted }]}>{item.category}</Text>
          </View>
          <View style={s.qtyGroup}>
            <View style={s.qtyCol}>
              <Text style={[s.qtyLabel, { color: colors.textMuted }]}>Was</Text>
              <Text style={[s.qtyVal, { color: colors.textSub }]}>{item.systemQty}</Text>
            </View>
            <Ionicons name="arrow-forward" size={14} color={colors.textMuted} style={{ marginTop: 14 }} />
            <View style={s.qtyCol}>
              <Text style={[s.qtyLabel, { color: colors.textMuted }]}>Now</Text>
              <Text style={[s.qtyVal, { color: colors.text }]}>{item.countedQty}</Text>
            </View>
          </View>
          {diff === 0 ? (
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
      </MotiView>
    );
  };

  const s = makeStyles(colors);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Summary stats */}
      <View style={[s.summaryRow, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        {[
          { label: 'Counted', value: summary.counted, color: colors.primary },
          { label: 'Short', value: summary.short, color: summary.short > 0 ? colors.danger : colors.textMuted },
          { label: 'Over', value: summary.over, color: summary.over > 0 ? colors.success : colors.textMuted },
          { label: 'Skipped', value: summary.skipped, color: colors.textMuted },
        ].map((stat, i) => (
          <React.Fragment key={stat.label}>
            {i > 0 && <View style={[s.statDivider, { backgroundColor: colors.border }]} />}
            <View style={s.statItem}>
              <Text style={[s.statValue, { color: stat.color }]}>{stat.value}</Text>
              <Text style={[s.statLabel, { color: colors.textMuted }]}>{stat.label}</Text>
            </View>
          </React.Fragment>
        ))}
      </View>

      {/* Net adjustment banner */}
      {summary.netAdj !== 0 && (
        <View style={[s.netBanner, {
          backgroundColor: summary.netAdj < 0 ? colors.danger + '10' : colors.success + '10',
          borderColor: summary.netAdj < 0 ? colors.danger + '30' : colors.success + '30',
        }]}>
          <Ionicons
            name={summary.netAdj < 0 ? 'trending-down-outline' : 'trending-up-outline'}
            size={15}
            color={summary.netAdj < 0 ? colors.danger : colors.success}
          />
          <Text style={{ fontFamily: fonts.semiBold, fontSize: 13, color: summary.netAdj < 0 ? colors.danger : colors.success }}>
            Net adjustment: {summary.netAdj > 0 ? '+' : ''}{summary.netAdj} units across all products
          </Text>
        </View>
      )}

      {/* Toggle filter */}
      <View style={[s.filterRow, { borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[s.filterChip, { backgroundColor: !showAll ? colors.primary : colors.surface, borderColor: !showAll ? colors.primary : colors.border }]}
          onPress={() => setShowAll(false)}
        >
          <Text style={[s.filterChipText, { color: !showAll ? '#fff' : colors.textSub }]}>
            Discrepancies ({discrepancies.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.filterChip, { backgroundColor: showAll ? colors.primary : colors.surface, borderColor: showAll ? colors.primary : colors.border }]}
          onPress={() => setShowAll(true)}
        >
          <Text style={[s.filterChipText, { color: showAll ? '#fff' : colors.textSub }]}>
            All counted ({countedItems.length})
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={displayItems}
        keyExtractor={i => i.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 140, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 60, gap: 10 }}>
            <Ionicons name="checkmark-circle-outline" size={48} color={colors.success} />
            <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.text }}>
              {showAll ? 'Nothing counted yet' : 'No discrepancies'}
            </Text>
            <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 40 }}>
              {showAll ? 'Go back and enter some counts.' : 'Every counted product matches the system.'}
            </Text>
          </View>
        }
      />

      {/* Commit footer */}
      <View style={[s.footer, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TouchableOpacity style={[s.backBtn, {borderColor: colors.border}]} onPress={() => navigation.goBack()}>
           <Ionicons name="chevron-back" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.commitBtn, { backgroundColor: countedItems.length > 0 ? colors.primary : colors.surfaceHigh }]}
          onPress={handleCommit}
          disabled={committing || countedItems.length === 0}
        >
          <Ionicons name="checkmark-done-outline" size={18} color={countedItems.length > 0 ? '#fff' : colors.textMuted} />
          <Text style={[s.commitBtnText, { color: countedItems.length > 0 ? '#fff' : colors.textMuted }]}>
            {committing ? 'Updating inventory...' : `Confirm & Update ${countedItems.length} Product${countedItems.length !== 1 ? 's' : ''}`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  summaryRow: { flexDirection: 'row', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: fonts.extraBold, fontSize: 22 },
  statLabel: { fontFamily: fonts.medium, fontSize: 11, marginTop: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, marginVertical: 6 },

  netBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 1 },

  filterRow: { flexDirection: 'row', gap: 8, padding: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  filterChipText: { fontFamily: fonts.bold, fontSize: 13 },

  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  productName: { fontFamily: fonts.bold, fontSize: 14 },
  category: { fontFamily: fonts.regular, fontSize: 11, marginTop: 2 },
  qtyGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  qtyCol: { alignItems: 'center' },
  qtyLabel: { fontFamily: fonts.regular, fontSize: 10 },
  qtyVal: { fontFamily: fonts.extraBold, fontSize: 15 },
  diffBadge: { width: 48, height: 32, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  diffText: { fontFamily: fonts.extraBold, fontSize: 13 },

  footer: { padding: 14, gap: 8, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, display:'flex', flexDirection: 'row', alignItems:'center' },
  commitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 10, flex: 1 },
  commitBtnText: { fontFamily: fonts.extraBold, fontSize: 15 },
  backBtn: { paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 10 },
});
