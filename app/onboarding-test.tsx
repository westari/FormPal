// ── app/onboarding-test.tsx ─────────────────────────────────────────────────
// EXPERIMENTAL onboarding style test — completely separate from the real
// onboarding flow (app/onboarding.tsx), which this file does not touch or
// import from. Question content, icons, and the weight-ruler/wheel controls
// are duplicated here on purpose to keep this file 100% isolated — no
// shared state, no shared component imports beyond AppBackground (a
// read-only visual layer) and theme tokens. Reached only via the "Test New
// Onboarding" button on the home screen. Safe to delete this file and that
// button with no effect on the real flow.
//
// Third pass, after two rounds of "that's not what I meant":
//   • font switched off the Bricolage display faces entirely — system font
//     ("the basic iOS font"), light weight, not the bold display font
//   • real icons (the same assets/icons/*.webp + SF Symbol fallbacks the
//     real onboarding uses) instead of emoji
//   • AppBackground's colorful blob gradient restored behind everything
//   • age/height use the real wheel picker, weight uses a duplicated
//     version of the real tick-mark ruler slider — not bucketed pills
//   • the active question now anchors near the TOP of the viewport and the
//     whole page scrolls down to bring each new turn there, rather than
//     leaving it wherever it happened to land after accumulated content
//   • a round "X" icon button (SF Symbol, not text) top-right
//
// Open question I'm not confident I read correctly: something about
// reusing "the four things" / "two animations" from the real interstitial
// screens for two of the four "did you know" facts, excluding the two that
// use photos. I left the facts as plain animated text rather than guess at
// embedding chart components — say more if that's not what you meant.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, ScrollView, TextInput, Image,
  KeyboardAvoidingView, Platform, PanResponder, Dimensions, Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import { SymbolView } from 'expo-symbols';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, {
  Path as SvgPath, Text as SvgText, Circle as SvgCircle, Line as SvgLine,
  Defs, LinearGradient as SvgLinearGradient, Stop,
} from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import AppBackground from '../components/AppBackground';
import { Col } from '../constants/theme';
import { BodyMapSide, MuscleRankBackdrop } from '../components/MuscleTierMap';
import { Muscle } from '../constants/exercises';
import type { MuscleTiers, Tier } from '../lib/sessionLog';

const ACCENT   = '#2E7DFF';
const DARK     = '#0B1020';
const TYPE_SPEED_MS = 20; // ms per character
const SPACER_H = Math.round(Dimensions.get('window').height * 0.85);

// ── Icons — same asset files the real onboarding uses ─────────────────────

const ICON = {
  heart: require('../assets/icons/heart.webp'), person: require('../assets/icons/person.webp'),
  muscle: require('../assets/icons/muscle.webp'), calm: require('../assets/icons/calm.webp'),
  days: require('../assets/icons/days.webp'), run: require('../assets/icons/run.webp'),
  gym: require('../assets/icons/gym.webp'), scale: require('../assets/icons/scale.webp'),
  camera: require('../assets/icons/camera.webp'), arm: require('../assets/icons/arm.webp'),
  allGood: require('../assets/icons/allgood.webp'), hip: require('../assets/icons/hip.webp'),
  wrist: require('../assets/icons/wrist.webp'), neck: require('../assets/icons/neck.webp'),
  shoulder: require('../assets/icons/shoulder.webp'), knee: require('../assets/icons/knee.webp'),
  notSure: require('../assets/icons/notsure.webp'), fire: require('../assets/icons/fire.webp'),
  scared: require('../assets/icons/scared.webp'), noResults: require('../assets/icons/progressquestion.webp'),
  date: require('../assets/icons/date.webp'), good: require('../assets/icons/good.webp'),
  bodyweight: require('../assets/icons/bodyweight.webp'), bench: require('../assets/icons/bench.webp'),
  pullupBar: require('../assets/icons/pullupbar.webp'), kettlebell: require('../assets/icons/kettlebell.webp'),
  bands: require('../assets/icons/bands.webp'), dumbbell: require('../assets/icons/dumbell.webp'),
  barbell: require('../assets/icons/barbellandplates.webp'), expertGym: require('../assets/icons/gymexpert.webp'),
  intermediateGym: require('../assets/icons/gymintermediate.webp'), someExpGym: require('../assets/icons/gymsomeexperience.webp'),
  beginnerGym: require('../assets/icons/gymbeginner.webp'), home: require('../assets/icons/home.webp'),
  female: require('../assets/icons/female.webp'), male: require('../assets/icons/male.webp'),
  mixOfBoth: require('../assets/icons/mixofboth.webp'), back: require('../assets/icons/back.webp'),
  squatMachine: require('../assets/icons/squatmachine.webp'), backMachine: require('../assets/icons/backmachine.webp'),
  chestMachine: require('../assets/icons/chestmachine.webp'), legMachine: require('../assets/icons/legmachine.webp'),
  cableMachine: require('../assets/icons/cablemachine.webp'),
  // trainDuration ("how long have you trained") — one per option, in
  // ascending order.
  justStarting: require('../assets/icons/juststarting.webp'), lessThan6mo: require('../assets/icons/6months.webp'),
  sixTo12mo: require('../assets/icons/12months.webp'), oneToTwoYr: require('../assets/icons/1year.webp'),
  twoToFiveYr: require('../assets/icons/2years.webp'), fiveToTenYr: require('../assets/icons/5years.webp'),
  tenPlusYr: require('../assets/icons/10years.webp'),
  // cardioTypes ("what kind" of cardio)
  running: require('../assets/icons/running.webp'), cycling: require('../assets/icons/cycling.webp'),
  swimming: require('../assets/icons/swimming.webp'), rowing: require('../assets/icons/rowing.webp'),
  hiit: require('../assets/icons/hiit.webp'), walking: require('../assets/icons/walking.webp'),
  sports: require('../assets/icons/sports.webp'),
  // startReason + successVision — "moremuscle" is shared between the two
  // (startReason's "Build muscle" and successVision's "Visibly more
  // muscle" are the same concept in two questions).
  moreMuscle: require('../assets/icons/moremuscle.webp'), trainProperly: require('../assets/icons/trainproperly.webp'),
  getStronger: require('../assets/icons/getstronger.webp'), lookBetter: require('../assets/icons/lookbetter.webp'),
  seeingResults: require('../assets/icons/seeingreusults.webp'), betterForm: require('../assets/icons/betterform.webp'),
  backOnTrack: require('../assets/icons/backontrack.webp'), stayConsistentIcon: require('../assets/icons/stayconsistent.webp'),
  shirtOff: require('../assets/icons/shirtoff.webp'), leanerIcon: require('../assets/icons/leaner.webp'),
  // days ("how many days a week do you train") — one per count, 1-7.
  oneDay: require('../assets/icons/1day.webp'), twoDays: require('../assets/icons/2days.webp'),
  threeDays: require('../assets/icons/3days.webp'), fourDays: require('../assets/icons/4days.webp'),
  fiveDays: require('../assets/icons/5days.webp'), sixDays: require('../assets/icons/6days.webp'),
  sevenDays: require('../assets/icons/7days.webp'),
  // duration (session length) — full set now.
  fifteenMin: require('../assets/icons/15mins.webp'), thirtyMin: require('../assets/icons/30mins.webp'),
  fortyFiveMin: require('../assets/icons/45mins.webp'), sixtyMin: require('../assets/icons/60mins.webp'),
  seventyFiveMin: require('../assets/icons/75mins.webp'),
  // trainTime (time of day)
  morning: require('../assets/icons/morning.webp'), afternoon: require('../assets/icons/afternoon.webp'),
  night: require('../assets/icons/night.webp'),
  // howHeard
  socialMedia: require('../assets/icons/socialmedia.webp'), shareLink: require('../assets/icons/sharelink.webp'),
  appStore: require('../assets/icons/appstore.webp'), search: require('../assets/icons/search.webp'),
  other: require('../assets/icons/other.webp'),
  // followPlan
  yes: require('../assets/icons/yes.webp'), no: require('../assets/icons/no.webp'),
  onAndOff: require('../assets/icons/onandoff.webp'),
  // trainingLocation bubbles — transparent-background variants made for
  // sitting directly on the gradient bubble art (see LocationBubbles).
  homeNoBg: require('../assets/icons/homenobg.webp'), gymNoBg: require('../assets/icons/gymnobg.webp'),
  mixNoBg: require('../assets/icons/homeandgymnobg.webp'),
  // notifications
  notifOn: require('../assets/icons/notison.webp'), notifOff: require('../assets/icons/notisoff.webp'),
  // injury math's closing "lock it in" moment
  fingerprint: require('../assets/icons/fingerprint.webp'),
} as const;

// ── Content model ────────────────────────────────────────────────────────

interface OptionDef { label: string; sfSymbol?: string; customIcon?: any }
interface Segment { text: string; accent?: boolean }
type TurnBase = { id: string; showIf?: (a: Record<string, any>) => boolean };
type Turn =
  | (TurnBase & { kind: 'fact'; segments: Segment[]; visual?: 'effortBars' | 'planChart' })
  | (TurnBase & { kind: 'text'; prompt: string; placeholder: string })
  | (TurnBase & { kind: 'select'; prompt: string; options: OptionDef[] | ((a: Record<string, any>) => OptionDef[]) })
  | (TurnBase & { kind: 'multiselect'; prompt: string; options: OptionDef[] | ((a: Record<string, any>) => OptionDef[]); clearAllOption?: string })
  | (TurnBase & { kind: 'wheel'; prompt: string; wheelKind: 'age' | 'height' })
  | (TurnBase & { kind: 'ruler'; prompt: string })
  | (TurnBase & { kind: 'locationBubbles'; prompt: string })
  | (TurnBase & { kind: 'guessSlider'; prompt: string })
  | (TurnBase & { kind: 'mathReveal'; variant: 'wastedReps' | 'injury' })
  | (TurnBase & { kind: 'mathLine'; segments: Segment[]; checkIn: string; special?: 'lockIn' })
  | (TurnBase & { kind: 'wastedRepsPayoff' })
  | (TurnBase & { kind: 'reversalScreen' })
  // The whole rank run (6 screens) is full-screen overlays, same pattern
  // as wastedRepsPayoff/reversalScreen — none of these render through the
  // normal ActiveTurn/PastTurn scrolling-turn path at all.
  | (TurnBase & { kind: 'rankIntro' })
  | (TurnBase & { kind: 'rankFloating' })
  | (TurnBase & { kind: 'rankFilling' })
  | (TurnBase & { kind: 'rankAssess' })
  | (TurnBase & { kind: 'rankReveal' })
  | (TurnBase & { kind: 'rankProjection' })
  | (TurnBase & { kind: 'reviews'; prompt: string })
  | (TurnBase & { kind: 'planReveal'; prompt: string });

const fact = (id: string, segments: Segment[], visual?: 'effortBars' | 'planChart'): Turn => ({ id, kind: 'fact', segments, visual });

function resolveOptions(turn: Extract<Turn, { kind: 'select' }>, answers: Record<string, any>): OptionDef[] {
  return typeof turn.options === 'function' ? turn.options(answers) : turn.options;
}

function resolveMultiOptions(turn: Extract<Turn, { kind: 'multiselect' }>, answers: Record<string, any>): OptionDef[] {
  return typeof turn.options === 'function' ? turn.options(answers) : turn.options;
}

const FLOW: Turn[] = [
  { id: 'name', kind: 'text', prompt: "Hey — I'm going to build your training plan. What should I call you?", placeholder: 'Your name' },

  { id: 'age', kind: 'wheel', wheelKind: 'age', prompt: 'How old are you?' },
  { id: 'height', kind: 'wheel', wheelKind: 'height', prompt: 'How tall are you?' },
  { id: 'weight', kind: 'ruler', prompt: 'What do you weigh?' },
  { id: 'sex', kind: 'select', prompt: "What's your sex?", options: [
    { label: 'Male', sfSymbol: 'person.fill', customIcon: ICON.male },
    { label: 'Female', sfSymbol: 'person.fill', customIcon: ICON.female },
  ]},

  // Moved up near the basics — both math blocks later need real weeks-
  // trained data, not a placeholder default. Reworded to be unmistakably
  // about TIME (was "how many years/months," similar enough to "experience
  // level" below that they read as the same question twice) — this one is
  // now explicitly framed as duration, that one as knowledge/skill.
  { id: 'trainDuration', kind: 'select', prompt: 'How long have you actually been training, in months or years?', options: [
    { label: 'Just starting', sfSymbol: 'sparkles', customIcon: ICON.justStarting },
    { label: '1-6 months', sfSymbol: 'clock.fill', customIcon: ICON.lessThan6mo },
    { label: '6-12 months', sfSymbol: 'clock.fill', customIcon: ICON.sixTo12mo },
    { label: '1-2 years', sfSymbol: 'calendar', customIcon: ICON.oneToTwoYr },
    { label: '2-5 years', sfSymbol: 'calendar', customIcon: ICON.twoToFiveYr },
    { label: '5-10 years', sfSymbol: 'calendar', customIcon: ICON.fiveToTenYr },
    { label: '10+ years', sfSymbol: 'calendar', customIcon: ICON.tenPlusYr },
  ]},

  { id: 'startReason', kind: 'select', prompt: 'What made you decide to start FormPal?', options: [
    { label: 'Build muscle', sfSymbol: 'dumbbell.fill', customIcon: ICON.moreMuscle },
    { label: 'Look better, feel confident', sfSymbol: 'star.fill', customIcon: ICON.lookBetter },
    { label: 'Learn to train properly', sfSymbol: 'camera.fill', customIcon: ICON.trainProperly },
    { label: 'Get back on track', sfSymbol: 'arrow.triangle.2.circlepath', customIcon: ICON.backOnTrack },
    { label: 'Stay consistent', sfSymbol: 'repeat', customIcon: ICON.stayConsistentIcon },
  ]},

  // Reworded from "Your experience level?" — that read as a duplicate of
  // trainDuration above. This one is explicitly about SKILL/KNOWLEDGE
  // (how much you know), not time (how long you've done it).
  { id: 'experience', kind: 'select', prompt: 'How much do you actually know about proper training and form?', options: [
    { label: 'Beginner', sfSymbol: '1.circle.fill', customIcon: ICON.beginnerGym },
    { label: 'Some experience', sfSymbol: '2.circle.fill', customIcon: ICON.someExpGym },
    { label: 'Intermediate', sfSymbol: '3.circle.fill', customIcon: ICON.intermediateGym },
    { label: 'Advanced', sfSymbol: '4.circle.fill', customIcon: ICON.expertGym },
  ]},

  // followPlan primes fact1 right after it — their reaction to this answer
  // ("No — that's about to change" etc.) sets up the structured-plan stat
  // that immediately follows.
  { id: 'followPlan', kind: 'select', prompt: 'Do you currently follow a structured training plan?', options: [
    { label: 'Yes', sfSymbol: 'checkmark.circle.fill', customIcon: ICON.yes },
    { label: 'No — I wing it', sfSymbol: 'xmark.circle.fill', customIcon: ICON.no },
    { label: 'On and off', sfSymbol: 'arrow.triangle.2.circlepath', customIcon: ICON.onAndOff },
  ]},
  fact('fact1', [
    { text: 'Did you know lifters who follow a structured plan build ' },
    { text: '2-3x more muscle?', accent: true },
  ], 'planChart'),

  // Branches by experience — a beginner's "in the way" is different from
  // an advanced lifter's. Both lists end in a real "Nothing" option.
  { id: 'struggle', kind: 'multiselect', prompt: "What's been holding your training back?", clearAllOption: 'Nothing — just ready to start',
    showIf: a => a.experience !== 'Beginner',
    options: [
      { label: 'Not seeing results', sfSymbol: 'minus.circle.fill', customIcon: ICON.noResults },
      { label: "Not sure if I'm training right", sfSymbol: 'questionmark.circle.fill', customIcon: ICON.notSure },
      { label: 'Staying consistent', sfSymbol: 'repeat', customIcon: ICON.days },
      { label: 'Losing motivation', sfSymbol: 'flame.fill', customIcon: ICON.scared },
      { label: 'Injuries or pain', sfSymbol: 'bandage.fill', customIcon: ICON.wrist },
      { label: 'Nothing — just ready to start', sfSymbol: 'checkmark.circle.fill', customIcon: ICON.good },
    ],
  },
  { id: 'frustration', kind: 'select', prompt: 'What frustrates you most about your training?',
    showIf: a => a.experience !== 'Beginner',
    options: [
    { label: 'Not seeing results', sfSymbol: 'minus.circle.fill', customIcon: ICON.noResults },
    { label: "Don't know if I'm doing it right", sfSymbol: 'questionmark.circle.fill', customIcon: ICON.notSure },
    { label: 'Staying consistent', sfSymbol: 'repeat', customIcon: ICON.days },
    { label: 'Nothing really', sfSymbol: 'checkmark.circle.fill', customIcon: ICON.good },
  ]},
  { id: 'formConfidence', kind: 'select', prompt: 'Do you actually know if your form is right?', options: [
    { label: 'Yes', sfSymbol: 'checkmark.seal.fill', customIcon: ICON.yes },
    { label: 'Not sure', sfSymbol: 'questionmark.circle.fill', customIcon: ICON.notSure },
    { label: 'No idea', sfSymbol: 'xmark.circle.fill', customIcon: ICON.no },
  ]},

  // "Get stronger" and "Build muscle" used to be separate, redundant
  // options — merged into one.
  { id: 'goal', kind: 'multiselect', prompt: 'What are your goals?', options: [
    { label: 'Build muscle & strength', sfSymbol: 'dumbbell.fill', customIcon: ICON.muscle },
    { label: 'Lose weight', sfSymbol: 'flame.fill', customIcon: ICON.scale },
    { label: 'Improve form', sfSymbol: 'camera.fill', customIcon: ICON.camera },
    { label: 'Stay consistent', sfSymbol: 'repeat', customIcon: ICON.days },
    { label: 'General fitness', sfSymbol: 'heart.fill', customIcon: ICON.heart },
  ]},

  fact('fact2', [
    { text: 'Did you know? Without good form, you only get back ' },
    { text: 'a fraction of the work', accent: true },
    { text: ' you put in.' },
  ], 'effortBars'),

  { id: 'injuries', kind: 'multiselect', prompt: 'Any injuries or areas that hurt?', clearAllOption: 'No injuries — all clear', options: [
    { label: 'Knees', sfSymbol: 'figure.walk', customIcon: ICON.knee },
    { label: 'Shoulders', sfSymbol: 'figure.arms.open', customIcon: ICON.shoulder },
    { label: 'Lower back', sfSymbol: 'figure.cooldown', customIcon: ICON.back },
    { label: 'Wrists', sfSymbol: 'hand.raised.fill', customIcon: ICON.wrist },
    { label: 'Neck', sfSymbol: 'figure.stand', customIcon: ICON.neck },
    { label: 'Hips', sfSymbol: 'figure.run', customIcon: ICON.hip },
    { label: 'No injuries — all clear', sfSymbol: 'checkmark.circle.fill', customIcon: ICON.good },
  ]},

  // The home/gym/both question — the bubbles ARE the answer options now
  // (tap a bubble to pick it), not a separate select list followed by a
  // decorative bubbles interstitial. See LocationBubbles below.
  { id: 'trainingLocation', kind: 'locationBubbles', prompt: 'Where do you train?' },

  { id: 'homeEquipment', kind: 'multiselect', prompt: 'Equipment you have at home?',
    showIf: a => a.trainingLocation === 'Home' || a.trainingLocation === 'Mix of both',
    clearAllOption: 'Nothing — bodyweight only',
    options: [
      { label: 'Dumbbells', sfSymbol: 'dumbbell.fill', customIcon: ICON.dumbbell },
      { label: 'Resistance bands', sfSymbol: 'figure.flexibility', customIcon: ICON.bands },
      { label: 'Kettlebells', sfSymbol: 'figure.strengthtraining.functional', customIcon: ICON.kettlebell },
      { label: 'Pull-up bar', sfSymbol: 'figure.gymnastics', customIcon: ICON.pullupBar },
      { label: 'Bench', sfSymbol: 'rectangle.fill', customIcon: ICON.bench },
      { label: 'Barbell & plates', sfSymbol: 'figure.strengthtraining.traditional', customIcon: ICON.barbell },
      { label: 'Nothing — bodyweight only', sfSymbol: 'figure.walk', customIcon: ICON.bodyweight },
    ],
  },
  { id: 'gymMissingEquipment', kind: 'multiselect', prompt: 'Anything your gym is missing?',
    showIf: a => a.trainingLocation === 'Gym' || a.trainingLocation === 'Mix of both',
    clearAllOption: 'It has everything',
    options: [
      { label: 'Free weights', sfSymbol: 'dumbbell.fill', customIcon: ICON.dumbbell },
      { label: 'Cable machines', sfSymbol: 'figure.strengthtraining.functional', customIcon: ICON.cableMachine },
      { label: 'Leg machines', sfSymbol: 'figure.walk', customIcon: ICON.legMachine },
      { label: 'Chest / press machines', sfSymbol: 'figure.strengthtraining.traditional', customIcon: ICON.chestMachine },
      { label: 'Back / row machines', sfSymbol: 'figure.rower', customIcon: ICON.backMachine },
      { label: 'Squat rack', sfSymbol: 'figure.cross.training', customIcon: ICON.squatMachine },
      { label: 'It has everything', sfSymbol: 'checkmark.circle.fill', customIcon: ICON.allGood },
    ],
  },

  // The ONE frequency question — replaces the old duplicate (this used to
  // be asked twice: once as "days a week" for the plan, again as "times a
  // week" for the reps math). Both now read this single answer. Capped at
  // 6 for beginners/some-experience; Intermediate/Advanced can go to 7.
  { id: 'days', kind: 'select', prompt: 'How many days a week do you train?', options: (a) => {
      const advanced = a.experience === 'Intermediate' || a.experience === 'Advanced';
      const max = advanced ? 7 : 6;
      const DAY_ICONS = [ICON.oneDay, ICON.twoDays, ICON.threeDays, ICON.fourDays, ICON.fiveDays, ICON.sixDays, ICON.sevenDays];
      return Array.from({ length: max }, (_, i) => ({ label: `${i + 1} day${i === 0 ? '' : 's'}`, sfSymbol: `${i + 1}.circle.fill`, customIcon: DAY_ICONS[i] }));
    },
  },
  { id: 'duration', kind: 'select', prompt: 'How long per session?', options: [
    { label: '15-20 min', sfSymbol: 'clock.fill', customIcon: ICON.fifteenMin },
    { label: '30 min', sfSymbol: 'clock.fill', customIcon: ICON.thirtyMin },
    { label: '45 min', sfSymbol: 'clock.fill', customIcon: ICON.fortyFiveMin },
    { label: '60 min', sfSymbol: 'clock.fill', customIcon: ICON.sixtyMin },
    { label: '75+ min', sfSymbol: 'clock.fill', customIcon: ICON.seventyFiveMin },
  ]},

  // ── MIDDLE-OF-FLOW math beat — injury math. `days` and `trainDuration`
  // (asked early, near the basics) are both known by now, so its numbers
  // are real, not placeholders. Deliberately far from the wasted-reps peak
  // below — that one moved to the very end, this one stays here as a
  // value beat between ordinary questions, never adjacent to it.
  { id: 'injuryReveal', kind: 'mathReveal', variant: 'injury' },
  // Connecting beat — bridges the fingerprint lock-in wash back into the
  // ordinary flow instead of cutting straight to the next question.
  fact('injuryToCardio', [
    { text: "You're locked in. Now let's see where you stand..." },
  ]),

  { id: 'cardio', kind: 'select', prompt: 'Do you do any cardio or other training?', options: [
    { label: 'Yes, regularly', sfSymbol: 'figure.run', customIcon: ICON.running },
    { label: 'Sometimes', sfSymbol: 'figure.walk', customIcon: ICON.walking },
    { label: 'No, just lifting', sfSymbol: 'dumbbell.fill', customIcon: ICON.dumbbell },
    { label: 'I want to add some', sfSymbol: 'plus.circle.fill', customIcon: ICON.fire },
  ]},
  { id: 'cardioTypes', kind: 'multiselect', prompt: 'What kind?',
    showIf: a => a.cardio === 'Yes, regularly' || a.cardio === 'Sometimes',
    options: [
      { label: 'Running', sfSymbol: 'figure.run', customIcon: ICON.running },
      { label: 'Cycling', sfSymbol: 'bicycle', customIcon: ICON.cycling },
      { label: 'Swimming', sfSymbol: 'figure.pool.swim', customIcon: ICON.swimming },
      { label: 'Rowing', sfSymbol: 'figure.rower', customIcon: ICON.rowing },
      { label: 'HIIT', sfSymbol: 'bolt.fill', customIcon: ICON.hiit },
      { label: 'Walking', sfSymbol: 'figure.walk', customIcon: ICON.walking },
      { label: 'Sports', sfSymbol: 'sportscourt.fill', customIcon: ICON.sports },
    ],
  },
  { id: 'trainTime', kind: 'select', prompt: 'What time of day do you usually train?', options: [
    { label: 'Morning', sfSymbol: 'sunrise.fill', customIcon: ICON.morning },
    { label: 'Afternoon', sfSymbol: 'sun.max.fill', customIcon: ICON.afternoon },
    { label: 'Evening', sfSymbol: 'moon.stars.fill', customIcon: ICON.night },
    { label: 'Varies', sfSymbol: 'shuffle', customIcon: ICON.onAndOff },
  ]},
  { id: 'successVision', kind: 'select', prompt: 'What does success look like in 6 months?', options: [
    { label: 'Visibly more muscle', sfSymbol: 'dumbbell.fill', customIcon: ICON.moreMuscle },
    { label: 'Noticeably stronger lifts', sfSymbol: 'bolt.fill', customIcon: ICON.getStronger },
    { label: 'Leaner and more defined', sfSymbol: 'flame.fill', customIcon: ICON.leanerIcon },
    { label: 'Confident with my shirt off', sfSymbol: 'star.fill', customIcon: ICON.shirtOff },
    { label: 'Finally seeing results', sfSymbol: 'checkmark.circle.fill', customIcon: ICON.seeingResults },
    { label: 'Knowing my form is right', sfSymbol: 'camera.fill', customIcon: ICON.betterForm },
  ]},
  { id: 'howHeard', kind: 'select', prompt: 'How did you hear about us?', options: [
    { label: 'Instagram / TikTok', sfSymbol: 'play.rectangle.fill', customIcon: ICON.socialMedia },
    { label: 'Friend or referral', sfSymbol: 'person.2.fill', customIcon: ICON.shareLink },
    { label: 'App Store search', sfSymbol: 'magnifyingglass', customIcon: ICON.appStore },
    { label: 'Google / web search', sfSymbol: 'globe', customIcon: ICON.search },
    { label: 'Other', sfSymbol: 'ellipsis.circle.fill', customIcon: ICON.other },
  ]},
  { id: 'notifications', kind: 'select', prompt: 'Reminders on training days?', options: [
    { label: 'Yes please', sfSymbol: 'bell.fill', customIcon: ICON.notifOn },
    { label: 'No thanks', sfSymbol: 'bell.slash.fill', customIcon: ICON.notifOff },
  ]},

  // ── Hope beat — every question has been asked; nothing below is a
  // question again. Rank system (6 full-screen beats: intro → floating →
  // filling → assess → reveal → projection) / reviews come BEFORE the math
  // peak, so the flow ends on the wasted-reps payoff and the turn, with
  // nothing between that and plan generation. No photos anywhere.
  { id: 'rankIntro', kind: 'rankIntro' },
  { id: 'rankFloating', kind: 'rankFloating' },
  { id: 'rankFilling', kind: 'rankFilling' },
  { id: 'rankAssess', kind: 'rankAssess' },
  { id: 'rankReveal', kind: 'rankReveal' },
  { id: 'rankProjection', kind: 'rankProjection' },
  // Connecting beat — bridges the big rank moment back into the ordinary
  // flow instead of cutting straight to "You're in good company."
  fact('rankToReviews', [
    { text: 'Alright — now let\'s build the plan to get you there.' },
  ]),
  { id: 'reviews', kind: 'reviews', prompt: "You're in good company." },

  // ── THE PEAK — the % question is glued directly to the reveal that
  // follows it (one unit, never split apart). The turn's own prompt IS the
  // math's first real step (the flat assumption), not a "did you know" /
  // "one more thing" throat-clear. Three parts, three separate beats:
  //   A) wastedRepsReveal — normal typed build-up, same mechanism/autoscroll
  //      as every other turn, ends cold on "barely built anything."
  //   B) wastedRepsPayoff — full-screen cinematic count-up, no FormPal
  //      mention, pure emotional impact.
  //   C) formPalReversal — separate full-screen beat, hands the potential
  //      back. White background with the same colorful blob decoration as
  //      every question (AppBackground), deliberately the opposite of B's
  //      dark screen.
  // Nothing after this run except plan generation.
  { id: 'formGuess', kind: 'guessSlider', prompt: 'Out of every rep you do, how many do you think are actually high quality — with good form?' },
  { id: 'wastedRepsReveal', kind: 'mathReveal', variant: 'wastedReps' },
  { id: 'wastedRepsPayoff', kind: 'wastedRepsPayoff' },
  { id: 'formPalReversal', kind: 'reversalScreen' },

  // Last screen before a paywall would go — not building the paywall
  // itself, just the hand-off point.
  { id: 'planReveal', kind: 'planReveal', prompt: "Alright — let's put it all together." },
];

// ── Wheel data (age/height/rank-assessment counts) ──────────────────────

const AGE_OPTIONS = Array.from({ length: 73 }, (_, i) => String(i + 13));
const HEIGHT_OPTIONS: string[] = [];
for (let ft = 4; ft <= 6; ft++) {
  for (let inch = (ft === 4 ? 8 : 0); inch <= (ft === 6 ? 10 : 11); inch++) HEIGHT_OPTIONS.push(`${ft}'${inch}"`);
}
// Rank-assessment counts — same 0-N picker data, but rendered directly by
// RankAssessScreen (all 3 on one page) now, not through the generic `wheel`
// turn kind.
const PUSHUP_OPTIONS = Array.from({ length: 101 }, (_, i) => String(i));
const PULLUP_OPTIONS = Array.from({ length: 51 }, (_, i) => String(i));
const SQUAT_OPTIONS = Array.from({ length: 151 }, (_, i) => String(i));
const WHEEL_OPTIONS: Record<string, string[]> = { age: AGE_OPTIONS, height: HEIGHT_OPTIONS };

// ── Weight ruler (duplicated from app/onboarding.tsx's WeightRulerSlider —
// same tick-mark/drag mechanics, restyled to this screen's palette) ───────

const WEIGHT_MIN = 70, WEIGHT_MAX = 400, TICK_GAP = 14, TICK_TRACK_H = 70;
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

function WeightRuler({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const trackWidth = (WEIGHT_MAX - WEIGHT_MIN) * TICK_GAP;
  const pxFromValue = (v: number) => Math.max(0, Math.min(trackWidth, (v - WEIGHT_MIN) * TICK_GAP));
  const valueFromPx = (px: number) => WEIGHT_MIN + px / TICK_GAP;

  const [displayVal, setDisplayVal] = useState(value);
  const [viewportWidth, setViewportWidth] = useState(300);
  const valuePx  = useRef(new Animated.Value(pxFromValue(value))).current;
  const startRef = useRef(pxFromValue(value));
  const lastTickRef = useRef(Math.round(value));
  // The decimal digit blurs while actively dragging and sharpens back into
  // focus once you settle — the reference image's look (crisp whole
  // number, soft/blurred tenths digit mid-scrub).
  const blurAmount = useRef(new Animated.Value(0)).current;
  const settleTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Release used to just hard-set the final value with no carry-through —
  // the strip stopped dead exactly where the finger let go, which is why
  // it felt stiff instead of like a real ruler. A real drag-to-scrub
  // control (this is the same "flick and it glides to a stop" feel Cal
  // AI's own numeric pickers and native iOS scroll views use) has to
  // carry the release velocity into the settle instead of discarding it.
  // Animated.spring's own `velocity` option does exactly that — the strip
  // keeps moving in the direction/speed you released it at and eases into
  // the final tick instead of snapping.
  const settleAnim = useRef<Animated.CompositeAnimation | null>(null);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        settleAnim.current?.stop();
        startRef.current = (valuePx as any)._value ?? pxFromValue(value);
        if (settleTimeout.current) clearTimeout(settleTimeout.current);
        Animated.timing(blurAmount, { toValue: 14, duration: 100, useNativeDriver: false }).start();
      },
      onPanResponderMove: (_, gs) => {
        const raw = startRef.current - gs.dx;
        const next = Math.max(0, Math.min(trackWidth, raw));
        valuePx.setValue(next);
        const v = Math.round(valueFromPx(next) * 10) / 10;
        setDisplayVal(v);
        onChange(v);
        const wholeLb = Math.round(v);
        if (wholeLb !== lastTickRef.current) { lastTickRef.current = wholeLb; void Haptics.selectionAsync(); }
      },
      onPanResponderRelease: (_, gs) => {
        const raw = startRef.current - gs.dx;
        const velocity = -gs.vx;
        // Project a little further in the direction of the flick before
        // settling, so a fast flick visibly travels past where the finger
        // literally lifted — the "glide" part of the feel.
        const projected = Math.max(0, Math.min(trackWidth, raw + velocity * 140));
        const v = Math.round(valueFromPx(projected) * 10) / 10;
        const target = pxFromValue(v);
        setDisplayVal(v);
        onChange(v);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        const anim = Animated.spring(valuePx, { toValue: target, velocity, friction: 9, tension: 80, useNativeDriver: false });
        settleAnim.current = anim;
        anim.start();
        settleTimeout.current = setTimeout(() => {
          Animated.timing(blurAmount, { toValue: 0, duration: 340, useNativeDriver: false }).start();
        }, 220);
      },
    })
  ).current;

  useEffect(() => () => {
    if (settleTimeout.current) clearTimeout(settleTimeout.current);
    settleAnim.current?.stop();
  }, []);

  const [whole, decimal] = displayVal.toFixed(1).split('.');

  const stripTranslateX = valuePx.interpolate({
    inputRange: [0, trackWidth], outputRange: [viewportWidth / 2, viewportWidth / 2 - trackWidth],
  });
  const ticks = useMemo(() => {
    const out: { left: number; major: boolean }[] = [];
    for (let i = 0; i <= WEIGHT_MAX - WEIGHT_MIN; i++) out.push({ left: i * TICK_GAP, major: i % 10 === 0 });
    return out;
  }, []);

  return (
    <View style={{ alignItems: 'center', marginTop: 14 }}>
      <View style={rulerStyles.valueRow}>
        <Text style={rulerStyles.value}>{whole}.</Text>
        <View style={rulerStyles.decimalWrap}>
          <Text style={rulerStyles.value}>{decimal}</Text>
          <AnimatedBlurView intensity={blurAmount} tint="light" style={StyleSheet.absoluteFill} pointerEvents="none" />
        </View>
        <Text style={[rulerStyles.value, rulerStyles.unit]}> lbs</Text>
      </View>
      <View
        style={{ width: '100%', height: TICK_TRACK_H, overflow: 'hidden' }}
        onLayout={e => setViewportWidth(e.nativeEvent.layout.width)}
        {...panResponder.panHandlers}
      >
        <Animated.View style={{ width: trackWidth, height: TICK_TRACK_H, transform: [{ translateX: stripTranslateX }] }}>
          {ticks.map((t, i) => (
            <View key={i} style={{ position: 'absolute', left: t.left, bottom: 0, width: 3, height: t.major ? 38 : 20, backgroundColor: 'rgba(17,24,39,0.14)', borderRadius: 1.5 }} />
          ))}
          <Animated.View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: valuePx, overflow: 'hidden' }}>
            {ticks.map((t, i) => (
              <View key={i} style={{ position: 'absolute', left: t.left, bottom: 0, width: 3, height: t.major ? 38 : 20, backgroundColor: DARK, borderRadius: 1.5 }} />
            ))}
          </Animated.View>
        </Animated.View>
        <View pointerEvents="none" style={{ position: 'absolute', bottom: 0, left: viewportWidth / 2 - 2, width: 4, height: 52, backgroundColor: DARK, borderRadius: 2 }} />
      </View>
    </View>
  );
}

const rulerStyles = StyleSheet.create({
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 18 },
  value: { fontSize: 40, fontWeight: '300', color: Col.text, letterSpacing: -1 },
  unit: { fontSize: 18, fontWeight: '400', color: Col.textDim },
  // Fixed width so the blur overlay's frame doesn't jump around as the
  // digit itself changes (a "1" is narrower than a "8", etc.).
  decimalWrap: { width: 24, overflow: 'hidden' },
});

// ── Typewriter ───────────────────────────────────────────────────────────

function useTypewriter(fullText: string, active: boolean, onWord: () => void, onDone: () => void) {
  const [count, setCount] = useState(active ? 0 : fullText.length);
  useEffect(() => {
    if (!active) { setCount(fullText.length); return; }
    setCount(0);
    let i = 0;
    // Was 1 character per 20ms tick — 50 setCount calls/sec, each one
    // forcing a text-reflow layout pass on the growing Text. That layout
    // thrash at that frequency was the actual "choppy," not the animation
    // math. Batching 2 characters per tick at 2x the interval keeps the
    // same overall typing pace (same total duration) with HALF the
    // re-renders.
    const STEP = 2;
    const id = setInterval(() => {
      const next = Math.min(i + STEP, fullText.length);
      for (let j = i; j < next; j++) { if (fullText[j] === ' ') onWord(); }
      i = next;
      setCount(i);
      if (i >= fullText.length) { clearInterval(id); onDone(); }
    }, TYPE_SPEED_MS * STEP);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullText, active]);
  return count;
}

function TypedSegments({ segments, count, style, accentStyle = styles.accent }: { segments: Segment[]; count: number; style: any; accentStyle?: any }) {
  let consumed = 0;
  return (
    <Text style={style}>
      {segments.map((seg, i) => {
        const start = consumed;
        consumed += seg.text.length;
        const visible = Math.max(0, Math.min(seg.text.length, count - start));
        if (visible <= 0) return null;
        return <Text key={i} style={seg.accent ? accentStyle : undefined}>{seg.text.slice(0, visible)}</Text>;
      })}
    </Text>
  );
}

// Brought back from the real interstitial screens' EffortResultsMoment,
// scaled down to sit inline as a fact turn's visual instead of its own
// full screen — the "what you get vs what you put in" bar comparison.
function EffortBars() {
  const effortFill  = useRef(new Animated.Value(0)).current;
  const resultsFill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a1 = Animated.timing(effortFill,  { toValue: 1, duration: 900, delay: 150, useNativeDriver: false });
    const a2 = Animated.timing(resultsFill, { toValue: 1, duration: 900, delay: 150, useNativeDriver: false });
    a1.start();
    a2.start();
    return () => { a1.stop(); a2.stop(); };
  }, []);
  const effortW  = effortFill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const resultsW = resultsFill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '40%'] });
  return (
    <View style={styles.barsWrap}>
      <View>
        <View style={styles.barHead}>
          <Text style={styles.barLabel}>Effort you put in</Text>
          <Text style={[styles.barPct, styles.accent]}>100%</Text>
        </View>
        <View style={styles.barTrack}><Animated.View style={[styles.barFill, { width: effortW, backgroundColor: ACCENT }]} /></View>
      </View>
      <View>
        <View style={styles.barHead}>
          <Text style={styles.barLabel}>Results you get</Text>
          <Text style={styles.barPct}>40%</Text>
        </View>
        <View style={styles.barTrack}><Animated.View style={[styles.barFill, { width: resultsW, backgroundColor: DARK }]} /></View>
      </View>
    </View>
  );
}

// Brought back from the real interstitial screens' PlanGrowthMoment,
// scaled down to sit inline — the "muscle gained" line chart, grey/flat
// "without a plan" vs blue/steep "with a plan", drawing in.
const AnimatedPath = Animated.createAnimatedComponent(SvgPath);
const AnimatedCircle = Animated.createAnimatedComponent(SvgCircle);
const CHART_LINE_LEN = 340;

function PlanGrowthChart() {
  const greyProgress = useRef(new Animated.Value(0)).current;
  const blueProgress = useRef(new Animated.Value(0)).current;
  const endDot = useRef(new Animated.Value(0)).current;
  // Crash fix: the endDot spring used to be kicked off from inside the
  // blueProgress timing's completion callback with no way to cancel it. If
  // this component unmounted (turn advanced) while that spring was still
  // settling — springs don't have a fixed duration — the native driver kept
  // trying to update a view that no longer existed: "Unable to find node on
  // an unmounted component". Fix: keep handles to every running animation
  // and .stop() all of them on unmount, and never START the spring if the
  // timing that triggers it didn't finish (i.e. we're already unmounting).
  useEffect(() => {
    const greyAnim = Animated.timing(greyProgress, { toValue: 1, duration: 1000, delay: 150, useNativeDriver: false });
    const blueAnim = Animated.timing(blueProgress, { toValue: 1, duration: 1300, delay: 300, useNativeDriver: false });
    let dotAnim: Animated.CompositeAnimation | null = null;
    greyAnim.start();
    blueAnim.start(({ finished }) => {
      if (!finished) return;
      dotAnim = Animated.spring(endDot, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true });
      dotAnim.start();
    });
    return () => {
      greyAnim.stop();
      blueAnim.stop();
      dotAnim?.stop();
    };
  }, []);
  const greyDashoffset = greyProgress.interpolate({ inputRange: [0, 1], outputRange: [CHART_LINE_LEN, 0] });
  const blueDashoffset = blueProgress.interpolate({ inputRange: [0, 1], outputRange: [CHART_LINE_LEN, 0] });
  return (
    <View style={styles.chartWrap}>
      <Text style={styles.chartLabelBig}>Muscle gained</Text>
      <Svg width="100%" height={220} viewBox="0 0 360 190">
        <SvgLine x1={30} y1={14} x2={30} y2={160} stroke="#E2E2E8" strokeWidth={1} />
        <SvgLine x1={30} y1={160} x2={330} y2={160} stroke="#E2E2E8" strokeWidth={1} />
        <AnimatedPath d="M30 152 C 120 150 226 144 322 138" stroke="#C7C7CE" strokeWidth={3} strokeLinecap="round" fill="none"
          strokeDasharray={`${CHART_LINE_LEN} ${CHART_LINE_LEN}`} strokeDashoffset={greyDashoffset} />
        <AnimatedPath d="M30 152 C 130 146 210 110 322 30" stroke={ACCENT} strokeWidth={3} strokeLinecap="round" fill="none"
          strokeDasharray={`${CHART_LINE_LEN} ${CHART_LINE_LEN}`} strokeDashoffset={blueDashoffset} />
        <AnimatedCircle cx={322} cy={30} r={5} fill={ACCENT} opacity={endDot} />
        <SvgText x={316} y={20} textAnchor="end" fontSize={13} fill={ACCENT}>With a plan</SvgText>
        <SvgText x={316} y={124} textAnchor="end" fontSize={13} fill={Col.textSub}>Without a plan</SvgText>
        <SvgText x={30} y={178} fontSize={12} fill={Col.textDim}>Week 1</SvgText>
        <SvgText x={330} y={178} textAnchor="end" fontSize={12} fill={Col.textDim}>Week 12</SvgText>
      </Svg>
    </View>
  );
}

// ── LocationBubbles — 3 overlapping gradient spheres (Home/Gym/Mix) that
// ARE the answer options — tapping one picks it, it isn't just decoration
// followed by a separate select list anymore. Uses `selected`/`onPick` the
// same way the plain pill-select turns use `selectTemp`/`onPickOption` —
// pick-then-Continue, not tap-to-commit.
//
// Rebuilt after the bubbles shipped blank and untappable. Root cause: the
// old version put an inner `Pressable` with `StyleSheet.absoluteFill`
// *inside* an outer `Animated.View` that was itself `position:'absolute'`
// with its size coming from a second, separately-merged style object
// (`b.style`) — a child stretching via `top/right/bottom/left:0` inside an
// absolutely-positioned parent whose own size comes from a merged style
// array is exactly the kind of layout Yoga sometimes fails to resolve
// (ends up 0-sized — invisible content, untappable, but the OUTER view's
// own background/border can still paint, which is why 3 blank circles were
// visible). Fixed by using one `Animated.createAnimatedComponent(Pressable)`
// as the single element carrying position, size, animation AND the tap
// handler — no nested absoluteFill child, nothing for Yoga to get wrong.
// Custom webp icons were swapped for SF Symbols at the time this was fixed,
// so there was no asset-loading uncertainty left in the mix while chasing
// the layout bug. Dedicated transparent-background art (see ICON.homeNoBg
// etc.) exists now specifically for sitting on this gradient, so it's back
// — the icon itself is a plain, non-absolutely-positioned leaf inside
// `bubbleGradient` below, nothing to do with the absoluteFill nesting bug
// that was actually the root cause, so swapping it is safe.
const AnimatedBubblePressable = Animated.createAnimatedComponent(Pressable);

const BUBBLES: { label: string; sub: string; icon: string; customIcon: any; colors: [string, string]; style: any }[] = [
  { label: 'Home', sub: 'Minimal kit', icon: 'house.fill', customIcon: ICON.homeNoBg, colors: ['#FFD9A8', '#FF9F5A'], style: { top: 0, right: 6, width: 168, height: 168 } },
  { label: 'Gym', sub: 'Full rack', icon: 'figure.strengthtraining.traditional', customIcon: ICON.gymNoBg, colors: ['#BFE0FF', '#5AA9FF'], style: { top: 118, left: 0, width: 190, height: 190 } },
  { label: 'Mix of both', sub: 'Flexible', icon: 'shuffle', customIcon: ICON.mixNoBg, colors: ['#E3D6FF', '#B79CFF'], style: { top: 190, right: 0, width: 176, height: 176 } },
];

function LocationBubbles({ selected, onPick }: { selected: string | null; onPick: (label: string) => void }) {
  // Entrance history: originally popped in from scale:0 via a native-driver
  // spring — reported as "only appear after you tap them" (a native-driver
  // animation kicked off the instant a view mounts is a known rough edge:
  // it can silently fail to flush its first frame). Removing the animation
  // entirely fixed the visibility bug but then read as "just spawn in, no
  // animation at all." Fixed properly this time: JS-driven (useNativeDriver:
  // false — goes through the normal render path, immune to the native-
  // driver-on-fresh-mount flakiness that broke this originally) AND starting
  // from an already-mostly-visible state (0.5 opacity / 0.92 scale, not 0),
  // so even in the worst case where the animation never advances a single
  // frame, the bubbles are still clearly there — the animation can only add
  // polish on top of "definitely visible," never gate it.
  const entrance = useRef(BUBBLES.map(() => new Animated.Value(0.5))).current;
  const driftX = useRef(BUBBLES.map(() => new Animated.Value(0))).current;
  const driftY = useRef(BUBBLES.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const entranceAnims = entrance.map((v, i) =>
      Animated.timing(v, { toValue: 1, duration: 480, delay: i * 90, easing: Easing.out(Easing.cubic), useNativeDriver: false })
    );
    entranceAnims.forEach(a => a.start());

    const driftLoops = BUBBLES.map((_, i) => {
      const xDur = 3600 + i * 620;
      const yDur = 4200 + i * 540;
      const xLoop = Animated.loop(Animated.sequence([
        Animated.timing(driftX[i], { toValue: 1, duration: xDur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(driftX[i], { toValue: -1, duration: xDur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(driftX[i], { toValue: 0, duration: xDur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]));
      const yLoop = Animated.loop(Animated.sequence([
        Animated.timing(driftY[i], { toValue: 1, duration: yDur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(driftY[i], { toValue: -1, duration: yDur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(driftY[i], { toValue: 0, duration: yDur, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]));
      // Stagger the drift start so they don't all breathe in unison —
      // part of what makes it read as independent bubbles vs. one group.
      setTimeout(() => { xLoop.start(); yLoop.start(); }, i * 240);
      return [xLoop, yLoop];
    }).flat();

    // This loop never resolves on its own — without stopping it here, an
    // unmount (turn advances via the new Continue button) leaves the native
    // driver trying to update a view that no longer exists, the same class
    // of crash fixed on PlanGrowthChart above.
    return () => {
      entranceAnims.forEach(a => a.stop());
      driftLoops.forEach(l => l.stop());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={styles.bubblesWrap}>
      {BUBBLES.map((b, i) => {
        const tx = driftX[i].interpolate({ inputRange: [-1, 1], outputRange: [-9, 9] });
        const ty = driftY[i].interpolate({ inputRange: [-1, 1], outputRange: [-7, 7] });
        const scale = entrance[i].interpolate({ inputRange: [0.5, 1], outputRange: [0.92, 1] });
        const isSel = selected === b.label;
        return (
          <AnimatedBubblePressable
            key={b.label}
            onPress={() => onPick(b.label)}
            style={[styles.bubble, b.style, isSel && styles.bubbleSel, { opacity: entrance[i], transform: [{ scale }, { translateX: tx }, { translateY: ty }] }]}
          >
            {/* Dimmed gradient base, then a frost layer over it — the
                BlurView blurs whatever's behind it in the stack (this
                gradient), so the icon/text below have to render AFTER it
                to stay crisp instead of getting frosted along with the
                background. */}
            {/* Was opacity 0.72 gradient + intensity-22 frost — that combo
                washed the color out toward grey/white (frost lightens and
                desaturates whatever's behind it). Bumped the gradient to
                near-full opacity and cut the frost intensity way down so
                the actual bubble color reads clearly; just enough blur left
                for a faint glassy edge, not enough to grey it out. */}
            <LinearGradient colors={b.colors} start={{ x: 0.15, y: 0.1 }} end={{ x: 0.9, y: 1 }} style={[StyleSheet.absoluteFill, { opacity: 0.94 }]} />
            <BlurView intensity={8} tint="light" style={StyleSheet.absoluteFill} pointerEvents="none" />
            <View pointerEvents="none" style={styles.bubbleHighlight} />
            <View style={styles.bubbleGradient} pointerEvents="none">
              {b.customIcon
                ? <Image source={b.customIcon} style={{ width: 28, height: 28, marginBottom: 4 }} resizeMode="contain" />
                : <SymbolView name={b.icon as any} size={26} tintColor="#241708" type="monochrome" style={{ width: 26, height: 26, marginBottom: 4 }} />}
              <Text style={styles.bubbleLabel}>{b.label}</Text>
              <Text style={styles.bubbleSub}>{b.sub}</Text>
            </View>
            {isSel && (
              <View style={styles.bubbleCheck} pointerEvents="none">
                <SymbolView name="checkmark" size={14} tintColor="#fff" type="monochrome" style={{ width: 14, height: 14 }} />
              </View>
            )}
          </AnimatedBubblePressable>
        );
      })}
    </View>
  );
}

// ── RankLadder — horizontal, swipeable, 2-3 ranks in view at a time, with
// a big zoomed-in badge per card. Was a static vertical list showing all 6
// at once with small 34px badges — replaced with a scrollable carousel so
// each rank gets real visual weight instead of being a small row. Was a
// generic colored-circle + SF Symbol placeholder; swapped for the real
// rank badge art now that it exists (assets/ranks/*.png).
// RANKS itself stays Champion → Bronze (used elsewhere for color lookups);
// the carousel displays them ascending, Bronze → Champion, left to right,
// so scrolling right reads as climbing the ladder.

const RANKS: { name: string; color: string; image: any }[] = [
  { name: 'Champion', color: ACCENT, image: require('../assets/ranks/champion.png') },
  // Master sits between Diamond and Champion — matches the real Tier type
  // (lib/sessionLog.ts) and the Rankings page's own tier colors
  // (TIER_META.master.lo in components/MuscleTierMap.tsx), just wasn't in
  // this onboarding-only list yet.
  { name: 'Master', color: '#B98CFF', image: require('../assets/ranks/master.png') },
  { name: 'Diamond', color: '#5AD1E8', image: require('../assets/ranks/diamond.png') },
  { name: 'Platinum', color: '#7FB8D9', image: require('../assets/ranks/platinum.png') },
  { name: 'Gold', color: '#E8B923', image: require('../assets/ranks/gold.png') },
  { name: 'Silver', color: '#9AA5B1', image: require('../assets/ranks/silver.png') },
  { name: 'Bronze', color: '#CD7F32', image: require('../assets/ranks/bronze.png') },
];
const RANKS_ASCENDING = [...RANKS].reverse();
// All 6 rank-run screens — full-screen overlays, never rendered through
// the normal ActiveTurn/PastTurn scrolling-turn path. Used everywhere the
// screen needs to check "is this turn one of the full-screen rank beats."
const RANK_FULLSCREEN_KINDS = new Set(['rankIntro', 'rankFloating', 'rankFilling', 'rankAssess', 'rankReveal', 'rankProjection']);
// Sizing matches the reference build (FormPal Ranks.html) 1:1 at its own
// 390px mockup width: 210px card, 168px badge orb, cards overlapping by
// 18px on each side (CSS `margin: 0 -18px`). Scaled proportionally for
// other screen widths so the same reel reads the same on any device.
const RANK_REF_W = 390;
const RANK_SCALE = Dimensions.get('window').width / RANK_REF_W;
const RANK_CARD_W = Math.round(210 * RANK_SCALE);
const RANK_ORB = Math.round(168 * RANK_SCALE);
const RANK_OVERLAP = Math.round(18 * RANK_SCALE);
// Centers the focused card with the neighbors peeking on either side —
// side padding so the FIRST/LAST card can also land centered, computed
// against the ScrollView's own viewport (screen width minus the outer
// scroll content's own 28px-each-side padding, see styles.scroll). The
// extra `+ RANK_OVERLAP` compensates for the first/last card's own
// negative left/right margin eating into that padding.
const RANK_VIEWPORT_W = Dimensions.get('window').width - 56;
const RANK_SIDE_PAD = Math.max(0, Math.round((RANK_VIEWPORT_W - RANK_CARD_W) / 2)) + RANK_OVERLAP;

// Was a flat horizontal list (every card the same size/opacity regardless
// of scroll position) — reported as "rendering flat." Rebuilt as a real
// coverflow: one Animated.Value tracks scroll offset, and each card's own
// rotateY/scale/opacity are interpolated from ITS distance (in card-steps)
// from that offset — the centered card reads big and flat-on, cards
// further out shrink, dim, and tilt away, matching the reference build
// (FormPal Ranks.html)'s paint() logic (d = clamped offset-from-center in
// step units, rotateY = -d*angle, scale/opacity fall off with distance).
// RANK_STEP is the actual on-screen distance between two card centers,
// i.e. the card width minus the overlap eaten on BOTH sides.
// useNativeDriver:false throughout — this file already prefers JS-driven
// animation for reliability over native-driver edge cases.
const RANK_STEP = RANK_CARD_W - RANK_OVERLAP * 2;

function RankLadder() {
  const scrollX = useRef(new Animated.Value(0)).current;

  return (
    <EntranceFade>
      <View>
        <Animated.ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={RANK_STEP}
          decelerationRate="fast"
          style={styles.rankScroll}
          contentContainerStyle={[styles.rankScrollContent, { paddingHorizontal: RANK_SIDE_PAD }]}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
          scrollEventThrottle={16}
        >
          {RANKS_ASCENDING.map((r, i) => {
            const center = i * RANK_STEP;
            const inputRange = [center - 2 * RANK_STEP, center - RANK_STEP, center, center + RANK_STEP, center + 2 * RANK_STEP];
            const rotateY = scrollX.interpolate({ inputRange, outputRange: ['30deg', '15deg', '0deg', '-15deg', '-30deg'], extrapolate: 'clamp' });
            const scale = scrollX.interpolate({ inputRange, outputRange: [0.68, 0.86, 1.18, 0.86, 0.68], extrapolate: 'clamp' });
            const opacity = scrollX.interpolate({ inputRange, outputRange: [0.3, 0.65, 1, 0.65, 0.3], extrapolate: 'clamp' });
            return (
              <Animated.View
                key={r.name}
                style={[styles.rankCard, { width: RANK_CARD_W, marginHorizontal: -RANK_OVERLAP, opacity, transform: [{ perspective: 700 }, { rotateY }, { scale }] }]}
              >
                <Image source={r.image} resizeMode="contain" style={[styles.rankBadgeImg, { width: RANK_ORB, height: RANK_ORB }]} />
                <Text style={styles.rankNameCarousel}>{r.name}</Text>
              </Animated.View>
            );
          })}
        </Animated.ScrollView>
      </View>
    </EntranceFade>
  );
}

// ── Rank section shell — all 6 screens share ONE consistent black
// background with the colored blobs (MuscleRankBackdrop, the same drifting
// blob treatment the real Rankings page's backdrop already uses), so the
// whole run reads as one continuous experience instead of 6 disconnected
// screens. Only the FIRST screen washes in from the normal (light) onboarding
// flow — every screen after that is already inside this dark world, so no
// repeated wash between them.
function RankShell({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.rankShellOverlay}>
      <MuscleRankBackdrop tier="diamond" />
      {children}
    </View>
  );
}

// ── Body preview — front-only, cropped to the upper half (no legs), used
// on screens 2/3/5 ONLY — this is the one and only place a body map
// appears anywhere in onboarding-test now. BodyMapSide renders the full
// front figure at `width`; the fixed-height, overflow:hidden wrapper below
// just clips everything past roughly the waist, since there's no exported
// way to ask it for a partial viewBox directly. RANK_BODY_CROP_H is a
// reasonable estimate of "about half the full figure," not a measured
// value — if it crops too high/low once actually seen on-device, that
// number is the one to adjust.
const RANK_BODY_WIDTH = 210;
const RANK_BODY_WIDTH_FULL = 240;
const RANK_BODY_CROP_H = 195;

// `full` shows the whole figure (screen 2, matches its reference image
// exactly) instead of the upper-half crop (screens 3/5, no reference photo
// for those — the crop was this file's own earlier interpretation of "zoom
// in," kept since nothing contradicts it there).
function RankBodyPreview({ tiers, full = false }: { tiers: MuscleTiers; full?: boolean }) {
  if (full) {
    return <BodyMapSide side="front" tiers={tiers} width={RANK_BODY_WIDTH_FULL} />;
  }
  return (
    <View style={styles.rankBodyCrop}>
      <View style={styles.rankBodyInner}>
        <BodyMapSide side="front" tiers={tiers} width={RANK_BODY_WIDTH} />
      </View>
    </View>
  );
}

const RANK_ALL_MUSCLES = Object.values(Muscle) as Muscle[];
// Every muscle at the SAME tier at once — used for the demo cycle (screen
// 3) and the final reveal (screen 5), not real per-muscle data (this app
// doesn't have any logged sessions yet during onboarding).
function tiersForRank(tier: Tier | null): MuscleTiers {
  if (!tier) return {};
  return Object.fromEntries(
    RANK_ALL_MUSCLES.map(m => [m, { tier, peakTier: tier, volume: 0, goodRatio: 0 }]),
  ) as MuscleTiers;
}

// ── SCREEN 1 — intro. Matches the reference build (FormPal Ranks.html)
// exactly: light background (same AppBackground blob art as every other
// question — NOT the dark rank shell; that starts at screen 2), no heading
// copy, just the coverflow reel with a flexible spacer pushing it toward
// the bottom, then "Find my rank." The dark world begins on the NEXT
// screen, so that's now the one that washes in (see RankFloatingScreen).
function RankIntroScreen({ onDone }: { onDone: () => void }) {
  return (
    <WashIn>
      <View style={styles.momentOverlay}>
        <Image source={require('../assets/images/rank-intro-bg.webp')} style={styles.rankIntroBg} resizeMode="cover" />
        <View style={styles.rankIntroSpacer} />
        <RankLadder />
        {/* Reserves room above the fixed "Find my rank" button so the reel
            never sits underneath/against it. */}
        <View style={styles.rankIntroBtnSpacer} />
        <View style={styles.momentBtnWrap}>
          <BounceBtn style={styles.continueBtn} onPress={onDone}>
            <Text style={styles.continueBtnTxt}>Find my rank</Text>
          </BounceBtn>
        </View>
      </View>
    </WashIn>
  );
}

// ── SCREEN 2 — floating emblems. NOTE: no reference photo actually came
// matched to the reference image — full front body (not upper-half-cropped
// like screens 3/5's preview; this one specifically shows the whole
// figure), with floating LABEL CARDS ("Chest / TITAN" + a small badge
// icon) pointing at specific muscle groups, not bare badges drifting on
// their own. Cards independently drift (same slow-loop pattern
// LocationBubbles/MuscleRankBackdrop already use) and periodically swap to
// a different muscle/tier pairing, staggered so they don't all change at
// once — reads as "cycling through ranks."
const RANK_FLOAT_CARDS: { muscle: string; style: any }[] = [
  { muscle: 'Chest', style: { top: 70, left: 8 } },
  { muscle: 'Core', style: { top: 210, right: 4 } },
  { muscle: 'Legs', style: { top: 340, left: 4 } },
];

function useRankFloatDrift(duration: number, delay = 0) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration, delay, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

function RankFloatCard({ index, muscle, style }: { index: number; muscle: string; style: any }) {
  const drift = useRankFloatDrift(3400 + index * 420, index * 260);
  const [rankIdx, setRankIdx] = useState(index % RANKS.length);
  const fade = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const id = setInterval(() => {
      Animated.timing(fade, { toValue: 0, duration: 260, useNativeDriver: false }).start(({ finished }) => {
        if (!finished) return;
        setRankIdx(i => (i + 1) % RANKS.length);
        Animated.timing(fade, { toValue: 1, duration: 320, useNativeDriver: false }).start();
      });
    }, 1700 + index * 240);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const translateY = drift.interpolate({ inputRange: [0, 1], outputRange: [-8, 8] });
  const rank = RANKS[rankIdx];
  return (
    <Animated.View style={[styles.rankFloatCard, style, { opacity: fade, transform: [{ translateY }] }]}>
      <View>
        <Text style={styles.rankFloatCardMuscle}>{muscle}</Text>
        <Text style={[styles.rankFloatCardTier, { color: rank.color }]}>{rank.name.toUpperCase()}</Text>
      </View>
      <Image source={rank.image} style={styles.rankFloatCardImg} resizeMode="contain" />
    </Animated.View>
  );
}

// Now the entry point into the dark rank world (screen 1 is light — see
// RankIntroScreen) — washes in for that reason, unlike before.
function RankFloatingScreen({ onDone }: { onDone: () => void }) {
  return (
    <WashIn>
      <RankShell>
        <View style={styles.rankScreenPad}>
          <Text style={styles.rankScreenHeading}>Analyze your body's full potential.</Text>
          <View style={styles.rankBodyStageFull}>
            <RankBodyPreview tiers={{}} full />
            {RANK_FLOAT_CARDS.map((c, i) => (
              <RankFloatCard key={c.muscle} index={i} muscle={c.muscle} style={c.style} />
            ))}
          </View>
        </View>
        <View style={styles.momentBtnWrap}>
          <BounceBtn style={styles.continueBtn} onPress={onDone}>
            <Text style={styles.continueBtnTxt}>Continue</Text>
          </BounceBtn>
        </View>
      </RankShell>
    </WashIn>
  );
}

// ── SCREEN 3 — body filling up. A shared "demo tier" cycles Bronze →
// Champion; every muscle lights up to that SAME tier at once, so the whole
// figure visibly climbs in sync — a preview of the mechanic, not a real
// per-user result yet (that's screen 5, after the real assessment).
function RankFillingScreen({ onDone }: { onDone: () => void }) {
  const [tierIdx, setTierIdx] = useState(0);
  const fillTiers = useMemo(() => tiersForRank(RANKS_ASCENDING[tierIdx].name.toLowerCase() as Tier), [tierIdx]);
  useEffect(() => {
    const id = setInterval(() => {
      Haptics.selectionAsync();
      setTierIdx(i => (i + 1) % RANKS_ASCENDING.length);
    }, 1100);
    return () => clearInterval(id);
  }, []);
  return (
    <RankShell>
      <View style={styles.rankScreenPad}>
        <Text style={styles.rankScreenHeading}>Every muscle, ranked.</Text>
        <Text style={styles.rankScreenBody}>Train it right and it lights up — one muscle at a time, all the way to Champion.</Text>
        <View style={styles.rankBodyStage}>
          <RankBodyPreview tiers={fillTiers} />
        </View>
        <Text style={styles.rankFillingTierLabel}>{RANKS_ASCENDING[tierIdx].name}</Text>
      </View>
      <View style={styles.momentBtnWrap}>
        <BounceBtn style={styles.continueBtn} onPress={onDone}>
          <Text style={styles.continueBtnTxt}>Continue</Text>
        </BounceBtn>
      </View>
    </RankShell>
  );
}

// ── SCREEN 4 — the 3 strength questions, all on ONE page (was 3 separate
// wheel turns) — same wheel-picker mechanism as age/height, just 3 of them
// stacked. Commits all 3 answers at once on Continue.
function RankAssessScreen({ onDone }: { onDone: (pushups: number, pullups: number, squats: number) => void }) {
  const [pushups, setPushups] = useState('10');
  const [pullups, setPullups] = useState('3');
  const [squats, setSquats] = useState('15');
  const rows: { label: string; value: string; set: (v: string) => void; options: string[] }[] = [
    { label: 'Push-ups', value: pushups, set: setPushups, options: PUSHUP_OPTIONS },
    { label: 'Pull-ups', value: pullups, set: setPullups, options: PULLUP_OPTIONS },
    { label: 'Squats', value: squats, set: setSquats, options: SQUAT_OPTIONS },
  ];
  const confirm = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDone(parseInt(pushups, 10) || 0, parseInt(pullups, 10) || 0, parseInt(squats, 10) || 0);
  };
  return (
    <RankShell>
      <ScrollView contentContainerStyle={styles.rankAssessScroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.rankScreenHeading}>Where do you stand?</Text>
        <Text style={styles.rankScreenBody}>How many can you do in a row? Be honest — this sets your starting point.</Text>
        {rows.map(row => (
          <View key={row.label} style={styles.rankAssessRow}>
            <Text style={styles.rankAssessLabel}>{row.label}</Text>
            <Picker
              selectedValue={row.value}
              onValueChange={(v) => { Haptics.selectionAsync(); row.set(v); }}
              style={styles.rankAssessPicker}
              itemStyle={{ color: '#fff', fontSize: 20, fontWeight: '300' }}
            >
              {row.options.map(o => <Picker.Item key={o} label={o} value={o} />)}
            </Picker>
          </View>
        ))}
      </ScrollView>
      <View style={styles.momentBtnWrap}>
        <BounceBtn style={styles.continueBtn} onPress={confirm}>
          <Text style={styles.continueBtnTxt}>Continue</Text>
        </BounceBtn>
      </View>
    </RankShell>
  );
}

// ── Rank assignment — 3 self-reported numbers (no photos at all), deliberately
// high bars for anything above Bronze: "unless the numbers are really high,
// assign Bronze to start" was the explicit ask, since most people SHOULD
// land at Bronze. These bars are a rough placeholder scale — there's no real
// user-distribution data to calibrate against yet, so they're a reasonable
// starting guess, not derived from anything. Revisit once real onboarding
// numbers exist, the same "log real data, then tune" principle this file's
// exercise-threshold work already follows, applied here since there's no
// device metric log for a gamification number like this one.
function computeStartingRank(answers: Record<string, any>): string {
  const pushups = parseInt(String(answers.assessPushups ?? '0'), 10) || 0;
  const pullups = parseInt(String(answers.assessPullups ?? '0'), 10) || 0;
  const squats = parseInt(String(answers.assessSquats ?? '0'), 10) || 0;
  if (pullups >= 15 && pushups >= 40 && squats >= 60) return 'Champion';
  if (pullups >= 10 && pushups >= 30 && squats >= 50) return 'Diamond';
  if (pullups >= 6 && pushups >= 25 && squats >= 40) return 'Platinum';
  if (pullups >= 3 && pushups >= 20 && squats >= 30) return 'Gold';
  if (pullups >= 1 && pushups >= 12 && squats >= 20) return 'Silver';
  return 'Bronze';
}

// A realistic-feeling next-rank target — placeholder pacing (10 weeks out),
// same "not derived from anything real yet" caveat as computeStartingRank.
function computeRankProjection(rank: string): { nextRank: string; dateLabel: string } {
  const idx = RANKS_ASCENDING.findIndex(r => r.name === rank);
  const next = RANKS_ASCENDING[Math.min(idx + 1, RANKS_ASCENDING.length - 1)];
  const target = new Date();
  target.setDate(target.getDate() + 70);
  const dateLabel = target.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  return { nextRank: next.name, dateLabel };
}

// ── The rank reveal — the most important screen in this whole run. Full-
// screen (outside the ScrollView, like WastedRepsPayoff/ReversalScreen),
// two phases: a short "calculating" build-up, then the actual reveal —
// their real rank badge bouncing in with a color burst behind it, their
// name attached, haptic success on the moment it lands. Uses the SAME
// computeStartingRank the projection screen right after it reads from, so
// they always agree.
// ── SCREEN 5 — THE reveal. The most important screen in this whole run:
// build-up → color burst + spring-bounce badge + name, THEN the body map
// (screen 2/3's same preview) fades in already filled to their real
// computed rank, tying the whole rank run together on one final beat.
function RankRevealScreen({ answers, onDone }: { answers: Record<string, any>; onDone: () => void }) {
  const rank = useMemo(() => computeStartingRank(answers), [answers]);
  const rankData = useMemo(() => RANKS.find(r => r.name === rank) ?? RANKS[RANKS.length - 1], [rank]);
  const rankTiers = useMemo(() => tiersForRank(rank.toLowerCase() as Tier), [rank]);
  const name = answers.name as string | undefined;

  const [revealed, setRevealed] = useState(false);
  const buildOpacity = useRef(new Animated.Value(0)).current;
  const burstScale = useRef(new Animated.Value(0)).current;
  const burstOpacity = useRef(new Animated.Value(0.85)).current;
  const badgeScale = useRef(new Animated.Value(0)).current;
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const labelOpacity = useRef(new Animated.Value(0)).current;
  const nameOpacity = useRef(new Animated.Value(0)).current;
  const bodyOpacity = useRef(new Animated.Value(0)).current;
  const btnOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const buildIn = Animated.timing(buildOpacity, { toValue: 1, duration: 420, useNativeDriver: false });
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    let buildOut: Animated.CompositeAnimation | null = null;

    buildIn.start(({ finished }) => {
      if (!finished) return;
      holdTimer = setTimeout(() => {
        buildOut = Animated.timing(buildOpacity, { toValue: 0, duration: 320, useNativeDriver: false });
        buildOut.start(({ finished: f2 }) => {
          if (!f2) return;
          setRevealed(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Animated.timing(labelOpacity, { toValue: 1, duration: 300, useNativeDriver: false }).start();
          Animated.parallel([
            Animated.timing(burstOpacity, { toValue: 0, duration: 750, useNativeDriver: false }),
            Animated.timing(burstScale, { toValue: 1, duration: 750, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
          ]).start();
          Animated.timing(badgeOpacity, { toValue: 1, duration: 260, useNativeDriver: false }).start();
          Animated.spring(badgeScale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: false }).start(() => {
            Animated.timing(nameOpacity, { toValue: 1, duration: 420, delay: 150, useNativeDriver: false }).start(() => {
              Animated.timing(bodyOpacity, { toValue: 1, duration: 500, delay: 250, useNativeDriver: false }).start(() => {
                Animated.timing(btnOpacity, { toValue: 1, duration: 420, delay: 250, useNativeDriver: false }).start();
              });
            });
          });
        });
      }, 1500);
    });

    return () => {
      buildIn.stop();
      if (holdTimer) clearTimeout(holdTimer);
      buildOut?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RankShell>
      <View style={styles.rankRevealCenter}>
        {!revealed && (
          <Animated.Text style={[styles.rankRevealBuilding, { opacity: buildOpacity }]}>
            Calculating your rank...
          </Animated.Text>
        )}
        {revealed && (
          <>
            <Animated.View
              pointerEvents="none"
              style={[styles.rankRevealBurst, { backgroundColor: rankData.color, opacity: burstOpacity, transform: [{ scale: burstScale }] }]}
            />
            <Animated.Text style={[styles.rankRevealLabel, { opacity: labelOpacity }]}>
              {name ? `${name}, you're starting at` : "You're starting at"}
            </Animated.Text>
            <Animated.Image
              source={rankData.image}
              resizeMode="contain"
              style={[styles.rankRevealBadge, { opacity: badgeOpacity, transform: [{ scale: badgeScale }] }]}
            />
            <Animated.Text style={[styles.rankRevealName, { opacity: nameOpacity }]}>{rank}</Animated.Text>
            <Animated.View style={{ opacity: bodyOpacity, marginTop: 18 }}>
              <RankBodyPreview tiers={rankTiers} />
            </Animated.View>
          </>
        )}
      </View>
      {revealed && (
        <Animated.View style={[styles.momentBtnWrap, { opacity: btnOpacity }]}>
          <BounceBtn style={styles.continueBtn} onPress={onDone}>
            <Text style={styles.continueBtnTxt}>Continue</Text>
          </BounceBtn>
        </Animated.View>
      )}
    </RankShell>
  );
}

// ── SCREEN 6 — "we predict you can reach [rank] by [date]." Rebuilt to
// match the reference image exactly: left-aligned headline with the rank
// name and date colored in, an S-curve growth graph (today's badge at the
// bottom-left, the target badge at the top-right plateau) with dotted
// guide lines down to "Today"/date labels, then supporting copy and a
// small disclaimer line, then Continue.
const RANK_CURVE_W = 300;
const RANK_CURVE_H = 150;
const RANK_CURVE_PAD = 18;

function RankProjectionScreen({ answers, onDone }: { answers: Record<string, any>; onDone: () => void }) {
  const rank = useMemo(() => computeStartingRank(answers), [answers]);
  const { nextRank, dateLabel } = useMemo(() => computeRankProjection(rank), [rank]);
  const nextRankData = useMemo(() => RANKS.find(r => r.name === nextRank) ?? RANKS[0], [nextRank]);
  const curRankData = useMemo(() => RANKS.find(r => r.name === rank) ?? RANKS[RANKS.length - 1], [rank]);

  const headingOpacity = useRef(new Animated.Value(0)).current;
  const curveProgress = useRef(new Animated.Value(0)).current;
  const startBadgeOpacity = useRef(new Animated.Value(0)).current;
  const endBadgeOpacity = useRef(new Animated.Value(0)).current;
  const endBadgeScale = useRef(new Animated.Value(0.6)).current;
  const copyOpacity = useRef(new Animated.Value(0)).current;
  const btnOpacity = useRef(new Animated.Value(0)).current;
  const [curvePct, setCurvePct] = useState(0);

  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const listenerId = curveProgress.addListener(({ value }) => setCurvePct(value));
    Animated.timing(headingOpacity, { toValue: 1, duration: 420, useNativeDriver: false }).start(() => {
      Animated.timing(startBadgeOpacity, { toValue: 1, duration: 300, useNativeDriver: false }).start(() => {
        Animated.timing(curveProgress, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Animated.timing(endBadgeOpacity, { toValue: 1, duration: 300, useNativeDriver: false }).start();
          Animated.spring(endBadgeScale, { toValue: 1, friction: 5, tension: 90, useNativeDriver: false }).start(() => {
            Animated.timing(copyOpacity, { toValue: 1, duration: 420, delay: 150, useNativeDriver: false }).start(() => {
              Animated.timing(btnOpacity, { toValue: 1, duration: 420, delay: 200, useNativeDriver: false }).start();
            });
          });
        });
      });
    });
    return () => { curveProgress.removeListener(listenerId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Single cubic bezier from bottom-left to top-right plateau — control
  // points pulled toward the OPPOSITE end's x at each end's own y, which is
  // the standard trick for getting a clean S/sigmoid shape from one curve.
  const x0 = RANK_CURVE_PAD, y0 = RANK_CURVE_H - RANK_CURVE_PAD;
  const x1 = RANK_CURVE_W - RANK_CURVE_PAD, y1 = RANK_CURVE_PAD;
  const curvePath = `M${x0},${y0} C${x0 + (x1 - x0) * 0.65},${y0} ${x0 + (x1 - x0) * 0.35},${y1} ${x1},${y1}`;
  const dashLen = Math.hypot(x1 - x0, y1 - y0) * 1.4; // rough over-estimate of the actual curve length

  return (
    <RankShell>
      <ScrollView contentContainerStyle={styles.rankProjScroll} showsVerticalScrollIndicator={false}>
        <Animated.Text style={[styles.rankProjHeading, { opacity: headingOpacity }]}>
          We predict you can reach{'\n'}
          <Text style={{ color: nextRankData.color }}>{nextRank.toUpperCase()}</Text> by{' '}
          <Text style={{ color: nextRankData.color }}>{dateLabel}</Text>
        </Animated.Text>

        <View style={styles.rankProjGraphWrap}>
          <Svg width={RANK_CURVE_W} height={RANK_CURVE_H}>
            <Defs>
              <SvgLinearGradient id="rankCurveGrad" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={curRankData.color} />
                <Stop offset="1" stopColor={nextRankData.color} />
              </SvgLinearGradient>
            </Defs>
            <SvgLine x1={x0} y1={y0} x2={x0} y2={RANK_CURVE_H} stroke="rgba(255,255,255,0.25)" strokeWidth={1} strokeDasharray="3,4" />
            <SvgLine x1={x1} y1={y1} x2={x1} y2={RANK_CURVE_H} stroke="rgba(255,255,255,0.25)" strokeWidth={1} strokeDasharray="3,4" />
            <SvgPath
              d={curvePath}
              stroke="url(#rankCurveGrad)" strokeWidth={3.5} fill="none"
              strokeDasharray={`${dashLen}, ${dashLen}`}
              strokeDashoffset={dashLen * (1 - curvePct)}
            />
          </Svg>
          <Animated.View style={[styles.rankProjBadgeWrap, { left: x0 - 22, top: y0 - 22, opacity: startBadgeOpacity }]}>
            <Image source={curRankData.image} style={styles.rankProjBadgeSmall} resizeMode="contain" />
          </Animated.View>
          <Animated.View
            style={[styles.rankProjBadgeWrap, { left: x1 - 26, top: y1 - 30, opacity: endBadgeOpacity, transform: [{ scale: endBadgeScale }] }]}
          >
            <Image source={nextRankData.image} style={styles.rankProjBadgeBig} resizeMode="contain" />
          </Animated.View>
          <View style={[styles.rankProjAxisLabel, { left: x0 - 20 }]}><Text style={styles.rankProjAxisTxt}>Today</Text></View>
          <View style={[styles.rankProjAxisLabel, { left: x1 - 30 }]}><Text style={[styles.rankProjAxisTxt, { color: nextRankData.color }]}>{dateLabel}</Text></View>
        </View>

        <Animated.View style={{ opacity: copyOpacity }}>
          <Text style={styles.rankProjPotential}>You have amazing potential!</Text>
          <Text style={styles.rankScreenBody}>Ranks are a direct way to measure your progress. Keep it up!</Text>
          <Text style={styles.rankProjDisclaimer}>*This projection is a rough estimate based on your starting numbers — not a guarantee.</Text>
        </Animated.View>
      </ScrollView>
      <Animated.View style={[styles.momentBtnWrap, { opacity: btnOpacity }]}>
        <BounceBtn style={styles.continueBtn} onPress={onDone}>
          <Text style={styles.continueBtnTxt}>Continue</Text>
        </BounceBtn>
      </Animated.View>
    </RankShell>
  );
}

// ── ReviewsCarousel — lightweight social proof, staggered pop-in cards. ──

const REVIEWS = [
  { name: 'Jordan M.', quote: 'Finally know my squat depth is actually right. Game changer.' },
  { name: 'Casey R.', quote: 'Caught my shoulder form issue in week one — saved me an injury.' },
  { name: 'Priya S.', quote: 'Feels like having a coach in my pocket every session.' },
];

function ReviewsCarousel() {
  const anims = useRef(REVIEWS.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const stagger = Animated.stagger(150, anims.map(v => Animated.spring(v, { toValue: 1, friction: 7, tension: 100, useNativeDriver: true })));
    stagger.start();
    return () => stagger.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={styles.reviewsWrap}>
      {REVIEWS.map((r, i) => {
        const scale = anims[i].interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] });
        return (
          <Animated.View key={r.name} style={[styles.reviewCard, { opacity: anims[i], transform: [{ scale }] }]}>
            <Text style={styles.reviewStars}>★★★★★</Text>
            <Text style={styles.reviewQuote}>"{r.quote}"</Text>
            <Text style={styles.reviewName}>{r.name}</Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

// ── PlanReveal — "building your plan," referencing what they actually
// answered, checklist ticking off one item at a time. Last screen before
// where a paywall would go (not building the paywall itself). ────────────

function PlanReveal({ answers, onConfirm, instant = false }: { answers: Record<string, any>; onConfirm: () => void; instant?: boolean }) {
  const name = answers.name as string | undefined;
  const goal = Array.isArray(answers.goal) && answers.goal.length ? String(answers.goal[0]).toLowerCase() : 'your goals';
  const days = (answers.days as string | undefined) ?? '4 days';
  const steps = useMemo(() => [
    `Analyzing ${name ? `${name}'s` : 'your'} answers`,
    `Building around ${goal}`,
    `Setting your ${days}-a-week schedule`,
    'Calibrating form-check thresholds',
  ], [name, goal, days]);

  const [doneCount, setDoneCount] = useState(instant ? steps.length : 0);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timeoutsRef.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (instant) return;
    steps.forEach((_, i) => {
      const t = setTimeout(() => setDoneCount(c => Math.max(c, i + 1)), (i + 1) * 500);
      timeoutsRef.current.push(t);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allDone = doneCount >= steps.length;

  return (
    <View style={styles.planWrap}>
      {steps.map((s, i) => (
        <View key={s} style={styles.planStepRow}>
          <SymbolView name={doneCount > i ? 'checkmark.circle.fill' : 'circle'} size={18} tintColor={Col.text} type="monochrome" style={{ width: 18, height: 18 }} />
          <Text style={[styles.planStepTxt, doneCount > i && styles.planStepTxtDone]}>{s}</Text>
        </View>
      ))}
      {allDone && (
        <>
          <Text style={styles.planReadyTxt}>Your plan is ready.</Text>
          <BounceBtn style={styles.continueBtn} onPress={onConfirm}>
            <Text style={styles.continueBtnTxt}>Continue</Text>
          </BounceBtn>
        </>
      )}
    </View>
  );
}

// ── FormGuessSlider — the 0-100% honest-guess drag ────────────────────────
// Preset buttons were tried and rejected — it has to be a slider. The
// original drag slider's real bug wasn't the drag math, it was that this
// whole screen lives inside a vertical ScrollView: a PanResponder on a
// child view doesn't stop the ScrollView from also trying to interpret the
// same touch as a scroll gesture, so a drag would randomly get "stolen" —
// exactly the "thinks you're scrolling, gets stuck" symptom. The fix is to
// explicitly lock the parent ScrollView (scrollEnabled=false) for the
// duration of the drag via onDragStart/onDragEnd, wired all the way up to
// the screen — see OnboardingTestScreen's `sliderDragging` state.
const SLIDER_TRACK_H = 64;
const SLIDER_KNOB = 52;
const FLOAT_BUBBLES: { size: number; left: string; top: number }[] = [
  { size: 22, left: '18%', top: 9 },
  { size: 14, left: '46%', top: 34 },
  { size: 18, left: '74%', top: 12 },
];

function FormGuessSlider({ value, onChange, onDragStart, onDragEnd }: {
  value: number; onChange: (v: number) => void; onDragStart: () => void; onDragEnd: () => void;
}) {
  const [trackWidth, setTrackWidth] = useState(280);
  const usableWidth = Math.max(1, trackWidth - SLIDER_KNOB);
  const knobX = useRef(new Animated.Value((value / 100) * usableWidth)).current;
  const startPx = useRef(0);
  const lastHaptic = useRef(value);
  // The real bug behind "100% only fills halfway": PanResponder is created
  // once inside useRef, so its handlers permanently close over whatever
  // `usableWidth` was on the FIRST render — the 280px fallback, before
  // onLayout ever measures the real track. Every drag afterward was being
  // clamped/normalized against that stale, too-small width even though the
  // knob visually moves across the real (wider) track — so "100%" in the
  // math didn't correspond to "all the way across" on screen. Fix: keep a
  // ref that always holds the CURRENT usableWidth and have the handlers
  // read `.current` instead of the value they closed over at creation.
  const usableWidthRef = useRef(usableWidth);
  useEffect(() => { usableWidthRef.current = usableWidth; }, [usableWidth]);

  useEffect(() => { knobX.setValue((value / 100) * usableWidth); }, [trackWidth]); // eslint-disable-line react-hooks/exhaustive-deps

  const panResponder = useRef(
    PanResponder.create({
      // Capture (not just Set) so this claims the gesture immediately, before
      // the ancestor ScrollView's own scroll responder gets a chance to grab
      // it — the actual fix for the "thinks you're scrolling" bug.
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: () => {
        onDragStart();
        startPx.current = (knobX as any)._value ?? 0;
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      onPanResponderMove: (_, gs) => {
        const uw = usableWidthRef.current;
        const next = Math.max(0, Math.min(uw, startPx.current + gs.dx));
        knobX.setValue(next);
        const pct = Math.round((next / uw) * 100);
        onChange(pct);
        if (pct !== lastHaptic.current) { lastHaptic.current = pct; void Haptics.selectionAsync(); }
      },
      onPanResponderRelease: () => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onDragEnd();
      },
      onPanResponderTerminate: () => onDragEnd(),
    })
  ).current;

  // Fill tracks the knob's leading (right) edge, not its center — at
  // knobX=usableWidth (100%) the knob's right edge is exactly at
  // trackWidth, so the fill has to reach all the way there too.
  const fillWidth = knobX.interpolate({ inputRange: [0, usableWidth], outputRange: [SLIDER_KNOB / 2, trackWidth] });

  const floats = useRef(FLOAT_BUBBLES.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    const loops = floats.map((f, i) => Animated.loop(Animated.sequence([
      Animated.timing(f, { toValue: 1, duration: 1900 + i * 260, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(f, { toValue: 0, duration: 1900 + i * 260, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])));
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={sliderStyles.wrap}>
      <Text style={sliderStyles.bigPct}>{value}%</Text>
      <View style={sliderStyles.track} onLayout={e => setTrackWidth(e.nativeEvent.layout.width)}>
        <Animated.View style={[sliderStyles.fill, { width: fillWidth }]} />
        {FLOAT_BUBBLES.map((b, i) => {
          const translateY = floats[i].interpolate({ inputRange: [0, 1], outputRange: [-4 - i * 2, 4 + i * 2] });
          return (
            <Animated.View key={i} pointerEvents="none" style={[sliderStyles.floatBubble, { width: b.size, height: b.size, borderRadius: b.size / 2, left: b.left as any, top: b.top, transform: [{ translateY }] }]}>
              <BlurView intensity={35} tint="light" style={StyleSheet.absoluteFill} />
            </Animated.View>
          );
        })}
        <Animated.View {...panResponder.panHandlers} style={[sliderStyles.knob, { transform: [{ translateX: knobX }] }]}>
          <BlurView intensity={50} tint="light" style={StyleSheet.absoluteFill} />
          <View style={sliderStyles.knobDot} />
        </Animated.View>
      </View>
      <View style={sliderStyles.trackLabels}>
        <Text style={sliderStyles.trackLabelTxt}>0%</Text>
        <Text style={sliderStyles.trackLabelTxt}>100%</Text>
      </View>
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  wrap: { marginTop: 24, alignItems: 'center' },
  bigPct: { fontSize: 48, fontWeight: '300', color: Col.text, letterSpacing: -1.2, marginBottom: 14 },
  track: {
    width: '100%', height: SLIDER_TRACK_H, borderRadius: SLIDER_TRACK_H / 2,
    backgroundColor: 'rgba(17,24,39,0.06)', overflow: 'hidden', justifyContent: 'center',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(17,24,39,0.10)', borderRadius: SLIDER_TRACK_H / 2 },
  floatBubble: {
    position: 'absolute', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.35)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)',
  },
  knob: {
    position: 'absolute', top: (SLIDER_TRACK_H - SLIDER_KNOB) / 2, left: 0,
    width: SLIDER_KNOB, height: SLIDER_KNOB, borderRadius: SLIDER_KNOB / 2, overflow: 'hidden',
    backgroundColor: DARK, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center',
    ...({ boxShadow: '0px 4px 12px rgba(20,20,40,0.22)' } as any),
  },
  knobDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#fff' },
  trackLabels: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 8, paddingHorizontal: 4 },
  trackLabelTxt: { fontSize: 12, fontWeight: '500', color: Col.textDim },
});

// ── Math reveal content — the wasted-reps and injury math ────────────────
//
// REBUILT from a custom multi-line "type one line, tap to continue, type the
// next line" component with its own scroll-pin logic — that mechanism is
// what caused the reported bug (autoscroll pinned to the CONTAINER's top,
// but the container kept growing taller as lines accumulated, so by the
// last couple of lines the actively-typing text was below the fold and
// snapped back out of view every time a new layout event fired). Replaced
// with the simplest possible fix: this is no longer a special component at
// all. It's one Segment[] (with embedded \n\n between "lines" for visual
// paragraph breaks) fed through the EXACT SAME top-level typewriter every
// other turn's prompt already uses — same size text, same single Continue
// button once typing finishes, same pin-to-top-once behavior that already
// works correctly for every other turn. No separate scroll region, nothing
// bespoke left to break.
// Direct weeks-trained figures — NOT years × 52. Converting their answer
// straight to a weeks count and stopping there is what fixes the old
// "1 day × 52 weeks × 4 months" double-count: a yearly rate must never be
// multiplied by a months/years figure again after this lookup.
const DURATION_WEEKS: Record<string, number> = {
  'Just starting': 2,
  '1-6 months': 13,
  '6-12 months': 39,
  '1-2 years': 78,
  '2-5 years': 182,
  '5-10 years': 390,
  '10+ years': 624,
};

// Plain-English gloss shown next to the weeks figure, e.g. "~13 weeks
// (about 3 months)" — keeps the math legible without re-introducing a
// second unit into the multiplication itself.
const DURATION_PLAIN: Record<string, string> = {
  'Just starting': 'just starting out',
  '1-6 months': 'about 3 months',
  '6-12 months': 'about 9 months',
  '1-2 years': 'about 1.5 years',
  '2-5 years': 'about 3.5 years',
  '5-10 years': 'about 7.5 years',
  '10+ years': '12+ years',
};

// Reps-per-session estimated from their OWN "how long per session?" answer
// instead of a flat guess — grounds the math in something they actually
// told us.
const REPS_PER_SESSION_BY_DURATION: Record<string, number> = {
  '15-20 min': 60,
  '30 min': 90,
  '45 min': 120,
  '60 min': 150,
  '75+ min': 180,
};
const DEFAULT_REPS_PER_SESSION = 90; // fallback only — `duration` is always answered before this turn in the real flow

function dayWord(n: number): string {
  return `${n} day${n === 1 ? '' : 's'}`;
}

// Each "line" is its own sentence/step — pushed as a discrete entry in a
// Segment[][]. Each becomes its own ordinary `mathLine` turn (see
// expandMathTurns) so the reader taps through one sentence at a time using
// the exact same question layout as everything else.
function line(lines: Segment[][], parts: Segment[]) {
  lines.push(parts);
}

// Wasted-reps math — the emotional peak. Uses THEIR number, always: no
// "you're probably wrong, here's the real number" override, no recalculated
// challenge. If they said 86%, the math runs at 86%. A beginner who
// explicitly said "Just starting" gets the forward-looking framing (nothing
// wasted yet — nothing TO waste); anyone who gave a real elapsed-time answer
// gets the past-tense regret framing built from what THEY said, even if
// they also self-rated as "Beginner" — that mismatch gets called out by
// name rather than silently picking one answer over the other.
type WastedRepsMath = {
  trainDurationLabel: string;
  justStarting: boolean;
  freq: number;
  durationLabel: string | undefined;
  repsPerSession: number;
  pct: number;
  weeks: number;
  weeksPlain: string;
  totalSessions: number;
  totalReps: number;
  wasted: number;
};

// Single source of truth for the wasted-reps numbers — both Part A (the
// typed build-up below) and Part B (the full-screen payoff) read from this
// SAME computation, so the big number in the cinematic screen always
// matches the number the build-up just walked through.
// sessions = (days/week) × (weeks actually trained) — nothing else. No
// years-to-weeks-to-multiplied-again double counting.
function computeWastedReps(answers: Record<string, any>): WastedRepsMath {
  const trainDurationLabel = (answers.trainDuration as string) ?? 'Just starting';
  const justStarting = trainDurationLabel === 'Just starting';
  const freq = parseInt(String(answers.days ?? '3 days'), 10) || 3;
  const durationLabel = answers.duration as string | undefined;
  const repsPerSession = REPS_PER_SESSION_BY_DURATION[durationLabel ?? ''] ?? DEFAULT_REPS_PER_SESSION;
  const pct = typeof answers.formGuess === 'number' ? answers.formGuess : 50;

  const weeks = justStarting ? 104 : (DURATION_WEEKS[trainDurationLabel] ?? 78);
  const weeksPlain = justStarting ? 'about 2 years ahead' : (DURATION_PLAIN[trainDurationLabel] ?? 'about 1.5 years');
  const totalSessions = Math.round(freq * weeks);
  const totalReps = totalSessions * repsPerSession;
  const wasted = Math.max(0, Math.round(totalReps * (1 - pct / 100)));

  return { trainDurationLabel, justStarting, freq, durationLabel, repsPerSession, pct, weeks, weeksPlain, totalSessions, totalReps, wasted };
}

// Merges a few short, related sentence-groups into ONE line/tap — was one
// tap per single sentence, which meant 6-9 check-ins per math turn and
// reportedly felt too broken-up. Groups a couple of related sentences per
// tap instead, so there are fewer, more spread-out check-ins overall.
function combineLines(...groups: Segment[][]): Segment[] {
  const out: Segment[] = [];
  groups.forEach((g, i) => {
    out.push(...g);
    if (i < groups.length - 1) out.push({ text: '\n\n' });
  });
  return out;
}

// Wasted-reps math, PART A — the build-up. Now just ONE line/tap: the
// callback + the sessions count, in plain words before the math (see
// buildInjuryLines' own comment on that fix) — then PART B (the full-screen
// payoff) picks up IMMEDIATELY, absorbing the total-reps/lot-of-work/wasted
// steps that used to be typed here. Was 3 taps ending on the wasted-reps
// line before the full-screen moment started; reported as coming too late
// — moved everything after the sessions count into the payoff itself so it
// starts right where this leaves off.
// CALLS BACK to the reps-per-session idea instead of re-opening with "you
// said you were X and trained for Y" — the injury math earlier already
// covered that; re-stating it here read as repetitive by the second math
// section.
function buildWastedRepsLines(answers: Record<string, any>): Segment[][] {
  const m = computeWastedReps(answers);
  const { justStarting, freq, repsPerSession, weeksPlain, totalSessions } = m;

  const lines: Segment[][] = [];

  const callbackSegs: Segment[] = justStarting
    ? [
        { text: "Let's imagine those " }, { text: `${repsPerSession} reps`, accent: true },
        { text: ' a session, ' }, { text: dayWord(freq), accent: true }, { text: '.' },
      ]
    : [
        { text: 'Remember those ' }, { text: `${repsPerSession} reps`, accent: true },
        { text: ' a session you do?' },
      ];
  const formulaSegs: Segment[] = justStarting
    ? [
        { text: 'Training like that for about ' }, { text: weeksPlain, accent: true },
        { text: ", that's about " }, { text: `${totalSessions.toLocaleString()} sessions`, accent: true }, { text: ' total.' },
      ]
    : [
        { text: 'Training ' }, { text: dayWord(freq), accent: true }, { text: ' for about ' }, { text: weeksPlain, accent: true },
        { text: ", that's about " }, { text: `${totalSessions.toLocaleString()} sessions`, accent: true }, { text: " you've done so far." },
      ];

  line(lines, combineLines(callbackSegs, formulaSegs));

  return lines;
}

// Injury math — mid-flow value beat, kept far from the wasted-reps peak.
// Same step-by-step arithmetic (nothing appears without the step that
// produced it). Uses the SAME justStarting handling as the wasted-reps
// section above — was previously falling through to the raw DURATION_WEEKS
// lookup (2 weeks for "Just starting," which made no sense for an
// injury-risk framing). This is
// the FIRST math section chronologically — it's the one that plainly
// states "you said you've trained for X," so the SECOND section (wasted-
// reps, above) doesn't have to.
function buildInjuryLines(answers: Record<string, any>): Segment[][] {
  const freq = parseInt(String(answers.days ?? '3 days'), 10) || 3;
  const trainDurationLabel = (answers.trainDuration as string) ?? '1-2 years';
  const justStarting = trainDurationLabel === 'Just starting';
  const weeks = justStarting ? 104 : (DURATION_WEEKS[trainDurationLabel] ?? 78);
  const weeksPlain = justStarting ? 'about 2 years' : (DURATION_PLAIN[trainDurationLabel] ?? 'about 1.5 years');
  const totalSessions = Math.round(freq * weeks);

  const lines: Segment[][] = [];

  const openingSegs: Segment[] = justStarting
    ? [{ text: "You said you're just starting out." }]
    : [{ text: "You said you've trained for about " }, { text: trainDurationLabel, accent: true }, { text: '.' }];
  // Plain words BEFORE the math, not bare numbers on their own — was
  // "X a week over Y is around Z sessions," reported as reading like raw
  // math with no words. "So far" added so the number reads as something
  // that's already happened, not an abstract total.
  const sessionsSegs: Segment[] = justStarting
    ? [
        { text: 'Training ' }, { text: dayWord(freq), accent: true }, { text: ' for about ' }, { text: weeksPlain, accent: true },
        { text: ", that's around " }, { text: `${totalSessions.toLocaleString()} sessions`, accent: true }, { text: ' total.' },
      ]
    : [
        { text: 'Training ' }, { text: dayWord(freq), accent: true }, { text: ' for about ' }, { text: weeksPlain, accent: true },
        { text: ", that's around " }, { text: `${totalSessions.toLocaleString()} sessions`, accent: true }, { text: " you've done so far." },
      ];

  const riskSegs: Segment[] = [
    { text: 'Every one of those sessions means ' },
    { text: 'risking injury because of your form', accent: true }, { text: '.' },
  ];
  const sidelineSegs: Segment[] = [{ text: 'One gym injury sidelines you ' }, { text: '4-6 weeks', accent: true }, { text: '.' }];

  const weeksOffSegs: Segment[] = [{ text: 'And after just ' }, { text: '4 weeks off', accent: true }, { text: ', you start losing the strength you built.' }];
  const undoneSegs: Segment[] = [{ text: 'So one injury = ' }, { text: 'months of progress, undone.', accent: true }];

  // "Hold to lock in an injury-free future" now lives IN this sentence,
  // not as separate small text floating above the fingerprint — reads as
  // one connected thought instead of two disconnected pieces.
  const closingSegs: Segment[] = [
    { text: '1,000,000', accent: true },
    { text: ' people learn this the hard way every year. Most from bad form. ' },
    { text: "Don't be one of them.", accent: true },
    { text: ' Hold to lock in an ' },
    { text: 'injury-free future', accent: true }, { text: '.' },
  ];

  line(lines, combineLines(openingSegs, sessionsSegs));
  line(lines, combineLines(riskSegs, sidelineSegs));
  line(lines, combineLines(weeksOffSegs, undoneSegs));
  line(lines, closingSegs);
  return lines;
}

// One entry per sentence — each becomes its own ordinary `mathLine` turn
// (see expandMathTurns below), not a custom block.
function buildMathLines(variant: 'wastedReps' | 'injury', answers: Record<string, any>): Segment[][] {
  return variant === 'injury' ? buildInjuryLines(answers) : buildWastedRepsLines(answers);
}

// Cycled per math turn so the check-in phrase doesn't repeat line after
// line.
const CHECK_IN_PHRASES = ['Following?', 'Make sense?', 'With me?', 'Understand?', 'Clear?'];

// Turns a single mathReveal SEED entry from FLOW into a sequence of
// ordinary `mathLine` turns, one per sentence — each one goes through the
// EXACT SAME ActiveTurn/PastTurn rendering path as every other question:
// same layout, same top-of-screen prompt position, same pin-to-top scroll,
// same everything. The only thing standing in for answer choices is a
// single pill-styled option (the check-in phrase) — no separate math
// screen component, no custom scroll handling.
function expandMathTurns(turn: Turn, answers: Record<string, any>): Turn[] {
  if (turn.kind !== 'mathReveal') return [turn];
  const lines = buildMathLines(turn.variant, answers);
  return lines.map((segments, i) => {
    const isLast = i === lines.length - 1;
    return {
      id: `${turn.id}__${i}`,
      kind: 'mathLine' as const,
      segments,
      checkIn: CHECK_IN_PHRASES[i % CHECK_IN_PHRASES.length],
      // The injury math's final line gets the fingerprint "lock it in"
      // moment instead of the normal small check-in — a one-off closing
      // beat for the first math section only, not the wasted-reps one.
      special: (turn.variant === 'injury' && isLast) ? 'lockIn' as const : undefined,
    };
  });
}

// ── Injury math's closing "lock it in" moment — press and hold the
// fingerprint, a ring fills as you hold it (with haptics), and on
// completion a color wash expands from the button out across the whole
// screen before revealing the next question underneath.
const LOCK_IN_HOLD_MS = 850;
const LOCK_IN_CIRCLE_SIZE = 40;

function LockInButton({ onLockedIn }: { onLockedIn: (origin: { x: number; y: number }) => void }) {
  const fill = useRef(new Animated.Value(0)).current;
  const btnRef = useRef<View>(null);
  const fillAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const cancel = () => {
    fillAnimRef.current?.stop();
    Animated.timing(fill, { toValue: 0, duration: 220, useNativeDriver: false }).start();
  };

  const start = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const anim = Animated.timing(fill, { toValue: 1, duration: LOCK_IN_HOLD_MS, easing: Easing.linear, useNativeDriver: false });
    fillAnimRef.current = anim;
    anim.start(({ finished }) => {
      if (!finished) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      btnRef.current?.measureInWindow((x, y, width, height) => {
        onLockedIn({ x: x + width / 2, y: y + height / 2 });
      });
    });
  };

  useEffect(() => () => { fillAnimRef.current?.stop(); }, []);

  // No ring/circle around it anymore — the fingerprint itself IS the size
  // the old circle was. Hold-progress feedback is now the icon's own
  // opacity/scale instead of a separate ring overlay.
  const iconOpacity = fill.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });
  const iconScale = fill.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.08] });

  return (
    <View style={styles.lockInWrap}>
      <Pressable onPressIn={start} onPressOut={cancel} hitSlop={16}>
        <View ref={btnRef} collapsable={false}>
          <Animated.Image
            source={ICON.fingerprint}
            tintColor="#000"
            style={[styles.lockInIcon, { opacity: iconOpacity, transform: [{ scale: iconScale }] }]}
            resizeMode="contain"
          />
        </View>
      </Pressable>
    </View>
  );
}

// The wash itself — a solid circle expanding from the fingerprint button's
// measured screen position out past every corner, so it fully covers the
// screen regardless of where the button sits. Advances the turn once fully
// covered (the swap happens hidden, same principle as the reaction-line
// fix from earlier), then fades away to reveal the next question.
function LockInWash({ origin, onAdvance, onDone }: { origin: { x: number; y: number }; onAdvance: () => void; onDone: () => void }) {
  const grow = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const { width, height } = Dimensions.get('window');
    const maxDist = Math.max(
      Math.hypot(origin.x, origin.y),
      Math.hypot(width - origin.x, origin.y),
      Math.hypot(origin.x, height - origin.y),
      Math.hypot(width - origin.x, height - origin.y),
    );
    const targetScale = (maxDist * 2.1) / LOCK_IN_CIRCLE_SIZE;
    // Was 620ms grow + 140ms hold + 380ms fade (~1.1s total) — reported as
    // too fast to register. Slower grow, a real hold at full coverage
    // before it starts fading, and a slower fade out.
    const growAnim = Animated.timing(grow, { toValue: targetScale, duration: 950, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    growAnim.start(({ finished }) => {
      if (!finished) return;
      onAdvance();
      Animated.timing(opacity, { toValue: 0, duration: 550, delay: 500, useNativeDriver: false }).start(({ finished: f2 }) => {
        if (f2) onDone();
      });
    });
    return () => growAnim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity, zIndex: 70 }]}>
      <Animated.View
        style={[
          styles.lockInWashCircle,
          { left: origin.x - LOCK_IN_CIRCLE_SIZE / 2, top: origin.y - LOCK_IN_CIRCLE_SIZE / 2, transform: [{ scale: grow }] },
        ]}
      />
    </Animated.View>
  );
}

// ── WashIn — the entry transition for both full-screen moments below. Was
// a plain opacity fade (1 → 0) on a white sheet — reported as invisible,
// which makes sense: fading white-on-white over an already-mostly-light
// screen has no visible motion to track. Now it's an actual sliding panel:
// starts fully covering the screen (briefly blank, like the previous
// screen got washed over), then slides up and off, with a thin black line
// on its bottom edge so the sweep itself is visible as it moves — the
// "outline" that was missing. useNativeDriver:false throughout, same
// reliability reasoning as LocationBubbles' entrance fix — this must never
// be the thing that fails to flush and leaves the screen stuck blank.
function WashIn({ children }: { children: React.ReactNode }) {
  const translateY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const screenH = Dimensions.get('window').height;
    const anim = Animated.timing(translateY, { toValue: -screenH, duration: 520, delay: 80, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      {children}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.washPanel, { transform: [{ translateY }] }]} />
    </>
  );
}

// ── FadeSequence — one line at a time, centered: fades in, holds, fades
// out, next line fades in. The LAST line fades in and stays (doesn't fade
// out) — onDone fires once it's settled, so the caller can bring in a
// Continue button after.
function FadeSequence({ lines, textStyle, onDone }: { lines: string[]; textStyle: any; onDone: () => void }) {
  const [index, setIndex] = useState(0);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const isLast = index === lines.length - 1;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    let fadeOut: Animated.CompositeAnimation | null = null;
    const fadeIn = Animated.timing(opacity, { toValue: 1, duration: 450, useNativeDriver: false });
    fadeIn.start(({ finished }) => {
      if (!finished) return;
      Haptics.selectionAsync();
      if (isLast) { onDone(); return; }
      // Was a 1150ms hold — reported as going too quick to actually read.
      holdTimer = setTimeout(() => {
        fadeOut = Animated.timing(opacity, { toValue: 0, duration: 450, useNativeDriver: false });
        fadeOut.start(({ finished: f2 }) => { if (f2) setIndex(i => i + 1); });
      }, 2000);
    });
    return () => {
      fadeIn.stop();
      if (holdTimer) clearTimeout(holdTimer);
      fadeOut?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  return <Animated.Text style={[textStyle, { opacity }]}>{lines[index]}</Animated.Text>;
}

// ── Shared shell for both full-screen beats (PART B and PART C) — same
// white background + colorful blob art (AppBackground) every question
// already uses, same one-line-at-a-time fade sequence, same font treatment
// throughout (one text style, no varying weights/sizes/accent colors —
// "black-and-white" means the TEXT is plain black, the background is where
// the color lives).
// `wash` defaults to true (the entry from the normal onboarding flow into
// PART B). PART C follows directly from PART B without one — two washes in
// a row read as the screen resetting twice; only the very first entry
// should wash.
function FullScreenMoment({ lines, onDone, wash = true }: { lines: string[]; onDone: () => void; wash?: boolean }) {
  const [linesDone, setLinesDone] = useState(false);
  const btnOpacity = useRef(new Animated.Value(0)).current;

  const handleSequenceDone = () => {
    setLinesDone(true);
    Animated.timing(btnOpacity, { toValue: 1, duration: 420, delay: 500, useNativeDriver: false }).start();
  };

  const content = (
    <View style={styles.momentOverlay}>
      <AppBackground />
      <View style={styles.momentCenter}>
        <FadeSequence lines={lines} textStyle={styles.momentLine} onDone={handleSequenceDone} />
      </View>
      {linesDone && (
        <Animated.View style={[styles.momentBtnWrap, { opacity: btnOpacity }]}>
          <BounceBtn style={styles.continueBtn} onPress={onDone}>
            <Text style={styles.continueBtnTxt}>Continue</Text>
          </BounceBtn>
        </Animated.View>
      )}
    </View>
  );

  return wash ? <WashIn>{content}</WashIn> : content;
}

// ── PART B — the wasted-reps payoff. Reads from computeWastedReps — the
// SAME function Part A's build-up used — so these numbers always match
// what the build-up just walked through. No FormPal mention anywhere in
// this screen — pure emotional impact; the reversal is PART C, right after.
// PART A now ends right at the sessions-count line — reported as coming
// "too late" when the full-screen moment used to wait for total-reps/lot-
// of-work/wasted to type out first. Those three now open THIS screen
// instead, so the full-screen moment starts immediately after the sessions
// line, then builds all the way through to the emotional payoff in one
// continuous run.
function WastedRepsPayoff({ answers, onDone }: { answers: Record<string, any>; onDone: () => void }) {
  const m = useMemo(() => computeWastedReps(answers), [answers]);
  const lines = useMemo(() => [
    `That's about ${m.totalReps.toLocaleString()} reps.`,
    "That's a lot of work.",
    `But at ${m.pct}% good form, ${m.wasted.toLocaleString()} of them barely built anything.`,
    "That's months of muscle — gone.",
    `With correct form, those ${m.wasted.toLocaleString()} reps would have built nearly twice the muscle.`,
  ], [m]);
  return <FullScreenMoment lines={lines} onDone={onDone} />;
}

// ── PART C — the reversal. Same shell as PART B, hands the potential back
// instead of dwelling in the loss. No wash — follows straight on from B.
function ReversalScreen({ onDone }: { onDone: () => void }) {
  const lines = useMemo(() => [
    "But wait — it's not too late.",
    'FormPal checks every rep.',
    'So from today, every one counts — and you build nearly 2x the muscle.',
  ], []);
  return <FullScreenMoment lines={lines} onDone={onDone} wash={false} />;
}

// The post-answer response — types out with the EXACT same mechanism and
// style as a question's own prompt (same useTypewriter, same TypedSegments,
// same activeLine style, same blinking cursor), so the user visibly watches
// it happen, same as any other line in this flow. This is deliberately
// separate from the plain, non-typed summary PastTurn shows in history
// (echoFor) — this line is a one-time, seen-live moment; the summary is the
// quiet permanent record.
function ReactionLine({ text, onDone }: { text: string; onDone: () => void }) {
  const segments: Segment[] = useMemo(() => [{ text }], [text]);
  const count = useTypewriter(text, true, () => void Haptics.selectionAsync(), onDone);
  return (
    <View style={styles.typeRow}>
      <TypedSegments segments={segments} count={count} style={styles.activeLine} />
      <BlinkCursor show={count < text.length} />
    </View>
  );
}

function BlinkCursor({ show }: { show: boolean }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!show) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0, duration: 420, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 420, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [show]);
  if (!show) return null;
  return <Animated.Text style={[styles.cursor, { opacity }]}>|</Animated.Text>;
}

// ── Option icon — customIcon (webp) takes priority, sfSymbol is the
// fallback, exactly like the real onboarding's option renderer ───────────

function OptIcon({ opt, selected }: { opt: OptionDef; selected: boolean }) {
  if (opt.customIcon) {
    // No background box — just the icon itself with rounded corners,
    // matching the real onboarding's plain (no-tint, no-badge) treatment.
    return <Image source={opt.customIcon} style={styles.pillIconImg} resizeMode="cover" />;
  }
  return (
    <View style={styles.pillIconWrap}>
      <SymbolView name={(opt.sfSymbol ?? 'circle.fill') as any} size={20} tintColor={selected ? ACCENT : Col.textSub} type="monochrome" style={{ width: 20, height: 20 }} />
    </View>
  );
}

// ── AnimatedPill — one option, popping in with a staggered bouncy spring
// (Cal AI style) instead of appearing flat/instant. Was reported as too
// much/too slow — the 65%→100% scale jump combined with a loose spring
// (friction 6) meant each pill visibly overshot and settled slowly, and a
// 55ms stagger over a 6-7-item list made the whole list take the better
// part of a second to finish arriving. Tightened: a much smaller starting
// scale delta (barely-there pop, not a jump), a stiffer/less bouncy spring
// that settles fast, and a shorter per-item delay so options still clearly
// arrive in order but the whole list is done arriving quickly. ──────────

// ── EntranceFade — a quick fade+rise for anything that used to just spawn
// in with no animation at all (the age/height wheel, the weight ruler).
// Deliberately simple/cheap (one native-driver timing, no spring) since
// it's just meant to soften an appearance, not be a set piece. ──────────

function EntranceFade({ children }: { children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(v, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  return <Animated.View style={{ opacity: v, transform: [{ translateY }] }}>{children}</Animated.View>;
}

function AnimatedPill({ index, children }: { index: number; children: React.ReactNode }) {
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.spring(pop, { toValue: 1, delay: index * 32, friction: 9, tension: 260, useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const scale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] });
  return <Animated.View style={{ opacity: pop, transform: [{ scale }] }}>{children}</Animated.View>;
}

// ── BounceBtn — drop-in Pressable replacement adding the small "everyday
// tap" spring bounce (scale down on press, spring back on release) PART 3
// asked for on every button/option. Deliberately subtle (0.96, not lower)
// so it stays out of the way of the bold, one-off animations reserved for
// big moments (rank reveal, math payoff) elsewhere in this file — contrast
// is what makes those land.
function BounceBtn({ style, onPress, disabled, children, ...rest }: {
  style?: any; onPress?: () => void; disabled?: boolean; children?: React.ReactNode; [key: string]: any;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const onPressIn = () => { if (!disabled) Animated.spring(scale, { toValue: 0.96, friction: 7, tension: 300, useNativeDriver: true }).start(); };
  const onPressOut = () => { Animated.spring(scale, { toValue: 1, friction: 5, tension: 300, useNativeDriver: true }).start(); };
  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} disabled={disabled} {...rest}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// ── MilestoneBurst — the small checkmark pop for a progress-bar quarter
// crossing (see the progressAnim effect above). Pops in, holds briefly,
// fades out; a fresh `key` per pulse just remounts it, no manual reset.
function MilestoneBurst() {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 5, tension: 200, useNativeDriver: true }),
      ]),
      Animated.timing(opacity, { toValue: 0, duration: 260, delay: 500, useNativeDriver: true }),
    ]).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Animated.View pointerEvents="none" style={[styles.milestoneBurst, { opacity, transform: [{ scale }] }]}>
      <SymbolView name="checkmark" size={12} tintColor="#fff" type="monochrome" style={{ width: 12, height: 12 }} />
    </Animated.View>
  );
}

// ── Answer echo + reaction copy — a quick line responding to the specific
// choice just made, held on screen for a beat before the turn advances into
// history. Not every turn gets a hand-written reaction (most of the plain
// biographical ones — name/age/height/weight/motivation/injuries/struggle/
// equipment/session length — just advance immediately as before); the ones
// that got one are the ones an honest reaction actually adds something to.
function echoFor(turn: Turn, answer: any): string | undefined {
  const NO_ECHO = new Set([
    'fact', 'mathReveal', 'mathLine',
    'rankIntro', 'rankFloating', 'rankFilling', 'rankAssess', 'rankReveal', 'rankProjection',
    'reviews', 'planReveal',
  ]);
  if (NO_ECHO.has(turn.kind)) return undefined;
  if (turn.kind === 'multiselect') return (answer as string[] | undefined)?.join(', ');
  if (turn.kind === 'ruler') return `${Number(answer).toFixed(1)} lbs`;
  if (turn.kind === 'guessSlider') return `${answer}%`;
  return answer != null ? String(answer) : undefined;
}

// Was a fixed formula — echo the raw answer back, then a dash, then a
// generic comment (e.g. "Build muscle — got it, let's build around that").
// Reads as generated because the SAME shape repeats every time regardless
// of what was actually said. Rewritten so every real option has its own
// specific, natural line that reacts to THAT answer without restating it.
function reactionFor(id: string, value: any): string | null {
  switch (id) {
    case 'startReason':
      switch (value) {
        case 'Build muscle': return "Perfect. That's exactly what we'll focus on.";
        case 'Look better, feel confident': return "That confidence shows up fast once the work starts paying off.";
        case 'Learn to train properly': return "Smart move — form is what actually makes the reps count.";
        case 'Get back on track': return "Everyone needs a reset sometimes. Let's make this one stick.";
        case 'Stay consistent': return "Consistency's the real unlock. Let's build a routine you can keep.";
        default: return null;
      }
    case 'followPlan':
      if (value === 'Yes') return "Good — we'll make it even more effective.";
      if (value === 'On and off') return "Let's make it stick this time.";
      return "That's about to change.";
    case 'frustration':
      switch (value) {
        case 'Not seeing results': return "That's the most frustrating place to be — let's change that.";
        case "Don't know if I'm doing it right": return "That uncertainty ends here.";
        case 'Staying consistent': return "Consistency's a skill, not a personality trait — it's learnable.";
        case 'Nothing really': return "Good — let's keep it that way.";
        default: return null;
      }
    case 'formConfidence':
      if (value === 'Yes') return "We'll put that to the test.";
      if (value === 'Not sure') return "Most people aren't — that's exactly the gap we're closing.";
      return "Totally normal. That's what we're here to fix.";
    case 'cardio':
      switch (value) {
        case 'Yes, regularly': return 'Good base to build on.';
        case 'Sometimes': return "That's a solid start.";
        case 'No, just lifting': return "Nothing wrong with that — lifting's the priority here anyway.";
        case 'I want to add some': return "We'll work that in.";
        default: return null;
      }
    case 'cardioTypes': {
      if (!Array.isArray(value) || !value.length) return null;
      const lines: Record<string, string> = {
        Running: 'Good — running pairs well with a lifting split.',
        Cycling: "Nice, cardio's covered then.",
        Swimming: 'Full-body conditioning, nice pick.',
        Rowing: "That's a serious engine builder.",
        HIIT: 'Short and brutal — respect.',
        Walking: "Underrated. Keep it up.",
        Sports: "Nothing beats getting your cardio from something you actually enjoy.",
      };
      return lines[value[0]] ?? "Good — that'll round things out.";
    }
    case 'trainTime':
      switch (value) {
        case 'Morning': return 'Mornings set the tone for the whole day.';
        case 'Afternoon': return 'Good — a natural break in the day.';
        case 'Evening': return "Evening training's great for shaking off the day.";
        case 'Varies': return "Flexible works too, as long as it happens.";
        default: return null;
      }
    case 'successVision':
      switch (value) {
        case 'Visibly more muscle': return "That's the classic payoff — and it's closer than you think.";
        case 'Noticeably stronger lifts': return "Strength numbers don't lie. We'll chase those.";
        case 'Leaner and more defined': return "Definition comes from the details — exactly what we're dialing in.";
        case 'Confident with my shirt off': return "That confidence is earned, not given. Let's earn it.";
        case 'Finally seeing results': return "The frustrating part is almost over.";
        case 'Knowing my form is right': return "That certainty is the whole point of this app.";
        default: return null;
      }
    case 'howHeard':
      switch (value) {
        case 'Instagram / TikTok': return 'Glad it caught your eye.';
        case 'Friend or referral': return 'The best kind of recommendation.';
        case 'App Store search': return 'You went looking — that says something.';
        case 'Google / web search': return 'Good research instincts.';
        default: return 'Glad you found us either way.';
      }
    case 'days': {
      const n = parseInt(String(value), 10) || 0;
      if (n >= 6) return "That's serious dedication.";
      if (n >= 4) return 'Solid, consistent routine.';
      if (n >= 2) return 'Consistency beats intensity.';
      return 'Every session counts, even one.';
    }
    case 'trainDuration':
      switch (value) {
        case 'Just starting': return 'Clean slate — no bad habits to unlearn.';
        case '1-6 months': return "You're past the hardest part — showing up.";
        case '6-12 months': return "Almost a year in — that's real momentum.";
        case '1-2 years': return "That's enough time to know this isn't a phase.";
        case '2-5 years': return "You've clearly put in the time.";
        case '5-10 years': return "That's serious dedication.";
        case '10+ years': return 'A decade-plus. Respect.';
        default: return null;
      }
    case 'formGuess':
      if (value >= 85) return 'Most people land lower than they think — we\'ll see.';
      if (value <= 40) return "At least you're being honest with yourself.";
      return "Let's see what that actually adds up to.";
    case 'experience':
      switch (value) {
        case 'Beginner': return 'Honestly the best time to start — before bad habits set in.';
        case 'Some experience': return "Enough to know what you don't know yet.";
        case 'Intermediate': return "Good base — let's sharpen it.";
        case 'Advanced': return "Let's make sure your form matches your effort.";
        default: return null;
      }
    case 'duration':
      switch (value) {
        case '15-20 min': return 'Short and efficient — no wasted time.';
        case '30 min': return 'A solid, sustainable window.';
        case '45 min': return 'Enough time to really work.';
        case '60 min': return 'A real session.';
        case '75+ min': return "That's serious volume.";
        default: return null;
      }
    case 'sex':
      return 'Got it.';
    case 'goal': {
      if (!Array.isArray(value) || !value.length) return null;
      const lines: Record<string, string> = {
        'Build muscle & strength': "That's the foundation everything else builds on.",
        'Lose weight': "Form matters even more when you're cutting — good call focusing on it.",
        'Improve form': 'That\'s exactly what this app is built for.',
        'Stay consistent': 'Consistency beats any single great workout.',
        'General fitness': 'A solid, well-rounded goal.',
      };
      const base = lines[value[0]] ?? "Good — that'll shape the plan.";
      return value.length > 1 ? `${base} Plus a few more in the mix.` : base;
    }
    case 'injuries':
      return Array.isArray(value) && value.length && value[0] !== 'No injuries — all clear' ? "Noted — we'll train around that." : "Good — nothing holding you back.";
    case 'struggle': {
      if (!Array.isArray(value) || !value.length) return null;
      const lines: Record<string, string> = {
        'Not seeing results': "That's the most frustrating place to be — let's change that.",
        "Not sure if I'm training right": 'That uncertainty ends here.',
        'Staying consistent': "Consistency's a skill, not a personality trait — it's learnable.",
        'Losing motivation': 'That happens to everyone eventually. A visible plan helps a lot.',
        'Injuries or pain': "We'll make sure your form isn't making that worse.",
        'Nothing — just ready to start': "Then let's get started.",
      };
      return lines[value[0]] ?? "Noted — we'll factor that in.";
    }
    case 'trainingLocation':
      switch (value) {
        case 'Home': return 'Minimal kit, maximum consistency — that works.';
        case 'Gym': return "Full setup — we'll put it to use.";
        case 'Mix of both': return "Flexible. We'll build around wherever you are.";
        default: return null;
      }
    case 'notifications':
      return value === 'Yes please' ? 'Good — reminders make consistency easier.' : "Noted — you'll drive it yourself.";
    default:
      return null;
  }
}

// ── Screen ───────────────────────────────────────────────────────────────

export default function OnboardingTestScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  // Tracks the active turn's absolute Y (from the outer wrapper's onLayout,
  // same value pinActiveTurn uses) and its OWN content height (from an
  // inner wrapper's onLayout that excludes the trailing spacer) — combined,
  // these give the exact scroll position that clears this turn's content
  // out of view. Used by commitAndAdvance to scroll away BEFORE the answer
  // swaps to its settled summary, so that swap is never seen happening.
  const activeTurnYRef = useRef(0);
  const activeContentRef = useRef<{ y: number; height: number } | null>(null);

  const [answers, setAnswers]     = useState<Record<string, any>>({});
  const [turnIndex, setTurnIndex] = useState(0);
  // Was a plain boolean reset via a useEffect keyed on [turnIndex] — but
  // effects run AFTER the render that changes `current` commits, so for
  // one frame the newly-mounted ActiveTurn received the NEW turn together
  // with the OLD (stale, still-true) typingDone value, and briefly showed
  // that turn's input UI before its prompt had typed a single character —
  // the "weight picker flashes, then the question types out" glitch.
  // Deriving typingDone from "does the id that finished typing match the
  // current turn's id" instead of a manually-reset flag makes it correct
  // on every render with no lag, no effect needed.
  const [typingDoneId, setTypingDoneId] = useState<string | null>(null);
  const [multiTemp, setMultiTemp]   = useState<string[]>([]);
  const [nameInput, setNameInput]   = useState('');
  const [wheelVal, setWheelVal]     = useState('');
  const [rulerVal, setRulerVal]     = useState(160);
  const [guessPct, setGuessPct]     = useState(50);
  const [guessTouched, setGuessTouched] = useState(false);
  const [selectTemp, setSelectTemp] = useState<string | null>(null);
  // Locks the ScrollView for the duration of a slider drag — see
  // FormGuessSlider's comment for why this exists.
  const [sliderDragging, setSliderDragging] = useState(false);
  // The response currently typing out (see commitAndAdvance/ReactionLine
  // below) — declared up here, not next to commitAndAdvance, because the
  // per-turn reset effect below needs to clear it and runs before that.
  const [reactionPending, setReactionPending] = useState<{ id: string; value: any } | null>(null);

  const visibleFlow = useMemo(
    () => FLOW.filter(t => !t.showIf || t.showIf(answers)).flatMap(t => expandMathTurns(t, answers)),
    [answers],
  );
  const current = visibleFlow[turnIndex];
  const isDone = !current;
  const typingDone = !!current && typingDoneId === current.id;

  // Overall progress bar (PART 3) — fills smoothly toward turnIndex/total on
  // every advance, never jumps. A quarter-mark crossing (25/50/75/100%)
  // fires a small checkmark burst next to it — a "section milestone," kept
  // deliberately subtle since it's an everyday-tap-tier moment, not a big
  // one like the rank reveal.
  const progressAnim = useRef(new Animated.Value(0)).current;
  const [milestonePulse, setMilestonePulse] = useState(0);
  const lastMilestoneRef = useRef(0);
  useEffect(() => {
    const total = visibleFlow.length || 1;
    const pct = Math.min(1, turnIndex / total);
    Animated.timing(progressAnim, { toValue: pct, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    const milestone = Math.floor(pct * 4);
    if (milestone > lastMilestoneRef.current) {
      lastMilestoneRef.current = milestone;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setMilestonePulse(p => p + 1);
    }
  }, [turnIndex, visibleFlow.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Seeds every turn's temp input state from any EXISTING answer for that
  // turn's id, falling back to a blank default when there isn't one. That
  // single rule handles both directions: moving forward to a fresh turn
  // (no existing answer → blanks, unchanged behavior) and moving BACK to
  // one already answered (existing answer → pre-filled, selected/typed-in
  // state visible immediately) — see goBack below, which is the only other
  // place turnIndex moves backward.
  useEffect(() => {
    const id = current?.id;
    const existing = id ? answers[id] : undefined;
    setMultiTemp(Array.isArray(existing) ? existing : []);
    if (current?.kind === 'wheel') {
      const wheelDefaults: Record<string, string> = { height: `5'8"`, age: '18' };
      setWheelVal(typeof existing === 'string' ? existing : (wheelDefaults[current.wheelKind] ?? '18'));
    }
    if (current?.kind === 'ruler') setRulerVal(typeof existing === 'number' ? existing : 160);
    if (current?.kind === 'guessSlider') { setGuessPct(typeof existing === 'number' ? existing : 50); setGuessTouched(existing != null); }
    if (current?.kind === 'select' || current?.kind === 'locationBubbles') setSelectTemp(typeof existing === 'string' ? existing : null);
    else setSelectTemp(null);
    if (current?.kind === 'text') setNameInput(typeof existing === 'string' ? existing : '');
    setReactionPending(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnIndex]);

  // Back arrow — steps to the previous turn and, since the effect above now
  // seeds from `answers`, its answer shows up already selected/filled in
  // automatically. Also marks it as already-typed so the prompt doesn't
  // replay the typewriter for a question they've already seen.
  const goBack = () => {
    if (turnIndex === 0) return;
    const prevTurn = visibleFlow[turnIndex - 1];
    if (prevTurn) setTypingDoneId(prevTurn.id);
    setTurnIndex(i => i - 1);
  };

  // Dev-only shortcut for testing the rank section without walking the
  // whole flow every time — jumps straight to the rank intro screen.
  // Rank screens are full-screen overlays gated purely on turn kind (see
  // RANK_FULLSCREEN_KINDS), not on typingDoneId, so no typewriter state to
  // fake here the way goBack has to.
  const skipToRanks = () => {
    const idx = visibleFlow.findIndex(t => t.id === 'rankIntro');
    if (idx < 0) return;
    setReactionPending(null);
    setTurnIndex(idx);
  };

  const wordTick = () => Haptics.selectionAsync();

  // Scroll mechanism, take 5. Take 4 (scrollToEnd, fired imperatively on
  // every advance) was wrong in the opposite direction: it jumped straight
  // to the bottom of the 85%-height spacer, which is WAY past the active
  // turn while it's still typing — so the line actually being typed sat
  // off-screen below the fold until the user scrolled back up. What's
  // actually wanted: the active turn pinned to the TOP of the viewport for
  // as long as it's on screen (typing and after), and left alone if the
  // user manually scrolls away from it. So instead of scrollToEnd, this
  // measures the active turn's own y-position via onLayout (fires on
  // mount, and again any time it shifts down because a new past turn was
  // added above it) and scrolls exactly there — never further. No more
  // imperative scrollDown() calls scattered through the handlers; layout
  // is the only trigger now.
  // Going BACK shrinks the scroll content (the turns that used to be past
  // the resurrected turn stop being rendered, and the 85%-height spacer
  // moves back up with it), unlike every forward step, which only ever
  // grows it. A single RAF-deferred scrollTo — fine for growth — was
  // reportedly landing back at the top of the page after Back: the
  // ScrollView's own internal position clamping when its content shrinks
  // can override a scrollTo that fired before that shrink finished
  // settling. A second, slightly-delayed correction re-asserts the target
  // after that settles, regardless of which direction caused the resize.
  const pinActiveTurn = (y: number) => {
    const target = Math.max(y - 12, 0);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: target, animated: true });
    });
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: target, animated: false });
    }, 130);
  };

  // Two SEPARATE things, not one merged into the other:
  //   1. The RESPONSE — a reaction to the specific answer, typed out
  //      visibly (ReactionLine, same typewriter/style as any question) so
  //      the user actually watches it happen, right where they're already
  //      looking. Transient — exists only while this turn is still active.
  //   2. The SUMMARY — the plain "you said X" record (echoFor), never
  //      typed, shown only once this turn is history (PastTurn) — the
  //      quiet thing you'd see if you scrolled back up, not something
  //      played out live.
  // Sequence: commitAndAdvance shows the response typing (if this answer
  // has one) and STOPS there; advanceNow (the actual scroll-away + state
  // swap) only runs once ReactionLine's onDone fires, i.e. after the
  // response has fully typed out and settled. No reaction → advances
  // immediately, same as before.
  const reactionText = reactionPending ? reactionFor(reactionPending.id, reactionPending.value) : null;

  // The actual scroll-away + state swap — unchanged from before: scroll
  // happens FIRST while this turn's content is still untouched (using
  // activeTurnYRef + activeContentRef to land just past this turn's real
  // content, not overshooting into the trailing spacer), and only once
  // that scroll has had time to move it off-screen does the state update,
  // so the swap to history happens somewhere the user isn't looking.
  const advanceNow = (id: string, value: any) => {
    const content = activeContentRef.current;
    if (content) {
      const target = activeTurnYRef.current + content.height + 16;
      scrollRef.current?.scrollTo({ y: target, animated: true });
    }
    setTimeout(() => {
      setAnswers(a => ({ ...a, [id]: value }));
      // Cleared HERE, in the exact same batched update as turnIndex — not a
      // moment earlier. Clearing it early (what this used to do) flips
      // reactionActive false while this turn is still the active/on-screen
      // one, which re-exposes its pills for the remainder of this delay —
      // "answer choices reappear, then get taken away again" when turnIndex
      // finally catches up. Batching them together means there's no render
      // in between where the old turn is current AND unanswered-looking.
      setReactionPending(null);
      setTurnIndex(i => i + 1);
    }, 300);
  };

  const commitAndAdvance = (id: string, value: any) => {
    if (reactionFor(id, value)) {
      setReactionPending({ id, value });
    } else {
      advanceNow(id, value);
    }
  };

  // Fires once the response has fully typed out — holds briefly so it can
  // actually be read, then hands off to the normal scroll-away + advance.
  const onReactionTyped = () => {
    if (!reactionPending) return;
    const { id, value } = reactionPending;
    // Holds so the now-fully-typed response can actually be read, then
    // hands straight off to the scroll-away — reactionPending itself stays
    // set (keeping pills hidden, response text in place) the whole time;
    // see advanceNow for exactly where/when it actually clears.
    setTimeout(() => advanceNow(id, value), 500);
  };

  // Single-select used to commit and advance the instant you tapped an
  // option. Now tapping just picks/highlights it (like multiselect already
  // did) — advancing needs an explicit Continue tap, same as every other
  // question in this flow.
  const pickOption = (label: string) => {
    Haptics.selectionAsync();
    setSelectTemp(label);
  };

  const confirmSelect = (id: string) => {
    if (!selectTemp) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    commitAndAdvance(id, selectTemp);
  };

  const toggleMultiOption = (opt: OptionDef, clearAllOption?: string) => {
    Haptics.selectionAsync();
    setMultiTemp(cur => {
      if (clearAllOption && opt.label === clearAllOption) return cur.includes(opt.label) ? [] : [opt.label];
      const withoutClear = clearAllOption ? cur.filter(o => o !== clearAllOption) : cur;
      return withoutClear.includes(opt.label) ? withoutClear.filter(o => o !== opt.label) : [...withoutClear, opt.label];
    });
  };

  const confirmMulti = (id: string) => {
    if (multiTemp.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    commitAndAdvance(id, multiTemp);
  };

  const confirmName = () => {
    const v = nameInput.trim();
    if (!v) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    commitAndAdvance('name', v);
    setNameInput('');
  };

  const confirmWheel = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    commitAndAdvance(id, wheelVal);
  };

  const confirmRuler = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    commitAndAdvance(id, rulerVal);
  };

  const confirmGuess = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    commitAndAdvance(id, guessPct);
  };

  const onGuessDragStart = () => {
    setSliderDragging(true);
    setGuessTouched(true);
  };
  const onGuessDragEnd = () => setSliderDragging(false);

  // Generic "acknowledge and advance" for every set-piece turn that isn't
  // really a question — facts, the math reveals, the rank ladder, reviews,
  // the photo scan's final continue, the plan reveal. None of these get a
  // reaction line; they just need a Continue tap so the user controls the
  // pace, per "no auto-advance."
  const confirmInert = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    commitAndAdvance(id, true);
  };

  // rankAssess collects 3 answers on one screen (see RankAssessScreen) —
  // needs its own commit path since commitAndAdvance only ever handles one
  // id/value pair at a time.
  const confirmRankAssess = (pushups: number, pullups: number, squats: number) => {
    setAnswers(a => ({ ...a, assessPushups: pushups, assessPullups: pullups, assessSquats: squats }));
    setTurnIndex(i => i + 1);
  };

  // Injury math's "lock it in" moment — captures the turn id at the moment
  // the hold completes (not read fresh from `current` later), so the wash's
  // eventual advance always targets the right turn regardless of anything
  // else re-rendering in between.
  const [lockIn, setLockIn] = useState<{ origin: { x: number; y: number }; turnId: string } | null>(null);
  const onLockIn = (origin: { x: number; y: number }) => {
    if (current) setLockIn({ origin, turnId: current.id });
  };

  const name = answers.name as string | undefined;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1 }}>
        <AppBackground />
        <View style={{ flex: 1, paddingTop: insets.top }}>
          <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={12}>
            <View style={styles.closeCircle}>
              <SymbolView name="xmark" size={13} tintColor={Col.textSub} type="monochrome" style={{ width: 13, height: 13 }} />
            </View>
          </Pressable>

          {/* Back button used to be position:'absolute' at a hand-guessed
              top offset — reported twice as sitting too high (once right
              up against the status bar). Guessing pixel offsets against
              insets.top was never going to be reliable across devices.
              Put in normal flow instead, on the SAME row as the mark dot
              (which was never reported as mispositioned) — it inherits
              that already-correct vertical position for free, no more
              guessing. A same-width empty spacer on the right keeps the
              dot visually centered whether or not the back button is
              showing. */}
          <View style={styles.headerRow}>
            <View style={styles.headerSide}>
              {turnIndex > 0 && (
                <Pressable onPress={goBack} hitSlop={12}>
                  <View style={styles.backCircle}>
                    <SymbolView name="chevron.left" size={15} tintColor="#fff" type="monochrome" style={{ width: 15, height: 15 }} />
                  </View>
                </Pressable>
              )}
            </View>
            <View style={styles.mark} />
            {/* Dev-only testing shortcut — only shown at the very start of
                the flow. Placed here (in normal flow, right next to the
                mark dot) instead of a guessed absolute top offset — same
                fix as the back button above, for the same reason: a
                hand-picked pixel offset against insets.top isn't reliable
                across devices, but this row's own vertical position
                already is. Not part of the real onboarding.tsx flow. */}
            {turnIndex === 0 ? (
              <Pressable onPress={skipToRanks} style={styles.devSkipBtn} hitSlop={8}>
                <Text style={styles.devSkipBtnTxt}>Skip to rank page</Text>
              </Pressable>
            ) : (
              <View style={styles.headerSide} />
            )}
          </View>

          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
            </View>
            {milestonePulse > 0 && <MilestoneBurst key={milestonePulse} />}
          </View>

          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]}
            showsVerticalScrollIndicator={false}
            scrollEnabled={!sliderDragging}
            onContentSizeChange={() => { if (isDone) scrollRef.current?.scrollToEnd({ animated: true }); }}
          >
            {visibleFlow.slice(0, turnIndex).map((t, i) => (
              <PastTurn key={t.id + i} turn={t} answer={answers[t.id]} answers={answers} />
            ))}

            {current && !RANK_FULLSCREEN_KINDS.has(current.kind) && current.kind !== 'wastedRepsPayoff' && current.kind !== 'reversalScreen' && (
              <View
                key={current.id}
                onLayout={(e) => { activeTurnYRef.current = e.nativeEvent.layout.y; pinActiveTurn(e.nativeEvent.layout.y); }}
              >
                {/* Separate inner wrapper (excludes the trailing spacer)
                    so commitAndAdvance can measure just the real content's
                    bottom edge — see activeContentRef below. */}
                <View onLayout={(e) => { activeContentRef.current = e.nativeEvent.layout; }}>
                  <ActiveTurn
                    turn={current}
                    answers={answers}
                    typingDone={typingDone}
                    onWord={wordTick}
                    onDone={() => setTypingDoneId(current.id)}
                    selectTemp={selectTemp}
                    onPickOption={pickOption}
                    onConfirmSelect={confirmSelect}
                    multiTemp={multiTemp}
                    onToggleMulti={toggleMultiOption}
                    onConfirmMulti={confirmMulti}
                    nameInput={nameInput}
                    onChangeName={setNameInput}
                    onConfirmName={confirmName}
                    wheelVal={wheelVal}
                    onChangeWheel={setWheelVal}
                    onConfirmWheel={confirmWheel}
                    rulerVal={rulerVal}
                    onChangeRuler={setRulerVal}
                    onConfirmRuler={confirmRuler}
                    guessPct={guessPct}
                    guessTouched={guessTouched}
                    onChangeGuess={setGuessPct}
                    onGuessDragStart={onGuessDragStart}
                    onGuessDragEnd={onGuessDragEnd}
                    onConfirmGuess={confirmGuess}
                    onConfirmInert={confirmInert}
                    reactionText={reactionText}
                    onReactionTyped={onReactionTyped}
                  />
                </View>
                {/* Room below the active turn so it can sit pinned near the
                    top of the viewport instead of jammed against the
                    bottom edge once it's the last thing in the scroll. */}
                <View style={{ height: SPACER_H }} />
              </View>
            )}

            {isDone && (
              <View style={styles.doneWrap}>
                <Text style={styles.doneText}>
                  All set{name ? `, ${name}` : ''}. <Text style={styles.accent}>That's the whole flow.</Text>
                </Text>
                <Pressable style={styles.finishBtn} onPress={() => router.back()}>
                  <Text style={styles.finishBtnTxt}>Close</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>

          {/* Fixed to the bottom of the screen — like the old iPhone home
              button position — not scrolling with the math text above it.
              Only shown once the closing line has fully typed. */}
          {current?.kind === 'mathLine' && current.special === 'lockIn' && typingDone && (
            <View style={styles.lockInFixedWrap} pointerEvents="box-none">
              <LockInButton onLockedIn={onLockIn} />
            </View>
          )}
        </View>

        {/* PART B — the wasted-reps payoff. Deliberately NOT inside the
            ScrollView: a full-screen cinematic beat with its own count-up,
            not another chat turn to autoscroll to. Absolutely positioned
            over everything (header included) so it reads as its own
            screen, then unmounts the instant the turn advances. */}
        {current?.kind === 'wastedRepsPayoff' && (
          <WastedRepsPayoff answers={answers} onDone={() => confirmInert(current.id)} />
        )}

        {current?.kind === 'reversalScreen' && (
          <ReversalScreen onDone={() => confirmInert(current.id)} />
        )}

        {current?.kind === 'rankIntro' && (
          <RankIntroScreen onDone={() => confirmInert(current.id)} />
        )}

        {current?.kind === 'rankFloating' && (
          <RankFloatingScreen onDone={() => confirmInert(current.id)} />
        )}

        {current?.kind === 'rankFilling' && (
          <RankFillingScreen onDone={() => confirmInert(current.id)} />
        )}

        {current?.kind === 'rankAssess' && (
          <RankAssessScreen onDone={confirmRankAssess} />
        )}

        {current?.kind === 'rankReveal' && (
          <RankRevealScreen answers={answers} onDone={() => confirmInert(current.id)} />
        )}

        {current?.kind === 'rankProjection' && (
          <RankProjectionScreen answers={answers} onDone={() => confirmInert(current.id)} />
        )}

        {lockIn && (
          <LockInWash
            origin={lockIn.origin}
            onAdvance={() => commitAndAdvance(lockIn.turnId, true)}
            onDone={() => setLockIn(null)}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ── Past (already-answered) turn — dimmed, static, no animation ──────────

// A turn that's scrolled into history. Used to just show the typed prompt
// (+ echoed answer) — but for turns with a graph/graphic (the fact charts,
// the training bubbles, the math reveal), that meant the actual visual
// vanished the moment you answered and it became "past": the chart/bubbles/
// wasted-rep numbers just disappeared, replaced by the bare prompt line.
// Now it re-renders the same visual in its settled/instant state so it
// stays on screen for good, which is what "graphs must persist" meant.
function PastTurn({ turn, answer, answers }: { turn: Turn; answer: any; answers: Record<string, any> }) {
  const segments: Segment[] = turn.kind === 'fact' || turn.kind === 'mathLine' ? turn.segments
    : 'prompt' in turn ? [{ text: turn.prompt }] : [];
  const fullText = useMemo(() => segments.map(s => s.text).join(''), [segments]);
  // Every full-screen beat (wasted-reps payoff, reversal, and all 6 rank
  // screens) is its own cinematic screen, never a scrollable chat turn —
  // nothing to show once it's history.
  if (turn.kind === 'wastedRepsPayoff' || turn.kind === 'reversalScreen' || RANK_FULLSCREEN_KINDS.has(turn.kind)) return null;
  // Plain summary ONLY — the reaction/response is a separate, transient
  // thing (ReactionLine, typed out live on the still-active turn, see
  // commitAndAdvance) that never persists into history. What's left behind
  // here once this turn scrolls past is just the quiet "you said X" record.
  const echo = echoFor(turn, answer);
  return (
    <View style={styles.pastTurn}>
      <TypedSegments
        segments={segments}
        count={fullText.length}
        style={styles.pastLine}
        accentStyle={turn.kind === 'mathLine' ? styles.revealAccent : undefined}
      />
      {echo ? <Text style={styles.echoLine}>{echo}</Text> : null}
      {turn.kind === 'fact' && turn.visual === 'effortBars' && <EntranceFade><EffortBars /></EntranceFade>}
      {turn.kind === 'fact' && turn.visual === 'planChart' && <PlanGrowthChart />}
      {turn.kind === 'locationBubbles' && <LocationBubbles selected={answer} onPick={() => {}} />}
      {turn.kind === 'reviews' && <ReviewsCarousel />}
    </View>
  );
}

// ── Active turn — typewriter, then its input UI ───────────────────────────

function ActiveTurn({
  turn, answers, typingDone, onWord, onDone,
  selectTemp, onPickOption, onConfirmSelect,
  multiTemp, onToggleMulti, onConfirmMulti,
  nameInput, onChangeName, onConfirmName,
  wheelVal, onChangeWheel, onConfirmWheel,
  rulerVal, onChangeRuler, onConfirmRuler,
  guessPct, guessTouched, onChangeGuess, onGuessDragStart, onGuessDragEnd, onConfirmGuess,
  onConfirmInert, reactionText, onReactionTyped,
}: {
  turn: Turn;
  answers: Record<string, any>;
  typingDone: boolean;
  onWord: () => void;
  onDone: () => void;
  selectTemp: string | null;
  onPickOption: (label: string) => void;
  onConfirmSelect: (id: string) => void;
  multiTemp: string[];
  onToggleMulti: (opt: OptionDef, clearAllOption?: string) => void;
  onConfirmMulti: (id: string) => void;
  nameInput: string;
  onChangeName: (v: string) => void;
  onConfirmName: () => void;
  wheelVal: string;
  onChangeWheel: (v: string) => void;
  onConfirmWheel: (id: string) => void;
  rulerVal: number;
  onChangeRuler: (v: number) => void;
  onConfirmRuler: (id: string) => void;
  guessPct: number;
  guessTouched: boolean;
  onChangeGuess: (v: number) => void;
  onGuessDragStart: () => void;
  onGuessDragEnd: () => void;
  onConfirmGuess: (id: string) => void;
  onConfirmInert: (id: string) => void;
  reactionText: string | null;
  onReactionTyped: () => void;
}) {
  const segments: Segment[] = turn.kind === 'fact' || turn.kind === 'mathLine' ? turn.segments
    : 'prompt' in turn ? [{ text: turn.prompt }] : [];
  const fullText = segments.map(s => s.text).join('');
  // Was hardcoded `true` — meant EVERY mount retyped from scratch, even
  // when goBack had already marked this turn's id as typingDoneId before
  // it mounted (a fresh `key={current.id}` remount doesn't care what
  // finished typing before). Tying `active` to `!typingDone` means a
  // back-navigated turn (typingDone already true on first render) shows
  // its full text instantly — see useTypewriter's `active ? 0 : fullText.length`
  // initial state — while a genuinely new turn (typingDone starts false)
  // still types out normally.
  const count = useTypewriter(fullText, !typingDone, onWord, onDone);

  // Whether a reaction to the just-picked answer is currently typing out on
  // THIS turn — see ReactionLine below and commitAndAdvance in the screen
  // component. While true, every kind-specific answer UI (pills, Continue,
  // etc.) is hidden so the reaction is the only thing on screen; once it's
  // done typing, the screen scrolls away and this turn becomes history,
  // where it's the plain summary (echoFor) that persists, not this text.
  const reactionActive = reactionText != null;

  return (
    <View style={styles.activeTurn}>
      <View style={styles.typeRow}>
        <TypedSegments
          segments={segments}
          count={count}
          style={styles.activeLine}
          accentStyle={turn.kind === 'mathLine' ? styles.revealAccent : undefined}
        />
        <BlinkCursor show={!typingDone} />
      </View>

      {reactionActive && <ReactionLine text={reactionText!} onDone={onReactionTyped} />}

      {typingDone && !reactionActive && turn.kind === 'fact' && turn.visual === 'effortBars' && <EntranceFade><EffortBars /></EntranceFade>}
      {typingDone && !reactionActive && turn.kind === 'fact' && turn.visual === 'planChart' && <PlanGrowthChart />}

      {typingDone && !reactionActive && turn.kind === 'fact' && (
        <BounceBtn style={styles.continueBtn} onPress={() => onConfirmInert(turn.id)}>
          <Text style={styles.continueBtnTxt}>Continue</Text>
        </BounceBtn>
      )}

      {/* Math, one line-group per ordinary turn — this IS the normal
          question layout (same typeRow above, same pin-to-top, same
          everything). But it's not really a "choice," so instead of an
          answer pill it's just the check-in word with a small side arrow —
          no white box, no background, minimal. */}
      {typingDone && !reactionActive && turn.kind === 'mathLine' && turn.special !== 'lockIn' && (
        <View style={styles.mathCheckInRow}>
          <Pressable onPress={() => onConfirmInert(turn.id)} hitSlop={12}>
            <Text style={styles.mathCheckInTxt}>{turn.checkIn}  ›</Text>
          </Pressable>
        </View>
      )}


      {/* Bubbles sit in a fixed-height (380px) container, unlike every
          other answer kind's UI, which is roughly as tall as its own
          content. Hiding the whole block the instant the reaction starts
          (like every other kind does) meant this turn's measured content
          height dropped by ~380px in the same frame the reaction line
          appeared — racing the pre-scroll height measurement commitAndAdvance
          relies on, which every other kind is too small to visibly break.
          Fix: bubbles stay mounted (frozen, non-interactive) for the whole
          reaction→advance sequence — only the Continue button hides — so
          this turn's content height never makes that sudden jump. */}
      {typingDone && turn.kind === 'locationBubbles' && (
        <>
          <LocationBubbles selected={selectTemp} onPick={reactionActive ? () => {} : onPickOption} />
          {!reactionActive && (
            <BounceBtn style={[styles.continueBtn, !selectTemp && styles.continueBtnDisabled]} disabled={!selectTemp} onPress={() => onConfirmSelect(turn.id)}>
              <Text style={[styles.continueBtnTxt, !selectTemp && styles.continueBtnTxtDisabled]}>Continue</Text>
            </BounceBtn>
          )}
        </>
      )}

      {typingDone && !reactionActive && turn.kind === 'reviews' && (
        <>
          <ReviewsCarousel />
          <BounceBtn style={styles.continueBtn} onPress={() => onConfirmInert(turn.id)}>
            <Text style={styles.continueBtnTxt}>Continue</Text>
          </BounceBtn>
        </>
      )}

      {typingDone && !reactionActive && turn.kind === 'planReveal' && (
        <PlanReveal answers={answers} onConfirm={() => onConfirmInert(turn.id)} />
      )}

      {typingDone && !reactionActive && turn.kind === 'select' && (
        <>
          <View style={styles.pillWrap}>
            {resolveOptions(turn, answers).map((o, i) => {
              const sel = selectTemp === o.label;
              return (
                <AnimatedPill key={o.label} index={i}>
                  <BounceBtn style={[styles.pill, sel && styles.pillSel]} onPress={() => onPickOption(o.label)}>
                    <OptIcon opt={o} selected={sel} />
                    <Text style={[styles.pillLabel, sel && styles.pillLabelSel]}>{o.label}</Text>
                  </BounceBtn>
                </AnimatedPill>
              );
            })}
          </View>
          <BounceBtn style={[styles.continueBtn, !selectTemp && styles.continueBtnDisabled]} disabled={!selectTemp} onPress={() => onConfirmSelect(turn.id)}>
            <Text style={[styles.continueBtnTxt, !selectTemp && styles.continueBtnTxtDisabled]}>Continue</Text>
          </BounceBtn>
        </>
      )}

      {typingDone && !reactionActive && turn.kind === 'multiselect' && (
        <>
          <View style={styles.pillWrap}>
            {resolveMultiOptions(turn, answers).map((o, i) => {
              const sel = multiTemp.includes(o.label);
              return (
                <AnimatedPill key={o.label} index={i}>
                  <BounceBtn style={[styles.pill, sel && styles.pillSel]} onPress={() => onToggleMulti(o, turn.clearAllOption)}>
                    <OptIcon opt={o} selected={sel} />
                    <Text style={[styles.pillLabel, sel && styles.pillLabelSel]}>{o.label}</Text>
                  </BounceBtn>
                </AnimatedPill>
              );
            })}
          </View>
          <BounceBtn style={[styles.continueBtn, multiTemp.length === 0 && styles.continueBtnDisabled]} disabled={multiTemp.length === 0} onPress={() => onConfirmMulti(turn.id)}>
            <Text style={[styles.continueBtnTxt, multiTemp.length === 0 && styles.continueBtnTxtDisabled]}>Continue</Text>
          </BounceBtn>
        </>
      )}

      {typingDone && !reactionActive && turn.kind === 'text' && (
        <View style={styles.textInputRow}>
          <TextInput
            value={nameInput} onChangeText={onChangeName} placeholder={turn.placeholder} placeholderTextColor={Col.textDim}
            style={styles.textInput} autoFocus returnKeyType="done" onSubmitEditing={onConfirmName}
          />
          <BounceBtn style={[styles.continueBtn, !nameInput.trim() && styles.continueBtnDisabled]} disabled={!nameInput.trim()} onPress={onConfirmName}>
            <Text style={[styles.continueBtnTxt, !nameInput.trim() && styles.continueBtnTxtDisabled]}>Continue</Text>
          </BounceBtn>
        </View>
      )}

      {typingDone && !reactionActive && turn.kind === 'wheel' && (
        <EntranceFade>
          <View style={styles.wheelWrap}>
            <Picker selectedValue={wheelVal} onValueChange={onChangeWheel} style={{ height: 170 }} itemStyle={{ color: Col.text, fontSize: 24, fontWeight: '300' }}>
              {WHEEL_OPTIONS[turn.wheelKind].map(o => <Picker.Item key={o} label={o} value={o} />)}
            </Picker>
            <BounceBtn style={styles.continueBtn} onPress={() => onConfirmWheel(turn.id)}>
              <Text style={styles.continueBtnTxt}>Continue</Text>
            </BounceBtn>
          </View>
        </EntranceFade>
      )}

      {typingDone && !reactionActive && turn.kind === 'ruler' && (
        <EntranceFade>
          <View>
            <WeightRuler value={rulerVal} onChange={onChangeRuler} />
            <BounceBtn style={styles.continueBtn} onPress={() => onConfirmRuler(turn.id)}>
              <Text style={styles.continueBtnTxt}>Continue</Text>
            </BounceBtn>
          </View>
        </EntranceFade>
      )}

      {typingDone && !reactionActive && turn.kind === 'guessSlider' && (
        <EntranceFade>
          <View>
            <FormGuessSlider value={guessPct} onChange={onChangeGuess} onDragStart={onGuessDragStart} onDragEnd={onGuessDragEnd} />
            <BounceBtn
              style={[styles.continueBtn, !guessTouched && styles.continueBtnDisabled]}
              disabled={!guessTouched}
              onPress={() => onConfirmGuess(turn.id)}
            >
              <Text style={[styles.continueBtnTxt, !guessTouched && styles.continueBtnTxtDisabled]}>Continue</Text>
            </BounceBtn>
          </View>
        </EntranceFade>
      )}

    </View>
  );
}


const styles = StyleSheet.create({
  closeBtn: { position: 'absolute', top: 8, right: 20, zIndex: 10 },
  devSkipBtn: {
    marginLeft: 10, backgroundColor: 'rgba(17,24,39,0.06)', borderRadius: 100, paddingVertical: 6, paddingHorizontal: 12,
  },
  devSkipBtnTxt: { fontSize: 12, fontWeight: '600', color: Col.textSub },
  closeCircle: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(17,24,39,0.06)',
    alignItems: 'center', justifyContent: 'center',
  },
  // Was the same barely-there 6%-tint circle as closeCircle — reported
  // as "not visible" even though the code/zIndex/position were all
  // correct, so the actual issue was almost certainly contrast: a faint
  // circle at the same weight as the close button just reads as part of
  // the colorful background behind it. Solid + white icon so it can't
  // blend into anything.
  backCircle: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: DARK,
    alignItems: 'center', justifyContent: 'center',
    ...({ boxShadow: '0px 2px 6px rgba(20,20,40,0.25)' } as any),
  },

  // Back button + mark dot share this row so they're always on the exact
  // same baseline — see the JSX comment for why this replaced guessing an
  // absolute `top` pixel value.
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 20, marginBottom: 8 },
  headerSide: { width: 30, alignItems: 'flex-start' },
  mark: { width: 10, height: 10, borderRadius: 5, backgroundColor: ACCENT, marginHorizontal: 14 },
  progressRow: { marginHorizontal: 24, marginBottom: 14 },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(17,24,39,0.08)', overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: DARK },
  milestoneBurst: {
    position: 'absolute', right: 0, top: -18, width: 22, height: 22, borderRadius: 11,
    backgroundColor: DARK, alignItems: 'center', justifyContent: 'center',
  },

  scroll: { paddingHorizontal: 28, paddingTop: 16 },

  // Past turns used to shrink down into small dimmed/colored text once
  // answered — reported as unwanted: this should read exactly like the
  // active turn did (big, black), not fade into a compact history log.
  pastTurn: { marginBottom: 28 },
  pastLine: { fontSize: 25, lineHeight: 32, fontWeight: '300', color: Col.text, letterSpacing: -0.3 },
  echoLine: { fontSize: 25, lineHeight: 32, marginTop: 2, fontWeight: '600', color: Col.text, letterSpacing: -0.3 },

  activeTurn: { marginBottom: 32 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' },
  activeLine: { fontSize: 25, lineHeight: 32, fontWeight: '300', color: Col.text, letterSpacing: -0.3 },
  accent: { color: ACCENT, fontWeight: '500' },
  cursor: { fontSize: 25, fontWeight: '300', color: ACCENT, marginLeft: 1 },

  chartWrap: { marginTop: 22 },
  chartLabel: { fontSize: 15, fontWeight: '400', color: Col.text, marginBottom: 4 },
  chartLabelBig: { fontSize: 17, fontWeight: '500', color: Col.text, marginBottom: 6 },

  // Black, never blue — emphasis for the math reveal's numbers is weight
  // only. Was fontWeight 800 at one point — heavy enough that iOS system
  // fonts render digits in a visibly different-looking cut, reading as "a
  // different font." 700 reads as clearly emphasized without that jump, and
  // is now literally the SAME accent style used everywhere the top-level
  // turn typewriter renders a mathReveal turn (see ActiveTurn/PastTurn).
  revealAccent: { fontWeight: '700', color: Col.text },

  barsWrap: { marginTop: 22, gap: 18 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 },
  barLabel: { fontSize: 15, fontWeight: '400', color: Col.text },
  barPct: { fontSize: 15, fontWeight: '600', color: Col.text },
  barTrack: { height: 30, borderRadius: 15, backgroundColor: 'rgba(17,24,39,0.06)', overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 15 },

  bubblesWrap: { height: 380, marginTop: 26 },
  bubble: {
    position: 'absolute', borderRadius: 999, overflow: 'hidden',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)',
    ...({ boxShadow: '0px 10px 24px rgba(20,20,40,0.16), 0px 2px 6px rgba(20,20,40,0.10), inset 0px 1px 1px rgba(255,255,255,0.4)' } as any),
  },
  bubbleHighlight: {
    position: 'absolute', top: '10%', left: '16%', width: '46%', height: '30%',
    borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.45)',
    ...({ transform: [{ rotate: '-18deg' }] } as any),
  },
  bubbleGradient: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  bubbleLabel: { fontSize: 16, fontWeight: '700', color: '#241708' },
  bubbleSub: { fontSize: 12, fontWeight: '500', color: 'rgba(36,23,8,0.6)' },
  bubbleSel: { borderWidth: 3, borderColor: DARK },
  bubbleCheck: {
    position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 11,
    backgroundColor: DARK, alignItems: 'center', justifyContent: 'center',
  },

  // ── Parts B & C — shared full-screen moment shell. Same white +
  // colorful-blob background as every question (AppBackground), same one
  // font treatment for every line on both screens — no varying
  // weights/sizes/accent colors, "black-and-white" text on a colorful
  // background.
  momentOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 50, backgroundColor: '#fff' },
  momentCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  // Bumped weight (500→600) and added a soft white text-shadow — the
  // colorful blob background sits right behind this text, and a plain
  // medium-weight line could lose contrast depending on what color happens
  // to be behind it at that moment. The shadow keeps it readable regardless.
  momentLine: {
    fontSize: 29, lineHeight: 38, fontWeight: '600', color: Col.text, textAlign: 'center',
    textShadowColor: 'rgba(255,255,255,0.9)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 0 },
  },
  momentBtnWrap: { position: 'absolute', left: 24, right: 24, bottom: 40 },
  washPanel: { backgroundColor: '#fff', zIndex: 60, borderBottomWidth: 2, borderBottomColor: '#111' },

  rankScroll: { marginTop: 22 },
  // No card background — just the badge + name floating on the page's own
  // blob background, centered with the neighbors peeking on either side.
  // Overlap/padding are set inline per-card/per-scrollview (RANK_OVERLAP,
  // RANK_SIDE_PAD) since they depend on screen width.
  rankScrollContent: { alignItems: 'center' },
  rankCard: { alignItems: 'center', paddingVertical: 18 },
  rankBadgeImg: { marginBottom: 8 },
  // Matches the reference build (FormPal Ranks.html) .name: 25px/500/-0.3,
  // black — this screen sits on the light AppBackground now, not a dark shell.
  rankNameCarousel: { fontSize: 25, fontWeight: '500', color: '#1A1A1C', letterSpacing: -0.3 },
  rankIntroBg: { ...StyleSheet.absoluteFillObject },
  rankIntroBtnSpacer: { height: 110 },

  // ── Rank section shell — dark background + blob backdrop shared by all
  // 6 screens (see RankShell). Text styles below are white/light for this
  // same reason the carousel name above is.
  rankShellOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 50, backgroundColor: DARK },
  rankScreenPad: { flex: 1, paddingHorizontal: 24, paddingTop: 76 },
  rankScreenHeading: { fontSize: 28, fontWeight: '700', color: '#fff', letterSpacing: -0.5, marginBottom: 12 },
  rankScreenBody: { fontSize: 15, lineHeight: 21, color: 'rgba(255,255,255,0.72)', marginBottom: 20 },
  rankIntroSpacer: { flex: 1 },
  rankBodyStage: { alignItems: 'center', marginTop: 8 },
  rankBodyStageFull: { alignItems: 'center', justifyContent: 'center', marginTop: 24, minHeight: 360 },
  // Fixed-size clip window for the upper-half crop (screens 3/5) — BodyMapSide
  // has no partial-viewBox option, so this just clips the bottom of the full
  // figure rendered inside it.
  rankBodyCrop: { width: RANK_BODY_WIDTH, height: RANK_BODY_CROP_H, overflow: 'hidden', alignSelf: 'center' },
  rankBodyInner: { position: 'absolute', top: 0, left: 0 },
  rankFillingTierLabel: { fontSize: 20, fontWeight: '700', color: '#fff', textAlign: 'center', marginTop: 14, letterSpacing: -0.3 },
  rankAssessScroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 76, paddingBottom: 40 },
  rankAssessRow: { marginTop: 18 },
  rankAssessLabel: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.8)', marginBottom: 2 },
  rankAssessPicker: { color: '#fff' },
  rankFloatCard: {
    position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(11,16,32,0.82)', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  rankFloatCardMuscle: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.65)' },
  rankFloatCardTier: { fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  rankFloatCardImg: { width: 30, height: 30 },
  rankProjScroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 76, paddingBottom: 130 },
  rankProjHeading: { fontSize: 26, fontWeight: '700', color: '#fff', lineHeight: 32, letterSpacing: -0.4 },
  rankProjGraphWrap: { width: RANK_CURVE_W, height: RANK_CURVE_H + 30, marginTop: 30, alignSelf: 'center' },
  rankProjBadgeWrap: { position: 'absolute' },
  rankProjBadgeSmall: { width: 44, height: 44 },
  rankProjBadgeBig: { width: 52, height: 52 },
  rankProjAxisLabel: { position: 'absolute', top: RANK_CURVE_H + 6, width: 80 },
  rankProjAxisTxt: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  rankProjPotential: { fontSize: 17, fontWeight: '700', color: '#5B9CFF', marginTop: 22, marginBottom: 8 },
  rankProjDisclaimer: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 14, lineHeight: 15 },

  // ── Rank reveal — full-screen, see RankRevealScreen ─────────────────────
  rankRevealCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  rankRevealBuilding: { fontSize: 19, fontWeight: '500', color: 'rgba(255,255,255,0.8)', textAlign: 'center' },
  rankRevealBurst: { position: 'absolute', width: 140, height: 140, borderRadius: 70 },
  rankRevealLabel: { fontSize: 19, fontWeight: '500', color: '#fff', textAlign: 'center', marginBottom: 18 },
  rankRevealBadge: { width: 180, height: 180, marginBottom: 18 },
  rankRevealName: { fontSize: 44, fontWeight: '800', color: '#fff', letterSpacing: -1, textAlign: 'center' },

  reviewsWrap: { marginTop: 22, gap: 12 },
  reviewCard: {
    backgroundColor: '#ffffff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: 'rgba(17,24,39,0.06)',
    ...({ boxShadow: '0px 1px 2px rgba(20,20,40,0.06), 0px 4px 10px rgba(20,20,40,0.04)' } as any),
  },
  reviewStars: { fontSize: 14, color: '#E8B923', marginBottom: 6, letterSpacing: 1 },
  reviewQuote: { fontSize: 15, lineHeight: 21, color: Col.text, marginBottom: 8 },
  reviewName: { fontSize: 13, fontWeight: '600', color: Col.textSub },

  planWrap: { marginTop: 22, gap: 14 },
  planStepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planStepTxt: { fontSize: 16, color: Col.textDim, letterSpacing: -0.1 },
  planStepTxtDone: { color: Col.text, fontWeight: '500' },
  planReadyTxt: { fontSize: 20, fontWeight: '600', color: Col.text, marginTop: 8, marginBottom: 4 },

  pillWrap: { marginTop: 20, gap: 10 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 100, backgroundColor: '#ffffff',
    borderWidth: 1, borderColor: 'rgba(17,24,39,0.06)',
    ...({ boxShadow: '0px 1px 2px rgba(20,20,40,0.06), 0px 4px 10px rgba(20,20,40,0.04)' } as any),
  },
  pillSel: { backgroundColor: 'rgba(46,125,255,0.08)', borderColor: ACCENT },
  pillIconWrap: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  pillIconImg: { width: 32, height: 32, borderRadius: 10 },
  pillLabel: { fontSize: 16, fontWeight: '400', color: Col.text, letterSpacing: -0.2 },
  pillLabelSel: { color: ACCENT, fontWeight: '500' },

  // Math check-in — no answer-pill box, just the word + a small side arrow.
  mathCheckInRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 18 },
  mathCheckInTxt: { fontSize: 13, fontWeight: '600', color: Col.text, letterSpacing: 0.1 },

  // Injury math's closing "lock it in" fingerprint moment. No button
  // circle/ring around it — the fingerprint image itself is sized to what
  // that circle used to be. marginTop pushes it down toward the bottom of
  // the screen — was sitting right under the math text, reported as too
  // high/cramped.
  // Now a FIXED overlay pinned to the bottom of the screen (see
  // lockInFixedWrap) instead of inline content, so no more marginTop push —
  // position is entirely the fixed wrapper's job now.
  lockInWrap: { alignItems: 'center' },
  lockInFixedWrap: {
    position: 'absolute', left: 0, right: 0, bottom: 36, alignItems: 'center', zIndex: 40,
  },
  // tintColor set BOTH as a prop and here in style — belt and suspenders
  // for cross-platform Image tinting reliability (was reading grey even
  // with the style-only version). Glow toned WAY down from before — a
  // strong colored shadowRadius was likely muddying the black into a
  // grey/blue-ish read; kept just enough for a faint accent, not enough to
  // compete with the black fill.
  lockInIcon: {
    width: 128, height: 128, tintColor: '#000',
    shadowColor: ACCENT, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
  },
  lockInWashCircle: {
    position: 'absolute', width: LOCK_IN_CIRCLE_SIZE, height: LOCK_IN_CIRCLE_SIZE,
    borderRadius: LOCK_IN_CIRCLE_SIZE / 2, backgroundColor: ACCENT,
  },

  continueBtn: { marginTop: 14, backgroundColor: DARK, borderRadius: 100, paddingVertical: 15, alignItems: 'center' },
  continueBtnDisabled: { backgroundColor: '#EBEBF0' },
  continueBtnTxt: { fontSize: 15, fontWeight: '600', color: '#fff', letterSpacing: 0.1 },
  continueBtnTxtDisabled: { color: Col.textDim },

  textInputRow: { marginTop: 22, gap: 14 },
  textInput: { fontSize: 22, fontWeight: '300', color: Col.text, borderBottomWidth: 2, borderBottomColor: ACCENT, paddingBottom: 8, letterSpacing: -0.2 },

  wheelWrap: { marginTop: 8 },

  doneWrap: { marginTop: 12, alignItems: 'center' },
  doneText: { fontSize: 25, lineHeight: 32, fontWeight: '300', textAlign: 'center', color: Col.text, letterSpacing: -0.3, marginBottom: 24 },
  finishBtn: { backgroundColor: DARK, borderRadius: 100, paddingVertical: 15, paddingHorizontal: 40 },
  finishBtnTxt: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
