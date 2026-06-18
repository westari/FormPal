const Colors = {
  // ── Surfaces — warm near-black canvas ──────────────────────────────────────
  background:      '#0E0E10',     // main app background (was warm bone #F4EFE6)
  surface:         '#1A1A1E',     // cards, elevated surfaces (was #FBF8F2)
  white:           '#FFFFFF',     // explicit white — unchanged
  surfaceRecessed: '#121215',     // deeper insets, recessed wells (was #ECE6DA)
  surfaceBorder:   '#2A2A30',     // card borders (was #DCD6CA)
  hairline:        'rgba(255,255,255,0.08)',  // subtle dividers (was dark-ink-based)

  // ── Text — off-white grading to near-invisible ────────────────────────────
  textPrimary:  '#F4EFE6',        // headings, key numbers (old bg is now text — full circle)
  textBody:     '#C8C4BC',        // body copy
  textSecondary:'#9A9690',        // secondary labels, captions
  textMuted:    '#6A6660',        // timestamps, metadata
  textDisabled: '#3A3A3E',        // disabled UI elements

  // ── Gold accent — the hero, pops hard on dark ─────────────────────────────
  primary:       '#C9A24A',       // champagne gold — unchanged
  primaryPressed:'#A88436',       // pressed state — unchanged
  primarySoft:   'rgba(201,162,74,0.14)',  // was opaque cream #F4ECD8 — now dark-appropriate
  accent:        '#C9A24A',       // alias — unchanged

  // ── Sport accent colors ───────────────────────────────────────────────────
  court:     '#FF6B42',           // basketball orange — slightly brighter for dark bg
  courtSoft: 'rgba(255,107,66,0.15)',  // was opaque warm cream — now dark tint

  marine:     '#4F6BFF',          // electric blue — brighter for dark bg
  marineSoft: 'rgba(79,107,255,0.15)', // was opaque light blue — now dark tint

  // ── Semantic ──────────────────────────────────────────────────────────────
  success: '#22C97E',             // brighter green for dark bg (was #18B872)
  danger:  '#FF5A5A',             // brighter red for dark bg (was #E04848)
  warning: '#F5A524',             // unchanged — works on both

  // ── Alpha tokens — WHITE-based for dark backgrounds ───────────────────────
  // Old tokens were dark-ink-on-light; dark theme flips them to white-on-dark.
  inkA8:    'rgba(255,255,255,0.06)',  // subtle highlight layer
  inkA12:   'rgba(255,255,255,0.09)',  // light lift / pressed states
  inkA24:   'rgba(255,255,255,0.16)',  // visible dividers, tinted areas
  inkA64:   'rgba(255,255,255,0.48)',  // near-opaque glass overlays

  // Dark surface alphas (replaces paper/warm-background alphas)
  paperA72: 'rgba(14,14,16,0.84)',    // dark modal scrim (was warm white)
  paperA88: 'rgba(14,14,16,0.95)',    // heavy dark overlay (was warm white)

  glowGold: 'rgba(201,162,74,0.35)',  // gold glow — unchanged, works on dark

  // ── Legacy aliases (keeps all existing imports working) ───────────────────
  buttonDark:     '#F4EFE6',      // was #0B0E12 — inverted: now a LIGHT button on dark bg
  buttonDarkText: '#0E0E10',      // was #FBF8F2 — dark text ON the light button
  black:          '#0E0E10',      // legacy alias — updated from #0B0E12
  card:           '#1A1A1E',      // was #FBF8F2 — now dark surface
  border:         '#2A2A30',      // was #DCD6CA — now dark border
};

export default Colors;
