/**
 * lib/haptics.ts
 *
 * ONE place for every haptic in the app. Subtle on purpose (like Cal AI): nothing uses Medium or Heavy.
 *
 *   hapticSelect()   the lightest tick: tabs, segment controls (2M/6M/1Y, Front/Side/Back), pickers, chips, the day strip, and
 *                    every ordinary tap
 *   hapticSoft()     a button that OPENS something (a card, a row, a menu item): impact Soft
 *   hapticMain()     a main action (Start, Save, Submit, Continue, the + button): impact Light
 *   hapticSuccess()  big success moments only (weight logged, rank up, workout complete, plan ready)
 *   hapticWarning()  warnings ("Are you sure?" weight check)
 *   hapticError()    errors
 *
 * One haptic per press, never doubled: any haptic asked for within 60ms of the last one is dropped, and a press that already
 * made its own haptic does not get the automatic one (see installPressHaptics). Nothing here is ever called while scrolling.
 *
 * This file also exports the same names expo-haptics has (selectionAsync, impactAsync, notificationAsync, the style enums), so
 * `import * as Haptics from '.../lib/haptics'` is a drop-in that routes older call sites through the same rules:
 * impactAsync(Light) = an ordinary press = selection, impactAsync(Soft) = Soft, impactAsync(Medium/Heavy/Rigid) = a main action = Light.
 */
import * as Haptics from 'expo-haptics';

export { ImpactFeedbackStyle, NotificationFeedbackType } from 'expo-haptics';

const DEDUPE_MS = 60;
let lastAt = 0;
let fired = 0;
let backend: typeof Haptics = Haptics;

/** Tests only: replace expo-haptics with a recorder. */
export function __setHapticBackend(b: typeof Haptics | null) { backend = b ?? Haptics; lastAt = 0; fired = 0; }
export function hapticCount() { return fired; }

function fire(run: () => Promise<void>): void {
  const now = Date.now();
  if (now - lastAt < DEDUPE_MS) return;
  lastAt = now; fired += 1;
  try { void run().catch(() => {}); } catch { /* no haptic engine: nothing to do */ }
}

export const hapticSelect  = () => fire(() => backend.selectionAsync());
export const hapticSoft    = () => fire(() => backend.impactAsync(backend.ImpactFeedbackStyle.Soft));
export const hapticMain    = () => fire(() => backend.impactAsync(backend.ImpactFeedbackStyle.Light));
export const hapticSuccess = () => fire(() => backend.notificationAsync(backend.NotificationFeedbackType.Success));
export const hapticWarning = () => fire(() => backend.notificationAsync(backend.NotificationFeedbackType.Warning));
export const hapticError   = () => fire(() => backend.notificationAsync(backend.NotificationFeedbackType.Error));
// Names the post-workout / camera screens use: a normal tap is the lightest tick, a main action (Start, Stop, Done, Continue) is Light.
export const hapticLight   = hapticSelect;
export const hapticMedium  = hapticMain;

// ── drop-in for `import * as Haptics from 'expo-haptics'` ──
export const selectionAsync = async () => { hapticSelect(); };
export const impactAsync = async (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium) => {
  if (style === Haptics.ImpactFeedbackStyle.Light) hapticSelect();       // an ordinary press: the lightest tick
  else if (style === Haptics.ImpactFeedbackStyle.Soft) hapticSoft();     // opens something
  else hapticMain();                                                      // Medium / Heavy / Rigid were main actions: now Light
};
export const notificationAsync = async (type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success) => {
  if (type === Haptics.NotificationFeedbackType.Warning) hapticWarning();
  else if (type === Haptics.NotificationFeedbackType.Error) hapticError();
  else hapticSuccess();
};

/** A haptic named by a WebView page ('select' | 'light' | 'medium' | 'success' | 'warning' | 'error'). */
export function hapticKind(kind: string | undefined): void {
  switch (kind) {
    case 'select': case 'selection': hapticSelect(); break;
    case 'soft': hapticSoft(); break;
    case 'success': hapticSuccess(); break;
    case 'warning': hapticWarning(); break;
    case 'error': hapticError(); break;
    case 'light': case 'main': case 'medium': hapticMain(); break;
    default: break;
  }
}

/**
 * Every normal press in the app (Pressable, TouchableOpacity, Button all run on React Native's Pressability) gets the Light
 * haptic automatically, UNLESS the press already made its own haptic while its handler ran (a main action's Medium, a tab's
 * selection, ...). Call once at startup.
 */
export function installPressHaptics(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native/Libraries/Pressability/Pressability');
    const P = mod && (mod.default || mod);
    if (!P || !P.prototype || P.prototype.__hapticPatched) return;
    const orig = P.prototype.configure;
    P.prototype.configure = function (config: any) {
      if (config && typeof config.onPress === 'function' && !config.onPress.__haptic) {
        const inner = config.onPress;
        const wrapped: any = function (e: unknown) {
          const before = fired;
          const out = inner(e);
          if (fired === before) hapticSelect(); // an ordinary tap: the lightest tick
          return out;
        };
        wrapped.__haptic = true;
        config = { ...config, onPress: wrapped };
      }
      return orig.call(this, config);
    };
    P.prototype.__hapticPatched = true;
  } catch { /* an RN version without this module: the explicit haptics still work */ }
}

/**
 * Page side, for the design pages in WebViews (Home, Train, Progress, Profile): one click listener that classifies the tapped
 * thing and posts { type: 'haptic', kind } (clicks only, so scrolling never buzzes). The screen's onMessage calls hapticKind.
 */
export const HAPTIC_PAGE_JS = String.raw`
(function () {
  if (window.__hapticPageInstalled) return;
  window.__hapticPageInstalled = true;
  var MAIN = /^(start workout|start$|save|submit|continue|done|log weight|edit today.s weight|add today.s photo|create workout|get started|next|finish|generate|confirm|yes)/i;
  var SEL = /^(2m|6m|1y|all|front|side|back|today|sun|mon|tue|wed|thu|fri|sat|\d{1,2})$/i;
  var KEY = /^[0-9.⌫](\s|$)/;
  function send(kind) { try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'haptic', kind: kind })); } catch (e) {} }
  // A press may know better than the guess below (Submit that ends in "Are you sure?" or in a saved weight): the page's own
  // code calls window.__hapticClaim(kind), which replaces the guessed haptic for this press, so the press still makes ONE.
  var pending = null;
  window.__hapticClaim = function (kind) { pending = null; send(kind); };
  document.addEventListener('click', function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    if (t.hasAttribute && t.hasAttribute('data-athlt-pt')) { window.__hapticClaim('select'); return; }
    var el = t.closest('[data-hp],a,[sc-camel-on-click],[role="button"]');
    if (!el) {
      var p = t; for (var i = 0; p && i < 6; i++, p = p.parentElement) { if (p.style && p.style.cursor === 'pointer') { el = p; break; } }
    }
    if (!el) return;
    var forced = el.getAttribute && el.getAttribute('data-hp');
    var txt = ((el.innerText || el.textContent || '') + '').trim();
    // main action = Light, segment / key / chip / day = the lightest tick, a link or card that opens something = Soft
    var kind = forced || (MAIN.test(txt) ? 'light' : (KEY.test(txt) || SEL.test(txt.split('\n')[0])) ? 'select' : (el.tagName === 'A' ? 'soft' : 'select'));
    var token = {}; pending = token;
    setTimeout(function () { if (pending === token) { pending = null; send(kind); } }, 0);
  }, true);
})(); true;`;

/**
 * THE ONE EXCEPTION to the soft-haptics rule (Ari, 2026-11-13): the Finish button on the last rep of the rep review. A strong thump you really feel:
 * impact Heavy and notification Success together. Counts as this press's own haptic, so no automatic tick follows it.
 */
export function hapticFinish(): void {
  lastAt = Date.now(); fired += 1;
  try { void backend.impactAsync(backend.ImpactFeedbackStyle.Heavy).catch(() => {}); } catch { /* no haptic engine */ }
  try { void backend.notificationAsync(backend.NotificationFeedbackType.Success).catch(() => {}); } catch { /* no haptic engine */ }
}
