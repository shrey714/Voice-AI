import React from 'react';
import { View, StyleSheet } from 'react-native';
import { MotiView } from 'moti';

// Shared brand palette + decorative backdrop, matching the onboarding flow.
export const BRAND = { sage: '#5B7567', sageDark: '#3E4F44', cream: '#F6F5F1' };

// Soft translucent blobs + a faint brand waveform strip along the bottom.
export function BrandDecorations() {
  const bars = [0.3, 0.55, 0.8, 0.5, 0.95, 0.6, 0.35, 0.7, 0.45, 0.85, 0.5, 0.3];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.blob, { width: 320, height: 320, borderRadius: 160, top: -120, right: -90, backgroundColor: 'rgba(255,255,255,0.07)' }]} />
      <View style={[styles.blob, { width: 220, height: 220, borderRadius: 110, top: 140, left: -100, backgroundColor: 'rgba(255,255,255,0.05)' }]} />
      <View style={[styles.blob, { width: 160, height: 160, borderRadius: 80, bottom: 90, right: -50, backgroundColor: 'rgba(255,255,255,0.04)' }]} />
      <View style={styles.wave}>
        {bars.map((h, i) => (
          <View key={i} style={{ flex: 1, marginHorizontal: 3, height: 90 * h, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.06)' }} />
        ))}
      </View>
    </View>
  );
}

// The voice-bubble waveform mark on a cream circle, with an optional radar halo.
export function BrandBadge({ size = 104, pulse = true }: { size?: number; pulse?: boolean }) {
  const heights = [0.34, 0.6, 1, 0.56, 0.32];
  return (
    <View style={{ width: size * 1.5, height: size * 1.5, alignItems: 'center', justifyContent: 'center' }}>
      {pulse && (
        <MotiView
          from={{ scale: 1, opacity: 0.45 }}
          animate={{ scale: 1.5, opacity: 0 }}
          transition={{ type: 'timing', duration: 2600, loop: true, repeatReverse: false }}
          style={{ position: 'absolute', width: size * 1.06, height: size * 1.06, borderRadius: size, borderWidth: 2, borderColor: BRAND.cream }}
        />
      )}
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: BRAND.cream, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: size * 0.058 }}>
        {heights.map((h, i) => (
          <View key={i} style={{ width: size * 0.077, height: size * 0.5 * h, borderRadius: size * 0.04, backgroundColor: BRAND.sage }} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  blob: { position: 'absolute' },
  wave: { position: 'absolute', left: 16, right: 16, bottom: 0, height: 90, flexDirection: 'row', alignItems: 'flex-end', opacity: 0.9 },
});
