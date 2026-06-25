import React, { useEffect, useRef, useState } from 'react';
import { TextStyle, StyleProp } from 'react-native';
import { Text } from 'react-native-paper';

interface Props {
  value: number;
  format: (n: number) => string;
  duration?: number;
  style?: StyleProp<TextStyle>;
}

/**
 * Counts up to `value` with an ease-out curve. On mount it rolls from 0;
 * when `value` changes it animates from the current displayed value to the new one.
 */
export default function AnimatedNumber({ value, format, duration = 900, style }: Props) {
  const [display, setDisplay] = useState(0);
  const displayRef = useRef(0);

  useEffect(() => {
    const from = displayRef.current;
    const to = value;
    if (from === to) { setDisplay(to); return; }
    const start = Date.now();
    let raf: number;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const v = from + (to - from) * eased;
      displayRef.current = v;
      setDisplay(v);
      if (t < 1) raf = requestAnimationFrame(tick);
      else { displayRef.current = to; setDisplay(to); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <Text style={style}>{format(display)}</Text>;
}
