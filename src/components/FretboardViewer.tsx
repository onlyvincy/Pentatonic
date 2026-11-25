import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DemoStep, FretNote, InstrumentType, MetronomeSoundId } from '../types/practice';
import { Play, Square } from 'lucide-react';
import {
  BASS_STRING_LABELS,
  STRING_SHORT_MAP,
  getSharedAudioContext,
  playBassFrequency,
  playBassPluck,
  playGuitarFrequency,
  playGuitarPluck,
  playInstrumentStep,
  playSoftMetronomeTick,
} from '../utils/guitarSynth';

export type FretboardDemoMode = 'slow-intro' | 'live-loop' | 'manual';

interface FretboardViewerProps {
  notes: FretNote[];
  demoSequence?: DemoStep[];
  coachingCues?: string[];
  instrument?: InstrumentType;
  interactive?: boolean;
  forceStopDemo?: boolean;
  /** 'stage' = full-screen focused animated demo; 'compact' = clean minimal view */
  variant?: 'stage' | 'compact';
  /** Demo pacing & loop behavior */
  demoMode?: FretboardDemoMode;
  /** External sample-accurate tick index from the Web Audio metronome scheduler */
  externalStepTick?: number | null;
  /** Active quarter beat (1..4) from metronome for visual beat-sync pulse */
  currentBeat?: number;
  /** Active subdivision label (e.g. '1/8') */
  subdivisionLabel?: string;
  /** Metronome click preset used during slow demo */
  metronomeSound?: MetronomeSoundId;
  /** Custom string labels (e.g. ['e','C','G','C','A','F'] for FACGCE tuning or ['G','D','A','E'] for bass) */
  stringLabels?: readonly string[];
  /** Custom open-string frequencies in Hz for alternate tunings */
  customStringFreqs?: Partial<Record<1 | 2 | 3 | 4 | 5 | 6, number>>;
  /** Mute synthetic guitar audio (e.g., while mic recording & metronome run in live play) */
  muteAudio?: boolean;
  /** Target BPM used to synchronize slow-intro & live-loop pacing */
  bpm?: number;
  /** Runs alternating 1/8 (1x normal) -> 1/16 (2x double-speed burst) cycles */
  speedBurst?: boolean;
  /** Hides the manual Demo button in compact mode when not needed */
  hideDemoButton?: boolean;
  /** Automatically plays the guitar demo sequence on mount (used in full-screen stage) */
  autoPlayDemo?: boolean;
  /** Callback fired once slow-intro demo finishes */
  onDemoComplete?: () => void;
  /** Incrementing key to replay autoPlayDemo from step 0 */
  replayKey?: number;
  onToggleNote?: (stringNum: 1 | 2 | 3 | 4 | 5 | 6, fret: number) => void;
}

type LabelMode = 'none' | 'fingers' | 'intervals';

const DEFAULT_STRING_NAMES = ['e', 'B', 'G', 'D', 'A', 'E'] as const;
const INLAY_FRETS = [3, 5, 7, 9, 12, 15];
const BAR_8_LABELS = ['1', '&', '2', '&', '3', '&', '4', '&'] as const;

type StepArticulation =
  | 'pick'
  | 'hammer'
  | 'pull'
  | 'slide'
  | 'bend'
  | 'palmmute'
  | 'tapping'
  | 'harmonic'
  | 'sweep'
  | 'hybrid'
  | 'vibrato'
  | 'sustain'
  | 'muted';

function getStepArticulation(step: DemoStep | null | undefined): StepArticulation {
  if (!step) return 'pick';
  if (step.muted || (step.notes.length === 0 && !step.sustain)) return 'muted';
  const tech = (step.technique || '').toLowerCase();
  if (tech.includes('bend')) return 'bend';
  if (tech.includes('palm') || tech.includes('p.m.') || tech.includes('chug')) {
    return 'palmmute';
  }
  if (tech.includes('tap')) return 'tapping';
  if (tech.includes('pinch') || tech.includes('armonic') || tech.includes('p.h.')) {
    return 'harmonic';
  }
  if (tech.includes('sweep') || tech.includes('economy')) return 'sweep';
  if (tech.includes('hybrid') || tech.includes('medio (m)')) return 'hybrid';
  if (tech.includes('hammer')) return 'hammer';
  if (tech.includes('pull')) return 'pull';
  if (tech.includes('slide')) return 'slide';
  if (step.sustain && tech.includes('vibrato')) return 'vibrato';
  if (step.sustain) return 'sustain';
  return 'pick';
}

function getSubdivisionMetrics(sub?: string): {
  subsPerBeat: number;
  slowDemoBpm: number;
} {
  switch (sub) {
    case '1/4':
      return { subsPerBeat: 1, slowDemoBpm: 56 };
    case '1/8T':
      return { subsPerBeat: 3, slowDemoBpm: 50 };
    case '1/16':
      return { subsPerBeat: 4, slowDemoBpm: 46 };
    case '1/16T':
      return { subsPerBeat: 6, slowDemoBpm: 40 };
    case '1/8':
    default:
      return { subsPerBeat: 2, slowDemoBpm: 56 };
  }
}

function getBarreInfo(
  stepNotes: FretNote[]
): { fret: number; minString: number; maxString: number } | null {
  if (stepNotes.length < 2) return null;
  const fretted = stepNotes.filter((n) => n.fret > 0);
  if (fretted.length < 2) return null;

  const indexFingerNotes = fretted.filter((n) => n.finger === '1');
  if (indexFingerNotes.length >= 2) {
    const byFret = new Map<number, FretNote[]>();
    indexFingerNotes.forEach((n) => {
      const list = byFret.get(n.fret) ?? [];
      list.push(n);
      byFret.set(n.fret, list);
    });
    for (const [fret, list] of byFret.entries()) {
      if (list.length >= 2) {
        const strings = list.map((n) => n.string);
        return {
          fret,
          minString: Math.min(...strings),
          maxString: Math.max(...strings),
        };
      }
    }
  }

  const minFret = Math.min(...fretted.map((n) => n.fret));
  const atMinFret = fretted.filter((n) => n.fret === minFret);
  if (atMinFret.length >= 3) {
    const strings = atMinFret.map((n) => n.string);
    return {
      fret: minFret,
      minString: Math.min(...strings),
      maxString: Math.max(...strings),
    };
  }
  return null;
}

function resolveSpeedBurstTick(
  tick16: number,
  totalSteps: number
): { stepIndex: number; isBurstPhase: boolean } {
  if (totalSteps <= 0) {
    return { stepIndex: 0, isBurstPhase: false };
  }
  const phase1Ticks = 2 * totalSteps;
  const phase2Ticks = Math.max(16, totalSteps);
  const cycleTicks = phase1Ticks + phase2Ticks;
  const safeTick = ((tick16 % cycleTicks) + cycleTicks) % cycleTicks;
  if (safeTick < phase1Ticks) {
    return {
      stepIndex: Math.floor(safeTick / 2) % totalSteps,
      isBurstPhase: false,
    };
  }
  return {
    stepIndex: (safeTick - phase1Ticks) % totalSteps,
    isBurstPhase: true,
  };
}

export const FretboardViewer: React.FC<FretboardViewerProps> = ({
  notes,
  demoSequence,
  instrument = 'guitar',
  interactive = false,
  forceStopDemo = false,
  variant = 'compact',
  demoMode = 'manual',
  externalStepTick,
  subdivisionLabel = '1/8',
  metronomeSound = 'woodblock',
  stringLabels,
  customStringFreqs,
  muteAudio = false,
  bpm = 90,
  speedBurst = false,
  hideDemoButton = false,
  autoPlayDemo = false,
  onDemoComplete,
  replayKey = 0,
  onToggleNote,
}) => {
  const effectiveStringLabels = useMemo(
    () =>
      stringLabels ??
      (instrument === 'bass' ? BASS_STRING_LABELS : DEFAULT_STRING_NAMES),
    [stringLabels, instrument]
  );
  const stringCount = effectiveStringLabels.length;
  const spanCount = Math.max(1, stringCount - 1);
  const [userLabelMode, setUserLabelMode] = useState<LabelMode | null>(null);
  const [isPlayingDemo, setIsPlayingDemo] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const [internalBeatIdx, setInternalBeatIdx] = useState<number | null>(null);
  const [clickedNoteKey, setClickedNoteKey] = useState<string | null>(null);

  const rafRef = useRef<number | null>(null);
  const endTimeoutRef = useRef<number | null>(null);
  const clickTimeoutRef = useRef<number | null>(null);
  const onDemoCompleteRef = useRef(onDemoComplete);
  onDemoCompleteRef.current = onDemoComplete;

  const effectiveSteps: DemoStep[] = useMemo(() => {
    if (demoSequence && demoSequence.length > 0) return demoSequence;
    return notes.map((n) => ({ notes: [n] }));
  }, [demoSequence, notes]);

  const isChordPattern = useMemo(
    () => effectiveSteps.some((s) => s.notes.length > 1),
    [effectiveSteps]
  );

  const hasChordContext = useMemo(
    () => Boolean(effectiveSteps[0]?.chordNotes && effectiveSteps[0].chordNotes.length > 0),
    [effectiveSteps]
  );

  useEffect(() => {
    setUserLabelMode(null);
  }, [notes, demoSequence]);

  const defaultLabelMode: LabelMode = hasChordContext
    ? 'intervals'
    : isChordPattern
    ? 'none'
    : 'fingers';
  const labelMode: LabelMode = userLabelMode ?? defaultLabelMode;

  const clearTimers = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (endTimeoutRef.current !== null) {
      window.clearTimeout(endTimeoutRef.current);
      endTimeoutRef.current = null;
    }
  }, []);

  const stopDemo = useCallback(() => {
    clearTimers();
    setIsPlayingDemo(false);
    setActiveStepIndex(null);
    setInternalBeatIdx(null);
  }, [clearTimers]);

  const playNoteForTuning = useCallback(
    (stringNum: 1 | 2 | 3 | 4 | 5 | 6, fret: number) => {
      const customBase = customStringFreqs?.[stringNum];
      if (customBase) {
        const freq = customBase * Math.pow(2, fret / 12);
        if (instrument === 'bass') {
          playBassFrequency(freq, { durationSec: 1.25, volume: 0.56 });
        } else {
          playGuitarFrequency(freq, { durationSec: 1.25, volume: 0.54 });
        }
      } else if (instrument === 'bass') {
        const bassStr = Math.max(1, Math.min(4, stringNum)) as 1 | 2 | 3 | 4;
        playBassPluck(bassStr, fret, { durationSec: 1.25, volume: 0.56 });
      } else {
        playGuitarPluck(stringNum, fret, { durationSec: 1.25, volume: 0.54 });
      }
    },
    [customStringFreqs, instrument]
  );

  const triggerStepAudio = useCallback(
    (index: number, withSoftMetronome = false) => {
      const step = effectiveSteps[index];
      if (!step || muteAudio) return;
      const subsPerBeat = getSubdivisionMetrics(subdivisionLabel).subsPerBeat;
      if (withSoftMetronome && index % subsPerBeat === 0) {
        playSoftMetronomeTick(index % (subsPerBeat * 4) === 0, metronomeSound);
      }
      if (customStringFreqs && !step.sustain && !step.muted && step.notes.length > 0) {
        step.notes.forEach((n, idx) => {
          const customBase = customStringFreqs[n.string];
          if (!customBase) return;
          const freq = customBase * Math.pow(2, n.fret / 12);
          if (instrument === 'bass') {
            playBassFrequency(freq, {
              durationSec: 1.15,
              volume: step.notes.length > 1 ? 0.36 : 0.56,
              delaySec: idx * 0.012,
            });
          } else {
            playGuitarFrequency(freq, {
              durationSec: 1.25,
              volume: step.notes.length > 1 ? 0.32 : 0.54,
              delaySec: idx * 0.016,
            });
          }
        });
      } else {
        playInstrumentStep(
          instrument,
          step.notes,
          step.muted,
          step.sustain,
          step.technique,
          step.accent,
          step.dynamic
        );
      }
    },
    [effectiveSteps, muteAudio, subdivisionLabel, metronomeSound, customStringFreqs, instrument]
  );

  const startDemo = useCallback(
    (modeOverride?: FretboardDemoMode) => {
      const mode = modeOverride ?? demoMode;
      if (effectiveSteps.length === 0) {
        if (mode === 'slow-intro') onDemoCompleteRef.current?.();
        return;
      }
      clearTimers();
      setIsPlayingDemo(true);

      const getNowSec = () => {
        const ctx = getSharedAudioContext();
        return ctx && ctx.state === 'running'
          ? ctx.currentTime
          : performance.now() / 1000;
      };

      const useBurstDemo =
        speedBurst && (subdivisionLabel === '1/8' || subdivisionLabel === '1/4');

      if (useBurstDemo) {
        const demoBpm =
          mode === 'slow-intro' ? 62 : Math.max(40, Math.min(240, bpm));
        const sixteenthSec = 60 / demoBpm / 4;
        const demoStepsCount =
          mode === 'slow-intro' && effectiveSteps.length > 16
            ? 8
            : effectiveSteps.length;
        const phase1Ticks = 2 * demoStepsCount;
        const phase2Ticks = Math.max(16, demoStepsCount);
        const cycleTicks = phase1Ticks + phase2Ticks;
        const startAnchor = getNowSec();
        let lastTick16 = 0;

        setActiveStepIndex(0);
        setInternalBeatIdx(0);
        if (mode === 'slow-intro' && !muteAudio) {
          playSoftMetronomeTick(true, metronomeSound);
        }
        triggerStepAudio(0, false);

        const loopBurst = () => {
          const elapsed = Math.max(0, getNowSec() - startAnchor);
          const tick16 = Math.floor(elapsed / sixteenthSec);

          if (mode !== 'live-loop' && tick16 >= cycleTicks) {
            clearTimers();
            endTimeoutRef.current = window.setTimeout(() => {
              setIsPlayingDemo(false);
              setActiveStepIndex(null);
              setInternalBeatIdx(null);
              if (mode === 'slow-intro') {
                onDemoCompleteRef.current?.();
              }
            }, Math.round(sixteenthSec * 600));
            return;
          }

          if (tick16 !== lastTick16) {
            lastTick16 = tick16;
            const tickInCycle = tick16 % cycleTicks;
            setInternalBeatIdx(Math.floor(tick16 / 4) % 4);
            const isBurstNow = tickInCycle >= phase1Ticks;
            if (
              mode === 'slow-intro' &&
              !muteAudio &&
              (isBurstNow ? tick16 % 2 === 0 : tick16 % 4 === 0)
            ) {
              playSoftMetronomeTick(tick16 % 16 === 0, metronomeSound);
            }

            if (tickInCycle < phase1Ticks) {
              const stepIdx = Math.floor(tickInCycle / 2) % demoStepsCount;
              setActiveStepIndex(stepIdx);
              if (tickInCycle % 2 === 0) {
                triggerStepAudio(stepIdx, false);
              }
            } else {
              const stepIdx = (tickInCycle - phase1Ticks) % demoStepsCount;
              setActiveStepIndex(stepIdx);
              triggerStepAudio(stepIdx, false);
            }
          }

          rafRef.current = window.requestAnimationFrame(loopBurst);
        };

        rafRef.current = window.requestAnimationFrame(loopBurst);
        return;
      }

      const { subsPerBeat, slowDemoBpm } = getSubdivisionMetrics(subdivisionLabel);

      if (mode === 'slow-intro') {
        const stepSec = 60 / slowDemoBpm / subsPerBeat;
        const totalStepsPerPass = effectiveSteps.length;
        const passes = totalStepsPerPass >= 12 ? 1 : 2;
        const startAnchor = getNowSec();
        let lastTriggeredTotalIdx = 0;

        setActiveStepIndex(0);
        setInternalBeatIdx(0);
        triggerStepAudio(0, true);

        const loopSlow = () => {
          const elapsed = Math.max(0, getNowSec() - startAnchor);
          const totalIdx = Math.floor(elapsed / stepSec);

          if (totalIdx >= totalStepsPerPass * passes) {
            clearTimers();
            endTimeoutRef.current = window.setTimeout(() => {
              setIsPlayingDemo(false);
              setActiveStepIndex(null);
              setInternalBeatIdx(null);
              onDemoCompleteRef.current?.();
            }, Math.round(stepSec * 400));
            return;
          }

          if (totalIdx !== lastTriggeredTotalIdx) {
            lastTriggeredTotalIdx = totalIdx;
            const stepIdx = totalIdx % totalStepsPerPass;
            setActiveStepIndex(stepIdx);
            setInternalBeatIdx(Math.floor(stepIdx / subsPerBeat) % 4);
            triggerStepAudio(stepIdx, true);
          }

          rafRef.current = window.requestAnimationFrame(loopSlow);
        };

        rafRef.current = window.requestAnimationFrame(loopSlow);
        return;
      }

      if (mode === 'live-loop') {
        const beatSec = 60 / Math.max(40, Math.min(240, bpm));
        const stepSec = Math.max(0.11, Math.min(0.65, beatSec / subsPerBeat));
        const startAnchor = getNowSec();
        let lastIdx = 0;

        setActiveStepIndex(0);
        triggerStepAudio(0);

        const loopLive = () => {
          const elapsed = Math.max(0, getNowSec() - startAnchor);
          const totalIdx = Math.floor(elapsed / stepSec);
          if (totalIdx !== lastIdx) {
            lastIdx = totalIdx;
            const idx = totalIdx % effectiveSteps.length;
            setActiveStepIndex(idx);
            triggerStepAudio(idx);
          }
          rafRef.current = window.requestAnimationFrame(loopLive);
        };

        rafRef.current = window.requestAnimationFrame(loopLive);
        return;
      }

      // 'manual' mode: synced to BPM & subdivision on audio clock
      const stepSec = Math.max(0.11, Math.min(0.6, 60 / bpm / subsPerBeat));
      const startAnchor = getNowSec();
      let lastIdx = 0;

      setActiveStepIndex(0);
      triggerStepAudio(0);

      const loopManual = () => {
        const elapsed = Math.max(0, getNowSec() - startAnchor);
        const idx = Math.floor(elapsed / stepSec);

        if (idx >= effectiveSteps.length) {
          clearTimers();
          endTimeoutRef.current = window.setTimeout(() => {
            setIsPlayingDemo(false);
            setActiveStepIndex(null);
          }, 360);
          return;
        }

        if (idx !== lastIdx) {
          lastIdx = idx;
          setActiveStepIndex(idx);
          triggerStepAudio(idx);
        }
        rafRef.current = window.requestAnimationFrame(loopManual);
      };

      rafRef.current = window.requestAnimationFrame(loopManual);
    },
    [
      effectiveSteps,
      demoMode,
      bpm,
      speedBurst,
      subdivisionLabel,
      muteAudio,
      metronomeSound,
      clearTimers,
      triggerStepAudio,
    ]
  );

  useEffect(() => {
    if (forceStopDemo) {
      stopDemo();
    }
  }, [forceStopDemo, stopDemo]);

  // Synchronous render-time resolution when driven externally by Web Audio clock (0ms React lag)
  const usesExternalClock =
    demoMode === 'live-loop' && externalStepTick !== undefined;

  const externalBurstResolved =
    usesExternalClock &&
    speedBurst &&
    (subdivisionLabel === '1/8' || subdivisionLabel === '1/4') &&
    !forceStopDemo &&
    externalStepTick !== null &&
    effectiveSteps.length > 0
      ? resolveSpeedBurstTick(externalStepTick, effectiveSteps.length)
      : null;

  const effectiveActiveStepIndex: number | null = usesExternalClock
    ? !forceStopDemo && externalStepTick !== null && effectiveSteps.length > 0
      ? externalBurstResolved
        ? externalBurstResolved.stepIndex
        : externalStepTick % effectiveSteps.length
      : null
    : activeStepIndex;

  // Trigger optional audio only when step changes under external clock
  useEffect(() => {
    if (!usesExternalClock) return;
    clearTimers();
    if (effectiveActiveStepIndex === null || muteAudio) return;
    const step = effectiveSteps[effectiveActiveStepIndex];
    if (step) {
      playInstrumentStep(
        instrument,
        step.notes,
        step.muted,
        step.sustain,
        step.technique,
        step.accent,
        step.dynamic
      );
    }
  }, [
    usesExternalClock,
    effectiveActiveStepIndex,
    effectiveSteps,
    muteAudio,
    clearTimers,
    instrument,
  ]);

  // Internal auto-start only when not driven by external metronome clock
  useEffect(() => {
    if (usesExternalClock) return;

    const shouldAutoRun = autoPlayDemo || demoMode === 'live-loop';
    if (!shouldAutoRun || forceStopDemo) return;
    const kick = window.setTimeout(() => {
      startDemo(demoMode === 'live-loop' ? 'live-loop' : 'slow-intro');
    }, 30);
    return () => {
      window.clearTimeout(kick);
      stopDemo();
    };
  }, [
    usesExternalClock,
    autoPlayDemo,
    demoMode,
    forceStopDemo,
    replayKey,
    startDemo,
    stopDemo,
  ]);

  useEffect(() => {
    return () => {
      clearTimers();
      if (clickTimeoutRef.current !== null) {
        window.clearTimeout(clickTimeoutRef.current);
      }
    };
  }, [clearTimers]);

  const handlePreviewSingleNote = (note: FretNote) => {
    const key = `${note.string}-${note.fret}`;
    setClickedNoteKey(key);
    playNoteForTuning(note.string, note.fret);
    if (clickTimeoutRef.current !== null) {
      window.clearTimeout(clickTimeoutRef.current);
    }
    clickTimeoutRef.current = window.setTimeout(() => {
      setClickedNoteKey(null);
    }, 420);
  };

  const activeStep =
    effectiveActiveStepIndex !== null
      ? effectiveSteps[effectiveActiveStepIndex] ?? null
      : null;

  const activeArticulation = getStepArticulation(activeStep);
  const isSustainedStep = Boolean(activeStep?.sustain);

  const effectiveActiveNotes = useMemo(() => {
    if (!activeStep || activeStep.muted) return [];
    if (activeStep.notes.length > 0) return activeStep.notes;
    if (activeStep.sustain && effectiveActiveStepIndex !== null) {
      for (let i = effectiveActiveStepIndex - 1; i >= 0; i--) {
        const prev = effectiveSteps[i];
        if (prev && !prev.muted && prev.notes.length > 0) {
          return prev.notes;
        }
      }
    }
    return [];
  }, [activeStep, effectiveActiveStepIndex, effectiveSteps]);

  const hasBendSteps = useMemo(
    () => effectiveSteps.some((s) => getStepArticulation(s) === 'bend'),
    [effectiveSteps]
  );

  const activeBendNote = useMemo(() => {
    if (activeArticulation !== 'bend' || effectiveActiveNotes.length === 0) {
      return null;
    }
    const isHalf =
      (activeStep?.technique || '').includes('1/2') ||
      (activeStep?.technique || '').includes('½');
    return {
      note: effectiveActiveNotes[0],
      isHalf,
    };
  }, [activeArticulation, effectiveActiveNotes, activeStep]);

  const activeContextChordNotes: FretNote[] | null = useMemo(() => {
    if (!hasChordContext) return null;
    if (effectiveActiveStepIndex !== null) {
      const step = effectiveSteps[effectiveActiveStepIndex];
      if (step?.chordNotes && step.chordNotes.length > 0) {
        return step.chordNotes;
      }
    }
    return effectiveSteps[0]?.chordNotes ?? null;
  }, [hasChordContext, effectiveActiveStepIndex, effectiveSteps]);

  const activeContextChordNoteMap = useMemo(() => {
    if (!activeContextChordNotes) return null;
    const m = new Map<string, FretNote>();
    activeContextChordNotes.forEach((n) => m.set(`${n.string}-${n.fret}`, n));
    return m;
  }, [activeContextChordNotes]);

  const activeContextChordKeys = useMemo(() => {
    if (!activeContextChordNotes) return null;
    const s = new Set<string>();
    activeContextChordNotes.forEach((n) => s.add(`${n.string}-${n.fret}`));
    return s;
  }, [activeContextChordNotes]);

  const chordLookahead = useMemo(() => {
    const hasLabels = effectiveSteps.some((s) => Boolean(s.chordLabel));
    if (!hasLabels) return null;

    const uniqueLabels = new Set(
      effectiveSteps.map((s) => s.chordLabel).filter((l): l is string => Boolean(l))
    );
    const currentChordLabel =
      activeStep?.chordLabel ?? effectiveSteps[0]?.chordLabel ?? null;
    if (!currentChordLabel) return null;

    const isSingleStaticChord = uniqueLabels.size === 1;
    let nextChordLabel: string | null = null;
    let stepsUntilChange: number | null = null;
    let nextChordNotes: FretNote[] = [];

    if (!isSingleStaticChord && effectiveActiveStepIndex !== null) {
      for (let offset = 1; offset < effectiveSteps.length; offset++) {
        const nextIdx = (effectiveActiveStepIndex + offset) % effectiveSteps.length;
        const cand = effectiveSteps[nextIdx];
        if (cand?.chordLabel && cand.chordLabel !== currentChordLabel) {
          nextChordLabel = cand.chordLabel;
          stepsUntilChange = offset;
          nextChordNotes = cand.chordNotes ?? cand.notes ?? [];
          break;
        }
      }
    } else if (!isSingleStaticChord) {
      const secondStep = effectiveSteps.find(
        (s) => s.chordLabel && s.chordLabel !== currentChordLabel
      );
      if (secondStep?.chordLabel) {
        nextChordLabel = secondStep.chordLabel;
      }
    }

    return {
      currentChordLabel,
      isSingleStaticChord,
      nextChordLabel,
      stepsUntilChange,
      nextChordNotes,
    };
  }, [effectiveSteps, activeStep, effectiveActiveStepIndex]);

  const nextChordPreviewKeys = useMemo(() => {
    if (
      !chordLookahead ||
      chordLookahead.stepsUntilChange === null ||
      chordLookahead.stepsUntilChange > 2
    ) {
      return null;
    }
    const s = new Set<string>();
    chordLookahead.nextChordNotes.forEach((n) => s.add(`${n.string}-${n.fret}`));
    return s;
  }, [chordLookahead]);

  const activeBarre = useMemo(() => {
    if (instrument === 'bass') return null;
    if (hasChordContext && activeContextChordNotes) {
      const barre = getBarreInfo(activeContextChordNotes);
      return barre
        ? { ...barre, isActive: effectiveActiveStepIndex !== null }
        : null;
    }
    if (effectiveActiveStepIndex !== null) {
      const barre = getBarreInfo(effectiveActiveNotes);
      return barre ? { ...barre, isActive: true } : null;
    }
    if (effectiveSteps.length > 0) {
      const staticBarre = getBarreInfo(effectiveSteps[0].notes);
      return staticBarre ? { ...staticBarre, isActive: false } : null;
    }
    return null;
  }, [
    instrument,
    hasChordContext,
    activeContextChordNotes,
    effectiveActiveStepIndex,
    effectiveActiveNotes,
    effectiveSteps,
  ]);

  const legatoConnections = useMemo(() => {
    const conns: {
      stepIndex: number;
      kind: 'hammer' | 'pull' | 'slide';
      string: 1 | 2 | 3 | 4 | 5 | 6;
      fromFret: number;
      toFret: number;
    }[] = [];

    for (let i = 0; i < effectiveSteps.length; i++) {
      const currStep = effectiveSteps[i];
      const art = getStepArticulation(currStep);
      if (art !== 'hammer' && art !== 'pull' && art !== 'slide') continue;
      if (!currStep.notes || currStep.notes.length === 0) continue;

      let prevStep: DemoStep | null = null;
      for (let p = i - 1; p >= 0; p--) {
        const cand = effectiveSteps[p];
        if (cand && !cand.muted && cand.notes.length > 0) {
          prevStep = cand;
          break;
        }
      }

      let matchedAny = false;
      for (const currNote of currStep.notes) {
        const prevNote = prevStep?.notes.find(
          (pn) => pn.string === currNote.string && pn.fret !== currNote.fret
        );
        if (prevNote) {
          matchedAny = true;
          conns.push({
            stepIndex: i,
            kind: art,
            string: currNote.string,
            fromFret: prevNote.fret,
            toFret: currNote.fret,
          });
        }
      }

      // Synthesize a grace-note entry slide when a slide starts on a new string
      if (!matchedAny && art === 'slide') {
        const leadNote = currStep.notes[0];
        const tech = (currStep.technique || '').toLowerCase();
        const isDown = tech.includes('↓') || tech.includes('down');
        const synthFrom = isDown
          ? leadNote.fret + 2
          : Math.max(0, leadNote.fret - 2);
        if (synthFrom !== leadNote.fret) {
          conns.push({
            stepIndex: i,
            kind: 'slide',
            string: leadNote.string,
            fromFret: synthFrom,
            toFret: leadNote.fret,
          });
        }
      }
    }
    return conns;
  }, [effectiveSteps]);

  const uniqueStaticLegatoArcs = useMemo(() => {
    const seen = new Set<string>();
    return legatoConnections.filter((c) => {
      const key = `${c.kind}-${c.string}-${c.fromFret}-${c.toFret}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [legatoConnections]);

  const activeLegatoConns = useMemo(
    () =>
      effectiveActiveStepIndex !== null
        ? legatoConnections.filter((c) => c.stepIndex === effectiveActiveStepIndex)
        : [],
    [legatoConnections, effectiveActiveStepIndex]
  );

  const legatoAnchorKeys = useMemo(() => {
    const set = new Set<string>();
    activeLegatoConns.forEach((c) => set.add(`${c.string}-${c.fromFret}`));
    return set;
  }, [activeLegatoConns]);

  const activeSlideTargetMap = useMemo(() => {
    const map = new Map<string, number>();
    activeLegatoConns.forEach((c) => {
      if (c.kind === 'slide') {
        map.set(`${c.string}-${c.toFret}`, c.fromFret);
      }
    });
    return map;
  }, [activeLegatoConns]);

  const hasStoppataOrPalm = useMemo(
    () =>
      effectiveSteps.some((s) => {
        const a = getStepArticulation(s);
        return a === 'muted' || a === 'palmmute';
      }),
    [effectiveSteps]
  );

  const mutedTarget = useMemo(() => {
    if (
      activeArticulation !== 'muted' ||
      effectiveActiveStepIndex === null ||
      !activeStep
    ) {
      return null;
    }

    let refNotes: FretNote[] = [];
    if (activeStep.notes.length > 0) {
      refNotes = activeStep.notes;
    } else {
      for (let p = effectiveActiveStepIndex - 1; p >= 0; p--) {
        const cand = effectiveSteps[p];
        if (cand && !cand.muted && cand.notes.length > 0) {
          refNotes = cand.notes;
          break;
        }
      }
      if (refNotes.length === 0) {
        for (let p = effectiveActiveStepIndex + 1; p < effectiveSteps.length; p++) {
          const cand = effectiveSteps[p];
          if (cand && !cand.muted && cand.notes.length > 0) {
            refNotes = cand.notes;
            break;
          }
        }
      }
      if (refNotes.length === 0) {
        refNotes = notes;
      }
    }

    const tech = (activeStep.technique || '').toLowerCase();
    const isSilenceGate =
      Boolean(activeStep.sustain) ||
      tech.includes('pausa') ||
      tech.includes('silenzio');
    const isGhost = tech.includes('ghost');

    const strings = Array.from(
      new Set(refNotes.map((n) => n.string).filter((s) => s <= stringCount))
    ).sort((a, b) => a - b) as (1 | 2 | 3 | 4 | 5 | 6)[];

    const fretted = refNotes.filter((n) => n.fret > 0);
    const rawFret =
      fretted.length > 0
        ? fretted[0].fret
        : refNotes.length > 0
        ? refNotes[0].fret
        : 5;

    return {
      strings: strings.length > 0 ? strings : ([4, 3, 2] as (1 | 2 | 3 | 4 | 5 | 6)[]),
      rawFret,
      isSilenceGate,
      isGhost,
    };
  }, [
    activeArticulation,
    effectiveActiveStepIndex,
    activeStep,
    effectiveSteps,
    notes,
    stringCount,
  ]);

  const previewChordKeys = useMemo(() => {
    if (!isChordPattern || effectiveSteps.length === 0) return null;
    const set = new Set<string>();
    effectiveSteps[0].notes.forEach((n) => set.add(`${n.string}-${n.fret}`));
    return set;
  }, [isChordPattern, effectiveSteps]);

  const activeNoteKeys = useMemo(() => {
    const set = new Set<string>();
    effectiveActiveNotes.forEach((n) => set.add(`${n.string}-${n.fret}`));
    if (clickedNoteKey) {
      set.add(clickedNoteKey);
    }
    return set;
  }, [effectiveActiveNotes, clickedNoteKey]);

  const activeStringNumbers = useMemo(() => {
    const set = new Set<number>();
    effectiveActiveNotes.forEach((n) => set.add(n.string));
    if (clickedNoteKey) {
      const s = Number(clickedNoteKey.split('-')[0]);
      if (!Number.isNaN(s)) set.add(s);
    }
    return set;
  }, [effectiveActiveNotes, clickedNoteKey]);

  // Tight targeted auto-zoom around the exercise's active frets so mobile views fit 100% on-screen
  const fretRange = useMemo(() => {
    if (interactive || notes.length === 0) {
      return { start: 1, end: 15 };
    }
    const allFretsRaw = [
      ...notes.map((n) => n.fret),
      ...effectiveSteps.flatMap((s) => s.notes.map((n) => n.fret)),
    ].filter((f) => f >= 0);
    const hasOpen = allFretsRaw.some((f) => f === 0);
    const positiveFrets = allFretsRaw.filter((f) => f > 0);
    if (positiveFrets.length === 0 && !hasOpen) {
      return { start: 1, end: 5 };
    }
    const minPos = positiveFrets.length > 0 ? Math.min(...positiveFrets) : 1;
    const maxPos = positiveFrets.length > 0 ? Math.max(...positiveFrets) : 3;
    const start = hasOpen && minPos <= 3 ? 0 : Math.max(1, minPos);
    const end = Math.min(15, Math.max(start + 3, maxPos));
    return { start, end };
  }, [notes, effectiveSteps, interactive]);

  const fretCount = fretRange.end - fretRange.start + 1;
  const leftPad = 28;
  const rightPad = 12;
  const topPad =
    !interactive &&
    (legatoConnections.length > 0 || hasBendSteps || hasStoppataOrPalm)
      ? 36
      : 22;
  const bottomPad = 28;
  const fretWidth = interactive
    ? 44
    : fretCount <= 4
    ? 86
    : fretCount <= 6
    ? 68
    : 56;
  const stringGap = interactive
    ? instrument === 'bass'
      ? 28
      : 22
    : variant === 'stage'
    ? instrument === 'bass'
      ? 38
      : 30
    : instrument === 'bass'
    ? 32
    : 25;

  const width = leftPad + fretCount * fretWidth + rightPad;
  const height = topPad + spanCount * stringGap + bottomPad;

  const noteMap = useMemo(() => {
    const map = new Map<string, FretNote>();
    notes.forEach((n) => {
      map.set(`${n.string}-${n.fret}`, n);
    });
    return map;
  }, [notes]);

  const svgFilterId = variant === 'stage' ? 'fret-glow-stage' : 'fret-glow-compact';
  const effectivePlayingVisual =
    usesExternalClock ? effectiveActiveStepIndex !== null : isPlayingDemo;
  const doubleInlayOffsets = stringCount === 4 ? [0.5, 2.5] : [1.5, 3.5];

  const fretboardSvg = (
    <div className={interactive ? 'w-full max-w-full overflow-x-auto' : 'w-full max-w-full overflow-hidden'}>
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        className={`w-full max-w-full h-auto block select-none ${
          interactive ? 'min-w-[480px] max-h-[210px]' : ''
        }`}
        role="img"
        aria-label={
          instrument === 'bass'
            ? 'Tastiera basso 4 corde auto-zoom'
            : 'Tastiera chitarra auto-zoom'
        }
      >
        <defs>
          <filter id={svgFilterId} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Minimal hairline outer frame */}
        <rect
          x={leftPad}
          y={topPad - 10}
          width={fretCount * fretWidth}
          height={spanCount * stringGap + 20}
          rx={10}
          fill="#000000"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth={1}
        />

        {/* Open-string column tint & crisp white nut */}
        {fretRange.start === 0 && (
          <>
            <rect
              x={leftPad}
              y={topPad - 10}
              width={fretWidth}
              height={spanCount * stringGap + 20}
              rx={10}
              fill="rgba(255,255,255,0.03)"
            />
            <rect
              x={leftPad + fretWidth - 1.75}
              y={topPad - 10}
              width={3.5}
              height={spanCount * stringGap + 20}
              rx={1.5}
              fill="#FFFFFF"
            />
          </>
        )}
        {fretRange.start === 1 && (
          <rect
            x={leftPad - 2}
            y={topPad - 10}
            width={3.5}
            height={spanCount * stringGap + 20}
            rx={1.5}
            fill="#FFFFFF"
          />
        )}

        {/* Minimal fret wires & understated inlays */}
        {Array.from({ length: fretCount }, (_, i) => {
          const fretNum = fretRange.start + i;
          const xRight = leftPad + (i + 1) * fretWidth;
          const xCenter = leftPad + i * fretWidth + fretWidth / 2;
          const hasInlay = INLAY_FRETS.includes(fretNum);
          const isDouble = fretNum === 12;

          return (
            <g key={fretNum}>
              {i < fretCount - 1 && (
                <line
                  x1={xRight}
                  y1={topPad - 10}
                  x2={xRight}
                  y2={topPad + spanCount * stringGap + 10}
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth={1}
                />
              )}
              {hasInlay && !isDouble && (
                <circle
                  cx={xCenter}
                  cy={topPad + (spanCount / 2) * stringGap}
                  r={3.5}
                  fill="rgba(255,255,255,0.12)"
                />
              )}
              {isDouble && (
                <>
                  <circle
                    cx={xCenter}
                    cy={topPad + doubleInlayOffsets[0] * stringGap}
                    r={3.2}
                    fill="rgba(255,255,255,0.12)"
                  />
                  <circle
                    cx={xCenter}
                    cy={topPad + doubleInlayOffsets[1] * stringGap}
                    r={3.2}
                    fill="rgba(255,255,255,0.12)"
                  />
                </>
              )}
              <text
                x={xCenter}
                y={height - 6}
                textAnchor="middle"
                fontSize={10.5}
                fontWeight={700}
                fill="rgba(255,255,255,0.48)"
                className="tabular-nums"
              >
                {fretNum}
              </text>
            </g>
          );
        })}

        {/* Movable Barrè Clamp Indicator */}
        {!interactive &&
          activeBarre &&
          activeBarre.fret >= fretRange.start &&
          activeBarre.fret <= fretRange.end && (() => {
            const barreCx =
              leftPad +
              (activeBarre.fret - fretRange.start) * fretWidth +
              fretWidth / 2;
            const barreTop =
              topPad + (activeBarre.minString - 1) * stringGap - 13;
            const barreBottom =
              topPad + (activeBarre.maxString - 1) * stringGap + 13;
            return (
              <rect
                x={barreCx - 13}
                y={barreTop}
                width={26}
                height={Math.max(24, barreBottom - barreTop)}
                rx={13}
                fill={
                  activeBarre.isActive
                    ? 'rgba(57,255,20,0.22)'
                    : 'rgba(255,255,255,0.08)'
                }
                stroke={
                  activeBarre.isActive ? '#39FF14' : 'rgba(255,255,255,0.32)'
                }
                strokeWidth={activeBarre.isActive ? 2 : 1.2}
                pointerEvents="none"
              />
            );
          })()}

        {/* Strings & Zoomed Interactive Notes */}
        {effectiveStringLabels.map((name, idx) => {
          const stringNum = (idx + 1) as 1 | 2 | 3 | 4 | 5 | 6;
          const y = topPad + idx * stringGap;
          const thickness =
            instrument === 'bass' ? 1.65 + idx * 0.55 : 0.85 + idx * 0.28;
          const isMutedDampedString =
            !interactive &&
            mutedTarget !== null &&
            mutedTarget.strings.includes(stringNum);
          const isStringLit = activeStringNumbers.has(stringNum);
          const isBentString =
            !interactive &&
            activeBendNote !== null &&
            activeBendNote.note.string === stringNum &&
            activeBendNote.note.fret >= fretRange.start &&
            activeBendNote.note.fret <= fretRange.end;
          const bendCx = isBentString
            ? leftPad +
              (activeBendNote!.note.fret - fretRange.start) * fretWidth +
              fretWidth / 2
            : 0;
          const bendLift =
            isBentString && activeBendNote ? (activeBendNote.isHalf ? 12 : 20) : 0;

          const palmNoteOnString =
            !interactive && activeArticulation === 'palmmute'
              ? effectiveActiveNotes.find((n) => n.string === stringNum)
              : undefined;
          const damperStartX = leftPad + fretCount * fretWidth - 24;

          return (
            <g key={`${idx}-${name}`}>
              <text
                x={12}
                y={y + 4}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill={
                  isStringLit
                    ? '#39FF14'
                    : isMutedDampedString
                    ? mutedTarget?.isSilenceGate
                      ? 'rgba(255,255,255,0.65)'
                      : '#FBBF24'
                    : 'rgba(255,255,255,0.45)'
                }
              >
                {name}
              </text>
              {isBentString ? (
                <path
                  d={`M ${leftPad} ${y} Q ${bendCx} ${y - bendLift * 1.45} ${
                    leftPad + fretCount * fretWidth
                  } ${y}`}
                  fill="none"
                  stroke="#39FF14"
                  strokeWidth={thickness + 1.2}
                />
              ) : (
                <line
                  x1={leftPad}
                  y1={y}
                  x2={leftPad + fretCount * fretWidth}
                  y2={y}
                  stroke={
                    isStringLit
                      ? 'rgba(57,255,20,0.88)'
                      : isMutedDampedString
                      ? mutedTarget?.isSilenceGate
                        ? 'rgba(255,255,255,0.34)'
                        : 'rgba(251,191,36,0.62)'
                      : 'rgba(255,255,255,0.24)'
                  }
                  strokeWidth={
                    isStringLit || isMutedDampedString
                      ? thickness + 0.8
                      : thickness
                  }
                  strokeDasharray={
                    isMutedDampedString && !mutedTarget?.isSilenceGate
                      ? '6 3'
                      : undefined
                  }
                />
              )}

              {/* Staccato damped sawtooth vibration wave on active palm-muted string */}
              {palmNoteOnString &&
                palmNoteOnString.fret >= fretRange.start &&
                palmNoteOnString.fret <= fretRange.end && (() => {
                  const noteCx =
                    leftPad +
                    (palmNoteOnString.fret - fretRange.start) * fretWidth +
                    fretWidth / 2;
                  const waveStart = Math.min(damperStartX - 6, noteCx + 14);
                  const waveEnd = damperStartX - 2;
                  if (waveEnd - waveStart < 14) return null;
                  const seg = (waveEnd - waveStart) / 5;
                  const waveD = [
                    `M ${waveStart} ${y}`,
                    `L ${waveStart + seg} ${y - 4.2}`,
                    `L ${waveStart + seg * 2} ${y + 3.6}`,
                    `L ${waveStart + seg * 3} ${y - 2.4}`,
                    `L ${waveStart + seg * 4} ${y + 1.4}`,
                    `L ${waveEnd} ${y}`,
                  ].join(' ');
                  return (
                    <path
                      d={waveD}
                      fill="none"
                      stroke="#39FF14"
                      strokeWidth={1.9}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="animate-palm-mute"
                      pointerEvents="none"
                    />
                  );
                })()}

              {Array.from({ length: fretCount }, (_, fIdx) => {
                const fretNum = fretRange.start + fIdx;
                const cx = leftPad + fIdx * fretWidth + fretWidth / 2;
                const noteKey = `${stringNum}-${fretNum}`;
                const note =
                  activeContextChordNoteMap?.get(noteKey) ?? noteMap.get(noteKey);
                const isHighlighted = activeNoteKeys.has(noteKey);
                const isLegatoAnchor = legatoAnchorKeys.has(noteKey);
                const isOutOfActiveChordContext =
                  activeContextChordKeys !== null &&
                  !activeContextChordKeys.has(noteKey);
                const isInContextChordOnly =
                  hasChordContext && !isHighlighted && !isOutOfActiveChordContext;
                const isIdleDimmedChordNote =
                  isChordPattern &&
                  effectiveActiveStepIndex === null &&
                  !effectivePlayingVisual &&
                  previewChordKeys !== null &&
                  !previewChordKeys.has(noteKey);
                const isDimmed =
                  !isHighlighted &&
                  !isLegatoAnchor &&
                  (isOutOfActiveChordContext ||
                    ((effectivePlayingVisual || effectiveActiveStepIndex !== null) &&
                      !hasChordContext));

                const isBentNote =
                  isHighlighted &&
                  isBentString &&
                  activeBendNote?.note.fret === fretNum;
                const isPalmMutedNote =
                  isHighlighted && activeArticulation === 'palmmute';
                const slideFromFret = isHighlighted
                  ? activeSlideTargetMap.get(noteKey)
                  : undefined;
                const clampedSlideFrom =
                  slideFromFret !== undefined
                    ? Math.max(
                        fretRange.start,
                        Math.min(fretRange.end, slideFromFret)
                      )
                    : undefined;
                const slideDx =
                  clampedSlideFrom !== undefined && clampedSlideFrom !== fretNum
                    ? (clampedSlideFrom - fretNum) * fretWidth
                    : 0;
                const cyNote = isBentNote ? y - bendLift * 0.42 : y;

                const showEmptyChordDot =
                  labelMode === 'none' ||
                  isIdleDimmedChordNote ||
                  isOutOfActiveChordContext ||
                  (isChordPattern && isDimmed);
                const textLabel = showEmptyChordDot
                  ? ''
                  : labelMode === 'fingers'
                  ? note?.finger || '•'
                  : note?.label || (note?.isRoot ? 'R' : '•');

                const baseRadius = interactive
                  ? 9
                  : isChordPattern
                  ? fretCount <= 4
                    ? 10
                    : 9
                  : fretCount <= 4
                  ? 12
                  : 11;
                const litRadius = interactive
                  ? 12
                  : isChordPattern
                  ? fretCount <= 4
                    ? 13
                    : 11.5
                  : fretCount <= 4
                  ? 16
                  : 14.5;

                const noteOpacity =
                  isIdleDimmedChordNote || isOutOfActiveChordContext
                    ? 0.08
                    : isInContextChordOnly
                    ? 0.9
                    : isDimmed
                    ? isChordPattern
                      ? 0.08
                      : 0.24
                    : isLegatoAnchor
                    ? 0.72
                    : 1;

                return (
                  <g
                    key={noteKey}
                    className={interactive || note ? 'cursor-pointer' : undefined}
                    onClick={() => {
                      if (interactive && onToggleNote) {
                        onToggleNote(stringNum, fretNum);
                        playNoteForTuning(stringNum, fretNum);
                      } else if (note) {
                        handlePreviewSingleNote(note);
                      }
                    }}
                  >
                    {interactive && (
                      <circle cx={cx} cy={y} r={14} fill="transparent" />
                    )}
                    {!interactive &&
                      nextChordPreviewKeys?.has(noteKey) &&
                      !isHighlighted &&
                      !activeContextChordKeys?.has(noteKey) && (
                        <circle
                          cx={cx}
                          cy={y}
                          r={baseRadius + 2.5}
                          fill="rgba(57,255,20,0.12)"
                          stroke="#39FF14"
                          strokeWidth={1.6}
                          strokeDasharray="3 2"
                          pointerEvents="none"
                        />
                      )}
                    {note && (
                      <g
                        style={{
                          opacity: noteOpacity,
                        }}
                      >
                        {isLegatoAnchor && !isHighlighted && (
                          <circle
                            cx={cx}
                            cy={y}
                            r={baseRadius + 3.5}
                            fill="rgba(57,255,20,0.12)"
                            stroke="rgba(57,255,20,0.75)"
                            strokeWidth={1.5}
                            strokeDasharray="3 2"
                          />
                        )}
                        {isHighlighted ? (
                          <g
                            key={`hl-${noteKey}-${effectiveActiveStepIndex ?? 'click'}`}
                            className={
                              slideDx !== 0
                                ? 'animate-fret-slide'
                                : activeArticulation === 'vibrato' ||
                                  activeArticulation === 'sustain'
                                ? 'animate-vibrato'
                                : isPalmMutedNote
                                ? 'animate-palm-mute'
                                : undefined
                            }
                            style={
                              slideDx !== 0
                                ? ({
                                    '--slide-dx': `${slideDx}px`,
                                  } as React.CSSProperties)
                                : undefined
                            }
                          >
                            {isPalmMutedNote ? (
                              <>
                                <rect
                                  x={cx - litRadius - 7}
                                  y={cyNote - litRadius - 7}
                                  width={(litRadius + 7) * 2}
                                  height={(litRadius + 7) * 2}
                                  rx={10}
                                  fill="rgba(57,255,20,0.12)"
                                  stroke="rgba(57,255,20,0.6)"
                                  strokeWidth={1.3}
                                  strokeDasharray="3 2.5"
                                />
                                <rect
                                  x={cx - litRadius - 3.5}
                                  y={cyNote - litRadius - 3.5}
                                  width={(litRadius + 3.5) * 2}
                                  height={(litRadius + 3.5) * 2}
                                  rx={8}
                                  fill="rgba(57,255,20,0.22)"
                                  stroke="#39FF14"
                                  strokeWidth={2}
                                />
                              </>
                            ) : (
                              <circle
                                cx={cx}
                                cy={cyNote}
                                r={litRadius + 6}
                                fill={
                                  isSustainedStep
                                    ? 'rgba(255,255,255,0.16)'
                                    : 'rgba(57,255,20,0.2)'
                                }
                                stroke={isSustainedStep ? '#FFFFFF' : '#39FF14'}
                                strokeWidth={isSustainedStep ? 2 : 1.5}
                                strokeDasharray={isSustainedStep ? '4 3' : undefined}
                                filter={`url(#${svgFilterId})`}
                              />
                            )}
                            <circle
                              cx={cx}
                              cy={cyNote}
                              r={litRadius}
                              fill="#39FF14"
                              stroke="#FFFFFF"
                              strokeWidth={2}
                            />
                            {textLabel && (
                              <text
                                x={cx}
                                y={cyNote + 4.2}
                                textAnchor="middle"
                                fontSize={12}
                                fontWeight={800}
                                fill="#000000"
                              >
                                {textLabel}
                              </text>
                            )}
                          </g>
                        ) : (
                          <>
                            <circle
                              cx={cx}
                              cy={y}
                              r={baseRadius}
                              fill="#000000"
                              stroke={
                                isLegatoAnchor
                                  ? '#39FF14'
                                  : note.isRoot
                                  ? 'rgba(57,255,20,0.88)'
                                  : 'rgba(255,255,255,0.68)'
                              }
                              strokeWidth={
                                isLegatoAnchor || note.isRoot ? 2 : 1.4
                              }
                            />
                            {textLabel && (
                              <text
                                x={cx}
                                y={cyNote + 4.2}
                                textAnchor="middle"
                                fontSize={10.5}
                                fontWeight={800}
                                fill="#FFFFFF"
                              >
                                {textLabel}
                              </text>
                            )}
                          </>
                        )}
                        {isBentNote && (
                          <g className="animate-bend-rise" pointerEvents="none">
                            <path
                              d={`M ${cx} ${cyNote - litRadius - 2} L ${cx} ${
                                cyNote - litRadius - 17
                              } M ${cx - 4} ${cyNote - litRadius - 12} L ${cx} ${
                                cyNote - litRadius - 17
                              } L ${cx + 4} ${cyNote - litRadius - 12}`}
                              fill="none"
                              stroke="#39FF14"
                              strokeWidth={2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <text
                              x={cx + 12}
                              y={cyNote - litRadius - 8}
                              fontSize={9}
                              fontWeight={900}
                              fill="#39FF14"
                            >
                              {activeBendNote?.isHalf ? '½' : '1'}
                            </text>
                          </g>
                        )}
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Palm Mute Bridge Damper Zone & Chug Indicator */}
        {!interactive && activeArticulation === 'palmmute' && (() => {
          const pmStrings =
            effectiveActiveNotes.length > 0
              ? effectiveActiveNotes.map((n) => n.string)
              : instrument === 'bass'
              ? [4, 3]
              : [6, 5];
          const minPmStr = Math.min(...pmStrings);
          const maxPmStr = Math.max(...pmStrings);
          const pmTop = topPad + (minPmStr - 1) * stringGap - 11;
          const pmBottom = topPad + (maxPmStr - 1) * stringGap + 11;
          const pmHeight = Math.max(24, pmBottom - pmTop);
          const damperW = 22;
          const damperX = leftPad + fretCount * fretWidth - damperW - 2;
          const pillW = 62;
          const pillX = Math.max(leftPad + 4, damperX - pillW - 6);
          const pillY = Math.max(6, topPad - 24);
          const hatchCount = Math.max(2, Math.floor(pmHeight / 9));

          return (
            <g
              key={`pm-damper-${effectiveActiveStepIndex}`}
              className="animate-palm-damper"
              pointerEvents="none"
            >
              {/* Bridge Damper Pad */}
              <rect
                x={damperX}
                y={pmTop}
                width={damperW}
                height={pmHeight}
                rx={8}
                fill="rgba(57,255,20,0.18)"
                stroke="#39FF14"
                strokeWidth={1.8}
              />
              {/* Diagonal damper hatching */}
              {Array.from({ length: hatchCount }, (_, hIdx) => {
                const hy = pmTop + 6 + hIdx * 9;
                if (hy > pmTop + pmHeight - 5) return null;
                return (
                  <line
                    key={hIdx}
                    x1={damperX + 5}
                    y1={hy + 3}
                    x2={damperX + damperW - 5}
                    y2={hy - 3}
                    stroke="rgba(255,255,255,0.55)"
                    strokeWidth={1.3}
                    strokeLinecap="round"
                  />
                );
              })}
              {/* Downward pressure chevron above pad */}
              <path
                d={`M ${damperX + damperW / 2 - 5} ${Math.max(
                  4,
                  pmTop - 7
                )} L ${damperX + damperW / 2} ${Math.max(
                  8,
                  pmTop - 2
                )} L ${damperX + damperW / 2 + 5} ${Math.max(4, pmTop - 7)}`}
                fill="none"
                stroke="#39FF14"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* P.M. CHUG Pill */}
              <rect
                x={pillX}
                y={pillY}
                width={pillW}
                height={17}
                rx={8.5}
                fill="#000000"
                stroke="#39FF14"
                strokeWidth={1.5}
              />
              <text
                x={pillX + pillW / 2}
                y={pillY + 11.5}
                textAnchor="middle"
                fontSize={8.5}
                fontWeight={900}
                fill="#39FF14"
              >
                P.M. CHUG
              </text>
            </g>
          );
        })()}

        {/* Stoppate (Percussive Dead Notes) & Silence Gate Overlay */}
        {!interactive && mutedTarget && (() => {
          const clampedFret = Math.max(
            fretRange.start,
            Math.min(fretRange.end, mutedTarget.rawFret)
          );
          const mutedCx =
            leftPad + (clampedFret - fretRange.start) * fretWidth + fretWidth / 2;
          const minStr = Math.min(...mutedTarget.strings);
          const maxStr = Math.max(...mutedTarget.strings);
          const clampTop = topPad + (minStr - 1) * stringGap - 13;
          const clampBottom = topPad + (maxStr - 1) * stringGap + 13;
          const clampHeight = Math.max(26, clampBottom - clampTop);

          const badgeText = mutedTarget.isSilenceGate
            ? 'GATE · SILENZIO'
            : mutedTarget.isGhost
            ? '✕ GHOST'
            : '✕ STOPPATA';
          const badgeW = mutedTarget.isSilenceGate ? 90 : 76;
          const badgeX = Math.max(
            leftPad + 2,
            Math.min(
              leftPad + fretCount * fretWidth - badgeW - 2,
              mutedCx - badgeW / 2
            )
          );
          const badgeY = Math.max(4, clampTop - 20);
          const strumX = Math.min(
            leftPad + fretCount * fretWidth - 10,
            mutedCx + 20
          );

          return (
            <g
              key={`muted-fx-${effectiveActiveStepIndex}`}
              pointerEvents="none"
            >
              {/* Left-Hand Damping Clamp Bar */}
              <rect
                x={mutedCx - 12}
                y={clampTop}
                width={24}
                height={clampHeight}
                rx={11}
                fill={
                  mutedTarget.isSilenceGate
                    ? 'rgba(255,255,255,0.08)'
                    : 'rgba(251,191,36,0.16)'
                }
                stroke={
                  mutedTarget.isSilenceGate
                    ? 'rgba(255,255,255,0.55)'
                    : '#FBBF24'
                }
                strokeWidth={1.8}
                strokeDasharray={mutedTarget.isSilenceGate ? '3 3' : '5 2.5'}
                className="animate-stoppata-hit"
              />

              {/* Per-String Shockwaves & X Dead-Note Markers */}
              {mutedTarget.strings.map((sNum) => {
                const sy = topPad + (sNum - 1) * stringGap;
                return (
                  <g key={`mute-x-${sNum}`}>
                    {!mutedTarget.isSilenceGate && (
                      <circle
                        cx={mutedCx}
                        cy={sy}
                        r={10}
                        fill="none"
                        stroke="#39FF14"
                        strokeWidth={1.6}
                        className="animate-stoppata-wave"
                      />
                    )}
                    <g className="animate-stoppata-hit">
                      {mutedTarget.isSilenceGate ? (
                        <line
                          x1={mutedCx - 5}
                          y1={sy}
                          x2={mutedCx + 5}
                          y2={sy}
                          stroke="#FFFFFF"
                          strokeWidth={2.4}
                          strokeLinecap="round"
                        />
                      ) : (
                        <>
                          <circle
                            cx={mutedCx}
                            cy={sy}
                            r={8}
                            fill="#000000"
                            stroke="#FBBF24"
                            strokeWidth={1.5}
                          />
                          <path
                            d={`M ${mutedCx - 4} ${sy - 4} L ${mutedCx + 4} ${
                              sy + 4
                            } M ${mutedCx + 4} ${sy - 4} L ${mutedCx - 4} ${
                              sy + 4
                            }`}
                            stroke="#FFFFFF"
                            strokeWidth={2.2}
                            strokeLinecap="round"
                          />
                        </>
                      )}
                    </g>
                  </g>
                );
              })}

              {/* Vertical Pick-Strum Slash Arrow for Percussive Stoppata */}
              {!mutedTarget.isSilenceGate && (
                <g className="animate-stoppata-hit">
                  <line
                    x1={strumX}
                    y1={clampTop + 3}
                    x2={strumX}
                    y2={clampBottom - 3}
                    stroke="#39FF14"
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                  <path
                    d={`M ${strumX - 4} ${clampBottom - 8} L ${strumX} ${
                      clampBottom - 2
                    } L ${strumX + 4} ${clampBottom - 8}`}
                    fill="none"
                    stroke="#39FF14"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              )}

              {/* Floating Badge */}
              <rect
                x={badgeX}
                y={badgeY}
                width={badgeW}
                height={16}
                rx={8}
                fill="#000000"
                stroke={
                  mutedTarget.isSilenceGate
                    ? 'rgba(255,255,255,0.65)'
                    : '#FBBF24'
                }
                strokeWidth={1.4}
              />
              <text
                x={badgeX + badgeW / 2}
                y={badgeY + 11}
                textAnchor="middle"
                fontSize={8.5}
                fontWeight={900}
                fill={mutedTarget.isSilenceGate ? '#FFFFFF' : '#FBBF24'}
              >
                {badgeText}
              </text>
            </g>
          );
        })()}

        {/* Ad-Hoc Legato & Expressivity Slur Arcs (Hammer-On / Pull-Off / Slide) */}
        {!interactive &&
          uniqueStaticLegatoArcs.map((conn) => {
            const fromClamped = Math.max(
              fretRange.start,
              Math.min(fretRange.end, conn.fromFret)
            );
            if (fromClamped === conn.toFret) return null;
            const x1 =
              leftPad + (fromClamped - fretRange.start) * fretWidth + fretWidth / 2;
            const x2 =
              leftPad + (conn.toFret - fretRange.start) * fretWidth + fretWidth / 2;
            const y = topPad + (conn.string - 1) * stringGap;
            const midX = (x1 + x2) / 2;
            const archDir = conn.kind === 'pull' ? 1 : -1;
            const archLift = conn.kind === 'slide' ? 0 : 20 * archDir;
            const d =
              conn.kind === 'slide'
                ? `M ${x1} ${y} L ${x2} ${y}`
                : `M ${x1} ${y + archDir * 6} Q ${midX} ${y + archLift * 1.45} ${x2} ${y + archDir * 6}`;

            return (
              <path
                key={`static-${conn.kind}-${conn.string}-${conn.fromFret}-${conn.toFret}`}
                d={d}
                fill="none"
                stroke={
                  conn.kind === 'slide'
                    ? 'rgba(57,255,20,0.28)'
                    : 'rgba(255,255,255,0.22)'
                }
                strokeWidth={conn.kind === 'slide' ? 2.2 : 1.5}
                strokeLinecap="round"
                strokeDasharray={conn.kind === 'slide' ? '5 3' : undefined}
                pointerEvents="none"
              />
            );
          })}

        {!interactive &&
          activeLegatoConns.map((conn, connIdx) => {
            const fromClamped = Math.max(
              fretRange.start,
              Math.min(fretRange.end, conn.fromFret)
            );
            if (fromClamped === conn.toFret) return null;
            const x1 =
              leftPad + (fromClamped - fretRange.start) * fretWidth + fretWidth / 2;
            const x2 =
              leftPad + (conn.toFret - fretRange.start) * fretWidth + fretWidth / 2;
            const y = topPad + (conn.string - 1) * stringGap;
            const midX = (x1 + x2) / 2;

            if (conn.kind === 'slide') {
              const dir = x2 >= x1 ? 1 : -1;
              const arrowTipX = x2 - dir * 13;
              const pillW = 54;
              const pillX = Math.max(
                leftPad + 2,
                Math.min(
                  leftPad + fretCount * fretWidth - pillW - 2,
                  midX - pillW / 2
                )
              );
              const pillY = Math.max(4, y - 24);

              return (
                <g
                  key={`active-slide-${effectiveActiveStepIndex}-${conn.string}-${conn.fromFret}-${conn.toFret}`}
                  pointerEvents="none"
                >
                  {/* Dual Parallel Slide Glissando Rails */}
                  <line
                    x1={x1}
                    y1={y - 4.5}
                    x2={x2}
                    y2={y - 4.5}
                    stroke="rgba(57,255,20,0.35)"
                    strokeWidth={1.3}
                  />
                  <line
                    x1={x1}
                    y1={y + 4.5}
                    x2={x2}
                    y2={y + 4.5}
                    stroke="rgba(57,255,20,0.35)"
                    strokeWidth={1.3}
                  />
                  {/* Sweeping Neon Motion Trail */}
                  <path
                    d={`M ${x1} ${y} L ${x2} ${y}`}
                    pathLength={1}
                    fill="none"
                    stroke="#39FF14"
                    strokeWidth={3.4}
                    strokeLinecap="round"
                    filter={`url(#${svgFilterId})`}
                    className="animate-legato-arc"
                  />
                  {/* Directional Arrowhead */}
                  <path
                    d={`M ${arrowTipX - dir * 6} ${y - 4.5} L ${arrowTipX} ${y} L ${
                      arrowTipX - dir * 6
                    } ${y + 4.5}`}
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Origin Ghost Ring */}
                  <circle
                    cx={x1}
                    cy={y}
                    r={8}
                    fill="rgba(57,255,20,0.14)"
                    stroke="rgba(255,255,255,0.65)"
                    strokeWidth={1.4}
                    strokeDasharray="3 2"
                  />
                  {/* Slide Badge (only once for chord slides) */}
                  {connIdx === 0 && (
                    <>
                      <rect
                        x={pillX}
                        y={pillY}
                        width={pillW}
                        height={15}
                        rx={7.5}
                        fill="#000000"
                        stroke="#39FF14"
                        strokeWidth={1.4}
                      />
                      <text
                        x={pillX + pillW / 2}
                        y={pillY + 10.5}
                        textAnchor="middle"
                        fontSize={8.5}
                        fontWeight={900}
                        fill="#39FF14"
                      >
                        {dir >= 0 ? 'SLIDE ↗' : 'SLIDE ↘'}
                      </text>
                    </>
                  )}
                </g>
              );
            }

            const archDir = conn.kind === 'pull' ? 1 : -1;
            const archLift = 22 * archDir;
            const d = `M ${x1} ${y + archDir * 6} Q ${midX} ${
              y + archLift * 1.5
            } ${x2} ${y + archDir * 6}`;
            const badgeY = Math.max(10, Math.min(height - 10, y + archLift * 1.05));
            const badgeChar = conn.kind === 'hammer' ? 'H' : 'P';

            return (
              <g
                key={`active-legato-${effectiveActiveStepIndex}-${conn.string}-${conn.fromFret}-${conn.toFret}`}
                pointerEvents="none"
              >
                <path
                  d={d}
                  pathLength={1}
                  fill="none"
                  stroke="#39FF14"
                  strokeWidth={2.8}
                  strokeLinecap="round"
                  filter={`url(#${svgFilterId})`}
                  className="animate-legato-arc"
                />
                <circle
                  cx={midX}
                  cy={badgeY}
                  r={8}
                  fill="#000000"
                  stroke="#39FF14"
                  strokeWidth={1.6}
                />
                <text
                  x={midX}
                  y={badgeY + 3.4}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={900}
                  fill="#39FF14"
                >
                  {badgeChar}
                </text>
              </g>
            );
          })}
      </svg>
    </div>
  );

  const { subsPerBeat } = getSubdivisionMetrics(subdivisionLabel);
  const gridChunkSize =
    subdivisionLabel === '1/4'
      ? 4
      : subdivisionLabel === '1/8T'
      ? effectiveSteps.length === 6
        ? 6
        : 12
      : subdivisionLabel === '1/16T'
      ? 6
      : 8;
  const gridColsClass =
    gridChunkSize === 4
      ? 'grid-cols-4'
      : gridChunkSize === 6
      ? 'grid-cols-6'
      : gridChunkSize === 12
      ? 'grid-cols-12'
      : 'grid-cols-8';

  const totalBars = Math.max(1, Math.ceil(effectiveSteps.length / gridChunkSize));
  const activeBarIdx =
    effectiveActiveStepIndex !== null
      ? Math.floor(effectiveActiveStepIndex / gridChunkSize) % totalBars
      : 0;
  const barOffset = activeBarIdx * gridChunkSize;
  const barSteps = effectiveSteps.slice(barOffset, barOffset + gridChunkSize);
  const activeTechniqueLabel =
    effectiveActiveStepIndex !== null ? activeStep?.technique : undefined;

  const getSlotLabel = (idx: number): string => {
    if (subdivisionLabel === '1/4') {
      return String(idx + 1);
    }
    if (subdivisionLabel === '1/8T') {
      const tripletLabels = ['1', 't', 'a', '2', 't', 'a', '3', 't', 'a', '4', 't', 'a'];
      return tripletLabels[idx] ?? String(idx + 1);
    }
    if (subdivisionLabel === '1/16') {
      const firstHalf = ['1', 'e', '&', 'a', '2', 'e', '&', 'a'];
      const secondHalf = ['3', 'e', '&', 'a', '4', 'e', '&', 'a'];
      return (activeBarIdx % 2 === 0 ? firstHalf : secondHalf)[idx] ?? String(idx + 1);
    }
    if (subdivisionLabel === '1/16T') {
      const beatNum = (activeBarIdx % 4) + 1;
      const sextLabels = [String(beatNum), '·', '·', '&', '·', '·'];
      return sextLabels[idx] ?? '·';
    }
    return BAR_8_LABELS[idx] ?? String(idx + 1);
  };

  const rhythmGridBar =
    !interactive && barSteps.length > 0 && effectiveSteps.length <= 64 ? (
      <div className={`grid ${gridColsClass} gap-1 w-full min-w-0`}>
        {barSteps.map((step, idx) => {
          const isActive = effectiveActiveStepIndex === barOffset + idx;
          const slotLabel = getSlotLabel(idx);
          const isDownbeat =
            subdivisionLabel === '1/4'
              ? true
              : subdivisionLabel === '1/8T'
              ? idx % 3 === 0
              : subdivisionLabel === '1/16'
              ? idx % 4 === 0
              : subdivisionLabel === '1/16T'
              ? idx === 0
              : idx % 2 === 0;
          const art = getStepArticulation(step);
          const degreeLabel = step.notes[0]?.label;
          const isChordDegree =
            hasChordContext &&
            (degreeLabel === '1' ||
              degreeLabel === '3' ||
              degreeLabel === 'b3' ||
              degreeLabel === '5' ||
              degreeLabel === 'b5' ||
              degreeLabel === '7' ||
              degreeLabel === 'b7' ||
              degreeLabel === '8');
          const isAccented = Boolean(step.accent || step.dynamic === 'f');
          const isSoft = step.dynamic === 'p';
          const isArticulatedSlot =
            isAccented ||
            art === 'hammer' ||
            art === 'pull' ||
            art === 'slide' ||
            art === 'bend' ||
            art === 'palmmute' ||
            art === 'tapping' ||
            art === 'harmonic' ||
            art === 'sweep' ||
            art === 'hybrid';
          const symbol = isChordDegree
            ? degreeLabel
            : art === 'tapping'
            ? 'T'
            : art === 'harmonic'
            ? '◇'
            : art === 'sweep'
            ? 'SW'
            : art === 'hybrid'
            ? 'm'
            : art === 'bend'
            ? '↑'
            : art === 'palmmute'
            ? 'PM'
            : art === 'hammer'
            ? 'H'
            : art === 'pull'
            ? 'P'
            : art === 'slide'
            ? '/'
            : art === 'vibrato'
            ? '~'
            : art === 'sustain'
            ? '—'
            : art === 'muted'
            ? '×'
            : isAccented
            ? '>'
            : '●';

          return (
            <div
              key={`${barOffset}-${idx}`}
              className={`min-w-0 flex flex-col items-center justify-center rounded-lg border py-1 text-[10px] font-bold tabular-nums ${
                isActive
                  ? 'border-[#39FF14] bg-[#39FF14] text-black'
                  : isAccented
                  ? 'border-[#39FF14]/65 bg-[#39FF14]/10 text-[#39FF14]'
                  : isArticulatedSlot
                  ? 'border-[#39FF14]/35 bg-black text-[#39FF14]'
                  : isDownbeat
                  ? 'border-white/15 bg-black text-white/75'
                  : 'border-white/10 bg-black text-white/40'
              } ${!isActive && isSoft ? 'opacity-55' : ''}`}
            >
              <span className="leading-none">{slotLabel}</span>
              <span className="mt-0.5 text-[9px] leading-none">{symbol}</span>
            </div>
          );
        })}
      </div>
    ) : null;

  const chordLookaheadBar =
    chordLookahead && !chordLookahead.isSingleStaticChord ? (
      <div className="flex flex-wrap items-center justify-center gap-1.5 py-0.5 text-[10px]">
        <span className="rounded-full border border-white/25 bg-black px-2.5 py-0.5 font-bold text-white tabular-nums">
          {chordLookahead.currentChordLabel}
        </span>
        {chordLookahead.nextChordLabel && (
          <span
            className={`rounded-full border px-2.5 py-0.5 tabular-nums transition-colors ${
              chordLookahead.stepsUntilChange !== null &&
              chordLookahead.stepsUntilChange <= 3
                ? 'border-[#39FF14] bg-[#39FF14]/15 font-black text-[#39FF14]'
                : 'border-white/15 bg-black font-bold text-white/60'
            }`}
          >
            → {chordLookahead.nextChordLabel}
          </span>
        )}
      </div>
    ) : null;

  // FULL-SCREEN STAGE VARIANT
  if (variant === 'stage') {
    const progressPct =
      effectiveActiveStepIndex !== null && effectiveSteps.length > 0
        ? Math.round(((effectiveActiveStepIndex + 1) / effectiveSteps.length) * 100)
        : 0;
    const stageBeatIdx =
      internalBeatIdx !== null
        ? internalBeatIdx
        : effectiveActiveStepIndex !== null
        ? Math.floor(effectiveActiveStepIndex / subsPerBeat) % 4
        : -1;

    return (
      <div className="w-full min-w-0 max-w-full space-y-3">
        {chordLookaheadBar}
        {fretboardSvg}

        {(activeTechniqueLabel || totalBars > 1) && (
          <div className="mx-auto flex min-h-[26px] max-w-md flex-wrap items-center justify-center gap-2">
            {activeTechniqueLabel && (
              <span className="rounded-full border border-[#39FF14]/50 bg-[#39FF14]/12 px-3 py-0.5 text-[11px] font-black tracking-wide text-[#39FF14]">
                {activeTechniqueLabel}
              </span>
            )}
            {totalBars > 1 && (
              <span className="rounded-full border border-white/15 bg-black px-2.5 py-0.5 text-[10px] font-bold text-white/55 tabular-nums">
                B{activeBarIdx + 1}/{totalBars}
              </span>
            )}
          </div>
        )}

        {rhythmGridBar && <div className="mx-auto max-w-md">{rhythmGridBar}</div>}

        <div className="mx-auto max-w-md space-y-3 text-center">
          <div className="flex items-center justify-center gap-2.5">
            {[0, 1, 2, 3].map((b) => {
              const lit = stageBeatIdx === b;
              return (
                <span
                  key={b}
                  className={`h-2.5 w-2.5 rounded-full ${
                    lit
                      ? b === 0
                        ? 'bg-[#39FF14] scale-125'
                        : 'bg-white scale-110'
                      : 'bg-white/15'
                  }`}
                />
              );
            })}
          </div>

          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#39FF14]"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // COMPACT VARIANT (Obiettivi / Playing / Tuner Scales / Custom Builder)
  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl chrome-card p-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {!interactive && !hideDemoButton && effectiveSteps.length > 0 && (
            <button
              type="button"
              onClick={isPlayingDemo ? stopDemo : () => startDemo('manual')}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold transition ${
                isPlayingDemo
                  ? 'bg-white text-black'
                  : 'bg-black border border-white/20 text-white hover:border-white/50'
              }`}
            >
              {isPlayingDemo ? (
                <>
                  <Square className="h-3 w-3 fill-current" />
                  Stop
                </>
              ) : (
                <>
                  <Play className="h-3 w-3 fill-current text-[#39FF14]" />
                  Demo
                </>
              )}
            </button>
          )}

          {activeTechniqueLabel && effectiveActiveStepIndex !== null ? (
            <span className="rounded-full border border-[#39FF14]/50 bg-[#39FF14]/12 px-2.5 py-0.5 text-[11px] font-black tracking-wide text-[#39FF14] tabular-nums">
              {activeTechniqueLabel}
            </span>
          ) : (
            demoMode !== 'live-loop' &&
            activeStep &&
            effectiveActiveStepIndex !== null && (
              <span className="text-[11px] font-bold text-white/85 tabular-nums">
                <span className="text-[#39FF14] mr-1">
                  {BAR_8_LABELS[effectiveActiveStepIndex % 8] ??
                    effectiveActiveStepIndex + 1}
                </span>
                {activeStep.sustain
                  ? 'Tenuta'
                  : activeStep.muted || activeStep.notes.length === 0
                  ? '×'
                  : activeStep.notes
                      .map(
                        (n) =>
                          `${effectiveStringLabels[n.string - 1] ?? STRING_SHORT_MAP[n.string]}${n.fret}`
                      )
                      .join(' ')}
              </span>
            )
          )}

          {totalBars > 1 && (
            <span className="rounded-full border border-white/15 bg-black px-2 py-0.5 text-[10px] font-bold text-white/55 tabular-nums">
              B{activeBarIdx + 1}/{totalBars}
            </span>
          )}
        </div>

        <div className="flex rounded-full bg-black border border-white/15 p-0.5">
          <button
            type="button"
            onClick={() =>
              setUserLabelMode((curr) => {
                const effective = curr ?? defaultLabelMode;
                if (effective === 'fingers' && isChordPattern) return 'none';
                return 'fingers';
              })
            }
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold transition ${
              labelMode === 'fingers'
                ? 'bg-white text-black'
                : 'text-white/50 hover:text-white'
            }`}
          >
            Dita
          </button>
          <button
            type="button"
            onClick={() =>
              setUserLabelMode((curr) => {
                const effective = curr ?? defaultLabelMode;
                if (effective === 'intervals' && isChordPattern) return 'none';
                return 'intervals';
              })
            }
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold transition ${
              labelMode === 'intervals'
                ? 'bg-white text-black'
                : 'text-white/50 hover:text-white'
            }`}
          >
            {hasChordContext ? 'Gradi' : 'Note'}
          </button>
        </div>
      </div>

      {chordLookaheadBar}
      {fretboardSvg}
      {rhythmGridBar}
    </div>
  );
};
