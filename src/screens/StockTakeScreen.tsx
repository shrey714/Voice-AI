import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MotiView } from 'moti';
import { useAppStore } from '../stores/useAppStore';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function StockTakeScreen({ navigation }: any) {
  const { colors } = useAppTheme();
  const { activeStockTake, stockTakeItems, products, startStockTake, cancelStockTake, settings } = useAppStore();
  const CATEGORIES = ['All', ...(settings.productCategories ?? [])];
  const [scope, setScope] = useState('all');
  const [starting, setStarting] = useState(false);

  const countedCount = stockTakeItems.filter(i => i.countedQty !== null).length;
  const totalCount = stockTakeItems.length;
  const progress = totalCount > 0 ? countedCount / totalCount : 0;

  const handleStart = async () => {
    if (products.length === 0) {
      Alert.alert('No Products', 'Add products to your inventory before starting a stock take.');
      return;
    }
    const inScope = scope === 'all' ? products : products.filter(p => p.category === scope);
    if (inScope.length === 0) {
      Alert.alert('No Products', `No products in the "${scope}" category.`);
      return;
    }
    setStarting(true);
    try {
      await startStockTake(scope);
      navigation.navigate('StockTakeCount');
    } finally {
      setStarting(false);
    }
  };

  const handleDiscard = () => {
    Alert.alert(
      'Discard Stock Take?',
      'All counts entered so far will be lost. Inventory will not be updated.',
      [
        { text: 'Keep Counting', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: cancelStockTake },
      ]
    );
  };

  const s = makeStyles(colors);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>

      {/* History link */}
      <TouchableOpacity
        style={[s.historyBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => navigation.navigate('StockTakeHistory')}
        activeOpacity={0.75}
      >
        <Ionicons name="time-outline" size={17} color={colors.primary} />
        <Text style={[s.historyBtnText, { color: colors.primary }]}>View Past Stock Takes</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 'auto' }} />
      </TouchableOpacity>

      {/* Resume banner — shown when a session is in progress */}
      {activeStockTake && (
        <MotiView from={{ opacity: 0, translateY: -8 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 300 }}>
          <View style={[s.resumeCard, { backgroundColor: colors.primary + '12', borderColor: colors.primary + '40' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Ionicons name="time-outline" size={22} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[s.resumeTitle, { color: colors.primary }]}>Stock take in progress</Text>
                <Text style={[s.resumeSub, { color: colors.textMuted }]}>
                  Started {formatDate(activeStockTake.startedAt)} · Scope: {activeStockTake.scope === 'all' ? 'All products' : activeStockTake.scope}
                </Text>
              </View>
            </View>

            {/* Progress bar */}
            <View style={[s.progressTrack, { backgroundColor: colors.border }]}>
              <View style={[s.progressFill, { backgroundColor: colors.primary, width: `${Math.round(progress * 100)}%` as any }]} />
            </View>
            <Text style={[s.progressLabel, { color: colors.textSub }]}>
              {countedCount} of {totalCount} products counted
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[s.btn, { backgroundColor: colors.primary, flex: 2 }]}
                onPress={() => navigation.navigate('StockTakeCount')}
              >
                <Ionicons name="play" size={16} color="#fff" />
                <Text style={[s.btnText, { color: '#fff' }]}>Resume Counting</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btn, { backgroundColor: colors.danger + '15', borderWidth: 1, borderColor: colors.danger + '40', flex: 1 }]}
                onPress={handleDiscard}
              >
                <Text style={[s.btnText, { color: colors.danger }]}>Discard</Text>
              </TouchableOpacity>
            </View>
          </View>
        </MotiView>
      )}

      {/* New stock take section */}
      {!activeStockTake && (
        <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 350, delay: 100 }}>
          {/* What is stock take */}
          <View style={[s.infoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.infoTitle, { color: colors.text }]}>What is Stock Take?</Text>
            <Text style={[s.infoBody, { color: colors.textSub }]}>
              Walk your shelves, count each product physically, and enter what you see. The app shows where your actual stock differs from the system — then bulk-updates everything in one go.
            </Text>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
              {[
                { icon: 'cube-outline', label: `${products.length} products` },
                { icon: 'time-outline', label: '~20–40 min' },
                { icon: 'shield-checkmark-outline', label: 'Undo-safe' },
              ].map(item => (
                <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name={item.icon as any} size={14} color={colors.primary} />
                  <Text style={{ fontFamily: fonts.semiBold, fontSize: 12, color: colors.textSub }}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Scope selector */}
          <Text style={[s.sectionLabel, { color: colors.textSub }]}>SCOPE</Text>
          <View style={s.scopeGrid}>
            {CATEGORIES.map(cat => {
              const key = cat === 'All' ? 'all' : cat;
              const active = scope === key;
              const count = cat === 'All' ? products.length : products.filter(p => p.category === cat).length;
              if (count === 0 && cat !== 'All') return null;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[s.scopeChip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.surface }]}
                  onPress={() => setScope(key)}
                >
                  <Text style={[s.scopeChipText, { color: active ? '#fff' : colors.textSub }]}>{cat}</Text>
                  <Text style={[s.scopeChipCount, { color: active ? 'rgba(255,255,255,0.7)' : colors.textMuted }]}>{count}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[s.btn, s.startBtn, { backgroundColor: colors.primary }]}
            onPress={handleStart}
            disabled={starting}
          >
            <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
            <Text style={[s.btnText, { color: '#fff', fontSize: 16 }]}>
              {starting ? 'Starting...' : 'Start Stock Take'}
            </Text>
          </TouchableOpacity>
        </MotiView>
      )}

      {/* Tips */}
      <View style={[s.tipsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[s.tipsTitle, { color: colors.textSub }]}>TIPS</Text>
        {[
          'Count is saved automatically — safe to close the app and resume later',
          'Leave a product blank if you\'re skipping it — it won\'t be updated',
          'Large negative gaps may indicate theft or billing errors — investigate before confirming',
          'Do this monthly for best results',
        ].map((tip, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Ionicons name="ellipse" size={6} color={colors.primary} style={{ marginTop: 6 }} />
            <Text style={[s.tipText, { color: colors.textSub, flex: 1 }]}>{tip}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  resumeCard: { borderRadius: 14, borderWidth: 1.5, padding: 16, marginBottom: 20 },
  resumeTitle: { fontFamily: fonts.extraBold, fontSize: 15 },
  resumeSub: { fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  progressTrack: { height: 6, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressLabel: { fontFamily: fonts.semiBold, fontSize: 12, marginTop: 5 },

  infoCard: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 20 },
  infoTitle: { fontFamily: fonts.extraBold, fontSize: 16, marginBottom: 6 },
  infoBody: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20 },

  sectionLabel: { fontFamily: fonts.extraBold, fontSize: 11, letterSpacing: 0.7, marginBottom: 10 },
  scopeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  scopeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  scopeChipText: { fontFamily: fonts.bold, fontSize: 13 },
  scopeChipCount: { fontFamily: fonts.semiBold, fontSize: 11 },

  historyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 10, borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14, paddingVertical: 11, marginBottom: 16,
  },
  historyBtnText: { fontFamily: fonts.semiBold, fontSize: 13 },

  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, paddingHorizontal: 16, borderRadius: 12 },
  startBtn: { marginBottom: 20 },
  btnText: { fontFamily: fonts.bold, fontSize: 14 },

  tipsCard: { borderRadius: 14, borderWidth: 1, padding: 16 },
  tipsTitle: { fontFamily: fonts.extraBold, fontSize: 11, letterSpacing: 0.7 },
  tipText: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
});
