import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DemoStep, FretNote, MetronomeSoundId } from '../types/practice';
import { Play, Square } from 'lucide-react';
import {
  STRING_SHORT_MAP,
  getSharedAudioContext,
  playGuitarFrequency,
  playGuitarPluck,
  playGuitarStep,
  playSoftMetronomeTick,
} from '../utils/guitarSynth';

export type FretboardDemoMode = 'slow-intro' | 'live-loop' | 'manual';

interface FretboardViewerProps {
  notes: FretNote[];
  demoSequence?: DemoStep[];
  coachingCues?: string[];
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
  /** Custom string labels (e.g. ['e','C','G','C','A','F'] for FACGCE tuning) */
  stringLabels?: readonly [string, string, string, string, string, string];
  /** Custom open-string frequencies in Hz for alternate tunings */
  customStringFreqs?: Record<1 | 2 | 3 | 4 | 5 | 6, number>;
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
  | 'vibrato'
  | 'sustain'
  | 'muted';

function getStepArticulation(step: DemoStep | null | undefined): StepArticulation {
  if (!step) return 'pick';
  if (step.muted || (step.notes.length === 0 && !step.sustain)) return 'muted';
  const tech = (step.technique || '').toLowerCase();
  if (tech.includes('bend')) return 'bend';
  if (tech.includes('palm') || tech.includes('p.m.')) return 'palmmute';
  if (tech.includes('hammer')) return 'hammer';
  if (tech.includes('pull')) return 'pull';
  if (tech.includes('slide')) return 'slide';
  if (step.sustain && tech.includes('vibrato')) return 'vibrato';
  if (step.sustain) return 'sustain';
  return 'pick';
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
  interactive = false,
  forceStopDemo = false,
  variant = 'compact',
  demoMode = 'manual',
  externalStepTick,
  metronomeSound = 'woodblock',
  stringLabels = DEFAULT_STRING_NAMES,
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
  const [userLabelMode, setUserLabelMode] = useState<LabelMode | null>(null);
  const [isPlayingDemo, setIsPlayingDemo] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const [internalBurstPhase, setInternalBurstPhase] = useState(false);
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

  // Steady didactic half-time tempo in 1/8 subdivision (2 notes per metronome beat)
  const slowBpm = 56;

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
    setInternalBurstPhase(false);
    setInternalBeatIdx(null);
  }, [clearTimers]);

  const playNoteForTuning = useCallback(
    (stringNum: 1 | 2 | 3 | 4 | 5 | 6, fret: number) => {
      if (customStringFreqs) {
        const freq = customStringFreqs[stringNum] * Math.pow(2, fret / 12);
        playGuitarFrequency(freq, { durationSec: 1.25, volume: 0.54 });
      } else {
        playGuitarPluck(stringNum, fret, { durationSec: 1.25, volume: 0.54 });
      }
    },
    [customStringFreqs]
  );

  const triggerStepAudio = useCallback(
    (index: number, withSoftMetronome = false) => {
      const step = effectiveSteps[index];
      if (!step || muteAudio) return;
      if (withSoftMetronome && index % 2 === 0) {
        playSoftMetronomeTick(index % 8 === 0, metronomeSound);
      }
      if (customStringFreqs && !step.sustain && !step.muted && step.notes.length > 0) {
        step.notes.forEach((n, idx) => {
          const freq = customStringFreqs[n.string] * Math.pow(2, n.fret / 12);
          playGuitarFrequency(freq, {
            durationSec: 1.25,
            volume: step.notes.length > 1 ? 0.32 : 0.54,
            delaySec: idx * 0.016,
          });
        });
      } else {
        playGuitarStep(step.notes, step.muted, step.sustain, step.technique);
      }
    },
    [effectiveSteps, muteAudio, metronomeSound, customStringFreqs]
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

      if (speedBurst) {
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

        setInternalBurstPhase(false);
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
              setInternalBurstPhase(false);
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
            if (mode === 'slow-intro' && !muteAudio && tick16 % 4 === 0) {
              playSoftMetronomeTick(tick16 % 16 === 0, metronomeSound);
            }

            if (tickInCycle < phase1Ticks) {
              setInternalBurstPhase(false);
              const stepIdx = Math.floor(tickInCycle / 2) % demoStepsCount;
              setActiveStepIndex(stepIdx);
              if (tickInCycle % 2 === 0) {
                triggerStepAudio(stepIdx, false);
              }
            } else {
              setInternalBurstPhase(true);
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

      if (mode === 'slow-intro') {
        const stepSec = 60 / slowBpm / 2;
        const totalStepsPerPass = effectiveSteps.length;
        const passes = totalStepsPerPass >= 16 ? 1 : 2;
        const startAnchor = getNowSec();
        let lastTriggeredTotalIdx = 0;

        setActiveStepIndex(0);
        triggerStepAudio(0, true);

        const loopSlow = () => {
          const elapsed = Math.max(0, getNowSec() - startAnchor);
          const totalIdx = Math.floor(elapsed / stepSec);

          if (totalIdx >= totalStepsPerPass * passes) {
            clearTimers();
            endTimeoutRef.current = window.setTimeout(() => {
              setIsPlayingDemo(false);
              setActiveStepIndex(null);
              onDemoCompleteRef.current?.();
            }, Math.round(stepSec * 400));
            return;
          }

          if (totalIdx !== lastTriggeredTotalIdx) {
            lastTriggeredTotalIdx = totalIdx;
            const stepIdx = totalIdx % totalStepsPerPass;
            setActiveStepIndex(stepIdx);
            triggerStepAudio(stepIdx, true);
          }

          rafRef.current = window.requestAnimationFrame(loopSlow);
        };

        rafRef.current = window.requestAnimationFrame(loopSlow);
        return;
      }

      if (mode === 'live-loop') {
        const beatSec = 60 / Math.max(40, Math.min(240, bpm));
        const stepSec = Math.max(0.24, Math.min(0.6, beatSec / 2));
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

      // 'manual' mode: 1/8 note pace synced to BPM on audio clock
      const stepSec = Math.max(0.24, Math.min(0.55, 60 / bpm / 2));
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

  const isBurstPhase = usesExternalClock
    ? Boolean(externalBurstResolved?.isBurstPhase)
    : internalBurstPhase;

  // Trigger optional audio only when step changes under external clock
  useEffect(() => {
    if (!usesExternalClock) return;
    clearTimers();
    if (effectiveActiveStepIndex === null || muteAudio) return;
    const step = effectiveSteps[effectiveActiveStepIndex];
    if (step) {
      playGuitarStep(step.notes, step.muted, step.sustain, step.technique);
    }
  }, [
    usesExternalClock,
    effectiveActiveStepIndex,
    effectiveSteps,
    muteAudio,
    clearTimers,
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

  const activeBarre = useMemo(() => {
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

    for (let i = 1; i < effectiveSteps.length; i++) {
      const art = getStepArticulation(effectiveSteps[i]);
      if (art !== 'hammer' && art !== 'pull' && art !== 'slide') continue;
      const prevNote = effectiveSteps[i - 1]?.notes[0];
      const currNote = effectiveSteps[i]?.notes[0];
      if (
        prevNote &&
        currNote &&
        prevNote.string === currNote.string &&
        prevNote.fret !== currNote.fret
      ) {
        conns.push({
          stepIndex: i,
          kind: art,
          string: currNote.string,
          fromFret: prevNote.fret,
          toFret: currNote.fret,
        });
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

  const activeLegatoConn = useMemo(
    () =>
      effectiveActiveStepIndex !== null
        ? legatoConnections.find((c) => c.stepIndex === effectiveActiveStepIndex) ??
          null
        : null,
    [legatoConnections, effectiveActiveStepIndex]
  );

  const legatoAnchorKey = activeLegatoConn
    ? `${activeLegatoConn.string}-${activeLegatoConn.fromFret}`
    : null;

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
    !interactive && (legatoConnections.length > 0 || hasBendSteps) ? 36 : 22;
  const bottomPad = 28;
  const fretWidth = interactive
    ? 44
    : fretCount <= 4
    ? 86
    : fretCount <= 6
    ? 68
    : 56;
  const stringGap = interactive
    ? 22
    : variant === 'stage'
    ? 30
    : 25;

  const width = leftPad + fretCount * fretWidth + rightPad;
  const height = topPad + 5 * stringGap + bottomPad;

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

  const fretboardSvg = (
    <div className={interactive ? 'w-full max-w-full overflow-x-auto' : 'w-full max-w-full overflow-hidden'}>
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        className={`w-full max-w-full h-auto block select-none ${
          interactive ? 'min-w-[480px] max-h-[210px]' : ''
        }`}
        role="img"
        aria-label="Tastiera chitarra auto-zoom"
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
          height={5 * stringGap + 20}
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
              height={5 * stringGap + 20}
              rx={10}
              fill="rgba(255,255,255,0.03)"
            />
            <rect
              x={leftPad + fretWidth - 1.75}
              y={topPad - 10}
              width={3.5}
              height={5 * stringGap + 20}
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
            height={5 * stringGap + 20}
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
                  y2={topPad + 5 * stringGap + 10}
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth={1}
                />
              )}
              {hasInlay && !isDouble && (
                <circle
                  cx={xCenter}
                  cy={topPad + 2.5 * stringGap}
                  r={3.5}
                  fill="rgba(255,255,255,0.12)"
                />
              )}
              {isDouble && (
                <>
                  <circle
                    cx={xCenter}
                    cy={topPad + 1.5 * stringGap}
                    r={3.2}
                    fill="rgba(255,255,255,0.12)"
                  />
                  <circle
                    cx={xCenter}
                    cy={topPad + 3.5 * stringGap}
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
                    ? 'rgba(255,107,0,0.22)'
                    : 'rgba(255,255,255,0.08)'
                }
                stroke={
                  activeBarre.isActive ? '#FF6B00' : 'rgba(255,255,255,0.32)'
                }
                strokeWidth={activeBarre.isActive ? 2 : 1.2}
                pointerEvents="none"
              />
            );
          })()}

        {/* Strings & Zoomed Interactive Notes */}
        {stringLabels.map((name, idx) => {
          const stringNum = (idx + 1) as 1 | 2 | 3 | 4 | 5 | 6;
          const y = topPad + idx * stringGap;
          const thickness = 0.85 + idx * 0.28;
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

          return (
            <g key={`${idx}-${name}`}>
              <text
                x={12}
                y={y + 4}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill={isStringLit ? '#FF6B00' : 'rgba(255,255,255,0.45)'}
              >
                {name}
              </text>
              {isBentString ? (
                <path
                  d={`M ${leftPad} ${y} Q ${bendCx} ${y - bendLift * 1.45} ${
                    leftPad + fretCount * fretWidth
                  } ${y}`}
                  fill="none"
                  stroke="#FF6B00"
                  strokeWidth={thickness + 1.2}
                />
              ) : (
                <line
                  x1={leftPad}
                  y1={y}
                  x2={leftPad + fretCount * fretWidth}
                  y2={y}
                  stroke={
                    isStringLit ? 'rgba(255,107,0,0.88)' : 'rgba(255,255,255,0.24)'
                  }
                  strokeWidth={isStringLit ? thickness + 0.8 : thickness}
                />
              )}

              {Array.from({ length: fretCount }, (_, fIdx) => {
                const fretNum = fretRange.start + fIdx;
                const cx = leftPad + fIdx * fretWidth + fretWidth / 2;
                const noteKey = `${stringNum}-${fretNum}`;
                const note =
                  activeContextChordNoteMap?.get(noteKey) ?? noteMap.get(noteKey);
                const isHighlighted = activeNoteKeys.has(noteKey);
                const isLegatoAnchor = legatoAnchorKey === noteKey;
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
                            fill="rgba(255,107,0,0.12)"
                            stroke="rgba(255,107,0,0.75)"
                            strokeWidth={1.5}
                            strokeDasharray="3 2"
                          />
                        )}
                        {isHighlighted && (
                          <g
                            className={
                              activeArticulation === 'vibrato' ||
                              activeArticulation === 'sustain'
                                ? 'animate-vibrato'
                                : isPalmMutedNote
                                ? 'animate-palm-mute'
                                : undefined
                            }
                          >
                            {isPalmMutedNote ? (
                              <rect
                                x={cx - litRadius - 5}
                                y={cyNote - litRadius - 5}
                                width={(litRadius + 5) * 2}
                                height={(litRadius + 5) * 2}
                                rx={9}
                                fill="rgba(255,107,0,0.14)"
                                stroke="#FF6B00"
                                strokeWidth={1.8}
                                strokeDasharray="4 2.5"
                              />
                            ) : (
                              <circle
                                cx={cx}
                                cy={cyNote}
                                r={litRadius + 6}
                                fill={
                                  isSustainedStep
                                    ? 'rgba(255,255,255,0.16)'
                                    : 'rgba(255,107,0,0.2)'
                                }
                                stroke={isSustainedStep ? '#FFFFFF' : '#FF6B00'}
                                strokeWidth={isSustainedStep ? 2 : 1.5}
                                strokeDasharray={isSustainedStep ? '4 3' : undefined}
                                filter={`url(#${svgFilterId})`}
                              />
                            )}
                            <circle
                              cx={cx}
                              cy={cyNote}
                              r={litRadius}
                              fill="#FF6B00"
                              stroke="#FFFFFF"
                              strokeWidth={2}
                            />
                          </g>
                        )}
                        {!isHighlighted && (
                          <circle
                            cx={cx}
                            cy={y}
                            r={baseRadius}
                            fill="#000000"
                            stroke={
                              isLegatoAnchor
                                ? '#FF6B00'
                                : note.isRoot
                                ? 'rgba(255,107,0,0.88)'
                                : 'rgba(255,255,255,0.68)'
                            }
                            strokeWidth={
                              isLegatoAnchor || note.isRoot ? 2 : 1.4
                            }
                          />
                        )}
                        {textLabel && (
                          <text
                            x={cx}
                            y={cyNote + 4.2}
                            textAnchor="middle"
                            fontSize={isHighlighted ? 12 : 10.5}
                            fontWeight={800}
                            fill={isHighlighted ? '#000000' : '#FFFFFF'}
                          >
                            {textLabel}
                          </text>
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
                              stroke="#FF6B00"
                              strokeWidth={2}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <text
                              x={cx + 12}
                              y={cyNote - litRadius - 8}
                              fontSize={9}
                              fontWeight={900}
                              fill="#FF6B00"
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

        {/* Palm Mute Bridge Damper Pill */}
        {!interactive && activeArticulation === 'palmmute' && (
          <g className="animate-palm-mute" pointerEvents="none">
            <rect
              x={leftPad + fretCount * fretWidth - 28}
              y={topPad - 6}
              width={24}
              height={16}
              rx={5}
              fill="#000000"
              stroke="#FF6B00"
              strokeWidth={1.5}
            />
            <text
              x={leftPad + fretCount * fretWidth - 16}
              y={topPad + 5.5}
              textAnchor="middle"
              fontSize={9}
              fontWeight={900}
              fill="#FF6B00"
            >
              PM
            </text>
          </g>
        )}

        {/* Ad-Hoc Legato & Expressivity Slur Arcs (Hammer-On / Pull-Off / Slide) */}
        {!interactive &&
          uniqueStaticLegatoArcs.map((conn) => {
            const x1 =
              leftPad + (conn.fromFret - fretRange.start) * fretWidth + fretWidth / 2;
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
                stroke="rgba(255,255,255,0.22)"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeDasharray={conn.kind === 'slide' ? '4 3' : undefined}
                pointerEvents="none"
              />
            );
          })}

        {!interactive && activeLegatoConn && (() => {
          const x1 =
            leftPad +
            (activeLegatoConn.fromFret - fretRange.start) * fretWidth +
            fretWidth / 2;
          const x2 =
            leftPad +
            (activeLegatoConn.toFret - fretRange.start) * fretWidth +
            fretWidth / 2;
          const y = topPad + (activeLegatoConn.string - 1) * stringGap;
          const midX = (x1 + x2) / 2;
          const archDir = activeLegatoConn.kind === 'pull' ? 1 : -1;
          const archLift = activeLegatoConn.kind === 'slide' ? 0 : 22 * archDir;
          const d =
            activeLegatoConn.kind === 'slide'
              ? `M ${x1} ${y} L ${x2} ${y}`
              : `M ${x1} ${y + archDir * 6} Q ${midX} ${y + archLift * 1.5} ${x2} ${y + archDir * 6}`;
          const badgeY =
            activeLegatoConn.kind === 'slide'
              ? y - 14
              : y + archLift * 1.05;
          const badgeChar =
            activeLegatoConn.kind === 'hammer'
              ? 'H'
              : activeLegatoConn.kind === 'pull'
              ? 'P'
              : 'S';

          return (
            <g
              key={`active-legato-${effectiveActiveStepIndex}-${activeLegatoConn.fromFret}-${activeLegatoConn.toFret}`}
              pointerEvents="none"
            >
              <path
                d={d}
                pathLength={1}
                fill="none"
                stroke="#FF6B00"
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
                stroke="#FF6B00"
                strokeWidth={1.6}
              />
              <text
                x={midX}
                y={badgeY + 3.4}
                textAnchor="middle"
                fontSize={9}
                fontWeight={900}
                fill="#FF6B00"
              >
                {badgeChar}
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );

  // Instant 0ms highlight 8-slot 4/4 cyclic rhythm grid (slices 8-step bars for multi-bar progressions)
  const totalBars = Math.max(1, Math.ceil(effectiveSteps.length / 8));
  const activeBarIdx =
    effectiveActiveStepIndex !== null
      ? Math.floor(effectiveActiveStepIndex / 8) % totalBars
      : 0;
  const barOffset = activeBarIdx * 8;
  const barSteps = effectiveSteps.slice(barOffset, barOffset + 8);
  const activeTechniqueLabel =
    effectiveActiveStepIndex !== null ? activeStep?.technique : undefined;

  const rhythmGridBar =
    !interactive && barSteps.length > 0 && effectiveSteps.length <= 32 ? (
      <div className="grid grid-cols-8 gap-1 w-full min-w-0">
        {barSteps.map((step, idx) => {
          const isActive = effectiveActiveStepIndex === barOffset + idx;
          const slotLabel = BAR_8_LABELS[idx] ?? String(idx + 1);
          const isDownbeat = idx % 2 === 0;
          const art = getStepArticulation(step);
          const degreeLabel = step.notes[0]?.label;
          const isChordDegree =
            hasChordContext &&
            (degreeLabel === '1' ||
              degreeLabel === '3' ||
              degreeLabel === '5' ||
              degreeLabel === '8');
          const isArticulatedSlot =
            art === 'hammer' ||
            art === 'pull' ||
            art === 'slide' ||
            art === 'bend' ||
            art === 'palmmute';
          const symbol = isChordDegree
            ? degreeLabel
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
            : '●';

          return (
            <div
              key={`${barOffset}-${idx}`}
              className={`min-w-0 flex flex-col items-center justify-center rounded-lg border py-1 text-[10px] font-bold tabular-nums ${
                isActive
                  ? 'border-[#FF6B00] bg-[#FF6B00] text-black'
                  : isArticulatedSlot
                  ? 'border-[#FF6B00]/35 bg-black text-[#FF6B00]'
                  : isDownbeat
                  ? 'border-white/15 bg-black text-white/75'
                  : 'border-white/10 bg-black text-white/40'
              }`}
            >
              <span className="leading-none">{slotLabel}</span>
              <span className="mt-0.5 text-[9px] leading-none">{symbol}</span>
            </div>
          );
        })}
      </div>
    ) : null;

  const speedBurstBadge = speedBurst ? (
    isBurstPhase ? (
      <span className="rounded-full border border-[#FF6B00] bg-[#FF6B00] px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-black animate-pulse">
        ⚡ 1/16 · BURST 2x
      </span>
    ) : (
      <span className="rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
        1/8 · NORMALE 1x
      </span>
    )
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
        ? Math.floor(effectiveActiveStepIndex / 2) % 4
        : -1;

    return (
      <div className="w-full min-w-0 max-w-full space-y-4">
        {fretboardSvg}

        {(speedBurstBadge || activeTechniqueLabel || totalBars > 1) && (
          <div className="mx-auto flex min-h-[26px] max-w-md flex-wrap items-center justify-center gap-2">
            {speedBurstBadge}
            {activeTechniqueLabel && (
              <span className="rounded-full border border-[#FF6B00]/50 bg-[#FF6B00]/12 px-3 py-0.5 text-[11px] font-black tracking-wide text-[#FF6B00]">
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
                        ? 'bg-[#FF6B00] scale-125'
                        : 'bg-white scale-110'
                      : 'bg-white/15'
                  }`}
                />
              );
            })}
          </div>

          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#FF6B00]"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // COMPACT VARIANT (Obiettivi / Playing / Tuner Scales / Custom Builder)
  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl bg-black border border-white/15 p-3 space-y-2.5">
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
                  <Play className="h-3 w-3 fill-current text-[#FF6B00]" />
                  Demo
                </>
              )}
            </button>
          )}

          {speedBurstBadge}

          {activeTechniqueLabel && effectiveActiveStepIndex !== null ? (
            <span className="rounded-full border border-[#FF6B00]/50 bg-[#FF6B00]/12 px-2.5 py-0.5 text-[11px] font-black tracking-wide text-[#FF6B00] tabular-nums">
              {activeTechniqueLabel}
            </span>
          ) : (
            demoMode !== 'live-loop' &&
            activeStep &&
            effectiveActiveStepIndex !== null && (
              <span className="text-[11px] font-bold text-white/85 tabular-nums">
                <span className="text-[#FF6B00] mr-1">
                  {BAR_8_LABELS[effectiveActiveStepIndex % 8] ??
                    effectiveActiveStepIndex + 1}
                </span>
                {activeStep.sustain
                  ? 'Tenuta'
                  : activeStep.muted || activeStep.notes.length === 0
                  ? '×'
                  : activeStep.notes
                      .map((n) => `${STRING_SHORT_MAP[n.string]}${n.fret}`)
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

      {fretboardSvg}
      {rhythmGridBar}
    </div>
  );
};
