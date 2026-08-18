---
name: apple-hig-rn
description: Apple Human Interface Guidelines applied to this React Native / Expo codebase (FormPal) — materials/glassmorphism, system color semantics, SF Symbols, spacing, and motion, grounded in this app's own existing tokens and components rather than generic advice. Use for any screen, component, or visual-design task in this project.
---

# Apple HIG for FormPal (React Native / Expo)

This is not generic Apple design advice — it's how HIG principles map onto **this specific codebase's own tokens and components**, most of which already exist and already follow HIG correctly. The job on any design task is usually to extend an established pattern, not invent a new one. Check `constants/theme.ts` and the components below before designing anything from scratch.

## This app already speaks Apple's visual language — use it, don't reinvent it

`constants/theme.ts`'s `Col` palette is not an approximation of Apple's system colors, it **is** them: `good: '#30D158'` is systemGreen, `mid: '#FF9F0A'` is systemOrange, `low: '#FF3B30'` is systemRed, `ringC: '#007AFF'` is systemBlue. Never introduce a new color for a status/semantic meaning — check `Col` first; if the exact shade isn't there, derive it from the nearest Apple system color, not an arbitrary hex. `Elev` implements Apple's real multi-layer shadow recipe (contact / body / ambient / wash) — reuse it for any new elevated surface rather than a single flat `shadowOpacity`.

Typography already makes a deliberate, documented choice, not a HIG violation: `FONT.body` (`undefined`, i.e. SF Pro / system default) for `Sz.h3` and below, `FONT.display*` (Bricolage Grotesque) for `Sz.h2` and above. This is the correct HIG-adjacent pattern for an app with its own identity: SF Pro carries the interface (labels, numbers, body — where legibility and system-native feel matter most), a characterful display face carries the brand moments (hero titles, big scores). Don't "fix" this toward pure SF Pro everywhere — that would undo a real decision, not correct an error. Do keep obeying its own rule: never pair `fontWeight` with a `FONT.display*` family (the font file *is* the weight; a `fontWeight` alongside it is a no-op at best, per that file's own comment).

## Materials — this app's glass pattern is already HIG-correct

`app/recap.tsx`'s `GlassSurface` (blur → diagonal tint wash → top sheen → hairline border, shadow on an *outer* unclipped wrapper because `shadow` + `overflow:hidden` on the same view silently eats the shadow on iOS) is the canonical implementation of Apple's Liquid Glass material in this app — reuse it, don't hand-roll a new blur recipe per screen. `components/AppBackground.tsx` (soft gradient + drifting color blobs, `expo-blur`) is the canonical *background* to put glass surfaces over. Real depth in this system comes from thin borders (`rgba(255,255,255,0.7-0.85)`) plus a soft top highlight, not from harsh outlines — that's the actual visual difference between "glass" and "gray card with a border."

## SF Symbols, not custom icon sets

`SymbolView` (`expo-symbols`) is already used everywhere in this app for iconography — continue that, don't introduce a different icon library for new UI. Prefer `type="monochrome"` tinted from `Col`/tier palettes over multicolor/hierarchical rendering, matching the restrained, single-accent-per-context look the rest of the app already has.

## Spacing, radius, type scale — use the tokens, not literals

`Sp` (4/8/16/24/32/48, an 8pt-grid-derived scale) and `R` (chip/card/pill radii) exist so every screen's rhythm matches every other screen's. A new screen introducing its own one-off `padding: 18` or `borderRadius: 20` where an existing token is close enough is a regression, not a style choice — use the token, or extend the token file if a genuinely new value is needed project-wide (don't inline it once and repeat that same inline value on the next screen). Same for `Sz` (the type scale) — `Sz.h1`/`Sz.h2`/etc, not ad hoc font sizes.

## Motion — spring, not linear

Every existing animation in this app (`FadeInView`, `RankRing`, tab transitions in `plus.tsx`) uses `Animated.spring`/`timing` with real spring physics (damping/stiffness) or short, deliberate durations (~180-420ms) — not linear easing. New motion should match that: natural, slightly bouncy settle rather than a mechanical linear fade. Respect `prefers-reduced-motion`-equivalent restraint even where RN doesn't enforce it automatically — motion should serve a specific transition (entrance, state change), not run ambiently for its own sake, mirroring this app's own `MuscleRankBackdrop` blob drift, which is slow and subtle specifically so it reads as ambient atmosphere, not a distraction.

## Semantic color discipline

Color in this app already encodes MEANING, not decoration (see `Col`'s own comment: "3-state status — color encodes MEANING, not decoration"). A tier/rank/score color and a purely-decorative accent color are different concerns — don't blend them. When a new UI element needs a status color (good/caution/bad), it's one of the three existing semantic colors, never a new one invented for that screen.

## What "generic AI design" looks like here, specifically

For this app, the generic-AI failure mode isn't the usual purple-gradient-on-white (this app was explicitly designed away from that already — `Col.ringA/B/C`'s own comment says "NO purple or indigo"). Here it's: (1) introducing a NEW blur/glass recipe instead of reusing `GlassSurface`, (2) a new one-off spacing/radius value instead of the token, (3) an icon from a different set than `SymbolView`, (4) flat/linear motion instead of spring, (5) inventing a new status color instead of reusing `Col.good/mid/low`. Check against this list before calling a design done.

## Applying `frontend-design` alongside this skill

The `frontend-design` skill's principles (ground it in the subject, typography as personality, structure as information, restraint, one real signature element) still apply — they're about *judgment*, this skill is about *this app's existing vocabulary* for expressing that judgment. Use both together: `frontend-design` for what to say, this skill for how it's already being said in FormPal.
