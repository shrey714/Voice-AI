# Expo HAS CHANGED

This project is on **Expo SDK 55** (upgraded from SDK 54 on 2026-07-11). Read the exact versioned docs at https://docs.expo.dev/versions/v55.0.0/ before writing any code.

When adding native modules, always use `npx expo install <pkg>` (never plain `npm install`) so versions stay pinned to SDK 55 — mixing in mismatched-SDK packages causes native build failures (e.g. unresolved symbols like `OptimizedRecord`). If `app.json`'s `sdkVersion` field and the installed `expo` package version ever drift apart, `expo install --fix` silently resolves against the *declared* `sdkVersion`, not the installed package — keep them in sync.
