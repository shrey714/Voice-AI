import { NativeModules, Platform } from 'react-native';

// Fallback used until the native ScreenCornerRadius module is present in the build
// (i.e. before the dev client is rebuilt). Tune per target device if needed.
const FALLBACK_RADIUS = Platform.OS === 'ios' ? 49 : 27;

// Real device screen corner radius, read safely from the native module.
// We read NativeModules directly (instead of importing the package) because the
// package accesses `.cornerRadius` at import time and would crash if the native
// side hasn't been built yet. This accessor degrades gracefully to FALLBACK_RADIUS.
function readDeviceCornerRadius(): number {
  try {
    const r = NativeModules?.ScreenCornerRadius?.cornerRadius;
    return typeof r === 'number' && r > 0 ? r : FALLBACK_RADIUS;
  } catch {
    return FALLBACK_RADIUS;
  }
}

// Computed once at startup — the value is constant for a given device.
export const SCREEN_CORNER_RADIUS = readDeviceCornerRadius();
