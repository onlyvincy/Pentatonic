import { useCallback, useEffect, useRef, useState } from 'react';
import { GapClickMode, MetronomeSoundId, Subdivision } from '../types/practice';
import {
  MetronomeClickKind,
  getSharedAudioContext,
  playMetronomeClick,
  unlockSharedAudioContext,
} from '../utils/guitarSynth';

interface UseMetronomeOptions {
  initialBpm?: number;
  initialSubdivision?: Subdivision;
  initialGapClick?: GapClickMode;
  initialSound?: MetronomeSoundId;
  visualOnly?: boolean;
}

export interface MetronomeState {
  isPlaying: boolean;
  bpm: number;
  subdivision: Subdivision;
  gapClickMode: GapClickMode;
  soundId: MetronomeSoundId;
  visualOnly: boolean;
  currentBeat: number; // 1..4
  currentBar: number; // 1..N
  isGapBar: boolean;
  pulseCounter: number; // increments on every quarter beat for CSS flash trigger
  currentSubStep: number; // driven directly by AudioContext.currentTime playhead
}

function getSubdivisionCount(sub: Subdivision): number {
  switch (sub) {
    case '1/4':
      return 1;
    case '1/8':
      return 2;
    case '1/8T':
      return 3;
    case '1/16':
      return 4;
  }
}

export function useMetronome(options: UseMetronomeOptions = {}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpmState] = useState(options.initialBpm ?? 90);
  const [subdivision, setSubdivisionState] = useState<Subdivision>(
    options.initialSubdivision ?? '1/8'
  );
  const [gapClickMode, setGapClickMode] = useState<GapClickMode>(
    options.initialGapClick ?? 'off'
  );
  const [soundId, setSoundId] = useState<MetronomeSoundId>(
    options.initialSound ?? 'woodblock'
  );
  const [visualOnly, setVisualOnly] = useState<boolean>(options.visualOnly ?? false);

  const [currentBeat, setCurrentBeat] = useState(1);
  const [currentBar, setCurrentBar] = useState(1);
  const [isGapBar, setIsGapBar] = useState(false);
  const [pulseCounter, setPulseCounter] = useState(0);
  const [currentSubStep, setCurrentSubStep] = useState(0);

  const isPlayingRef = useRef(false);
  const schedulerIdRef = useRef<number | null>(null);
  const playheadRafRef = useRef<number | null>(null);

  // Sample-accurate Web Audio playhead anchors
  const clockAnchorRef = useRef<number>(0);
  const baseSubStepOffsetRef = useRef<number>(0);
  const nextNoteTimeRef = useRef<number>(0);
  const stepIndexRef = useRef<number>(0);
  const lastUsingAudioClockRef = useRef<boolean>(false);

  const lastEmittedSubStepRef = useRef<number>(-1);
  const lastEmittedBeatRef = useRef<number>(-1);
  const barGapMapRef = useRef<Map<number, boolean>>(new Map());
  const tapTimesRef = useRef<number[]>([]);

  // Live refs for scheduler & RAF access
  const bpmRef = useRef(bpm);
  const subRef = useRef(subdivision);
  const gapRef = useRef(gapClickMode);
  const soundIdRef = useRef(soundId);
  const visualOnlyRef = useRef(visualOnly);

  useEffect(() => {
    gapRef.current = gapClickMode;
  }, [gapClickMode]);

  useEffect(() => {
    soundIdRef.current = soundId;
  }, [soundId]);

  useEffect(() => {
    visualOnlyRef.current = visualOnly;
  }, [visualOnly]);

  const ensureAudioCtx = useCallback((): AudioContext | null => {
    const ctx = getSharedAudioContext();
    if (ctx && (ctx.state as string) !== 'running') {
      unlockSharedAudioContext().catch(() => {});
    }
    return ctx;
  }, []);

  const rebaseClockAnchor = useCallback(() => {
    if (!isPlayingRef.current) return;
    const ctx = getSharedAudioContext();
    const usingAudio = Boolean(ctx && ctx.state === 'running');
    const now = usingAudio && ctx ? ctx.currentTime : performance.now() / 1000;
    const targetTime = Math.max(now + 0.02, nextNoteTimeRef.current);

    baseSubStepOffsetRef.current = stepIndexRef.current;
    clockAnchorRef.current = targetTime;
    nextNoteTimeRef.current = targetTime;
  }, []);

  const setBpm = useCallback(
    (next: number | ((prev: number) => number)) => {
      setBpmState((prev) => {
        const val = typeof next === 'function' ? next(prev) : next;
        const clamped = Math.max(30, Math.min(260, Math.round(val)));
        bpmRef.current = clamped;
        rebaseClockAnchor();
        return clamped;
      });
    },
    [rebaseClockAnchor]
  );

  const setSubdivision = useCallback(
    (next: Subdivision) => {
      subRef.current = next;
      setSubdivisionState(next);
      rebaseClockAnchor();
    },
    [rebaseClockAnchor]
  );

  const triggerSound = useCallback(
    (time: number, kind: MetronomeClickKind) => {
      const ctx = getSharedAudioContext();
      if (!ctx) return;
      if ((ctx.state as string) !== 'running') {
        ctx.resume().catch(() => {});
      }

      const safeTime = Math.max(ctx.currentTime + 0.004, time);
      playMetronomeClick(ctx, safeTime, kind, soundIdRef.current);
    },
    []
  );

  const playPreCountBeep = useCallback(
    (isGo = false) => {
      if (visualOnlyRef.current) return;
      const ctx = ensureAudioCtx();
      if (!ctx) return;
      triggerSound(ctx.currentTime + 0.008, isGo ? 'go' : 'precount');
    },
    [ensureAudioCtx, triggerSound]
  );

  const scheduleAudioStep = useCallback(
    (step: number, time: number, nowClock: number, useAudioClock: boolean) => {
      const subsPerBeat = getSubdivisionCount(subRef.current);
      const stepsPerBar = 4 * subsPerBeat;
      const stepInBar = step % stepsPerBar;
      const isQuarterBeat = stepInBar % subsPerBeat === 0;
      const beatNumber = Math.floor(stepInBar / subsPerBeat) + 1;
      const barNum = Math.floor(step / stepsPerBar) + 1;

      if (!barGapMapRef.current.has(barNum)) {
        let isGap = false;
        if (gapRef.current === '1-in-4') {
          isGap = barNum % 4 === 0;
        } else if (gapRef.current === 'random-25') {
          isGap = barNum > 2 && Math.random() < 0.25;
        }
        barGapMapRef.current.set(barNum, isGap);
        if (barGapMapRef.current.size > 16) {
          const oldest = barGapMapRef.current.keys().next().value;
          if (oldest !== undefined) barGapMapRef.current.delete(oldest);
        }
      }

      const mutedByGap = barGapMapRef.current.get(barNum) ?? false;

      if (!visualOnlyRef.current && !mutedByGap) {
        const ctx = getSharedAudioContext();
        const audioTime =
          useAudioClock || !ctx
            ? time
            : ctx.currentTime + Math.max(0.004, time - nowClock);

        if (beatNumber === 1 && isQuarterBeat) {
          triggerSound(audioTime, 'accent');
        } else if (isQuarterBeat) {
          triggerSound(audioTime, 'beat');
        } else {
          triggerSound(audioTime, 'sub');
        }
      }
    },
    [triggerSound]
  );

  const stopPlayhead = useCallback(() => {
    if (playheadRafRef.current !== null) {
      window.cancelAnimationFrame(playheadRafRef.current);
      playheadRafRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    const ctx = ensureAudioCtx();
    if (schedulerIdRef.current !== null) {
      window.clearInterval(schedulerIdRef.current);
    }
    stopPlayhead();

    isPlayingRef.current = true;
    stepIndexRef.current = 0;
    baseSubStepOffsetRef.current = 0;
    lastEmittedSubStepRef.current = -1;
    lastEmittedBeatRef.current = -1;
    barGapMapRef.current.clear();

    const useAudioClock = Boolean(ctx && ctx.state === 'running');
    lastUsingAudioClockRef.current = useAudioClock;
    const baseNow =
      useAudioClock && ctx ? ctx.currentTime : performance.now() / 1000;
    const startAt = baseNow + 0.03;

    clockAnchorRef.current = startAt;
    nextNoteTimeRef.current = startAt;
    setCurrentSubStep(0);
    setCurrentBeat(1);
    setCurrentBar(1);
    setIsGapBar(false);
    setIsPlaying(true);

    // 1. Hardware lookahead audio scheduler
    schedulerIdRef.current = window.setInterval(() => {
      if (!isPlayingRef.current) return;
      const currentCtx = getSharedAudioContext();
      if (currentCtx && (currentCtx.state as string) !== 'running') {
        currentCtx.resume().catch(() => {});
      }

      const nowAudioRunning = Boolean(
        currentCtx && currentCtx.state === 'running'
      );
      const now =
        nowAudioRunning && currentCtx
          ? currentCtx.currentTime
          : performance.now() / 1000;

      if (nowAudioRunning !== lastUsingAudioClockRef.current) {
        lastUsingAudioClockRef.current = nowAudioRunning;
        const syncAnchor = now + 0.02;
        baseSubStepOffsetRef.current = stepIndexRef.current;
        clockAnchorRef.current = syncAnchor;
        nextNoteTimeRef.current = syncAnchor;
      }

      if (nextNoteTimeRef.current < now - 0.08) {
        const recoverAnchor = now + 0.02;
        baseSubStepOffsetRef.current = stepIndexRef.current;
        clockAnchorRef.current = recoverAnchor;
        nextNoteTimeRef.current = recoverAnchor;
      }

      const subsPerBeat = getSubdivisionCount(subRef.current);
      const stepDur = 60.0 / bpmRef.current / subsPerBeat;
      const lookahead = 0.1;

      while (nextNoteTimeRef.current < now + lookahead) {
        scheduleAudioStep(
          stepIndexRef.current,
          nextNoteTimeRef.current,
          now,
          nowAudioRunning
        );
        stepIndexRef.current += 1;
        const stepsSinceAnchor =
          stepIndexRef.current - baseSubStepOffsetRef.current;
        nextNoteTimeRef.current =
          clockAnchorRef.current + stepsSinceAnchor * stepDur;
      }
    }, 20);

    // 2. Deterministic requestAnimationFrame playhead compensated for speaker hardware output latency
    const runPlayhead = () => {
      if (!isPlayingRef.current) return;

      const currentCtx = getSharedAudioContext();
      const usingAudio = Boolean(
        currentCtx && currentCtx.state === 'running'
      );
      const now =
        usingAudio && currentCtx
          ? currentCtx.currentTime
          : performance.now() / 1000;

      const outputLatencySec =
        usingAudio && currentCtx
          ? (currentCtx.baseLatency || 0) +
            ((currentCtx as unknown as { outputLatency?: number }).outputLatency || 0.018)
          : 0;
      const effectiveNow = now - outputLatencySec;
      const elapsed = effectiveNow - clockAnchorRef.current;
      if (elapsed >= 0) {
        const subsPerBeat = getSubdivisionCount(subRef.current);
        const stepDur = 60.0 / bpmRef.current / subsPerBeat;
        const exactSubStep =
          baseSubStepOffsetRef.current + Math.floor(elapsed / stepDur);

        if (exactSubStep !== lastEmittedSubStepRef.current) {
          lastEmittedSubStepRef.current = exactSubStep;
          setCurrentSubStep(exactSubStep);

          const beatNumber = (Math.floor(exactSubStep / subsPerBeat) % 4) + 1;
          const barNum = Math.floor(exactSubStep / (4 * subsPerBeat)) + 1;

          if (beatNumber !== lastEmittedBeatRef.current) {
            lastEmittedBeatRef.current = beatNumber;
            setCurrentBeat(beatNumber);
            setCurrentBar(barNum);
            setIsGapBar(barGapMapRef.current.get(barNum) ?? false);
            setPulseCounter((c) => c + 1);
          }
        }
      }

      playheadRafRef.current = window.requestAnimationFrame(runPlayhead);
    };

    playheadRafRef.current = window.requestAnimationFrame(runPlayhead);
  }, [ensureAudioCtx, scheduleAudioStep, stopPlayhead]);

  const stop = useCallback(() => {
    isPlayingRef.current = false;
    if (schedulerIdRef.current !== null) {
      window.clearInterval(schedulerIdRef.current);
      schedulerIdRef.current = null;
    }
    stopPlayhead();
    setIsPlaying(false);
    setCurrentBeat(1);
    setIsGapBar(false);
    setCurrentSubStep(0);
  }, [stopPlayhead]);

  const toggle = useCallback(() => {
    if (isPlaying) {
      stop();
    } else {
      start();
    }
  }, [isPlaying, start, stop]);

  const registerTap = useCallback(() => {
    const now = performance.now();
    const recent = tapTimesRef.current.filter((t) => now - t < 2200);
    recent.push(now);
    tapTimesRef.current = recent.slice(-5);
    if (recent.length >= 2) {
      let totalDiff = 0;
      for (let i = 1; i < recent.length; i++) {
        totalDiff += recent[i] - recent[i - 1];
      }
      const avgMs = totalDiff / (recent.length - 1);
      const calculatedBpm = Math.round(60000 / avgMs);
      setBpm(calculatedBpm);
    }
  }, [setBpm]);

  useEffect(() => {
    return () => {
      isPlayingRef.current = false;
      if (schedulerIdRef.current !== null) {
        window.clearInterval(schedulerIdRef.current);
      }
      stopPlayhead();
    };
  }, [stopPlayhead]);

  return {
    isPlaying,
    bpm,
    subdivision,
    gapClickMode,
    soundId,
    visualOnly,
    currentBeat,
    currentBar,
    isGapBar,
    pulseCounter,
    currentSubStep,
    setBpm,
    setSubdivision,
    setGapClickMode,
    setSoundId,
    setVisualOnly,
    start,
    stop,
    toggle,
    registerTap,
    playPreCountBeep,
  };
}
