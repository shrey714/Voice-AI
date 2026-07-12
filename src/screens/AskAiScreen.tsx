import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, TextInput, FlatList, Keyboard, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView, MotiText } from 'moti';
import GlassSurface from '../components/common/GlassSurface';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { useAudioRecorder, AudioModule, RecordingPresets, setAudioModeAsync } from 'expo-audio';
import { ThreadPrimitive, ActionBarPrimitive, MessageByIndexProvider, useAui, useAuiState } from '@assistant-ui/react-native';
import { useAppTheme } from '../theme';
import { fonts } from '../theme/typography';
import { useAppStore } from '../stores/useAppStore';
import { useTranslation } from '../hooks/useTranslation';
import { transcribeWithGroq } from '../services/groq';
import { toast } from '../utils/toast';
import { startNewAiChat, useAiWidgets } from '../services/aiRuntime';
import { AiWidget, SUGGESTED_QUESTIONS } from '../services/askAi';

// Card list rendered under an AI reply (top products, debtors, low stock…).
const WidgetCards = React.memo(function WidgetCards({ widget, colors }: { widget: AiWidget; colors: any }) {
  const icon = widget.kind === 'customers' ? 'person'
    : widget.kind === 'stock' ? 'cube'
    : widget.kind === 'expiring' ? 'time'
    : widget.kind === 'bills' ? 'receipt'
    : widget.kind === 'expenses' ? 'wallet'
    : 'pricetag';
  return (
    <MotiView from={{ opacity: 0, translateY: 6 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 280 }}
      style={[wc.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[wc.title, { color: colors.textMuted }]}>{widget.title.toUpperCase()}</Text>
      {widget.items.map((it, i) => (
        <View key={i} style={[wc.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
          <View style={[wc.badge, { backgroundColor: colors.primaryLight }]}>
            <Ionicons name={icon as any} size={14} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[wc.name, { color: colors.text }]} numberOfLines={1}>{it.name}</Text>
            {it.sub ? <Text style={[wc.sub, { color: colors.textMuted }]} numberOfLines={1}>{it.sub}</Text> : null}
          </View>
          <Text style={[wc.metric, { color: colors.primary }]}>{it.metric}</Text>
        </View>
      ))}
    </MotiView>
  );
});

// Animated "AI is thinking" dots, shown before the first token arrives.
function TypingDots({ color }: { color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 5, paddingVertical: 6 }}>
      {[0, 1, 2].map((i) => (
        <MotiView key={i}
          from={{ opacity: 0.3, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'timing', duration: 500, loop: true, repeatReverse: true, delay: i * 160 }}
          style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      ))}
    </View>
  );
}

// ChatGPT-style streaming: each word is a BLOCK-level element in a wrap layout so
// its opacity+translateY fade actually animates (a MotiText nested inside <Text>
// won't animate on RN). Each word is keyed by index, so already-shown words never
// re-animate — only the newly arrived word fades/rises in.
function StreamingText({ text, style }: { text: string; style: any }) {
  const tokens = text.split(/(\s+)/);
  const lineHeight = style?.lineHeight ?? 22;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' }}>
      {tokens.map((tok, i) => {
        if (!tok) return null;
        if (tok.includes('\n')) {
          // Force a line break; add blank-line height for consecutive newlines.
          const extra = (tok.split('\n').length - 2);
          return <View key={i} style={{ width: '100%', height: extra > 0 ? extra * lineHeight : 0 }} />;
        }
        if (/^\s+$/.test(tok)) return <Text key={i} style={style}>{' '}</Text>;
        return (
          <MotiText
            key={i}
            from={{ opacity: 0, translateY: 1.5 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 200 }}
            style={style}
          >
            {tok}
          </MotiText>
        );
      })}
    </View>
  );
}

// One chat turn. Reads its message from the assistant-ui context (provided by
// MessageByIndexProvider) so ActionBar copy/regenerate work. User → right bubble;
// assistant → full-width (ChatGPT/Claude style) with avatar, cards, and actions.
const Bubble = React.memo(function Bubble({ colors, s, t }: { colors: any; s: any; t: (k: any) => string }) {
  const role = useAuiState((st: any) => st.message.role);
  const content = useAuiState((st: any) => st.message.content);
  const id = useAuiState((st: any) => st.message.id);
  const streaming = useAuiState((st: any) => st.message.status?.type === 'running');
  const text = (content || []).filter((p: any) => p?.type === 'text').map((p: any) => p.text).join('');
  const widget = useAiWidgets((st) => st.widgets[id]);

  if (role === 'user') {
    return (
      <View style={s.userRow}>
        <View style={s.userBubble}>
          <Text style={s.userText}>{text}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.aiRow}>
      <LinearGradient colors={[colors.primary, colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.aiAvatar}>
        <Ionicons name="sparkles" size={13} color="#fff" />
      </LinearGradient>
      <View style={{ flex: 1, gap: 8 }}>
         <Text style={s.aiName}>{t('shopkeeperAi')}</Text>
        {text
          ? (streaming ? <StreamingText text={text} style={s.aiText} /> : <Text style={s.aiText}>{text}</Text>)
          : <TypingDots color={colors.textMuted} />}
        {widget && <WidgetCards widget={widget} colors={colors} />}
        {!!text && (
          <View style={s.actionsRow}>
            <ActionBarPrimitive.Reload style={s.actionBtn}>
              <Ionicons name="refresh" size={13} color={colors.textMuted} />
              <Text style={s.actionText}>{t('regenerate')}</Text>
            </ActionBarPrimitive.Reload>
            <ActionBarPrimitive.Copy style={s.actionBtn} copyToClipboard={(t: string) => { try { Clipboard.setStringAsync(t)?.catch(() => {}); } catch { /* clipboard needs a rebuild */ } }}>
              {({ isCopied }: { isCopied: boolean }) => (
                <>
                  <Ionicons name={isCopied ? 'checkmark' : 'copy-outline'} size={13} color={colors.textMuted} />
                  <Text style={s.actionText}>{isCopied ? t('copied') : t('copy')}</Text>
                </>
              )}
            </ActionBarPrimitive.Copy>
          </View>
        )}
      </View>
    </View>
  );
});

// Self-owned message list so we control the FlatList ref → auto-scroll to bottom
// (the library's ThreadPrimitive.Messages forwards no ref and never auto-scrolls).
function MessageList({ colors, s, bottomPad, t }: { colors: any; s: any; bottomPad: number; t: (k: any) => string }) {
  const messages = useAuiState((st: any) => st.thread.messages);

  // Inverted list = always pinned to the bottom with zero scroll timing. data[0]
  // must be the NEWEST message, so we render in reverse and map back to the real
  // runtime index for MessageByIndexProvider.
  const data = useMemo(() => messages.slice().reverse(), [messages]);
  const renderItem = useCallback(({ index }: any) => (
    <MessageByIndexProvider index={messages.length - 1 - index}>
      <Bubble colors={colors} s={s} t={t} />
    </MessageByIndexProvider>
  ), [colors, s, messages.length]);

  return (
    <FlatList
      inverted
      data={data}
      keyExtractor={(m: any) => m.id}
      renderItem={renderItem}
      style={{ flex: 1 }}
      // Inverted flips contentContainer too: paddingTop is the VISUAL bottom, so it
      // reserves room for the floating composer; paddingBottom is the visual top.
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: bottomPad, paddingBottom: 16 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    />
  );
}

// Custom composer: a LOCAL-state TextInput (instant, no per-keystroke round-trip to
// the runtime store — that was the lag) that pushes to the runtime only on send.
function Composer({ colors, s, insets, isDark, t }: { colors: any; s: any; insets: any; isDark: boolean; t: (k: any) => string }) {
  const aui = useAui();
  const isRunning = useAuiState((st: any) => st.thread.isRunning);
  const language = useAppStore((st: any) => st.settings.language);
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const canSend = text.trim().length > 0;

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  const sendText = useCallback((raw: string) => {
    const t = raw.trim();
    if (!t) return;
    setText('');
    aui.composer().setText(t);
    aui.composer().send();
  }, [aui]);
  const send = useCallback(() => sendText(text), [sendText, text]);

  // Voice → transcribe (Groq Whisper) → auto-send. Reuses the app's existing
  // expo-audio + Groq STT stack (already shipped for Billing), so no rebuild.
  const startRec = useCallback(async () => {
    try {
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      if (!granted) { toast.error(t('micPermissionNeeded')); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
      recorder.record();
      setRecording(true);
    } catch { toast.error(t('couldntStartRecording')); }
  }, [recorder]);

  const stopRec = useCallback(async () => {
    setRecording(false);
    let uri = '';
    try { await recorder.stop(); uri = recorder.uri || ''; } catch {}
    try { await setAudioModeAsync({ allowsRecording: false }); } catch {}
    if (!uri) return;
    setTranscribing(true);
    const res = await transcribeWithGroq(uri, language);
    setTranscribing(false);
    if (res.ok && res.text.trim()) sendText(res.text);          // auto-send
    else if (!res.ok) toast.error(res.error || t('couldntTranscribe'));
  }, [recorder, language, sendText]);

  // Stop any in-flight recording if the screen unmounts.
  useEffect(() => () => { try { recorder.stop(); } catch {} ; setAudioModeAsync({ allowsRecording: false }).catch(() => {}); }, [recorder]);

  return (
    <View style={[s.composerWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {/* isInteractive deliberately omitted — same reason as CollapsibleFab:
          this glass surface wraps genuinely separate tappable children (mic,
          text input, send), it isn't the tap target itself, and
          isInteractive risks the glass layer intercepting touches meant for
          them. */}
      <GlassSurface tint={isDark ? 'dark' : 'light'} style={s.pill}>
        <TouchableOpacity
          style={s.micBtn}
          hitSlop={8}
          disabled={isRunning || transcribing}
          onPress={() => (recording ? stopRec() : startRec())}
          accessibilityLabel={recording ? 'Stop recording' : 'Start voice input'}
          accessibilityRole="button"
        >
          {transcribing ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : recording ? (
            <MotiView from={{ opacity: 0.5 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 600, loop: true, repeatReverse: true }}>
              <Ionicons name="stop-circle" size={24} color={colors.danger} />
            </MotiView>
          ) : (
            <Ionicons name="mic-outline" size={22} color={isRunning ? colors.border : colors.textMuted} />
          )}
        </TouchableOpacity>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder={recording ? t('speaking') : transcribing ? t('transcribing') : t('askAnything')}
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="center"
          returnKeyType="default"
        />
        {isRunning ? (
          <TouchableOpacity onPress={() => aui.composer().cancel()} activeOpacity={0.85} accessibilityLabel="Stop generation" accessibilityRole="button">
            <LinearGradient colors={[colors.primary, colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.sendBtn}>
              <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: '#fff' }} />
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={send} disabled={!canSend} activeOpacity={0.85} accessibilityLabel="Send message" accessibilityRole="button">
            <LinearGradient
              colors={canSend ? [colors.primary, colors.primaryDark] : [colors.border, colors.border]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.sendBtn}>
              <Ionicons name="arrow-up" size={20} color={canSend ? '#fff' : colors.textMuted} />
            </LinearGradient>
          </TouchableOpacity>
        )}
      </GlassSurface>
    </View>
  );
}

export default function AskAiScreen({ navigation }: any) {
  const { colors, isDark } = useAppTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const s = useMemo(() => makeStyles(colors), [colors]);

  // Apply the header offset only while the keyboard is open; when it closes the
  // offset goes back to 0 so the floating composer rests flush at the bottom.
  const [kbOpen, setKbOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKbOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // Composer height (deterministic): paddingTop 8 + pill (~52) + bottom safe area.
  // The list reserves this much at the bottom so scrollToEnd parks the last message
  // just above the floating composer — no measurement loop, no extra gap.
  const composerH = 8 + 52 + Math.max(insets.bottom, 10);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={startNewAiChat} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 }} hitSlop={8}>
          <Ionicons name="create-outline" size={18} color={colors.primary} />
          <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.primary }}>{t('newChat')}</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors.primary]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'height' : 'height'} style={{ flex: 1 }} keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : kbOpen ? headerHeight : 0}>
        <ThreadPrimitive.Root style={{ flex: 1 }}>
          {/* Empty state — welcome + suggestion cards */}
          <ThreadPrimitive.Empty>
            <View style={{ padding: 20 }}>
              <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 400 }}>
                <LinearGradient colors={[colors.primary, colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.heroIcon}>
                  <Ionicons name="sparkles" size={26} color="#fff" />
                </LinearGradient>
                <Text style={[s.heroTitle, { color: colors.text }]}>{t('askAboutShop')}</Text>
                <Text style={[s.heroSub, { color: colors.textMuted }]}>{t('askAboutShopSub')}</Text>
                <View style={{ gap: 10, marginTop: 6 }}>
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <ThreadPrimitive.Suggestion key={q} prompt={q} send style={[s.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <View style={[s.chipIcon, { backgroundColor: colors.primaryLight }]}>
                        <Ionicons name="sparkles-outline" size={14} color={colors.primary} />
                      </View>
                      <Text style={[s.chipText, { color: colors.text }]}>{q}</Text>
                      <Ionicons name="arrow-forward" size={15} color={colors.textMuted} />
                    </ThreadPrimitive.Suggestion>
                  ))}
                </View>
              </MotiView>
            </View>
          </ThreadPrimitive.Empty>

          {/* Message list (only when there are messages) */}
          <ThreadPrimitive.If empty={false}>
            <MessageList colors={colors} s={s} bottomPad={composerH + 8} t={t} />
          </ThreadPrimitive.If>
        </ThreadPrimitive.Root>

        <Composer colors={colors} s={s} insets={insets} isDark={isDark} t={t} />
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (c: any) => StyleSheet.create({
  heroIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 12, marginBottom: 14 },
  heroTitle: { fontFamily: fonts.extraBold, fontSize: 23 },
  heroSub: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 21, marginTop: 6, marginBottom: 20 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  chipIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: fonts.semiBold, fontSize: 14, flex: 1 },

  // User turn — right-aligned bubble
  userRow: { alignItems: 'flex-end', marginBottom: 18 },
  userBubble: { maxWidth: '86%', backgroundColor: c.primary, borderRadius: 20, borderBottomRightRadius: 6, paddingHorizontal: 15, paddingVertical: 11 },
  userText: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, color: '#fff' },

  // Assistant turn — full width, no heavy bubble (ChatGPT/Claude style)
  aiRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  aiAvatar: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  aiName: { fontFamily: fonts.bold, fontSize: 12.5, color: c.textMuted, letterSpacing: 0.2 },
  aiText: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 23, color: c.text },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 },
  actionText: { fontFamily: fonts.semiBold, fontSize: 12, color: c.textMuted },

  // Composer — floats over the chat (chat scrolls behind the frosted glass)
  composerWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 12, paddingTop: 8 },
  pill: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, overflow: 'hidden', backgroundColor: c.surfaceHigh + '4D', borderRadius: 26, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, paddingLeft: 8, paddingRight: 6, paddingVertical: 6 },
  micBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, maxHeight: 120, minHeight: 40, paddingVertical: Platform.OS === 'ios' ? 8 : 4, fontSize: 15.5, color: c.text, fontFamily: fonts.regular, lineHeight: 21 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});

const wc = StyleSheet.create({
  wrap: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, paddingVertical: 6, marginTop: 2 },
  title: { fontFamily: fonts.bold, fontSize: 10, letterSpacing: 1, marginTop: 8, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  badge: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: fonts.semiBold, fontSize: 14 },
  sub: { fontFamily: fonts.medium, fontSize: 11.5, marginTop: 1 },
  metric: { fontFamily: fonts.bold, fontSize: 13 },
});
