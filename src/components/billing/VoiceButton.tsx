import React, { useState, useRef, useCallback, useEffect } from 'react';
import { TouchableOpacity, StyleSheet, View, ScrollView, Animated } from 'react-native';
import { MotiView } from 'moti';
import AppModal from '../common/AppModal';
import { Ionicons } from '@expo/vector-icons';
import { Text } from 'react-native-paper';
import {
  useAudioRecorder,
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
} from 'expo-audio';
import { useAppStore } from '../../stores/useAppStore';
import { useAppTheme } from '../../theme';
import { fonts } from '../../theme/typography';
import { Product } from '../../types';
import { parseVoiceOrder, fuzzyScore } from '../../utils/helpers';
import { transcribeAudio, getWhisperApiKey } from '../../services/whisper';
import { transcribeWithGroq, getGroqApiKey } from '../../services/groq';
import { extractInventoryItems, getGeminiApiKey } from '../../services/gemini';

const SPEECH_DB = -50;       // was -35; typical phone speech is -40 to -50 dBFS
const SILENCE_DB = -60;       // was -42; true silence/room noise is below -60
const SILENCE_MS = 1400;
const MIN_SPEECH_MS = 300;    // was 400
const MAX_SPEECH_MS = 10000;  // force-trigger after 10s even if no silence gap
const MAX_PARALLEL = 2;
const N_BARS = 5;
const BAR_WEIGHTS = [0.55, 0.82, 1.0, 0.82, 0.55];

type Mode = 'off' | 'standby' | 'confirm';

interface ResolvedItem {
  id: string;
  label: string;
  product: Product | null;
  quantity: number;
}

interface Props {
  onResult: (items: { product: Product; quantity: number }[]) => void;
  style?: any;
  color?: string;
}

function resolveProduct(name: string, products: Product[]): Product | null {
  if (!name || !products.length) return null;
  let best: { p: Product; s: number } | null = null;
  for (const p of products) {
    const s = fuzzyScore(name, p.name);
    if (!best || s > best.s) best = { p, s };
  }
  return best && best.s >= 0.45 ? best.p : null;
}

export default function VoiceButton({ onResult, style, color }: Props) {
  const { colors } = useAppTheme();
  const language = useAppStore(s => s.settings.language);
  const products = useAppStore(s => s.products);

  const [mode, setMode] = useState<Mode>('off');
  const [resolvedItems, setResolvedItems] = useState<ResolvedItem[]>([]);
  const [processingCount, setProcessingCount] = useState(0);
  const [debugDb, setDebugDb] = useState<number>(-160);

  // Refs for async closures — never stale
  const listeningRef = useRef(false);
  const recordingActiveRef = useRef(false);
  const processingCountRef = useRef(0);
  const speechStartRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const languageRef = useRef(language);
  const productsRef = useRef(products);
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Always points to the latest triggerProcessing — avoids stale closure in setInterval
  const triggerFnRef = useRef<() => void>(() => {});

  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { productsRef.current = products; }, [products]);

  const barAnims = useRef(
    Array.from({ length: N_BARS }, () => new Animated.Value(0.08))
  ).current;

  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    isMeteringEnabled: true,
  });

  // Cleanup
  useEffect(() => {
    return () => {
      listeningRef.current = false;
      recordingActiveRef.current = false;
      if (vadIntervalRef.current !== null) clearInterval(vadIntervalRef.current);
      try { recorder.stop(); } catch {}
      try { setAudioModeAsync({ allowsRecording: false }); } catch {}
    };
  }, []);

  // ── VAD interval ──────────────────────────────────────────────────────────
  // Polls recorder directly every 100ms — does NOT go through React state.
  // This fires even when metering is constant (silence), unlike useEffect on state.

  const stopVAD = () => {
    if (vadIntervalRef.current !== null) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
  };

  const startVAD = () => {
    stopVAD();
    vadIntervalRef.current = setInterval(() => {
      if (!listeningRef.current) return;

      let db = -160;
      try { db = recorder.getStatus().metering ?? -160; } catch {}

      const now = Date.now();

      // Debug: update visible dB display (throttled via React batching)
      setDebugDb(db);

      // Waveform animation
      const rawAmp = Math.max(0, Math.min(1, (db + 60) / 50));
      const amp = db < -55 ? 0 : rawAmp;
      barAnims.forEach((anim, i) => {
        const jitter = (Math.random() * 0.14) - 0.07;
        const target = Math.max(0.08, Math.min(1.0, amp * BAR_WEIGHTS[i] + jitter));
        Animated.spring(anim, {
          toValue: target,
          useNativeDriver: true,
          tension: 280,
          friction: 14,
        }).start();
      });

      // VAD logic — skip during recorder restart gap
      if (!recordingActiveRef.current) return;

      if (db > SPEECH_DB) {
        if (!speechStartRef.current) {
          speechStartRef.current = now;
        }
        silenceStartRef.current = null;
        // Force-trigger after MAX_SPEECH_MS even without silence gap
        if (now - speechStartRef.current >= MAX_SPEECH_MS) {
          speechStartRef.current = null;
          silenceStartRef.current = null;
          triggerFnRef.current();
        }
      } else if (db < SILENCE_DB && speechStartRef.current) {
        if (!silenceStartRef.current) {
          silenceStartRef.current = now;
        }
        const silenceDuration = now - silenceStartRef.current;
        const speechDuration = silenceStartRef.current - speechStartRef.current;
        if (silenceDuration >= SILENCE_MS && speechDuration >= MIN_SPEECH_MS) {
          speechStartRef.current = null;
          silenceStartRef.current = null;
          triggerFnRef.current();
        }
      }
    }, 100);
  };

  // ── Recording helpers ─────────────────────────────────────────────────────

  const startRecordingOnly = async () => {
    try {
      // Pass options explicitly each time so isMeteringEnabled is always set
      await recorder.prepareToRecordAsync({
        ...RecordingPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      recorder.record();
      recordingActiveRef.current = true;
    } catch (e) {
      recordingActiveRef.current = false;
    }
  };

  const startRecording = async () => {
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    } catch (e) {
    }
    await startRecordingOnly();
    startVAD();
  };

  // ── Processing ────────────────────────────────────────────────────────────

  const transcribeUri = async (uri: string): Promise<string> => {
    const groq = getGroqApiKey();
    const oai = getWhisperApiKey();
    if (!groq && !oai) {; return ''; }
    if (groq) {
      const r = await transcribeWithGroq(uri, languageRef.current);
      if (r.ok) {; return r.text; }
    }
    if (oai) {
      const r = await transcribeAudio(uri, languageRef.current);
      if (r.ok) {; return r.text; }
    }
    return '';
  };

  const processUtterance = async (uri: string) => {
    const text = await transcribeUri(uri);
    if (!text || !listeningRef.current) return;

    const gemini = getGeminiApiKey();
    let extracted: Array<{ product_name: string; quantity?: number; unit?: string }> = [];

    if (gemini) {
      const r = await extractInventoryItems(text);
      if (r.ok && r.data.intent === 'inventory_request' && r.data.items.length) {
        extracted = r.data.items;
      }
    }
    if (!extracted.length) {
      extracted = parseVoiceOrder(text).map(p => ({ product_name: p.item, quantity: p.quantity }));
    }

    const resolved: ResolvedItem[] = extracted.map(ex => ({
      id: `${Date.now()}-${Math.random()}`,
      label: ex.unit ? `${ex.product_name} (${ex.unit})` : ex.product_name,
      product: resolveProduct(ex.product_name, productsRef.current),
      quantity: ex.quantity ?? 1,
    }));

    if (!listeningRef.current) return;
    if (!resolved.some(r => r.product !== null)) return;

    setResolvedItems(prev => {
      const next = [...prev];
      for (const newItem of resolved) {
        // If the same product is already in the stack, just bump its quantity
        if (newItem.product) {
          const existing = next.find(it => it.product?.id === newItem.product?.id);
          if (existing) {
            existing.quantity += newItem.quantity;
            continue;
          }
        }
        next.push(newItem);
      }
      return next;
    });
    setMode(m => m === 'off' ? 'off' : 'confirm');
  };

  const triggerProcessing = async () => {
    if (!listeningRef.current) return;
    if (processingCountRef.current >= MAX_PARALLEL) {; return; }
    if (!recordingActiveRef.current) {; return; }

    // Check recorder is actually active before stopping
    const statusBefore = recorder.getStatus();

    if (!statusBefore.isRecording) {
      recordingActiveRef.current = false;
      await startRecordingOnly();
      return;
    }

    // Mark recording as inactive FIRST to block re-entry from VAD ticks
    recordingActiveRef.current = false;
    try {
      await recorder.stop();
      const uri = recorder.uri || '';
      if (!uri) {
        await startRecordingOnly();
        return;
      }

      // Restart recording immediately (VAD interval keeps running)
      await startRecordingOnly();

      if (!uri) return;

      processingCountRef.current++;
      setProcessingCount(c => c + 1);
      processUtterance(uri).finally(() => {
        processingCountRef.current--;
        setProcessingCount(c => Math.max(0, c - 1));
      });
    } catch {
      if (listeningRef.current && !recordingActiveRef.current) {
        await startRecordingOnly();
      }
    }
  };

  // Keep the ref current on every render so the setInterval closure is never stale
  triggerFnRef.current = () => { triggerProcessing(); };

  // ── Controls ──────────────────────────────────────────────────────────────

  const toggleListening = async () => {
    if (listeningRef.current) {
      listeningRef.current = false;
      recordingActiveRef.current = false;
      speechStartRef.current = null;
      silenceStartRef.current = null;
      stopVAD();
      try { await recorder.stop(); } catch {}
      try { await setAudioModeAsync({ allowsRecording: false }); } catch {}
      barAnims.forEach(a =>
        Animated.spring(a, { toValue: 0.08, useNativeDriver: true, tension: 120, friction: 14 }).start()
      );
      setMode('off');
      setResolvedItems([]);
      return;
    }

    const { granted } = await AudioModule.requestRecordingPermissionsAsync();
    if (!granted) return;

    listeningRef.current = true;
    setMode('standby');
    await startRecording();
  };

  const confirmOrder = () => {
    const items = resolvedItems
      .filter(i => i.product)
      .map(i => ({ product: i.product!, quantity: i.quantity }));
    onResult(items);
    setResolvedItems([]);
    setMode('standby');
  };

  const dismissConfirm = () => {
    setResolvedItems([]);
    setMode('standby');
  };

  const active = mode !== 'off';
  const addableCount = resolvedItems.filter(i => i.product).length;
  const s = makeStyles(colors);

  return (
    <>
      {/* Mic button — live waveform bars when active */}
      <View style={{ position: 'relative', alignItems: 'center' }}>
        <TouchableOpacity
          style={[
            style ?? s.defaultBtn,
            {
              backgroundColor: colors.primaryLight,
              borderColor: colors.primary,
              borderWidth: active ? 1.5 : 0.5,
            },
          ]}
          onPress={toggleListening}
        >
          {active ? (
            <View style={s.barsContainer}>
              {barAnims.map((anim, i) => (
                <Animated.View
                  key={i}
                  style={[
                    s.bar,
                    { backgroundColor: colors.primary, transform: [{ scaleY: anim }] },
                  ]}
                />
              ))}
            </View>
          ) : (
            <Ionicons name="mic-outline" size={22} color={color ?? colors.primary} />
          )}
        </TouchableOpacity>

        {/* Amber dot badge while STT/Gemini calls are in-flight */}
        {processingCount > 0 && (
          <View style={[s.badge, { backgroundColor: colors.warning, borderColor: colors.bg }]} />
        )}

        {/* DEBUG: live dB value — remove after calibrating thresholds */}
        {active && (
          <Text style={[s.liveDbText, { fontSize: 8, color: debugDb > SPEECH_DB ? colors.primary : colors.textMuted}]}>
            {debugDb.toFixed(1)}dB
          </Text>
        )}
      </View>

      {/* Confirmation sheet — appends new detections while recording continues */}
      <AppModal visible={mode === 'confirm'} transparent animationType="slide">
        <View style={s.overlay}>
          <View style={[s.sheet, { backgroundColor: colors.surface }]}>

            <View style={s.row}>
              <Text style={[s.sheetTitle, { color: colors.text }]}>Order Detected</Text>
              <View style={[s.dot, { backgroundColor: colors.primary }]} />
              {processingCount > 0 && (
                <Text style={[s.listeningBadge, {
                  color: colors.primary,
                  borderColor: colors.primary + '40',
                  backgroundColor: colors.primaryLight,
                }]}>
                  listening...
                </Text>
              )}
            </View>

            <ScrollView style={s.list} showsVerticalScrollIndicator={false}>
              {resolvedItems.map(item => (
                <MotiView
                  key={item.id}
                  from={{ opacity: 0, translateY: -6 }}
                  animate={{ opacity: 1, translateY: 0 }}
                  transition={{ type: 'spring', damping: 20, stiffness: 240 }}
                >
                  <View
                    style={[
                      s.card,
                      {
                        backgroundColor: colors.surfaceHigh,
                        borderColor: item.product ? colors.border : colors.danger + '45',
                      },
                    ]}
                  >
                    <View style={[s.cardIcon, {
                      backgroundColor: item.product ? colors.primaryLight : colors.danger + '18',
                    }]}>
                      <Ionicons
                        name={item.product ? 'cube-outline' : 'help-circle-outline'}
                        size={18}
                        color={item.product ? colors.primary : colors.danger}
                      />
                    </View>

                    <View style={s.cardBody}>
                      <Text
                        style={[s.cardName, { color: item.product ? colors.text : colors.textMuted }]}
                        numberOfLines={1}
                      >
                        {item.product?.name ?? item.label}
                      </Text>
                      {item.product ? (
                        <Text style={[s.cardSub, { color: colors.textMuted }]}>
                          {item.product.category} · {item.product.quantity} {item.product.unit} in stock
                        </Text>
                      ) : (
                        <Text style={[s.cardSub, { color: colors.danger }]}>Not in inventory</Text>
                      )}
                    </View>

                    {item.product && (
                      <View style={s.qtyRow}>
                        <TouchableOpacity
                          style={[s.qtyBtn, { borderColor: colors.border }]}
                          onPress={() => setResolvedItems(prev =>
                            prev.map(it => it.id === item.id ? { ...it, quantity: Math.max(1, it.quantity - 1) } : it)
                          )}
                        >
                          <Ionicons name="remove" size={12} color={colors.text} />
                        </TouchableOpacity>
                        <Text style={[s.qtyVal, { color: colors.text }]}>{item.quantity}</Text>
                        <TouchableOpacity
                          style={[s.qtyBtn, { borderColor: colors.border }]}
                          onPress={() => setResolvedItems(prev =>
                            prev.map(it => it.id === item.id ? { ...it, quantity: it.quantity + 1 } : it)
                          )}
                        >
                          <Ionicons name="add" size={12} color={colors.text} />
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Delete — removes this item from the stack entirely */}
                    <TouchableOpacity
                      onPress={() => setResolvedItems(prev => prev.filter(it => it.id !== item.id))}
                      style={s.deleteBtn}
                      hitSlop={8}
                    >
                      <Ionicons name="trash-outline" size={15} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </MotiView>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[
                s.ctaBtn,
                {
                  backgroundColor: addableCount > 0 ? colors.primary : colors.surfaceHigh,
                  borderColor: colors.border,
                },
              ]}
              onPress={confirmOrder}
              disabled={addableCount === 0}
            >
              <Ionicons name="cart-outline" size={16} color={addableCount > 0 ? '#fff' : colors.textMuted} />
              <Text style={[s.ctaText, { color: addableCount > 0 ? '#fff' : colors.textMuted }]}>
                {addableCount > 0
                  ? `Add ${addableCount} Item${addableCount !== 1 ? 's' : ''} to Cart`
                  : 'Nothing to add'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={dismissConfirm} style={{ paddingVertical: 6 }}>
              <Text style={[s.hint, { color: colors.textMuted }]}>Dismiss · keep listening</Text>
            </TouchableOpacity>

          </View>
        </View>
      </AppModal>
    </>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  defaultBtn: {
    width: 46, height: 46, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  bar: {
    width: 3,
    height: 22,
    borderRadius: 2,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  liveDbText: {
    position: 'absolute',
    bottom: -10.5,
  },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 22, paddingBottom: 36, gap: 12, alignItems: 'center',
  },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 17 },
  hint: { fontFamily: fonts.regular, fontSize: 13, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  listeningBadge: {
    fontFamily: fonts.medium, fontSize: 11,
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 20, borderWidth: 1,
  },
  list: { width: '100%', maxHeight: 300 },
  card: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    padding: 10, marginBottom: 8, gap: 8,
  },
  cardIcon: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  cardBody: { flex: 1 },
  cardName: { fontFamily: fonts.semiBold, fontSize: 14 },
  cardSub: { fontFamily: fonts.regular, fontSize: 11, marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  qtyBtn: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 1,
    justifyContent: 'center', alignItems: 'center',
  },
  qtyVal: { fontFamily: fonts.bold, fontSize: 14, minWidth: 18, textAlign: 'center' },
  deleteBtn: { padding: 4, marginLeft: 2 },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 14,
    width: '100%', borderWidth: StyleSheet.hairlineWidth,
  },
  ctaText: { fontFamily: fonts.bold, fontSize: 14 },
});
