import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { MotiView } from 'moti';
import { Easing } from 'react-native-reanimated';

interface Props {
  index?: number;
  delayBase?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Minimal, modern list entrance: a short fade + 8px rise, ease-out, staggered
 * by index. No scale, no spring, no bounce — quiet and quick.
 */
export default function FadeSlideIn({ index = 0, delayBase = 0, children, style }: Props) {
  return (
    <MotiView
      from={{ opacity: 0, translateY: 8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 280, delay: delayBase + Math.min(index * 35, 300), easing: Easing.out(Easing.cubic) }}
      style={style}
    >
      {children}
    </MotiView>
  );
}
