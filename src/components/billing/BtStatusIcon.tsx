import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  withDelay,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useAppTheme } from '../../theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Standard Bluetooth symbol — 6 strokes in a 24×24 viewBox.
//
// Two right-facing kites (spine + 4 arm strokes), plus two crossing
// diagonals that extend from each kite tip through the spine center
// to the opposite left side:
//
//   Cross-1: (19,7) ────────────────► (5,17)   [upper-right → lower-left]
//   Cross-2: (19,17) ───────────────► (5,7)    [lower-right → upper-left]
//
// The RIGHT portion of each cross closes its respective kite.
// The LEFT portion creates the X visible on the left of the spine.
// The lower kite ALSO has an explicit back arm to close at (12,22).
const STROKES = [
  { d: 'M5,17 L19,7',   len: 18 },  // [0] cross-1 diagonal  (actual ≈17.20)
  { d: 'M19,7 L12,2',   len: 9  },  // [1] upper-right arm   (actual ≈8.60)
  { d: 'M12,2 L12,12',  len: 11 },  // [2] spine top half    (actual = 10.0)
  { d: 'M12,12 L12,22', len: 11 },  // [3] spine bottom half (actual = 10.0)
  { d: 'M12,22 L19,17', len: 9  },  // [4] lower-right arm   (actual ≈8.60)
  { d: 'M19,17 L5,7',   len: 18 },  // [5] cross-2 diagonal  (actual ≈17.20)
];

// Animation sequence:
//  t=0:   spine + upper arm start
//  t=150: cross-1 starts (from upper-right tip, draws toward lower-left)
//  t=290: lower arm starts (cross-1 visually reaches (12,12) at this moment)
//  t=440: lower-right back + cross-2 both start (both exit from the lower-right tip)
const DELAYS    = [0,   280, 420, 560, 700, 840];
const DURATIONS = [280, 140, 140, 140, 140, 280];
const HOLD_MS   = 1000;
const FADE_MS   = 300;

export default function BtStatusIcon({ active }: { active: boolean }) {
  const { colors } = useAppTheme();
  const activeRef = useRef(active);

  const o0 = useSharedValue(STROKES[0].len);
  const o1 = useSharedValue(STROKES[1].len);
  const o2 = useSharedValue(STROKES[2].len);
  const o3 = useSharedValue(STROKES[3].len);
  const o4 = useSharedValue(STROKES[4].len);
  const o5 = useSharedValue(STROKES[5].len);
  const masterOpacity = useSharedValue(1);

  const ap0 = useAnimatedProps(() => ({ strokeDashoffset: o0.value }));
  const ap1 = useAnimatedProps(() => ({ strokeDashoffset: o1.value }));
  const ap2 = useAnimatedProps(() => ({ strokeDashoffset: o2.value }));
  const ap3 = useAnimatedProps(() => ({ strokeDashoffset: o3.value }));
  const ap4 = useAnimatedProps(() => ({ strokeDashoffset: o4.value }));
  const ap5 = useAnimatedProps(() => ({ strokeDashoffset: o5.value }));
  const wrapStyle = useAnimatedStyle(() => ({ opacity: masterOpacity.value }));

  useEffect(() => {
    activeRef.current = active;
    const allO = [o0, o1, o2, o3, o4, o5];

    if (!active) {
      allO.forEach((o, i) => { cancelAnimation(o); o.value = 0; });
      cancelAnimation(masterOpacity);
      masterOpacity.value = 1;
      return;
    }

    const startCycle = () => {
      if (!activeRef.current) return;
      allO.forEach((o, i) => { o.value = STROKES[i].len; });
      masterOpacity.value = 1;

      o0.value = withTiming(0, { duration: DURATIONS[0] });
      o1.value = withDelay(DELAYS[1], withTiming(0, { duration: DURATIONS[1] }));
      o2.value = withDelay(DELAYS[2], withTiming(0, { duration: DURATIONS[2] }));
      o3.value = withDelay(DELAYS[3], withTiming(0, { duration: DURATIONS[3] }));
      o4.value = withDelay(DELAYS[4], withTiming(0, { duration: DURATIONS[4] }));
      // Cross-2 is last to finish — its callback drives hold → fade → repeat
      o5.value = withDelay(
        DELAYS[5],
        withTiming(0, { duration: DURATIONS[5] }, (finished) => {
          if (!finished) return;
          masterOpacity.value = withDelay(
            HOLD_MS,
            withTiming(0, { duration: FADE_MS }, (done) => {
              if (!done) return;
              runOnJS(startCycle)();
            })
          );
        })
      );
    };

    startCycle();

    return () => {
      activeRef.current = false;
      allO.forEach(o => cancelAnimation(o));
      cancelAnimation(masterOpacity);
    };
  }, [active]);

  const color = active ? colors.success : colors.textMuted;
  const pp = { stroke: color, strokeWidth: 2.2, strokeLinecap: 'round' as const, fill: 'none' };

  // viewBox "3 0 18 24": x from 3→21, y 0→24 — fits left endpoints (x=5) and
  // right tips (x=19) with 2-unit margin on each side.
  return (
    <View style={{ width: 34, height: 34, justifyContent: 'center', alignItems: 'center' }}>
      <Animated.View style={wrapStyle}>
        <Svg width={15} height={20} viewBox="3 0 18 24">
          <AnimatedPath animatedProps={ap0} d={STROKES[0].d} {...pp} strokeDasharray={`${STROKES[0].len} ${STROKES[0].len}`} />
          <AnimatedPath animatedProps={ap1} d={STROKES[1].d} {...pp} strokeDasharray={`${STROKES[1].len} ${STROKES[1].len}`} />
          <AnimatedPath animatedProps={ap2} d={STROKES[2].d} {...pp} strokeDasharray={`${STROKES[2].len} ${STROKES[2].len}`} />
          <AnimatedPath animatedProps={ap3} d={STROKES[3].d} {...pp} strokeDasharray={`${STROKES[3].len} ${STROKES[3].len}`} />
          <AnimatedPath animatedProps={ap4} d={STROKES[4].d} {...pp} strokeDasharray={`${STROKES[4].len} ${STROKES[4].len}`} />
          <AnimatedPath animatedProps={ap5} d={STROKES[5].d} {...pp} strokeDasharray={`${STROKES[5].len} ${STROKES[5].len}`} />
        </Svg>
      </Animated.View>
    </View>
  );
}


//      * (12,2)
//     /|\
//    / | \
//   /  |  \
// *(5,7)|  *(19,7)
//   \  |  /
//    \ | /
//     \|/
//      * (12,12)
//     /|\
//    / | \
//   /  |  \
// *(5,17) *(19,17)
//   \  |  /
//    \ | /
//     \|/
//      * (12,22)



    