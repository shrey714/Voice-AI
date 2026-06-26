import { useEffect, useState } from 'react';
import { NativeModules, Platform, PixelRatio } from 'react-native';

// Used until the real device radius resolves (and on iOS / unsupported devices).
const FALLBACK_RADIUS = Platform.OS === 'ios' ? 49 : 27;

let cached = FALLBACK_RADIUS;
let resolved = false;
const listeners = new Set<(r: number) => void>();

// Ask the native module for the real screen corner radius. We use the async
// method (added via patch-package) because it runs on the UI thread *after* the
// window exists — unlike the module's constant, which is computed at startup
// before window insets are available and so always returns 0 on Android.
async function fetchNativeRadius(): Promise<number> {
  try {
    const mod: any = NativeModules?.ScreenCornerRadius;
    if (mod?.getCornerRadiusAsync) {
      const raw = await mod.getCornerRadiusAsync();
      if (typeof raw === 'number' && raw > 0) {
        // Android returns raw pixels; RN borderRadius is in dp. iOS returns points.
        return Platform.OS === 'android' ? raw / PixelRatio.get() : raw;
      }
    }
  } catch {
    /* fall through to fallback */
  }
  return FALLBACK_RADIUS;
}

// Resolve once per app session and notify any mounted consumers.
export async function initScreenRadius(): Promise<void> {
  if (resolved) return;
  resolved = true;
  const r = await fetchNativeRadius();
  if (r > 0 && r !== cached) {
    cached = r;
    listeners.forEach((l) => l(r));
  }
}

// Latest known radius (fallback until the native value resolves).
export function getScreenCornerRadius(): number {
  return cached;
}

// React hook: returns the fallback immediately, then the real device radius once
// the native async read resolves (triggers a re-render of rounded pages).
export function useScreenRadius(): number {
  const [r, setR] = useState(cached);
  useEffect(() => {
    const l = (v: number) => setR(v);
    listeners.add(l);
    if (resolved) setR(cached);
    else initScreenRadius();
    return () => { listeners.delete(l); };
  }, []);
  return r;
}
