import React from 'react';
import { Pressable, PressableProps, ViewStyle, StyleProp, GestureResponderEvent } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface Props extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  children?: React.ReactNode;
}

/**
 * Drop-in replacement for TouchableOpacity that gently scales down on press
 * and springs back on release — the tactile, "premium" press feel.
 */
export default function PressableScale({ children, style, scaleTo = 0.96, onPressIn, onPressOut, ...rest }: Props) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e: GestureResponderEvent) => { scale.value = withTiming(scaleTo, { duration: 90 }); onPressIn?.(e); }}
      onPressOut={(e: GestureResponderEvent) => { scale.value = withTiming(1, { duration: 90 }); onPressOut?.(e); }}
      style={[style, aStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
