import React, { useRef, useState } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity, Alert, Platform, KeyboardAvoidingView, ScrollView } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { fonts } from '../theme/typography';
import { BRAND, BrandDecorations, BrandBadge } from '../components/common/brandKit';
import LiquidButton from '../components/common/LiquidButton';

/** Formats a raw 10-digit number into the +91 E.164 shape Supabase expects. */
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  return digits.startsWith('91') ? `+${digits}` : `+91${digits}`;
}

/**
 * The one sign-in screen for the whole app — shown right after splash,
 * before onboarding or any other screen. Shares the sage gradient + brand
 * kit with SplashScreen/OnboardingScreen so the three feel like one
 * continuous entry sequence rather than a jarring theme swap.
 * Session change is picked up by AuthContext's onAuthStateChange; App.tsx
 * swaps to the next screen itself.
 */
export default function PhoneAuthScreen() {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const otpRef = useRef<TextInput>(null);

  const sendOtp = async () => {
    const formatted = formatPhone(phone);
    if (formatted.replace(/\D/g, '').length < 12) {
      Alert.alert('Invalid number', 'Enter a valid 10-digit mobile number.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: formatted });
    setLoading(false);
    if (error) { Alert.alert('Could not send code', error.message); return; }
    setStep('otp');
    setTimeout(() => otpRef.current?.focus(), 150);
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) { Alert.alert('Invalid code', 'Enter the 6-digit code.'); return; }
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      phone: formatPhone(phone), token: otp, type: 'sms',
    });
    setLoading(false);
    if (error) { Alert.alert('Verification failed', error.message); return; }
  };

  return (
    <LinearGradient colors={[BRAND.sage, BRAND.sageDark]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ flex: 1 }}>
      <BrandDecorations />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <MotiView from={{ opacity: 0, translateY: 14 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 500 }} style={{ alignItems: 'center', marginBottom: 8 }}>
            <BrandBadge size={78} pulse={step === 'phone'} />
            <Text style={s.title}>
              {step === 'phone' ? 'Welcome to Shopkeeper AI' : 'Verify your number'}
            </Text>
            <Text style={s.sub}>
              {step === 'phone'
                ? 'Sign in with your mobile number to set up your shop and keep your data safe.'
                : `We sent a 6-digit code to +91 ${phone.slice(-10)}`}
            </Text>
          </MotiView>

          <MotiView key={step} from={{ opacity: 0, translateX: 24 }} animate={{ opacity: 1, translateX: 0 }} transition={{ type: 'timing', duration: 280 }} style={s.card}>
            {step === 'phone' ? (
              <>
                <Text style={s.label}>MOBILE NUMBER</Text>
                <View style={s.phoneRow}>
                  <Text style={s.prefix}>+91</Text>
                  <TextInput
                    style={s.input}
                    value={phone}
                    onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))}
                    placeholder="98765 43210"
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    keyboardType="phone-pad"
                    maxLength={10}
                    returnKeyType="done"
                    autoFocus
                  />
                </View>
                <LiquidButton
                  title="Send OTP"
                  onPress={sendOtp}
                  disabled={phone.length < 10}
                  loading={loading}
                  tintColor={BRAND.cream}
                  height={52}
                />
              </>
            ) : (
              <>
                <Text style={s.label}>VERIFICATION CODE</Text>
                <TextInput
                  ref={otpRef}
                  style={s.otpInput}
                  value={otp}
                  onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <LiquidButton
                  title="Verify & Continue"
                  onPress={verifyOtp}
                  disabled={otp.length !== 6}
                  loading={loading}
                  tintColor={BRAND.cream}
                  height={52}
                />
                <TouchableOpacity style={{ marginTop: 14, alignItems: 'center' }} onPress={() => { setStep('phone'); setOtp(''); }}>
                  <Text style={s.link}>Change number</Text>
                </TouchableOpacity>
              </>
            )}
          </MotiView>

          <Text style={s.footnote}>
            Your number is only used to sign in — it keeps your billing, inventory and online shop data tied to your account.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  title: { fontFamily: fonts.extraBold, fontSize: 22, color: BRAND.cream, textAlign: 'center', marginTop: 14 },
  sub: { fontFamily: fonts.medium, fontSize: 14, color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginTop: 8, lineHeight: 20, paddingHorizontal: 8 },

  card: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20, padding: 18, marginTop: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  label: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.8, color: 'rgba(255,255,255,0.75)', marginBottom: 8 },

  phoneRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(255,255,255,0.14)', marginBottom: 16, overflow: 'hidden' },
  prefix: { fontFamily: fonts.semiBold, fontSize: 15, color: 'rgba(255,255,255,0.85)', paddingLeft: 16 },
  input: { flex: 1, padding: 15, fontSize: 16, fontFamily: fonts.semiBold, letterSpacing: 0.5, color: '#fff' },

  otpInput: { borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', backgroundColor: 'rgba(255,255,255,0.14)', padding: 15, fontSize: 22, fontFamily: fonts.extraBold, color: '#fff', textAlign: 'center', letterSpacing: 8, marginBottom: 16 },

  link: { fontFamily: fonts.bold, fontSize: 13, color: BRAND.cream },

  footnote: { fontFamily: fonts.regular, fontSize: 12, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginTop: 22, lineHeight: 18, paddingHorizontal: 12 },
});
