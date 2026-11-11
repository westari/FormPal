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
import { hapticError, hapticSuccess } from '../lib/haptics';
import SavedCheck from '../components/SavedCheck';
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
  // after Save: a short "Session logged" check (success haptic), then Today's progress. Holds the time of the logged session.
  const [loggedTs, setLoggedTs] = useState<number | null>(null);
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
      await appendSessions(entries, 'log-session (Save session pressed)');
      console.log('[LOG-SESSION] saved ' + entries.length + ' exercises - showing the Session logged check');
      hapticSuccess();
      setLoggedTs(ts); // the check shows on a white screen, then onLoggedDone opens Today's progress
    } catch {
      hapticError();
      saving.current = false;
    }
  }, [catalog, router]);

  const onMessage = useCallback((m: DesignMessage) => {
    if (m.type === 'back') router.back();
    else if (m.type === 'save') void save(m);
  }, [router, save]);

  // the check is white like Today's progress, so the hand-over between them is clean: this screen is replaced
  const onLoggedDone = useCallback(() => {
    if (loggedTs == null) return;
    console.log('[LOG-SESSION] check done - opening the Today progress page');
    router.replace({ pathname: '/recap' as any, params: { mode: 'logged', ts: String(loggedTs) } });
  }, [router, loggedTs]);

  return (
    <>
      <DesignScreen name="log-session" source={SOURCE} beforeJs={BEFORE} dataJs={dataJs} onMessage={onMessage} webRef={webRef} />
      {loggedTs != null ? <SavedCheck text="Session logged" onDone={onLoggedDone} /> : null}
    </>
  );
}
