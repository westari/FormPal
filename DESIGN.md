# FormPal Design System

Token file: `constants/theme.ts` — exports `FONT`, `Col`, `Sp`, `Sz`, `W`, `R`, `Elev`.
Primitives: `components/ScreenBackground`, `components/Card`, `components/Ring`.

---

## FONTS

**Two-font system: Bricolage Grotesque (display) + SF Pro (body).**

### Display font — Bricolage Grotesque

Used for: `Sz.h2` (24) and larger — greeting headers, screen titles, section headings.
Loaded in `app/_layout.tsx` via `useFonts`. Splash screen holds until ready.
Package: `@expo-google-fonts/bricolage-grotesque`

| Token | fontFamily string | Weight | Use |
|-------|------------------|--------|-----|
| `FONT.displayLight` | `BricolageGrotesque_300Light` | 300 | Thin greeting headers ("Welcome back.") |
| `FONT.display` | `BricolageGrotesque_400Regular` | 400 | Neutral large labels |
| `FONT.displayBold` | `BricolageGrotesque_700Bold` | 700 | Bold section titles |
| `FONT.displayBlack` | `BricolageGrotesque_800ExtraBold` | 800 | Wordmark, hero CTA text |

**Critical RN note**: Custom fonts in React Native cannot change weight via `fontWeight`. You must use the correct `fontFamily` variant per weight. Never set `fontWeight` alongside a `FONT.display*` fontFamily — the variant IS the weight.

### Body font — SF Pro (system default)

Used for: `Sz.h3` (18) and smaller — all body copy, labels, numbers, chips, captions.
Set `fontFamily: FONT.body` (which is `undefined` — RN uses system default = SF Pro on iOS).
Use `W.*` for fontWeight on body text as normal.

**Banned fonts** (never set `fontFamily` to any of these): Inter, Roboto, Open Sans, Space Grotesk, system-ui.

### Weight tokens (body / system font only)

| Token | Value | Use |
|-------|-------|-----|
| `W.thin` | 300 | Large system-font numbers (ring values, rep counter) |
| `W.regular` | 400 | Body copy |
| `W.medium` | 500 | Option labels, nav items |
| `W.semi` | 600 | Card sub-headings, date labels |
| `W.bold` | 700 | Data values, CTA text, key numbers |

### Usage pattern

```tsx
import { FONT, Sz, W, Col } from '../constants/theme';

// Display header — Bricolage Grotesque, thin
<Text style={{ fontFamily: FONT.displayLight, fontSize: Sz.h1, color: Col.text }}>
  Welcome back.
</Text>

// Body label — SF Pro, semi-bold
<Text style={{ fontSize: Sz.caption, fontWeight: W.semi, color: Col.textSub }}>
  Form Score
</Text>
```

Pairing rule: **light display header + bold body number in the same card** = premium tension. Never use medium weights (500/600) for display text — defeats the contrast.

---

## COLOR

All colors live in `Col` from `constants/theme.ts`. Never use raw hex in components.

### Backgrounds

| Token | Hex | Use |
|-------|-----|-----|
| `Col.bg` | `#FBFBFD` | Flat screen background (use only when gradient unavailable) |
| `Col.bgGrad` | `['#FBFBFD', '#F1F1F6']` | `<ScreenBackground>` — always use this |
| `Col.card` | `#FFFFFF` | Card surface. Always white so layered shadows are visible. |

### Text

| Token | Hex | Use |
|-------|-----|-----|
| `Col.text` | `#1A1A1C` | Primary: headings, numbers, body copy |
| `Col.textSub` | `#8A8A8E` | Secondary: labels, units, captions, ring labels |
| `Col.textDim` | `#C4C4C8` | Faint: ring track arcs, dividers, hints, empty states |

### 3-State Status System

Color encodes meaning, not decoration. Use these for all metric states.

| Token | Hex | Meaning |
|-------|-----|---------|
| `Col.good` / `Col.goodSoft` | `#30D158` | High form score, clean rep, goal achieved |
| `Col.mid` / `Col.midSoft` | `#FF9F0A` | Average score, caution, partial success |
| `Col.low` / `Col.lowSoft` | `#FF3B30` | Bad form, low score, error state |

The `Soft` variants are at 12% opacity — use for pill backgrounds, badge fills.

Rule: **never swap these colors for decoration**. If something is orange, it means caution. Always.

### Ring Gradients

Three rings, three distinct hue families. No purple. No indigo. No mixing.

| Token | Colors | Assigned to |
|-------|--------|-------------|
| `Col.ringA` | `#FF9F0A → #FF6B00` | Form Score (orange → deep amber) |
| `Col.ringB` | `#30D158 → #00C7BE` | This Week (green → teal) |
| `Col.ringC` | `#007AFF → #5AC8FA` | Good Reps (blue → sky) |
| `Col.ringTrack` | `#E4E4EA` | Grey arc behind all ring indicators |

The assignment is fixed. Form Score is always orange. This Week is always green. Good Reps is always blue. Never swap them.

---

## SPACING

8px rhythm. Use `Sp.*` — never raw numbers in padding, gap, or margin.

| Token | Value |
|-------|-------|
| `Sp.xs` | 4 |
| `Sp.sm` | 8 |
| `Sp.md` | 16 |
| `Sp.lg` | 24 |
| `Sp.xl` | 32 |
| `Sp.xxl` | 48 |

Cards have `padding: Sp.lg` (24) by default. Gap between cards in a scroll is `Sp.md` (16).

---

## TYPE SCALE

Use `Sz.*` for all `fontSize` values. Approx 2× jumps at extremes.

| Token | Value | Weight pairing | Use |
|-------|-------|---------------|-----|
| `Sz.display` | 52 | `W.thin` or `W.bold` | Rep counter, giant score |
| `Sz.h1` | 32 | `W.thin` or `W.semi` | Screen title, question |
| `Sz.h2` | 24 | `W.semi` | Section heading |
| `Sz.h3` | 18 | `W.semi` | Card title |
| `Sz.body` | 15 | `W.regular` or `W.medium` | Body copy |
| `Sz.small` | 13 | `W.regular` | Secondary body |
| `Sz.caption` | 11 | `W.medium` or `W.semi` | Labels, chips, timestamps |

Pairing rule: big = thin weight. Small = bold weight. This is the premium inversion.

---

## ELEVATION: 3-TIER LAYERED SHADOW SYSTEM

**Not React Native's default single shadow. Layered multi-shadow using `boxShadow`.**

Requires new architecture (`newArchEnabled: true` in app.json ✓). iOS only; Android gets native `elevation`.

Shadow tint: `rgba(20, 20, 40, …)` — a slightly cool blue, not pure black. Pure black shadows look harsh. The cool tint recedes naturally on a warm-white card.

### The 3 Tiers

| Tier | `boxShadow` layers | Android elevation | Use |
|------|-------------------|------------------|-----|
| `low` | 3 layers (0.07 / 0.05 / 0.03) | 3 | Inner sections, stat rows, light chips |
| `medium` | 4 layers (0.08 / 0.06 / 0.05 / 0.03) | 8 | Default floating card |
| `high` | 4 layers (0.10 / 0.09 / 0.07 / 0.04) | 16 | Hero cards, overlapping blocks |

### Layer Recipe (Ahlin/Comeau)

Each tier stacks multiple shadows, from tight to wide:

1. **Contact layer** (0px offset, tiny blur, highest opacity): defines the sharp base edge. What the card presses against the surface.
2. **Body layer** (small offset, medium blur): the main volume and perceived lift.
3. **Ambient layer** (medium offset, large blur, lower opacity): soft diffusion into the background. The "glow" you don't consciously see but notice when it's absent.
4. **Wash** (high tier only, very wide blur, lowest opacity): atmospheric spread for prominent elements.

### Usage

```tsx
import Card from '../components/Card';

<Card>…</Card>                     // medium (default)
<Card elevation="low">…</Card>    // inner sections
<Card elevation="high">…</Card>   // hero / leading card
```

---

## RADII

| Token | Value | Use |
|-------|-------|-----|
| `R.card` | 22 | Outer floating card |
| `R.inner` | 14 | Inner card sections, nested surfaces |
| `R.chip` | 10 | Exercise chips, tags, small badges |
| `R.pill` | 100 | Status pills, buttons, circular badges |
| `R.sm` | 8 | Small elements, mini toggles |

---

## COMPONENT PRIMITIVES

### `<ScreenBackground>`
Wraps every light-theme screen. Provides `Col.bgGrad` vertical gradient.
Replaces `flex: 1, backgroundColor: Col.bg` at the screen root.

```tsx
import ScreenBackground from '../components/ScreenBackground';

export default function MyScreen() {
  return (
    <ScreenBackground>
      <ScrollView>…</ScrollView>
    </ScreenBackground>
  );
}
```

### `<Card elevation="low|medium|high">`
White card with layered shadow. Default elevation is `medium`.

```tsx
import Card from '../components/Card';

<Card style={{ padding: Sp.lg }}>
  <Text>…</Text>
</Card>
```

### `<Ring>`
SVG gradient ring. `gradientId` must be unique per instance (scoped per `<Svg>`).
Use `Col.ringA`, `Col.ringB`, `Col.ringC` for the three metric rings.

```tsx
import Ring from '../components/Ring';
import { Col } from '../constants/theme';

<Ring
  progress={0.82}
  colors={Col.ringA}
  gradientId="gFormScore"
  value="82"
  unit="%"
  label="Form Score"
/>
```

---

## RULES (non-negotiable)

1. **Colors**: always `Col.*` — never raw hex in components.
2. **Spacing**: always `Sp.*` — never raw numbers in padding/gap/margin.
3. **Font sizes**: always `Sz.*` — never raw numbers in fontSize.
4. **Font weights**: always `W.*` — never raw strings like `'600'`.
5. **Cards are always white** (`Col.card = #FFFFFF`). Background is always gradient (`Col.bgGrad`).
6. **Ring colors are fixed**: orange=Form Score, green=This Week, blue=Good Reps. Never swap.
7. **Status colors encode meaning**: green=good, amber=mid, red=bad. Never use decoratively.
8. **No purple, indigo, or mixed gradients** outside the three defined `Col.ring*` pairs.
9. **`elevation="medium"` is the default** for all floating cards. Use `low` for inner sections; `high` for hero/leading cards that overlap others.
10. **No custom fontFamily**. Never. SF Pro is the font.
