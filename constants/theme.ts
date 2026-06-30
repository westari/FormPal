/**
 * FormPal design system tokens.
 * Import only the namespaces you need: FONT, Col, Sp, Sz, W, R, Elev
 */

// ── Font families ─────────────────────────────────────────────────────────────
//
// Display font: Bricolage Grotesque (loaded in app/_layout.tsx via useFonts).
// Body font: system default (SF Pro on iOS) — set fontFamily to undefined.
//
// IMPORTANT: RN can't use fontWeight to select custom font weights.
// You must use the per-weight fontFamily name. Use FONT.* for fontFamily,
// then omit fontWeight (or use the matching W.* for system-font elements).
//
// Rule: FONT.display* → Sz.h2 and larger.  FONT.body → Sz.h3 and below.

export const FONT = {
  // Bricolage Grotesque variants — large display text only
  displayLight: 'BricolageGrotesque_300Light',      // thin headers: "Welcome back."
  display:      'BricolageGrotesque_400Regular',     // neutral display
  displayBold:  'BricolageGrotesque_700Bold',        // bold display: section titles
  displayBlack: 'BricolageGrotesque_800ExtraBold',   // heaviest: wordmark, hero CTA

  // System (SF Pro on iOS, Roboto on Android) — body, labels, numbers
  body: undefined as string | undefined,
} as const;

// ── Font weights ──────────────────────────────────────────────────────────────
// Used with FONT.body (system font). NOT used with FONT.display* (see above).
export const W = {
  thin:    '300' as const,
  regular: '400' as const,
  medium:  '500' as const,
  semi:    '600' as const,
  bold:    '700' as const,
};

// ── Type scale ───────────────────────────────────────────────────────────────
// Approx 2× jumps at the extremes; tighter in the body range.
export const Sz = {
  display:  52,   // rep counter, giant score — W.thin or W.bold
  h1:       32,   // screen title, onboarding question
  h2:       24,   // section heading, card title
  h3:       18,   // sub-section, card sub-head
  body:     15,   // default body copy
  small:    13,   // secondary body, list metadata
  caption:  11,   // timestamps, labels, chips
};

// ── Spacing (8px rhythm) ─────────────────────────────────────────────────────
export const Sp = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
};

// ── Border radii ──────────────────────────────────────────────────────────────
export const R = {
  card:  22,   // outer floating card
  inner: 14,   // inner card sections
  chip:  10,   // exercise chips, tags
  pill: 100,   // status pills, buttons, badges
  sm:    8,    // small elements
};

// ── Color palette ─────────────────────────────────────────────────────────────
// RULE: always use Col.* — never raw hex in components.
export const Col = {
  // Backgrounds
  bg:      '#FBFBFD' as const,
  bgGrad:  ['#FBFBFD', '#F1F1F6'] as [string, string],
  card:    '#FFFFFF' as const,

  // Text
  text:    '#1A1A1C' as const,   // primary: headings, numbers, body
  textSub: '#8A8A8E' as const,   // secondary: labels, units, captions
  textDim: '#C4C4C8' as const,   // faint: ring tracks, dividers, hints

  // 3-state status — color encodes MEANING, not decoration
  good:     '#30D158' as const,              // high score, clean rep, achieved
  goodSoft: 'rgba(48,209,88,0.12)' as const,
  mid:      '#FF9F0A' as const,              // average, caution
  midSoft:  'rgba(255,159,10,0.12)' as const,
  low:      '#FF3B30' as const,              // bad form, error, low score
  lowSoft:  'rgba(255,59,48,0.12)' as const,

  // Ring gradient pairs — each a distinct hue. NO purple or indigo.
  ringA:     ['#FF9F0A', '#FF6B00'] as [string, string],  // Form Score: orange → deep amber
  ringB:     ['#30D158', '#00C7BE'] as [string, string],  // This Week:  green  → teal
  ringC:     ['#007AFF', '#5AC8FA'] as [string, string],  // Good Reps:  blue   → sky

  ringTrack: '#E4E4EA' as const,  // grey arc behind every ring indicator
};

// ── Elevation tokens (3-tier layered-shadow system) ──────────────────────────
//
// Shadow tint: rgba(20,20,40,…) — cool blue cast, never pure black.
// Multi-layer boxShadow requires new architecture (newArchEnabled: true ✓).
// Android falls back to native elevation.
//
// Layer recipe (Ahlin/Comeau approach):
//   Layer 1 — contact: tight, dark   → sharp definition at element base
//   Layer 2 — body:    medium blur   → main volume and lift
//   Layer 3 — ambient: wide, faint   → soft diffusion into background
//   Layer 4 — wash:    very wide     → high tier only, full atmospheric bloom

export const Elev = {
  low: {
    shadow:  '0px 1px 2px rgba(20,20,40,0.07), 0px 4px 10px rgba(20,20,40,0.05), 0px 12px 24px rgba(20,20,40,0.03)',
    android: 3,
  },
  medium: {
    shadow:  '0px 2px 4px rgba(20,20,40,0.08), 0px 8px 18px rgba(20,20,40,0.06), 0px 20px 40px rgba(20,20,40,0.05), 0px 40px 80px rgba(20,20,40,0.03)',
    android: 8,
  },
  high: {
    shadow:  '0px 4px 8px rgba(20,20,40,0.10), 0px 12px 28px rgba(20,20,40,0.09), 0px 32px 64px rgba(20,20,40,0.07), 0px 64px 128px rgba(20,20,40,0.04)',
    android: 16,
  },
} as const;
