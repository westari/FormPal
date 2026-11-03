/**
 * lib/useRevealFade.ts
 *
 * Reveal gate for a tab's web view. The view stays invisible until the page itself says it is ready
 * (laid out, filled with real data and still), then fades in over 180ms, so nothing flashes, jumps or
 * snaps into place on the first open.
 *
 * iOS does not start loading a tab's web view until the tab is first shown, so the last-resort timer
 * only starts once the page has loaded (12s). The pages also hide their own content until ready, so
 * even a reveal by the timer can never show a half-built page.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

export function useRevealFade(onLog?: (msg: string) => void) {
  const [revealed, setRevealed] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const a = Animated.timing(fade, { toValue: revealed ? 1 : 0, duration: revealed ? 180 : 0, easing: Easing.out(Easing.quad), useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [revealed, fade]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onReady = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setRevealed(true);
  }, []);
  const onLoadStart = useCallback(() => setRevealed(false), []);
  const onLoadEnd = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { onLog?.('revealed by the 12s safety net (page never said ready)'); setRevealed(true); }, 12000);
  }, [onLog]);
  const hide = useCallback(() => setRevealed(false), []);

  return { fade, revealed, onReady, onLoadStart, onLoadEnd, hide };
}
