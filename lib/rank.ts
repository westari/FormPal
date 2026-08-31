/**
 * lib/rank.ts
 *
 * One hook that answers "what rank is the user" for the whole customization
 * feature, so no screen re-implements the sessions → tiers → standing chain.
 *
 *   • current  — weakest-link CURRENT tier (decays with inactivity). Shown as
 *                "your rank right now".
 *   • peakTier — highest tier EVER reached across any muscle. Never decays.
 *                This is the unlock currency: an option earned by reaching a
 *                peak tier stays unlocked forever (see
 *                constants/customization.isOptionUnlocked).
 */

import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import { getAllSessions, computeMuscleTiers, type MuscleTiers, type Tier } from './sessionLog';
import {
  computeOverallStanding,
  computeOverallPeak,
  type OverallStanding,
} from '../components/MuscleTierMap';

export interface RankStanding {
  tiers:    MuscleTiers;
  current:  OverallStanding | null;
  peakTier: Tier | null;
  /** total good (clean) reps across every logged session — a headline stat for the badge */
  cleanReps: number;
  sessions:  number;
  loaded:    boolean;
}

const EMPTY: RankStanding = {
  tiers: {}, current: null, peakTier: null, cleanReps: 0, sessions: 0, loaded: false,
};

export function useRankStanding(): RankStanding & { refresh: () => void } {
  const [state, setState] = useState<RankStanding>(EMPTY);

  const load = useCallback(() => {
    getAllSessions().then((all) => {
      const tiers = computeMuscleTiers(all);
      setState({
        tiers,
        current:   computeOverallStanding(tiers),
        peakTier:  computeOverallPeak(tiers),
        cleanReps: all.reduce((n, s) => n + (s.formChecked === false ? 0 : s.goodReps), 0),
        sessions:  new Set(all.map((s) => s.ts)).size,
        loaded:    true,
      });
    }).catch(() => setState({ ...EMPTY, loaded: true }));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return { ...state, refresh: load };
}
