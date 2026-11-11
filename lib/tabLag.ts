/**
 * lib/tabLag.ts
 *
 * [TAB-LAG] timing log for a tab's FIRST open (Progress, Profile): when the screen mounted, when its data was ready, when
 * the tab was first shown, when its web page loaded / asked for data / got it, and when it revealed itself. One summary
 * line is printed at the moment the page is ready, so a phone log shows exactly where a first open spends its time:
 *
 *   [TAB-LAG] profile first open: shown -> ready 412ms | data was ready 38ms BEFORE the tab was shown | page load 3ms after
 *   shown, page asked for data +29ms, data pushed +31ms, ready +412ms
 */
/** The moment the user last tapped a tab (set by components/GlassTabBar.tsx), so a screen can say how long it took to show. */
export const tapClock = { at: 0, name: '' };

export function createTabLag(tab: string) {
  const t: Record<string, number> = {};
  let printed = false;
  let seen = false;
  const now = () => Date.now();
  const log = (msg: string) => { if (__DEV__) console.log(`[TAB-LAG] ${tab} ${msg}`); };
  return {
    /** Every show after the first: how long after the tap, and whether the page was already on screen (a page that had to load again would say false). */
    revisit(visible: boolean) {
      if (!seen) { seen = true; return; }
      const ms = tapClock.at && tapClock.name === tab ? now() - tapClock.at : null;
      log(`shown again${ms == null ? '' : ' ' + ms + 'ms after the tap'} | page already visible: ${visible ? 'yes' : 'NO (it is loading again)'}`);
    },
    /** First time only: later calls are ignored, so "first open" stays the first open. */
    mark(name: 'mount' | 'dataReady' | 'shown' | 'loadStart' | 'loadEnd' | 'asked' | 'pushed' | 'ready') {
      if (t[name] != null) return;
      t[name] = now();
      if (name === 'mount') log('mounted (data prefetch starts now)');
      if (name === 'dataReady') log(`data ready ${t.mount != null ? t[name] - t.mount : '?'}ms after mount${t.shown != null ? ' (tab already shown)' : ' (before the tab was shown)'}`);
      if (name === 'ready' && !printed) {
        printed = true;
        const rel = (k: string) => (t[k] != null && t.shown != null ? `+${t[k] - t.shown}ms` : 'n/a');
        const lead = t.dataReady != null && t.shown != null ? t.shown - t.dataReady : null;
        log(`first open: shown -> ready ${t.shown != null ? t.ready - t.shown : '?'}ms | data ready ${lead == null ? 'after' : lead >= 0 ? lead + 'ms BEFORE' : -lead + 'ms AFTER'} the tab was shown | page load start ${rel('loadStart')}, load end ${rel('loadEnd')}, asked for data ${rel('asked')}, data pushed ${rel('pushed')}, ready ${rel('ready')}`);
      }
    },
  };
}
