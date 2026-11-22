/**
 * lib/doneStore.ts
 *
 * The one done screen (Ari's greatjobanimation.html) is drawn by components/DoneHost.tsx, mounted once at the top of the app (above every screen
 * and the tab bar). Anything that finishes calls showDone({ title, subtitle, onContinue }); onContinue runs when the user taps Continue.
 */
import { create } from 'zustand';

/** `subtitle` may be a Promise: the done screen then starts at ONCE with the title and the grey line fills in when the real line is ready (the line appears
 *  at about 2.2s into the animation, so it has that long to be worked out; if it fails the line is left out). */
export interface DonePayload { title: string; subtitle: string | Promise<string>; onContinue: () => void }
interface DoneState { payload: (DonePayload & { nonce: number }) | null; show: (p: DonePayload) => void; hide: () => void }

let nonce = 0;
export const useDone = create<DoneState>((set) => ({
  payload: null,
  show: (p) => set({ payload: { ...p, nonce: ++nonce } }),
  hide: () => set({ payload: null }),
}));
export const showDone = (p: DonePayload) => useDone.getState().show(p);
export const hideDone = () => useDone.getState().hide();
