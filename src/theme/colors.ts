// ─────────────────────────────────────────────────────────────
// "Sage & Stone" — a single, cohesive, premium palette.
// Warm stone neutrals + charcoal ink + ONE deep-sage accent.
// Semantic colours (success/warning/danger/info) are muted earth
// tones that harmonise with the accent rather than competing with it.
// The whole app reads from these tokens, so the accent is swappable
// from this one file.
// ─────────────────────────────────────────────────────────────

export const LIGHT = {
  primary: '#5B7567',       // deep sage — the single accent
  primaryDark: '#44574B',   // pressed / gradient
  primaryLight: '#E8EDE9',  // sage tint (chips, icon tiles)
  secondary: '#5B7567',
  bg: '#F6F5F1',            // warm stone / ivory
  surface: '#FFFFFF',
  surfaceHigh: '#F1F0EB',   // inputs / subtle fills
  text: '#1E1D1A',          // warm near-black ink
  textSub: '#5B5852',       // warm dark grey
  textMuted: '#98948B',     // warm muted grey
  border: '#E6E3DC',        // warm hairline
  success: '#5B7567',       // positive = the sage accent
  warning: '#A98545',       // muted ochre (low stock)
  danger: '#A65A4D',        // muted clay (owed / delete)
  info: '#6C7C88',          // muted slate (UPI / neutral)
  cash: '#5B7567',
  upi: '#6C7C88',
  credit: '#A98545',
  shadow: '#1E1D1A',
};

export const DARK = {
  primary: '#90A998',       // lighter sage for dark surfaces
  primaryDark: '#5B7567',
  primaryLight: '#242B25',  // dark sage tint
  secondary: '#90A998',
  bg: '#121210',            // warm near-black
  surface: '#1C1B18',       // warm charcoal
  surfaceHigh: '#252420',
  text: '#EFEDE6',
  textSub: '#B3AFA6',
  textMuted: '#807C72',
  border: '#2B2A26',
  success: '#90A998',
  warning: '#C7A063',
  danger: '#C57F70',
  info: '#8C9BA8',
  cash: '#90A998',
  upi: '#8C9BA8',
  credit: '#C7A063',
  shadow: '#000000',
};

export type AppColors = typeof LIGHT;
