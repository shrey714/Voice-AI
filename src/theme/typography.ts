// ─────────────────────────────────────────────────────────────
// Typography tokens — Nunito Sans (UI) + Libre Baskerville (hero)
//
// Usage:
//   import { fonts } from '../theme/typography';
//   style={{ fontFamily: fonts.bold, fontSize: 16 }}
//
// Never set fontFamily + fontWeight together — on Android,
// fontWeight is silently ignored when a custom fontFamily is set.
// The variant name already encodes the weight.
// ─────────────────────────────────────────────────────────────

export const fonts = {
  regular:   'NunitoSans_400Regular',
  medium:    'NunitoSans_500Medium',
  semiBold:  'NunitoSans_600SemiBold',
  bold:      'NunitoSans_700Bold',
  extraBold: 'NunitoSans_800ExtraBold',
  black:     'NunitoSans_900Black',
  // Serif — use ONLY for top-level hero numbers (shop name, big revenue)
  display:   'LibreBaskerville_400Regular',
} as const;
