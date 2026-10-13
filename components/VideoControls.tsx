/**
 * components/VideoControls.tsx
 *
 * Play/pause + 10s skip buttons over the video. Tap the video area to
 * show them, auto-hide after 3s, tap again to hide — explicit ask:
 * "they shouldn't always be there... only when you're on the video."
 * (Speed, the scrub bar, and fullscreen live in repfeedback.html's own
 * always-visible built-in row instead — found by reading the raw file,
 * see rep-feedback.tsx's own comment on it. This component only covers
 * what the design has no equivalent for.)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { SymbolView } from 'expo-symbols';
import type { VideoPlayer } from 'expo-video';

const VIDEO_CONTROLS_BUILD = 'vc-8';
if (__DEV__) console.log(`[VideoControls] build ${VIDEO_CONTROLS_BUILD}`);

const AUTO_HIDE_MS = 3000;
const SIDE_BUTTON_SIZE = 68;
const CENTER_BUTTON_SIZE = 84;
const SKIP_SECONDS = 10;

export default function VideoControls({
  player,
  style,
}: {
  player: VideoPlayer;
  style?: StyleProp<ViewStyle>;
}) {
  const [isPlaying, setIsPlaying] = useState(player.playing);
  useEffect(() => {
    const sub = player.addListener('playingChange', ({ isPlaying: p }) => setIsPlaying(p));
    return () => sub.remove();
  }, [player]);

  const [visible, setVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
  }, []);
  useEffect(() => clearHideTimer, [clearHideTimer]);

  const hide = useCallback(() => {
    clearHideTimer();
    Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setVisible(false);
    });
  }, [opacity, clearHideTimer]);

  const show = useCallback(() => {
    setVisible(true);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    clearHideTimer();
    hideTimer.current = setTimeout(hide, AUTO_HIDE_MS);
  }, [opacity, clearHideTimer, hide]);

  const handleTap = useCallback(() => {
    if (visible) hide(); else show();
  }, [visible, hide, show]);

  const togglePlay = useCallback(() => {
    if (player.playing) player.pause(); else player.play();
    show();
  }, [player, show]);

  const skip = useCallback((deltaSec: number) => {
    const d = player.duration || 0;
    let t = player.currentTime + deltaSec;
    if (t < 0) t = 0;
    if (d > 0 && t > d) t = d;
    player.currentTime = t;
    show();
  }, [player, show]);

  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={handleTap} />
      {visible && (
        <Animated.View style={[styles.row, { opacity }]} pointerEvents="box-none">
          <ControlButton onPress={() => skip(-SKIP_SECONDS)} icon="gobackward.10" size={SIDE_BUTTON_SIZE} iconSize={26} />
          <ControlButton onPress={togglePlay} icon={isPlaying ? 'pause.fill' : 'play.fill'} size={CENTER_BUTTON_SIZE} iconSize={32} />
          <ControlButton onPress={() => skip(SKIP_SECONDS)} icon="goforward.10" size={SIDE_BUTTON_SIZE} iconSize={26} />
        </Animated.View>
      )}
    </View>
  );
}

// BUG FOUND (repeatedly, across 3 rounds of tint/fallback-color tweaks
// to LiquidGlass — "still looks the same, ugly, white, small"): real
// Apple Liquid Glass is a genuine system material Claude can't fully
// control the look of (tintColor only nudges it, and Apple's own
// material can stay bright/light regardless), and the fallback render
// apparently wasn't landing as intended either. Rather than keep tuning
// a material that isn't behaving predictably, these buttons now use
// expo-blur's BlurView (already a project dependency) with an explicit
// dark overlay on top — fully self-contained, same look every time,
// regardless of Liquid Glass's own availability or behavior. This is a
// deliberate departure from the "use @callstack/liquid-glass for glass"
// default — flagging it plainly since it's a real change, not hiding it.
function ControlButton({
  onPress, icon, size, iconSize,
}: { onPress: () => void; icon: 'gobackward.10' | 'goforward.10' | 'play.fill' | 'pause.fill'; size: number; iconSize: number }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
      <BlurView tint="dark" intensity={80} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.38)' }]} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <SymbolView name={icon} size={iconSize} tintColor="#ffffff" type="monochrome" style={{ width: iconSize, height: iconSize }} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute', left: 0, right: 0, top: '50%', marginTop: -(CENTER_BUTTON_SIZE / 2),
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 26,
  },
});
