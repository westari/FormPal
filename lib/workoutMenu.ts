/**
 * lib/workoutMenu.ts
 *
 * Long-press a past workout (Home, Progress) -> a menu with "Delete workout" -> an "Are you sure?" -> it is gone from the
 * history, the streak and the ranks (every exercise saved with that time), and so are its video clips and pictures.
 * Works for camera workouts and hand-logged ones.
 *
 *  - WORKOUT_LONGPRESS_JS: page side. A press held ~0.5s on a workout card or row posts {type:'workoutMenu', ts}; the tap that
 *    follows the release is swallowed, so the recap does not open too. The page gives the list of times in order.
 *  - askRemoveWorkout(): app side. The menu, the confirm and the real removal.
 */
import { ActionSheetIOS, Alert, Platform } from 'react-native';
import { getAllSessions, groupIntoWorkouts, isManualEntry, removeWorkoutSessions } from './sessionLog';
import { removeSessionVideos } from './sessionVideo';
import * as Haptics from './haptics';

export const LONGPRESS_MS = 500;
export const LONGPRESS_SLOP = 10;

/** Page side. window.__athltLongPress(boxSelectors, tsAt): boxSelectors = the picture boxes of the cards/rows, tsAt(selectorIndex, boxIndex) = that workout's ts. */
export const WORKOUT_LONGPRESS_JS = String.raw`
(function () {
  if (window.__athltLongPress) return;
  var cfg = null, timer = null, sx = 0, sy = 0, firedAt = 0;
  function post(m) { try { window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {} }
  function find(t) {
    if (!cfg || !t || !t.closest) return null;
    for (var s = 0; s < cfg.sels.length; s++) {
      var all = document.querySelectorAll(cfg.sels[s]);
      for (var i = 0; i < all.length; i++) {
        // the card / row = the nearest ancestor of the picture box that holds only that one box
        var card = all[i];
        while (card.parentElement && card.parentElement.querySelectorAll(cfg.sels[s]).length === 1 && card.parentElement.id !== 'dc-root') card = card.parentElement;
        if (card.contains(t)) return { s: s, i: i };
      }
    }
    return null;
  }
  function cancel() { if (timer) { clearTimeout(timer); timer = null; } }
  document.addEventListener('pointerdown', function (e) {
    cancel();
    var hit = find(e.target);
    if (!hit) return;
    sx = e.clientX; sy = e.clientY;
    timer = setTimeout(function () {
      timer = null;
      var ts = cfg.tsAt(hit.s, hit.i);
      if (ts == null) return;
      firedAt = Date.now();
      post({ type: 'haptic', kind: 'soft' });
      post({ type: 'workoutMenu', ts: ts });
    }, ${LONGPRESS_MS});
  }, true);
  document.addEventListener('pointermove', function (e) { if (timer && (Math.abs(e.clientX - sx) > ${LONGPRESS_SLOP} || Math.abs(e.clientY - sy) > ${LONGPRESS_SLOP})) cancel(); }, true);
  document.addEventListener('pointerup', cancel, true);
  document.addEventListener('pointercancel', cancel, true);
  document.addEventListener('scroll', cancel, true);
  // the tap that ends a long press must not also open the workout
  function swallow(e) { if (Date.now() - firedAt < 900) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); } }
  document.addEventListener('click', swallow, true);
  window.__athltLongPress = function (sels, tsAt) { cfg = { sels: sels, tsAt: tsAt }; };
})(); true;`;

/** Take one workout out of the history for good: its entries, and (camera workouts) its clips and pictures. */
export async function removeWorkout(ts: number): Promise<boolean> {
  const all = await getAllSessions();
  const groups = groupIntoWorkouts(all); // newest first
  const idx = groups.findIndex(g => g.ts === ts);
  if (idx < 0) return false;
  const typedIn = groups[idx].entries.every(isManualEntry);
  if (!typedIn) { try { await removeSessionVideos(ts, groups[idx + 1]?.ts ?? 0); } catch { /* a clip that is already gone is fine */ } }
  return (await removeWorkoutSessions(ts)) > 0;
}

/** The menu, then the confirm, then the removal. `onDone` runs after it is gone so the screen can reload. */
export function askRemoveWorkout(ts: number, onDone: () => void): void {
  const confirm = () => Alert.alert(
    'Delete this workout?',
    'It is removed from your history, your streak and your ranks. This cannot be undone.',
    [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { void removeWorkout(ts).then(ok => { if (ok) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); onDone(); } }); } },
    ],
  );
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions({ options: ['Delete workout', 'Cancel'], destructiveButtonIndex: 0, cancelButtonIndex: 1 }, (i) => { if (i === 0) confirm(); });
  } else {
    Alert.alert('Workout', undefined, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete workout', style: 'destructive', onPress: confirm }]);
  }
}
