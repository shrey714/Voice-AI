import React, { useState } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity, Switch, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../stores/useAppStore';
import { fonts } from '../theme/typography';
import { useTranslation } from '../hooks/useTranslation';
import LiquidButton from '../components/common/LiquidButton';

const SAGE = '#5B7567';
const SAGE_DARK = '#3E4F44';
const CREAM = '#F6F5F1';
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

// Soft, low-opacity shapes + a brand waveform strip for a designed backdrop.
function Decorations() {
  const bars = [0.3, 0.55, 0.8, 0.5, 0.95, 0.6, 0.35, 0.7, 0.45, 0.85, 0.5, 0.3];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[s.blob, { width: 320, height: 320, borderRadius: 160, top: -120, right: -90, backgroundColor: 'rgba(255,255,255,0.07)' }]} />
      <View style={[s.blob, { width: 220, height: 220, borderRadius: 110, top: 120, left: -100, backgroundColor: 'rgba(255,255,255,0.05)' }]} />
      <View style={[s.blob, { width: 160, height: 160, borderRadius: 80, bottom: 80, right: -50, backgroundColor: 'rgba(255,255,255,0.04)' }]} />
      <View style={s.waveStrip}>
        {bars.map((h, i) => (
          <View key={i} style={{ flex: 1, marginHorizontal: 3, height: 90 * h, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.06)' }} />
        ))}
      </View>
    </View>
  );
}

// Brand mark — voice-bubble waveform on a cream circle, with a slow radar halo.
function BrandBadge() {
  const heights = [0.34, 0.6, 1, 0.56, 0.32];
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: 150, height: 150 }}>
      <MotiView
        from={{ scale: 1, opacity: 0.45 }}
        animate={{ scale: 1.5, opacity: 0 }}
        transition={{ type: 'timing', duration: 2600, loop: true, repeatReverse: false }}
        style={{ position: 'absolute', width: 110, height: 110, borderRadius: 55, borderWidth: 2, borderColor: CREAM }}
      />
      <View style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: CREAM, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {heights.map((h, i) => (
          <View key={i} style={{ width: 8, height: 52 * h, borderRadius: 4, backgroundColor: SAGE }} />
        ))}
      </View>
    </View>
  );
}

type StepKey = 'welcome' | 'shop' | 'contact' | 'upi' | 'gst' | 'goal';
const ORDER: StepKey[] = ['welcome', 'shop', 'contact', 'upi', 'gst', 'goal'];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useAppStore(
    useShallow(state => ({
      settings: state.settings,
      updateSettings: state.updateSettings,
    }))
  );
  const { t } = useTranslation();
  const [step, setStep] = useState(0);

  const COPY: Record<StepKey, { tag?: string; icon?: string; title: string; sub: string }> = {
    welcome: { title: t('letsSetUpShop'), sub: t('onboardingLead') },
    shop:    { tag: t('stepN').replace('{n}', '1'), icon: 'storefront-outline', title: t('tellUsAboutShop'), sub: t('showsOnBillsUpi') },
    contact: { tag: t('stepN').replace('{n}', '2'), icon: 'call-outline', title: t('howCanPeopleReach'), sub: t('printedOnBills') },
    upi:     { tag: t('stepN').replace('{n}', '3'), icon: 'qr-code-outline', title: t('getPaidInSeconds'), sub: t('addUpiForQr') },
    gst:     { tag: t('stepN').replace('{n}', '4'), icon: 'document-text-outline', title: t('doBillWithGst'), sub: t('enableGstForInvoice') },
    goal:    { tag: t('stepN').replace('{n}', '5'), icon: 'flag-outline', title: t('setDailyGoalStep'), sub: t('trackGoalRing') },
  };

  // Pre-fill from existing settings (so "Run setup again" shows current values).
  const [shopName, setShopName] = useState(settings.shopName === 'My Shop' ? '' : settings.shopName);
  const [ownerName, setOwnerName] = useState(settings.ownerName || '');
  const [phone, setPhone] = useState(settings.phone || '');
  const [address, setAddress] = useState(settings.address || '');
  const [upiId, setUpiId] = useState(settings.upiId || '');
  const [gstRegistered, setGstRegistered] = useState(settings.gstRegistered || false);
  const [gstin, setGstin] = useState(settings.gstin || '');
  const [dailyGoal, setDailyGoal] = useState(settings.dailyGoal ? String(settings.dailyGoal) : '');

  const key = ORDER[step];
  const copy = COPY[key];
  const tap = () => Haptics.selectionAsync().catch(() => {});

  const isLast = step === ORDER.length - 1;
  const primaryLabel = step === 0 ? t('getStarted') : isLast ? t('finishSetup') : t('continueBtn');
  const primaryIcon = isLast ? 'checkmark' : 'arrow-forward';
  const primarySfIcon = isLast ? 'checkmark' : 'arrow.forward';
  const primaryDisabled = key === 'shop' && !shopName.trim();
  const showSkip = step < ORDER.length - 1;
  const skipLabel = step === 0 ? t('skipForNow') : t('skipThisStep');

  const persist = async (done: boolean) => {
    const g = gstin.trim().toUpperCase();
    if (done && gstRegistered && g && !GSTIN_RE.test(g)) {
      Alert.alert(t('invalidGstin'), t('gstinMustBe15'));
      return false;
    }
    await updateSettings({
      shopName: shopName.trim() || 'My Shop',
      ownerName: ownerName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      upiId: upiId.trim(),
      gstRegistered,
      gstin: gstRegistered ? g : '',
      dailyGoal: parseInt(dailyGoal) || 0,
      onboardingDone: done,
    });
    return true;
  };

  const next = async () => {
    tap();
    if (key === 'shop' && !shopName.trim()) return;
    if (step < ORDER.length - 1) setStep(step + 1);
    else { await persist(true); }
  };
  const back = () => { tap(); setStep(s => Math.max(0, s - 1)); };
  const skipAll = async () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); await persist(true); };

  return (
    <LinearGradient colors={[SAGE, SAGE_DARK]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ flex: 1 }}>
      <Decorations />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} style={{ flex: 1, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 14 }}>

        {/* Progress dots */}
        <View style={s.dots}>
          {ORDER.map((_, i) => (
            <MotiView key={i} animate={{ width: i === step ? 24 : 8, opacity: i <= step ? 1 : 0.35 }} transition={{ type: 'timing', duration: 220 }} style={s.dot} />
          ))}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: key === 'welcome' ? 0 : 16,
            paddingBottom: 8,
            paddingHorizontal: 28,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          {/* Top spacer centers the welcome content vertically */}
          {key === 'welcome' && <View style={{ flex: 1 }} />}

          {key === 'welcome' ? (
            <MotiView from={{ opacity: 0, translateY: 14 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 500 }} style={{ alignItems: 'center' }}>
              <BrandBadge />
              <Text style={s.welcomeTitle}>{copy.title}</Text>
              <Text style={s.welcomeSub}>{copy.sub}</Text>
            </MotiView>
          ) : (
            <MotiView key={key} from={{ opacity: 0, translateX: 36 }} animate={{ opacity: 1, translateX: 0 }} transition={{ type: 'timing', duration: 300 }}>
              {!!copy.tag && <Text style={s.tag}>{copy.tag}</Text>}
              <View style={s.stepIcon}><Ionicons name={copy.icon as any} size={28} color={CREAM} /></View>
              <Text style={s.title}>{copy.title}</Text>
              <Text style={s.sub}>{copy.sub}</Text>

              {key === 'shop' && (
                <View style={{ marginTop: 22 }}>
                  <Field label={`${t('shopName')} *`}><TextInput style={s.input} value={shopName} onChangeText={setShopName} placeholder="e.g. Sharma General Store" placeholderTextColor="rgba(255,255,255,0.5)" returnKeyType="next" /></Field>
                  <Field label={t('ownerName')}><TextInput style={s.input} value={ownerName} onChangeText={setOwnerName} placeholder={t('yourName')} placeholderTextColor="rgba(255,255,255,0.5)" returnKeyType="done" /></Field>
                </View>
              )}
              {key === 'contact' && (
                <View style={{ marginTop: 22 }}>
                  <Field label={t('phone')}><TextInput style={s.input} value={phone} onChangeText={setPhone} placeholder="+91 XXXXX XXXXX" placeholderTextColor="rgba(255,255,255,0.5)" keyboardType="phone-pad" /></Field>
                  <Field label={t('address')}><TextInput style={[s.input, { height: 88, textAlignVertical: 'top' }]} value={address} onChangeText={setAddress} placeholder={t('streetAreaCity')} placeholderTextColor="rgba(255,255,255,0.5)" multiline /></Field>
                </View>
              )}
              {key === 'upi' && (
                <View style={{ marginTop: 22 }}>
                  <Field label={t('upiId')}><TextInput style={s.input} value={upiId} onChangeText={setUpiId} placeholder="yourname@upi" placeholderTextColor="rgba(255,255,255,0.5)" autoCapitalize="none" keyboardType="email-address" /></Field>
                </View>
              )}
              {key === 'gst' && (
                <View style={{ marginTop: 22 }}>
                  <View style={s.toggleRow}>
                    <Text style={s.toggleLabel}>{t('registeredUnderGst')}</Text>
                    <Switch value={gstRegistered} onValueChange={(v) => { tap(); setGstRegistered(v); }} trackColor={{ true: CREAM, false: 'rgba(255,255,255,0.25)' }} thumbColor={gstRegistered ? SAGE : '#fff'} />
                  </View>
                  {gstRegistered && (
                    <View style={{ marginTop: 14 }}>
                      <Field label="GSTIN"><TextInput style={s.input} value={gstin} onChangeText={(v) => setGstin(v.toUpperCase())} placeholder="22AAAAA0000A1Z5" placeholderTextColor="rgba(255,255,255,0.5)" autoCapitalize="characters" maxLength={15} /></Field>
                    </View>
                  )}
                </View>
              )}
              {key === 'goal' && (
                <View style={{ marginTop: 22 }}>
                  <Field label={`${t('dailySalesTarget')} (₹)`}><TextInput style={s.input} value={dailyGoal} onChangeText={setDailyGoal} placeholder="e.g. 10000" placeholderTextColor="rgba(255,255,255,0.5)" keyboardType="number-pad" /></Field>
                </View>
              )}
            </MotiView>
          )}

          {/* Flexible spacer — pins controls to the bottom on tall screens,
              and lets them scroll into reach (above the keyboard) on short ones. */}
          <View style={{ flex: 1, minHeight: 28 }} />

        </ScrollView>
        </KeyboardAvoidingView>
        {/* Controls — persistent so the layout can morph between steps */}
        <View style={{ paddingHorizontal: 28, paddingTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* Back button expands/slides in for step > 0 */}
            <MotiView
              animate={{ width: step > 0 ? 52 : 0, marginRight: step > 0 ? 12 : 0, opacity: step > 0 ? 1 : 0 }}
              transition={{ type: 'timing', duration: 320 }}
              style={{ overflow: 'hidden', height: 52 }}
            >
              <TouchableOpacity style={s.ghostBtn} onPress={back} disabled={step === 0} activeOpacity={0.8}>
                <Ionicons name="chevron-back" size={20} color={CREAM} />
              </TouchableOpacity>
            </MotiView>

            {/* Primary button — flex:1, reflows narrower as the back button appears */}
            <LiquidButton
              title={primaryLabel}
              icon={primarySfIcon as any}
              onPress={next}
              disabled={primaryDisabled}
              tintColor={CREAM}
              height={52}
              style={{ flex: 1 }}
            />
          </View>

          {/* Skip link */}
          <TouchableOpacity style={[s.skipBtn, { opacity: showSkip ? 1 : 0 }]} disabled={!showSkip} onPress={step === 0 ? skipAll : next}>
            <MotiView key={skipLabel} from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 240 }}>
              <Text style={s.skipText}>{skipLabel}</Text>
            </MotiView>
          </TouchableOpacity>
        </View>
    </LinearGradient>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  blob: { position: 'absolute' },
  waveStrip: { position: 'absolute', left: 16, right: 16, bottom: 0, height: 90, flexDirection: 'row', alignItems: 'flex-end', opacity: 0.9 },

  dots: { flexDirection: 'row', gap: 8, alignSelf: 'center', marginBottom: 4 },
  dot: { height: 8, borderRadius: 4, backgroundColor: CREAM },

  welcomeTitle: { fontFamily: fonts.extraBold, fontSize: 32, color: CREAM, marginTop: 30, textAlign: 'center', lineHeight: 40 },
  welcomeSub: { fontFamily: fonts.medium, fontSize: 15, color: 'rgba(255,255,255,0.85)', textAlign: 'center', lineHeight: 23, marginTop: 14, paddingHorizontal: 6 },

  tag: { fontFamily: fonts.extraBold, fontSize: 12, letterSpacing: 1.5, color: 'rgba(255,255,255,0.7)', marginBottom: 14 },
  stepIcon: { width: 58, height: 58, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { fontFamily: fonts.extraBold, fontSize: 26, color: CREAM, lineHeight: 33 },
  sub: { fontFamily: fonts.medium, fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 21, marginTop: 10 },

  fieldLabel: { fontFamily: fonts.bold, fontSize: 12, color: 'rgba(255,255,255,0.85)', marginBottom: 7, marginLeft: 2 },
  input: { backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 15, fontSize: 16, color: '#fff', fontFamily: fonts.semiBold, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 16, padding: 16 },
  toggleLabel: { fontFamily: fonts.semiBold, fontSize: 15, color: CREAM },

  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: CREAM, borderRadius: 16, paddingVertical: 16, marginTop: 8 },
  primaryBtnText: { fontFamily: fonts.extraBold, fontSize: 16, color: SAGE_DARK },
  ghostBtn: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)' },
  skipBtn: { alignSelf: 'center', paddingTop: 10, paddingBottom: 28 },
  skipText: { fontFamily: fonts.semiBold, fontSize: 14, color: 'rgba(255,255,255,0.75)' },
});
