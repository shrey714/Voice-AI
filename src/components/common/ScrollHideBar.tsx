import React from 'react';
import { Animated, LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface Props {
  translateY: Animated.Value;
  bgColor: string;
  onLayout: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Absolutely-positioned bar that slides up/down via useScrollHideBar.
 *
 * Usage:
 *   const { translateY, onListScroll, onBarLayout, listPaddingTop } = useScrollHideBar({ onScroll });
 *
 *   <View style={{ flex: 1, overflow: 'hidden' }}>
 *     <ScrollHideBar translateY={translateY} bgColor={colors.bg} onLayout={onBarLayout}>
 *       ...chips...
 *     </ScrollHideBar>
 *     <FlatList onScroll={onListScroll} scrollEventThrottle={16}
 *       contentContainerStyle={{ paddingTop: listPaddingTop, ... }} />
 *   </View>
 *
 * The parent must have overflow: 'hidden' so the bar is clipped when it slides up.
 */
export default function ScrollHideBar({ translateY, bgColor, onLayout, children, style }: Props) {
  return (
    <Animated.View
      onLayout={onLayout}
      style={[{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, transform: [{ translateY }] }, style]}
    >
      <LinearGradient colors={[bgColor, bgColor + 'F2', bgColor + '00']} locations={[0, 0.65, 1]}>
        {children}
      </LinearGradient>
    </Animated.View>
  );
}
