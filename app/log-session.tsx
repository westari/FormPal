/**
 * app/log-session.tsx
 *
 * "Log a session": Ari's real design file (assets/app screens/logsessionv2.html) used as-is, with real data
 * (lib/designScreens.ts): the app's own exercise catalog behind the search and the Cue box, and the real calendar month.
 * Manually logged exercises are saved to the session log (no camera, no form judged); every one of them counts toward
 * muscle ranks because the catalog is the same one lib/sessionLog.computeMuscleTiers reads.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import type { WebView } from 'react-native-webview';
import { EXERCISE_CATALOG } from '../constants/exercises';
import { getAllSessions, appendSessions, computeMuscleTiers } from '../lib/sessionLog';
import { computeOverallStanding } from '../components/MuscleTierMap';
import DesignScreen, { type DesignMessage } from '../components/DesignScreen';
import {
  buildCatalog, logSessionBeforeJs, logSessionData, athltSetDataJs, entriesFromPage, recentNames,
} from '../lib/designScreens';

const SOURCE = require('../assets/app screens/logsessionv2.html');
const BEFORE = logSessionBeforeJs();

export default function LogSessionScreen() {
  const router = useRouter();
  const webRef = useRef<WebView>(null);
  const saving = useRef(false);
  const catalog = useMemo(() => buildCatalog(EXERCISE_CATALOG as any), []);
  // the exercises logged most recently, shown as tappable chips under the search box (loaded once, pushed to the page)
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => { void getAllSessions().then(all => setRecent(recentNames(all, catalog))).catch(() => {}); }, [catalog]);
  const dataJs = useMemo(() => athltSetDataJs(logSessionData(catalog, new Date(), recent)), [catalog, recent]);

  const save = useCallback(async (msg: DesignMessage) => {
    if (saving.current) return; // one tap, one save
    saving.current = true;
    try {
      const { ts, entries } = entriesFromPage({ dayNum: msg.dayNum, year: msg.year, month: msg.month, items: msg.items }, catalog, new Date());
      if (entries.length === 0) { saving.current = false; return; }
      const before = computeOverallStanding(computeMuscleTiers(await getAllSessions()));
      await appendSessions(entries);
      const after = computeOverallStanding(computeMuscleTiers(await getAllSessions()));
      webRef.current?.injectJavaScript('window.__dsSaved && window.__dsSaved(); true;');
      const exercises = (msg.items as { n: string; sets: number; reps: number; load: number | null }[]).map(i => {
        const c = catalog.find(x => x.name === i.n);
        return { id: c?.id ?? i.n, name: i.n, sets: Array.from({ length: i.sets }, () => ({ reps: i.reps, ...(i.load ? { w: i.load } : {}) })) };
      });
      setTimeout(() => {
        router.replace({
          pathname: '/session-logged' as any,
          params: {
            rankBefore: before ? JSON.stringify(before) : '',
            rankAfter:  after ? JSON.stringify(after) : '',
            savedAt:    String(ts),
            exercises:  JSON.stringify(exercises),
          },
        });
      }, 650);
    } catch {
      saving.current = false;
    }
  }, [catalog, router]);

  const onMessage = useCallback((m: DesignMessage) => {
    if (m.type === 'back') router.back();
    else if (m.type === 'save') void save(m);
  }, [router, save]);

  return <DesignScreen name="log-session" source={SOURCE} beforeJs={BEFORE} dataJs={dataJs} onMessage={onMessage} webRef={webRef} />;
}
