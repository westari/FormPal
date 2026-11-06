/**
 * lib/cueOrb.ts
 *
 * ONE look for Cue's orb, used everywhere Cue appears.
 *
 * The look is the Home tab's: the design's glossy blue orb (radial gradient body, soft purple core, white glow,
 * crisp highlight, blue halo, gentle breathing) WITHOUT the design's textured layers. The design's orb has a
 * mix-blend-mode noise layer and two blurred full-size blobs; in WebKit those paint as a fuzzy, textured, sometimes
 * squared-off orb. Switching them off is what gives the clean glossy orb.
 *
 *  - Web pages (Home, the Cue chat, "Meet Cue" in onboarding): CUE_ORB_CSS / CUE_ORB_JS below. The design files are
 *    never edited; the style is injected and survives the bundle's <html> swap.
 *  - Native screens: components/CueOrb.tsx draws cueOrbSvg(), the same orb as an SVG.
 */

export const CUE_ORB_CSS = `
  /* Cue's orb: the design's own gradient, highlight, glow and breathing animation, with its blend-mode texture layer
     and blurred blobs (full-size square layers WebKit can paint as a visible square) switched off. */
  div[style*="hm-orb-breathe"] { background: none !important; box-shadow: none !important; border: 0 !important; outline: 0 !important; }
  div[style*="hm-orb-breathe"] div[style*="mix-blend-mode"] { display: none !important; }
  div[style*="hm-orb-breathe"] div[style*="filter: blur"] { filter: none !important; }
`;

/** Self-installing for pages that don't have their own style pass: adds the style and re-adds it after the bundle swaps <html>. */
export const CUE_ORB_JS = `(function(){
  if (window.__cueOrbInstalled) return;
  window.__cueOrbInstalled = true;
  var CSS = ${JSON.stringify(CUE_ORB_CSS)};
  function add(){
    if (document.getElementById('__cue_orb')) return;
    var host = document.head || document.documentElement;
    if (!host) return;
    var s = document.createElement('style'); s.id = '__cue_orb'; s.textContent = CSS; host.appendChild(s);
  }
  add();
  try { new MutationObserver(add).observe(document, { childList: true, subtree: true }); } catch (e) {}
})(); true;`;

/** The same orb as a standalone SVG (100x100 box, the orb body fills 78 of it, the rest is its halo). */
export function cueOrbSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="co-halo" cx="50" cy="54" r="50" gradientUnits="userSpaceOnUse">
      <stop offset="0.62" stop-color="#78a8ff" stop-opacity="0.5"/><stop offset="1" stop-color="#78a8ff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="co-body" cx="50" cy="54.2" r="54" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#b9d2ff"/><stop offset="0.55" stop-color="#8db4ff"/><stop offset="1" stop-color="#6a97f2"/>
    </radialGradient>
    <radialGradient id="co-white" cx="42" cy="40" r="27" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/><stop offset="0.68" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="co-purple" cx="53" cy="53" r="26" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#8460ff" stop-opacity="0.75"/><stop offset="0.7" stop-color="#8460ff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="co-bottom" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.6" stop-color="#4070e8" stop-opacity="0"/><stop offset="1" stop-color="#4070e8" stop-opacity="0.32"/>
    </linearGradient>
    <linearGradient id="co-top" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.5"/><stop offset="0.22" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <clipPath id="co-clip"><circle cx="50" cy="50" r="39"/></clipPath>
  </defs>
  <circle cx="50" cy="54" r="50" fill="url(#co-halo)"/>
  <g clip-path="url(#co-clip)">
    <rect x="0" y="0" width="100" height="100" fill="url(#co-body)"/>
    <circle cx="42" cy="40" r="27" fill="url(#co-white)"/>
    <circle cx="53" cy="53" r="26" fill="url(#co-purple)"/>
    <rect x="0" y="11" width="100" height="78" fill="url(#co-bottom)"/>
    <rect x="0" y="11" width="100" height="78" fill="url(#co-top)"/>
    <ellipse cx="41" cy="30.5" rx="14" ry="8.6" fill="#ffffff" fill-opacity="0.88"/>
  </g>
</svg>`;
}
