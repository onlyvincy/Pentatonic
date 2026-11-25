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
  initialBackbeatMode?: boolean;
  initialSound?: MetronomeSoundId;
  visualOnly?: boolean;
  speedBurst?: boolean;
  initialBurstCycleSteps?: number;
}

export interface StartMetronomeOptions {
  countInBeats?: number;
  onCountInComplete?: () => void;
}

export interface MetronomeState {
  isPlaying: boolean;
  isCountingIn: boolean;
  countInBeat: number; // 4..1 during count-in, 0 otherwise
  bpm: number;
  subdivision: Subdivision;
  gapClickMode: GapClickMode;
  backbeatMode: boolean;
  soundId: MetronomeSoundId;
  visualOnly: boolean;
  speedBurst: boolean;
  currentBeat: number; // 1..4
  currentBar: number; // 1..N (0 during count-in)
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
    case '1/16T':
      return 6;
  }
}

export function useMetronome(options: UseMetronomeOptions = {}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCountingIn, setIsCountingIn] = useState(false);
  const [countInBeat, setCountInBeat] = useState(0);
  const [bpm, setBpmState] = useState(options.initialBpm ?? 90);
  const [subdivision, setSubdivisionState] = useState<Subdivision>(
    options.initialSubdivision ?? '1/8'
  );
  const [gapClickMode, setGapClickMode] = useState<GapClickMode>(
    options.initialGapClick ?? 'off'
  );
  const [backbeatMode, setBackbeatModeState] = useState<boolean>(
    options.initialBackbeatMode ?? false
  );
  const [soundId, setSoundId] = useState<MetronomeSoundId>(
    options.initialSound ?? 'woodblock'
  );
  const [visualOnly, setVisualOnly] = useState<boolean>(options.visualOnly ?? false);
  const [speedBurst, setSpeedBurstState] = useState<boolean>(
    options.speedBurst ?? false
  );

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

  // Exact queue of scheduled audio clicks -> guarantees 1:1 audio-to-visual lock
  const visualQueueRef = useRef<
    {
      step: number;
      time: number;
      useAudioClock: boolean;
      beat: number;
      bar: number;
      isGap: boolean;
      isCountIn: boolean;
      countInBeat: number;
    }[]
  >([]);

  const lastEmittedSubStepRef = useRef<number>(-1);
  const lastEmittedBeatRef = useRef<number>(-1);
  const lastEmittedBarRef = useRef<number>(-1);
  const countInStepsRef = useRef<number>(0);
  const isCountingInRef = useRef<boolean>(false);
  const onCountInCompleteRef = useRef<(() => void) | null>(null);
  const barGapMapRef = useRef<Map<number, boolean>>(new Map());
  const tapTimesRef = useRef<number[]>([]);

  // Live refs for scheduler & RAF access
  const bpmRef = useRef(bpm);
  const subRef = useRef(subdivision);
  const gapRef = useRef(gapClickMode);
  const backbeatRef = useRef(backbeatMode);
  const soundIdRef = useRef(soundId);
  const visualOnlyRef = useRef(visualOnly);
  const speedBurstRef = useRef(speedBurst);
  const burstCycleStepsRef = useRef<number>(
    Math.max(1, options.initialBurstCycleSteps ?? 8)
  );

  useEffect(() => {
    gapRef.current = gapClickMode;
  }, [gapClickMode]);

  useEffect(() => {
    backbeatRef.current = backbeatMode;
  }, [backbeatMode]);

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
      if (typeof next === 'number') {
        const clamped = Math.max(30, Math.min(260, Math.round(next)));
        bpmRef.current = clamped;
        rebaseClockAnchor();
        setBpmState(clamped);
        return;
      }
      setBpmState((prev) => {
        const val = next(prev);
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

  const setSpeedBurst = useCallback(
    (next: boolean) => {
      speedBurstRef.current = next;
      setSpeedBurstState(next);
      rebaseClockAnchor();
    },
    [rebaseClockAnchor]
  );

  const setBurstCycleSteps = useCallback((stepsCount: number) => {
    burstCycleStepsRef.current = Math.max(1, Math.round(stepsCount));
  }, []);

  const setBackbeatMode = useCallback((next: boolean) => {
    backbeatRef.current = next;
    setBackbeatModeState(next);
  }, []);

  const triggerSound = useCallback(
    (time: number, kind: MetronomeClickKind): number => {
      const ctx = getSharedAudioContext();
      if (!ctx) return time;
      if ((ctx.state as string) !== 'running') {
        ctx.resume().catch(() => {});
      }

      const safeTime = Math.max(ctx.currentTime + 0.004, time);
      playMetronomeClick(ctx, safeTime, kind, soundIdRef.current);
      return safeTime;
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
      const audioSubsPerBeat = getSubdivisionCount(subRef.current);
      const useBurstClock =
        speedBurstRef.current &&
        (subRef.current === '1/8' || subRef.current === '1/4');
      const clockSubsPerBeat = useBurstClock ? 4 : audioSubsPerBeat;

      // Native sample-accurate count-in bar (step < 0) seamlessly leading into step 0 (Bar 1 Beat 1)
      if (step < 0) {
        const totalCountInSteps = Math.max(
          clockSubsPerBeat,
          countInStepsRef.current
        );
        const stepsFromStart = step + totalCountInSteps;
        const isQuarterBeat = stepsFromStart % clockSubsPerBeat === 0;
        const beatIdx = Math.floor(stepsFromStart / clockSubsPerBeat);
        const beatNumber = beatIdx + 1;
        const countInBeatsTotal = Math.max(
          1,
          Math.round(totalCountInSteps / clockSubsPerBeat)
        );
        const remainingBeat = Math.max(1, countInBeatsTotal - beatIdx);

        // During count-in, play at the exact exercise BPM & subdivision (1x normal speed if speedBurst is on)
        const shouldTriggerAudioClick = !useBurstClock
          ? true
          : subRef.current === '1/4'
          ? stepsFromStart % 4 === 0
          : stepsFromStart % 2 === 0;

        let scheduledTime = time;
        if (!visualOnlyRef.current && shouldTriggerAudioClick) {
          const ctx = getSharedAudioContext();
          const audioTime =
            useAudioClock || !ctx
              ? time
              : ctx.currentTime + Math.max(0.004, time - nowClock);

          const kind: MetronomeClickKind =
            beatNumber === 1 && isQuarterBeat
              ? 'accent'
              : isQuarterBeat
              ? 'beat'
              : 'sub';

          const actualAudioTime = triggerSound(audioTime, kind);
          if (useAudioClock) {
            scheduledTime = actualAudioTime;
          }
        }

        visualQueueRef.current.push({
          step,
          time: scheduledTime,
          useAudioClock,
          beat: beatNumber,
          bar: 0,
          isGap: false,
          isCountIn: true,
          countInBeat: remainingBeat,
        });
        if (visualQueueRef.current.length > 64) {
          visualQueueRef.current.splice(0, visualQueueRef.current.length - 64);
        }
        return;
      }

      const stepsPerBar = 4 * clockSubsPerBeat;
      const stepInBar = step % stepsPerBar;
      const isQuarterBeat = stepInBar % clockSubsPerBeat === 0;
      const beatNumber = Math.floor(stepInBar / clockSubsPerBeat) + 1;
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

      let isInSpeedBurstPhase = false;
      if (useBurstClock) {
        const totalSteps = Math.max(1, burstCycleStepsRef.current);
        const phase1Ticks = 2 * totalSteps;
        const phase2Ticks = Math.max(16, totalSteps);
        const cycleTicks = phase1Ticks + phase2Ticks;
        const tickInCycle = ((step % cycleTicks) + cycleTicks) % cycleTicks;
        isInSpeedBurstPhase = tickInCycle >= phase1Ticks;
      }

      const shouldTriggerAudioClick = backbeatRef.current
        ? isQuarterBeat && (beatNumber === 2 || beatNumber === 4)
        : !useBurstClock
        ? true
        : isInSpeedBurstPhase
        ? // 2x double-speed audible click during burst phase
          subRef.current === '1/4'
          ? stepInBar % 2 === 0
          : true
        : // 1x normal speed during non-burst phase
          subRef.current === '1/4'
          ? stepInBar % 4 === 0
          : stepInBar % 2 === 0;
      let scheduledTime = time;

      if (!visualOnlyRef.current && !mutedByGap && shouldTriggerAudioClick) {
        const ctx = getSharedAudioContext();
        const audioTime =
          useAudioClock || !ctx
            ? time
            : ctx.currentTime + Math.max(0.004, time - nowClock);

        const kind: MetronomeClickKind = backbeatRef.current
          ? 'accent'
          : beatNumber === 1 && isQuarterBeat
          ? 'accent'
          : isQuarterBeat || (isInSpeedBurstPhase && stepInBar % 2 === 0)
          ? 'beat'
          : 'sub';

        const actualAudioTime = triggerSound(audioTime, kind);
        if (useAudioClock) {
          scheduledTime = actualAudioTime;
        }
      }

      visualQueueRef.current.push({
        step,
        time: scheduledTime,
        useAudioClock,
        beat: beatNumber,
        bar: barNum,
        isGap: mutedByGap,
        isCountIn: false,
        countInBeat: 0,
      });
      if (visualQueueRef.current.length > 64) {
        visualQueueRef.current.splice(0, visualQueueRef.current.length - 64);
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

  const start = useCallback(
    (startOptions?: StartMetronomeOptions) => {
      const ctx = ensureAudioCtx();
      if (schedulerIdRef.current !== null) {
        window.clearInterval(schedulerIdRef.current);
      }
      stopPlayhead();

      const countInBeats = Math.max(
        0,
        Math.round(startOptions?.countInBeats ?? 0)
      );
      const audioSubsPerBeat = getSubdivisionCount(subRef.current);
      const useBurstClock =
        speedBurstRef.current &&
        (subRef.current === '1/8' || subRef.current === '1/4');
      const clockSubsPerBeat = useBurstClock ? 4 : audioSubsPerBeat;
      const countInSteps = countInBeats * clockSubsPerBeat;

      isPlayingRef.current = true;
      countInStepsRef.current = countInSteps;
      isCountingInRef.current = countInSteps > 0;
      onCountInCompleteRef.current = startOptions?.onCountInComplete ?? null;
      stepIndexRef.current = -countInSteps;
      baseSubStepOffsetRef.current = -countInSteps;
      lastEmittedSubStepRef.current = -1;
      lastEmittedBeatRef.current = -1;
      lastEmittedBarRef.current = -1;
      barGapMapRef.current.clear();
      visualQueueRef.current = [];

      const useAudioClock = Boolean(ctx && ctx.state === 'running');
      lastUsingAudioClockRef.current = useAudioClock;
      const baseNow =
        useAudioClock && ctx ? ctx.currentTime : performance.now() / 1000;
      const startAt = baseNow + 0.05;

      clockAnchorRef.current = startAt;
      nextNoteTimeRef.current = startAt;
      setIsCountingIn(countInSteps > 0);
      setCountInBeat(countInBeats);
      setCurrentSubStep(0);
      setCurrentBeat(1);
      setCurrentBar(countInSteps > 0 ? 0 : 1);
      setIsGapBar(false);
      setIsPlaying(true);

    const runSchedulerTick = () => {
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
        visualQueueRef.current = [];
        const syncAnchor = now + 0.03;
        baseSubStepOffsetRef.current = stepIndexRef.current;
        clockAnchorRef.current = syncAnchor;
        nextNoteTimeRef.current = syncAnchor;
      }

      if (nextNoteTimeRef.current < now - 0.08) {
        visualQueueRef.current = [];
        const recoverAnchor = now + 0.03;
        baseSubStepOffsetRef.current = stepIndexRef.current;
        clockAnchorRef.current = recoverAnchor;
        nextNoteTimeRef.current = recoverAnchor;
      }

      const audioSubsPerBeat = getSubdivisionCount(subRef.current);
      const useBurstClock =
        speedBurstRef.current &&
        (subRef.current === '1/8' || subRef.current === '1/4');
      const clockSubsPerBeat = useBurstClock ? 4 : audioSubsPerBeat;
      const stepDur = 60.0 / bpmRef.current / clockSubsPerBeat;
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
    };

    // 1. Schedule Step 0 immediately (zero initial setInterval delay) then keep lookahead fed
    runSchedulerTick();
    schedulerIdRef.current = window.setInterval(runSchedulerTick, 20);

    // 2. Exact queue-driven requestAnimationFrame playhead locked to speaker output clock
    const runPlayhead = () => {
      if (!isPlayingRef.current) return;

      const currentCtx = getSharedAudioContext();
      const usingAudio = Boolean(
        currentCtx && currentCtx.state === 'running'
      );

      let speakerAudioTime = 0;
      if (usingAudio && currentCtx) {
        const ts =
          typeof currentCtx.getOutputTimestamp === 'function'
            ? currentCtx.getOutputTimestamp()
            : null;
        if (ts && typeof ts.contextTime === 'number' && ts.contextTime > 0) {
          speakerAudioTime = ts.contextTime;
        } else {
          speakerAudioTime = currentCtx.currentTime;
        }
      }
      const perfNow = performance.now() / 1000;
      // 12ms lead compensates ~1 frame of React + SVG paint latency so highlight lands dead-on the click
      const VISUAL_LEAD_SEC = 0.012;

      const queue = visualQueueRef.current;
      let latestDue: (typeof queue)[number] | null = null;

      while (queue.length > 0) {
        const head = queue[0];
        const currentClock = head.useAudioClock ? speakerAudioTime : perfNow;
        if (head.time <= currentClock + VISUAL_LEAD_SEC) {
          latestDue = queue.shift()!;
        } else {
          break;
        }
      }

      if (latestDue) {
        if (latestDue.isCountIn) {
          if (
            latestDue.beat !== lastEmittedBeatRef.current ||
            latestDue.bar !== lastEmittedBarRef.current
          ) {
            lastEmittedBeatRef.current = latestDue.beat;
            lastEmittedBarRef.current = latestDue.bar;
            setCountInBeat(latestDue.countInBeat);
            setCurrentBeat(latestDue.beat);
            setCurrentBar(0);
            setIsGapBar(false);
            setPulseCounter((c) => c + 1);
          }
        } else {
          if (isCountingInRef.current) {
            isCountingInRef.current = false;
            setIsCountingIn(false);
            setCountInBeat(0);
            const onComplete = onCountInCompleteRef.current;
            onCountInCompleteRef.current = null;
            onComplete?.();
          }
          if (latestDue.step !== lastEmittedSubStepRef.current) {
            lastEmittedSubStepRef.current = latestDue.step;
            setCurrentSubStep(latestDue.step);
          }
          if (
            latestDue.beat !== lastEmittedBeatRef.current ||
            latestDue.bar !== lastEmittedBarRef.current
          ) {
            lastEmittedBeatRef.current = latestDue.beat;
            lastEmittedBarRef.current = latestDue.bar;
            setCurrentBeat(latestDue.beat);
            setCurrentBar(latestDue.bar);
            setIsGapBar(latestDue.isGap);
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
    countInStepsRef.current = 0;
    isCountingInRef.current = false;
    onCountInCompleteRef.current = null;
    if (schedulerIdRef.current !== null) {
      window.clearInterval(schedulerIdRef.current);
      schedulerIdRef.current = null;
    }
    visualQueueRef.current = [];
    stopPlayhead();
    setIsPlaying(false);
    setIsCountingIn(false);
    setCountInBeat(0);
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
    isCountingIn,
    countInBeat,
    bpm,
    subdivision,
    gapClickMode,
    backbeatMode,
    soundId,
    visualOnly,
    speedBurst,
    currentBeat,
    currentBar,
    isGapBar,
    pulseCounter,
    currentSubStep,
    setBpm,
    setSubdivision,
    setGapClickMode,
    setBackbeatMode,
    setSoundId,
    setVisualOnly,
    setSpeedBurst,
    setBurstCycleSteps,
    start,
    stop,
    toggle,
    registerTap,
    playPreCountBeep,
  };
}
