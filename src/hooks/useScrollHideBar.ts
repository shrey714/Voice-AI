import { useRef, useCallback, useState } from 'react';
import { Animated, LayoutChangeEvent } from 'react-native';

interface Options {
  /** Optional additional onScroll handler to chain (e.g. useFabScroll's onScroll). */
  onScroll?: (e: any) => void;
  threshold?: number;
  duration?: number;
}

interface Result {
  translateY: Animated.Value;
  onListScroll: (e: any) => void;
  /** Pass to ScrollHideBar's onLayout — measures the bar and sets listPaddingTop. */
  onBarLayout: (e: LayoutChangeEvent) => void;
  /** Use as paddingTop on the FlatList's contentContainerStyle. */
  listPaddingTop: number;
}

export function useScrollHideBar({ onScroll, threshold = 5, duration = 200 }: Options = {}): Result {
  const translateY = useRef(new Animated.Value(0)).current;
  const heightRef = useRef(0);
  const lastY = useRef(0);
  const isHidden = useRef(false);
  const floorY = useRef(0);  // lowest Y while bar is visible (hide dead zone reference)
  const peakY = useRef(0);   // highest Y while bar is hidden (show dead zone reference)
  const [listPaddingTop, setListPaddingTop] = useState(0);
  const DEAD_ZONE = 30;

  const onBarLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h !== heightRef.current) {
      heightRef.current = h;
      setListPaddingTop(h);
    }
  }, []);

  const onListScroll = useCallback((e: any) => {
    const y: number = e.nativeEvent.contentOffset.y;
    const dy = y - lastY.current;
    lastY.current = y;

    if (!isHidden.current) {
      // Track lowest point while visible (so dead zone is relative to recent position)
      if (y < floorY.current) floorY.current = y;
      if (dy > threshold && y - floorY.current > DEAD_ZONE) {
        isHidden.current = true;
        peakY.current = y;
        Animated.timing(translateY, { toValue: -heightRef.current, duration, useNativeDriver: true }).start();
      }
    } else {
      // Track highest point while hidden
      if (y > peakY.current) peakY.current = y;
      if ((dy < -threshold || y <= 0) && peakY.current - y > DEAD_ZONE) {
        isHidden.current = false;
        floorY.current = y;
        Animated.timing(translateY, { toValue: 0, duration, useNativeDriver: true }).start();
      }
    }

    onScroll?.(e);
  }, [translateY, threshold, duration, onScroll]);

  return { translateY, onListScroll, onBarLayout, listPaddingTop };
}
