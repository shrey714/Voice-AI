import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MotiView } from 'moti';
import { fonts } from '../theme/typography';
import { BRAND, BrandDecorations, BrandBadge } from '../components/common/brandKit';

export default function SplashScreen() {
  return (
    <LinearGradient colors={[BRAND.sage, BRAND.sageDark]} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={s.fill}>
      <BrandDecorations />
      <View style={s.center}>
        <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 500 }} style={{ alignItems: 'center' }}>
          <BrandBadge size={100} />
          <Text style={s.title}>Shopkeeper AI</Text>
          <Text style={s.tag}>RUN YOUR SHOP, BY VOICE</Text>
        </MotiView>

        {/* Loading dots */}
        <View style={s.dots}>
          {[0, 1, 2].map((i) => (
            <MotiView
              key={i}
              from={{ opacity: 0.25, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'timing', duration: 520, loop: true, repeatReverse: true, delay: i * 160 }}
              style={s.dot}
            />
          ))}
        </View>
      </View>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.extraBold, fontSize: 30, color: BRAND.cream, marginTop: 22 },
  tag: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 2.5, color: 'rgba(255,255,255,0.78)', marginTop: 10 },
  dots: { position: 'absolute', bottom: 70, flexDirection: 'row', gap: 9 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: BRAND.cream },
});
