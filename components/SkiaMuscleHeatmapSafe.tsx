/**
 * components/SkiaMuscleHeatmapSafe.tsx — error-boundary wrapper around the
 * experimental SkiaMuscleHeatmap. If the Skia render throws for any reason,
 * this falls back to the proven-safe react-native-svg MuscleHeatmap instead
 * of taking the whole app down. Same boundary pattern already used by
 * app/recap.tsx's RecapSectionBoundary.
 *
 * Not wired into recap.tsx or the progress tab yet — only used by the
 * isolated app/skia-heatmap-test.tsx route until a real device confirms the
 * Skia path doesn't crash.
 */

import React from 'react';
import { MuscleHeatmap } from './MuscleHeatmap';
import { SkiaMuscleHeatmap } from './SkiaMuscleHeatmap';
import { MuscleGroup } from '../constants/exercises';
import type { MuscleScores } from '../lib/sessionLog';

interface Props {
  overallScores:    MuscleScores;
  highlightGroups?: Set<MuscleGroup>;
  highlightLabel?:  string;
  scale?:           number;
}

class SkiaBoundary extends React.Component<{ children: React.ReactNode; onError: () => void }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode; onError: () => void }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: unknown) {
    console.error('[SkiaMuscleHeatmapSafe] Skia heatmap threw, falling back to SVG:', error);
    this.props.onError();
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

export function SkiaMuscleHeatmapSafe({ overallScores, highlightGroups, highlightLabel, scale }: Props) {
  const [failed, setFailed] = React.useState(false);

  if (failed) {
    return (
      <MuscleHeatmap
        overallScores={overallScores}
        highlightGroups={highlightGroups}
        highlightLabel={highlightLabel}
        scale={scale}
      />
    );
  }

  return (
    <SkiaBoundary onError={() => setFailed(true)}>
      <SkiaMuscleHeatmap overallScores={overallScores} highlightGroups={highlightGroups} scale={scale} />
    </SkiaBoundary>
  );
}
