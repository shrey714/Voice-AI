import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { fonts } from '../theme/typography';
import { BRAND, BrandDecorations } from '../components/common/brandKit';
import { useTranslation } from '../hooks/useTranslation';

export default function ErrorScreen({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <LinearGradient colors={[BRAND.sage, BRAND.sageDark]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={s.fill}>
      <BrandDecorations />
      <View style={s.center}>
        <MotiView from={{ opacity: 0, translateY: 14 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 450 }} style={{ alignItems: 'center' }}>
          <View style={s.iconCircle}>
            <Ionicons name="cloud-offline-outline" size={44} color={BRAND.cream} />
          </View>
          <Text style={s.title}>{t('somethingWentWrong')}</Text>
          <Text style={s.sub}>{message || t('couldntLoadData')}</Text>

          {onRetry && (
            <TouchableOpacity style={s.btn} onPress={onRetry} activeOpacity={0.85}>
              <Ionicons name="refresh" size={18} color={BRAND.sageDark} />
              <Text style={s.btnText}>{t('tryAgain')}</Text>
            </TouchableOpacity>
          )}
        </MotiView>
      </View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36 },
  iconCircle: { width: 92, height: 92, borderRadius: 46, backgroundColor: 'rgba(255,255,255,0.13)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  title: { fontFamily: fonts.extraBold, fontSize: 24, color: BRAND.cream, textAlign: 'center' },
  sub: { fontFamily: fonts.medium, fontSize: 14, color: 'rgba(255,255,255,0.82)', textAlign: 'center', lineHeight: 22, marginTop: 12 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BRAND.cream, borderRadius: 16, paddingVertical: 15, paddingHorizontal: 30, marginTop: 30 },
  btnText: { fontFamily: fonts.extraBold, fontSize: 15, color: BRAND.sageDark },
});
