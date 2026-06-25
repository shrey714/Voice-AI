# Expo HAS CHANGED

This project is on **Expo SDK 54**. Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

When adding native modules, always use `npx expo install <pkg>` (never plain `npm install`) so versions stay pinned to SDK 54 — mixing in newer-SDK packages causes native build failures (e.g. unresolved symbols like `OptimizedRecord`).
