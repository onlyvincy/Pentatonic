import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  FastForward,
  HelpCircle,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Square,
  Timer,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  CleanlinessScore,
  Exercise,
  ExerciseVariant,
  FeedRecording,
  GapClickMode,
  MetronomeSoundId,
  ScaledWorkoutPlan,
  SetLog,
  Subdivision,
  WorkoutSessionLog,
} from '../types/practice';
import {
  calculateGoldilocksNextBpm,
  calculateWarmupBpm,
  computeWeightedExerciseBpm,
  getLevelFilteredVariants,
  pickNextRecommendedVariant,
  pickNextVariantInSession,
  shouldEnableSpeedBurstForSkill,
} from '../utils/overloadEngine';
import { useMetronome } from '../hooks/useMetronome';
import { useWakeLock } from '../hooks/useWakeLock';
import {
  METRONOME_SOUNDS,
  isIosMicSessionActive,
  playSoftMetronomeTick,
  recoverPlaybackAfterMic,
  unlockSharedAudioContext,
} from '../utils/guitarSynth';
import {
  ARPEGGIO_EXERCISE_ID,
  ARPEGGIO_PROGRESSIONS,
  buildArpeggioWorkoutData,
  pickRecommendedProgression,
} from '../utils/arpeggioEngine';
import { FretboardViewer } from './FretboardViewer';

interface LiveWorkoutPlayerProps {
  plan: ScaledWorkoutPlan;
  sessionLogs?: WorkoutSessionLog[];
  initialVisualOnly: boolean;
  initialMetronomeSound?: MetronomeSoundId;
  onChangeMetronomeSound?: (sound: MetronomeSoundId) => void;
  onCompleteSession: (
    sessionLog: WorkoutSessionLog,
    newRecordings: FeedRecording[],
    updatedBpmByExercise: Record<
      string,
      {
        targetBpm: number;
        bestCleanBpm?: number;
        activeVariantId?: string;
        variantBpms?: Record<string, number>;
      }
    >
  ) => void;
  onCancel: () => void;
}

type PlayerPhase =
  | 'demo'
  | 'precount'
  | 'playing'
  | 'rating'
  | 'rest'
  | 'summary';

interface SessionSetEntry {
  setLog: SetLog;
  exerciseTitle: string;
}

const RATING_TEXT: Record<CleanlinessScore, string> = {
  1: 'Ho sbagliato tutto',
  2: 'Sporca / Ero teso',
  3: 'Giusta ma faticosa',
  4: 'Suonata bene',
  5: 'Perfetta e facile',
};

const SUBDIVISIONS: Subdivision[] = ['1/4', '1/8', '1/8T', '1/16'];
const GAP_MODES: { value: GapClickMode; label: string }[] = [
  { value: 'off', label: 'Battuta muta: No' },
  { value: '1-in-4', label: 'Battuta muta: 1 ogni 4' },
  { value: 'random-25', label: 'Battuta muta: Casuale' },
];

export const LiveWorkoutPlayer: React.FC<LiveWorkoutPlayerProps> = ({
  plan,
  sessionLogs = [],
  initialVisualOnly,
  initialMetronomeSound = 'woodblock',
  onChangeMetronomeSound,
  onCompleteSession,
  onCancel,
}) => {
  const [exerciseIdx, setExerciseIdx] = useState(0);
  const [setNumber, setSetNumber] = useState(1);
  // Full-screen single-focus sequence:
  // demo (2 automatic passes with 2s gap) -> precount (metronome 4-3-2-1) -> playing (set timer)
  const [phase, setPhase] = useState<PlayerPhase>('demo');
  const [demoReplayKey, setDemoReplayKey] = useState(0);
  const [demoContext, setDemoContext] = useState<'intro' | 'recall'>('intro');
  const [demoPass, setDemoPass] = useState<1 | 2>(1);
  const [isDemoBetweenPasses, setIsDemoBetweenPasses] = useState(false);
  const [recallReturnPhase, setRecallReturnPhase] = useState<'precount' | 'rest'>('precount');
  const demoBetweenTimerRef = useRef<number | null>(null);
  const [showMetronomeOptions, setShowMetronomeOptions] = useState(false);
  const [variantSetsInSession, setVariantSetsInSession] = useState(0);
  const [variantCleanNonBurstInSession, setVariantCleanNonBurstInSession] =
    useState(0);
  const [variantBurstFailedInSession, setVariantBurstFailedInSession] =
    useState(false);
  const [, setPendingNewVariantDemo] = useState(false);
  const pendingNewVariantDemoRef = useRef(false);
  const [burstChallengeBanner, setBurstChallengeBanner] = useState<string | null>(
    null
  );

  const clearDemoBetweenTimer = useCallback(() => {
    if (demoBetweenTimerRef.current !== null) {
      window.clearTimeout(demoBetweenTimerRef.current);
      demoBetweenTimerRef.current = null;
    }
    setIsDemoBetweenPasses(false);
  }, []);

  useEffect(() => {
    return () => {
      if (demoBetweenTimerRef.current !== null) {
        window.clearTimeout(demoBetweenTimerRef.current);
      }
    };
  }, []);

  const currentItem = plan.items[exerciseIdx];
  const currentExercise: Exercise | undefined = currentItem?.exercise;

  const [isSpeedBurst, setIsSpeedBurst] = useState<boolean>(() => {
    const firstEx = plan.items[0]?.exercise;
    if (!firstEx) return false;
    return shouldEnableSpeedBurstForSkill(
      firstEx,
      sessionLogs,
      plan.playerLevel
    );
  });

  const [bpmOverrides, setBpmOverrides] = useState<
    Record<
      string,
      {
        targetBpm: number;
        bestCleanBpm?: number;
        activeVariantId?: string;
        variantBpms?: Record<string, number>;
      }
    >
  >({});

  const [variantBpmMap, setVariantBpmMap] = useState<
    Record<string, Record<string, number>>
  >({});

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    () => {
      const first = plan.items[0];
      if (!first) return null;
      return (
        pickNextRecommendedVariant(
          first.exercise,
          sessionLogs,
          first.preferredVariantId,
          plan.playerLevel
        )?.id ?? null
      );
    }
  );

  const activeVariant: ExerciseVariant | undefined = useMemo(() => {
    if (!currentExercise) return undefined;
    const vars = getLevelFilteredVariants(currentExercise, plan.playerLevel);
    if (vars.length === 0) return undefined;
    return vars.find((v) => v.id === selectedVariantId) ?? vars[0];
  }, [currentExercise, selectedVariantId, plan.playerLevel]);

  const [selectedArpeggioProgressionId, setSelectedArpeggioProgressionId] =
    useState<string>(() => pickRecommendedProgression(sessionLogs.length).id);

  const isArpeggioExercise = currentExercise?.id === ARPEGGIO_EXERCISE_ID;
  const arpeggioData = useMemo(() => {
    if (!isArpeggioExercise) return null;
    return buildArpeggioWorkoutData(
      activeVariant?.id,
      selectedArpeggioProgressionId
    );
  }, [isArpeggioExercise, activeVariant?.id, selectedArpeggioProgressionId]);

  const effectiveFretboardNotes =
    arpeggioData?.fretboardNotes ??
    activeVariant?.fretboardNotes ??
    currentExercise?.fretboardNotes ??
    [];
  const effectiveDemoSequence =
    arpeggioData?.demoSequence ??
    activeVariant?.demoSequence ??
    currentExercise?.demoSequence;

  const resolveVariantBpm = useCallback(
    (ex: Exercise, varId: string | undefined, fallbackBpm: number): number => {
      if (varId && variantBpmMap[ex.id]?.[varId]) {
        return variantBpmMap[ex.id][varId];
      }
      return (
        computeWeightedExerciseBpm(ex, sessionLogs, varId, plan.playerLevel)
          .nextSessionBpm || fallbackBpm
      );
    },
    [variantBpmMap, sessionLogs, plan.playerLevel]
  );

  const currentComfortBpm = useMemo(() => {
    if (!currentItem || !currentExercise) return 80;
    return resolveVariantBpm(
      currentExercise,
      activeVariant?.id,
      bpmOverrides[currentExercise.id]?.targetBpm ?? currentItem.targetBpm
    );
  }, [currentItem, currentExercise, activeVariant, resolveVariantBpm, bpmOverrides]);

  const initialFirstBpm = useMemo(() => {
    const first = plan.items[0];
    if (!first) return 68;
    const initVar = pickNextRecommendedVariant(
      first.exercise,
      sessionLogs,
      first.preferredVariantId,
      plan.playerLevel
    );
    const comfort = computeWeightedExerciseBpm(
      first.exercise,
      sessionLogs,
      initVar?.id,
      plan.playerLevel
    ).nextSessionBpm;
    // Set 1 of every workout starts below capacity (-15%) to warm up cleanly
    return calculateWarmupBpm(comfort);
  }, [plan.items, plan.playerLevel, sessionLogs]);

  const [precountBeat, setPrecountBeat] = useState(4);
  const [setRemainingSec, setSetRemainingSec] = useState(
    currentItem?.durationSec ?? 60
  );
  const [isSetPaused, setIsSetPaused] = useState(false);
  const [restRemainingSec, setRestRemainingSec] = useState(
    currentItem?.restSec ?? 15
  );

  const [loggedSets, setLoggedSets] = useState<SetLog[]>([]);
  const [sessionSetEntries, setSessionSetEntries] = useState<SessionSetEntry[]>([]);
  const sessionStartRef = useRef<number>(Date.now());

  const effectiveStepCount = useMemo(() => {
    if (effectiveDemoSequence && effectiveDemoSequence.length > 0) {
      return effectiveDemoSequence.length;
    }
    return Math.max(1, effectiveFretboardNotes.length);
  }, [effectiveDemoSequence, effectiveFretboardNotes]);

  const metronome = useMetronome({
    initialBpm: initialFirstBpm,
    initialSubdivision: currentExercise?.subdivision ?? '1/8',
    initialGapClick: currentExercise?.gapClickMode ?? 'off',
    initialSound: initialMetronomeSound,
    visualOnly: initialVisualOnly,
    speedBurst: isSpeedBurst,
    initialBurstCycleSteps: effectiveStepCount,
  });

  useEffect(() => {
    metronome.setBurstCycleSteps(effectiveStepCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveStepCount]);

  const handleToggleSpeedBurst = () => {
    setIsSpeedBurst((prev) => {
      const next = !prev;
      metronome.setSpeedBurst(next);
      return next;
    });
  };

  // Bulletproof screen anti-sleep lock + ensure pure 'playback' speaker session
  useWakeLock(true);

  useEffect(() => {
    if (isIosMicSessionActive()) {
      recoverPlaybackAfterMic();
    }
    unlockSharedAudioContext().catch(() => {});
  }, []);

  // Lock background page scroll while LiveWorkoutPlayer is active
  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overscrollBehavior = prevBodyOverscroll;
    };
  }, []);

  // Sync metronome, variant & timers when switching to a new exercise
  useEffect(() => {
    if (!currentItem || !currentExercise) return;
    const pickedVar = pickNextRecommendedVariant(
      currentExercise,
      sessionLogs,
      currentItem.preferredVariantId,
      plan.playerLevel
    );
    setSelectedVariantId(pickedVar?.id ?? null);
    const comfortBpm = resolveVariantBpm(
      currentExercise,
      pickedVar?.id,
      currentItem.targetBpm
    );
    // Set 1 always starts in Warm-up (-15%) to loosen hands before entering Goldilocks Zone
    metronome.setBpm(calculateWarmupBpm(comfortBpm));
    metronome.setSubdivision(currentExercise.subdivision);
    metronome.setGapClickMode(currentExercise.gapClickMode);
    const nextBurst = shouldEnableSpeedBurstForSkill(
      currentExercise,
      sessionLogs,
      plan.playerLevel
    );
    setIsSpeedBurst(nextBurst);
    metronome.setSpeedBurst(nextBurst);
    setVariantSetsInSession(0);
    setVariantCleanNonBurstInSession(0);
    setVariantBurstFailedInSession(false);
    pendingNewVariantDemoRef.current = false;
    setPendingNewVariantDemo(false);
    setBurstChallengeBanner(null);
    setSetRemainingSec(currentItem.durationSec);
    setRestRemainingSec(currentItem.restSec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseIdx]);

  const startPreCountNow = useCallback(() => {
    clearDemoBetweenTimer();
    unlockSharedAudioContext().catch(() => {});
    setPrecountBeat(4);
    setPhase('precount');
  }, [clearDemoBetweenTimer]);

  const handleOpenRecallDemo = useCallback(
    (returnTo: 'precount' | 'rest' = 'precount') => {
      clearDemoBetweenTimer();
      metronome.stop();
      setIsSetPaused(false);
      setRecallReturnPhase(returnTo);
      setDemoContext('recall');
      setDemoPass(1);
      setDemoReplayKey((k) => k + 1);
      setPhase('demo');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearDemoBetweenTimer]
  );

  const handleRecallUnderstood = useCallback(() => {
    clearDemoBetweenTimer();
    setDemoContext('intro');
    if (recallReturnPhase === 'rest') {
      setPhase('rest');
    } else {
      startPreCountNow();
    }
  }, [clearDemoBetweenTimer, recallReturnPhase, startPreCountNow]);

  const handleDemoPassComplete = useCallback(() => {
    clearDemoBetweenTimer();
    if (demoContext === 'recall') {
      // In recall mode, gently pause 2s and replay until the user clicks "Ok, ho capito"
      setIsDemoBetweenPasses(true);
      demoBetweenTimerRef.current = window.setTimeout(() => {
        demoBetweenTimerRef.current = null;
        setIsDemoBetweenPasses(false);
        setDemoReplayKey((k) => k + 1);
      }, 2000);
      return;
    }

    if (demoPass === 1) {
      // Pass 1 done (understand) -> wait 2 seconds -> Pass 2 (play slowly along)
      setIsDemoBetweenPasses(true);
      demoBetweenTimerRef.current = window.setTimeout(() => {
        demoBetweenTimerRef.current = null;
        setIsDemoBetweenPasses(false);
        setDemoPass(2);
        setDemoReplayKey((k) => k + 1);
      }, 2000);
    } else {
      // Pass 2 done -> start precount & workout timer
      startPreCountNow();
    }
  }, [clearDemoBetweenTimer, demoContext, demoPass, startPreCountNow]);

  const startPlayingNow = useCallback(() => {
    unlockSharedAudioContext().catch(() => {});
    setPhase('playing');
    setIsSetPaused(false);
    metronome.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-timer with metronome click -> transitions straight into active playing
  useEffect(() => {
    if (phase !== 'precount') return;
    const beatMs = Math.max(340, Math.min(800, Math.round(60000 / metronome.bpm)));
    metronome.playPreCountBeep(false);

    const interval = window.setInterval(() => {
      setPrecountBeat((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          startPlayingNow();
          return 0;
        }
        metronome.playPreCountBeep(false);
        return prev - 1;
      });
    }, beatMs);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const finishActiveSet = () => {
    metronome.stop();
    setPhase('rating');
  };

  // Active set countdown timer
  useEffect(() => {
    if (phase !== 'playing' || isSetPaused) return;
    const timer = window.setInterval(() => {
      setSetRemainingSec((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          finishActiveSet();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isSetPaused]);

  // Rest countdown timer -> automatic demo for new exercise (Set 1), or pre-timer for Set 2+
  useEffect(() => {
    if (phase !== 'rest') return;
    const timer = window.setInterval(() => {
      setRestRemainingSec((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          startNextAfterRest();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const startNextAfterRest = () => {
    clearDemoBetweenTimer();
    setSetRemainingSec(currentItem?.durationSec ?? 60);
    if (setNumber === 1 || pendingNewVariantDemoRef.current) {
      pendingNewVariantDemoRef.current = false;
      setPendingNewVariantDemo(false);
      setDemoContext('intro');
      setDemoPass(1);
      setDemoReplayKey((k) => k + 1);
      setPhase('demo');
    } else {
      setPrecountBeat(4);
      setPhase('precount');
    }
  };

  const skipPreCountNow = () => {
    startPlayingNow();
  };

  const handleRateSet = (score: CleanlinessScore) => {
    if (!currentItem || !currentExercise) return;

    const feedback = calculateGoldilocksNextBpm(
      metronome.bpm,
      currentComfortBpm,
      score,
      setNumber
    );
    const nextBpmForScore = feedback.nextBpm;

    const hasMoreSets = setNumber < currentItem.sets;
    const hasMoreExercises = exerciseIdx < plan.items.length - 1;

    const newSetLog: SetLog = {
      id: `set-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      exerciseId: currentExercise.id,
      variantId: activeVariant?.id,
      variantLabel: activeVariant?.shortLabel,
      setNumber,
      bpm: metronome.bpm,
      durationSec: Math.max(10, currentItem.durationSec - setRemainingSec),
      cleanliness: score,
      nextRecommendedBpm: nextBpmForScore,
      speedBurst: isSpeedBurst,
      timestamp: new Date().toISOString(),
    };

    const nextLoggedSets = [...loggedSets, newSetLog];
    setLoggedSets(nextLoggedSets);
    setSessionSetEntries((prev) => [
      ...prev,
      {
        setLog: newSetLog,
        exerciseTitle: currentExercise.title,
      },
    ]);

    const existingVariantBpms = {
      ...(currentExercise.variantBpms ?? {}),
      ...(variantBpmMap[currentExercise.id] ?? {}),
    };
    const savedVariantBpm =
      setNumber === 1 && score >= 3
        ? Math.max(currentComfortBpm, nextBpmForScore)
        : nextBpmForScore;
    const updatedExVariantBpms = activeVariant
      ? { ...existingVariantBpms, [activeVariant.id]: savedVariantBpm }
      : existingVariantBpms;

    setVariantBpmMap((prev) => ({
      ...prev,
      [currentExercise.id]: updatedExVariantBpms,
    }));

    // Keep the exact same variant for all sets of this exercise within the workout;
    // variant rotation happens automatically across different workouts via pickNextRecommendedVariant.
    const updatedExerciseForCalc: Exercise = {
      ...currentExercise,
      variantBpms: updatedExVariantBpms,
      activeVariantId: activeVariant?.id,
    };

    const syntheticHistory: WorkoutSessionLog[] = [
      ...sessionLogs,
      {
        id: 'sess-in-progress',
        workoutId: plan.workout.id,
        workoutTitle: plan.workout.title,
        date: new Date().toISOString(),
        durationPreset: plan.preset,
        totalMinutes: 1,
        sets: nextLoggedSets,
        averageCleanliness: score,
      },
    ];

    const newWeighted = computeWeightedExerciseBpm(
      updatedExerciseForCalc,
      syntheticHistory,
      activeVariant?.id,
      plan.playerLevel
    );

    const prevBest =
      bpmOverrides[currentExercise.id]?.bestCleanBpm ?? currentExercise.bestCleanBpm;
    const newBest =
      score >= 4 && metronome.bpm > prevBest ? metronome.bpm : prevBest;

    setBpmOverrides((prev) => ({
      ...prev,
      [currentExercise.id]: {
        targetBpm: newWeighted.weightedBpm,
        bestCleanBpm: newBest,
        activeVariantId: activeVariant?.id,
        variantBpms: updatedExVariantBpms,
      },
    }));

    if (hasMoreSets) {
      let nextSetBpm = nextBpmForScore;
      const newVariantSets = variantSetsInSession + 1;
      const newVariantCleanNonBurst =
        variantCleanNonBurstInSession + (!isSpeedBurst && score >= 3 ? 1 : 0);

      const allVariants = getLevelFilteredVariants(
        currentExercise,
        plan.playerLevel
      );
      const defaultVarId = allVariants[0]?.id;
      const histCleanNonBurst = sessionLogs
        .flatMap((s) => s.sets)
        .filter(
          (st) =>
            st.exerciseId === currentExercise.id &&
            (st.variantId ?? defaultVarId) === activeVariant?.id &&
            !st.speedBurst &&
            st.cleanliness >= 3
        ).length;

      const rotateToNextVariant = (bannerText: string) => {
        const nextVar = pickNextVariantInSession(
          currentExercise,
          activeVariant?.id,
          sessionLogs,
          nextLoggedSets,
          plan.playerLevel
        );
        setIsSpeedBurst(false);
        metronome.setSpeedBurst(false);
        if (nextVar && nextVar.id !== activeVariant?.id) {
          setSelectedVariantId(nextVar.id);
          setVariantSetsInSession(0);
          setVariantCleanNonBurstInSession(0);
          setVariantBurstFailedInSession(false);
          pendingNewVariantDemoRef.current = true;
          setPendingNewVariantDemo(true);
          nextSetBpm = resolveVariantBpm(
            currentExercise,
            nextVar.id,
            currentItem.targetBpm
          );
          setBurstChallengeBanner(bannerText);
        } else {
          setVariantSetsInSession(0);
          setVariantCleanNonBurstInSession(0);
          setVariantBurstFailedInSession(false);
          setBurstChallengeBanner(null);
        }
      };

      if (currentExercise.id === 'ex-speed-bursts') {
        if (newVariantSets >= 3) {
          const nextVar = pickNextVariantInSession(
            currentExercise,
            activeVariant?.id,
            sessionLogs,
            nextLoggedSets,
            plan.playerLevel
          );
          if (nextVar && nextVar.id !== activeVariant?.id) {
            setSelectedVariantId(nextVar.id);
            setVariantSetsInSession(0);
            setVariantCleanNonBurstInSession(0);
            setVariantBurstFailedInSession(false);
            pendingNewVariantDemoRef.current = true;
            setPendingNewVariantDemo(true);
            nextSetBpm = resolveVariantBpm(
              currentExercise,
              nextVar.id,
              currentItem.targetBpm
            );
            setBurstChallengeBanner(`Nuova Variante: ${nextVar.shortLabel}`);
          } else {
            setVariantSetsInSession(newVariantSets);
            setVariantCleanNonBurstInSession(newVariantCleanNonBurst);
            setBurstChallengeBanner(null);
          }
        } else {
          setVariantSetsInSession(newVariantSets);
          setVariantCleanNonBurstInSession(newVariantCleanNonBurst);
          setBurstChallengeBanner(null);
        }
      } else if (isSpeedBurst) {
        if (score >= 3) {
          rotateToNextVariant(
            '🔥 Boss Fight superata! Passiamo alla variante successiva'
          );
        } else {
          setIsSpeedBurst(false);
          metronome.setSpeedBurst(false);
          setVariantBurstFailedInSession(true);
          setBurstChallengeBanner('Burst disattivato · Consolidiamo il ritmo');
          if (newVariantSets >= 4) {
            rotateToNextVariant('Nuova Variante sbloccata!');
          } else {
            setVariantSetsInSession(newVariantSets);
            setVariantCleanNonBurstInSession(newVariantCleanNonBurst);
          }
        }
      } else {
        const readyForBossFight =
          currentExercise.gapClickMode !== '1-in-4' &&
          !variantBurstFailedInSession &&
          (newVariantCleanNonBurst >= 2 ||
            (newVariantCleanNonBurst >= 1 && histCleanNonBurst >= 2));

        if (readyForBossFight && newVariantSets < 3) {
          setIsSpeedBurst(true);
          metronome.setSpeedBurst(true);
          nextSetBpm = Math.max(40, Math.round(metronome.bpm * 0.92));
          setVariantSetsInSession(newVariantSets);
          setVariantCleanNonBurstInSession(newVariantCleanNonBurst);
          setBurstChallengeBanner(
            '⚡ SFIDA SPEED BURST (1/8 → 1/16) · BPM calibrati (-8%)'
          );
        } else if (newVariantSets >= 3) {
          const nextVar = pickNextVariantInSession(
            currentExercise,
            activeVariant?.id,
            sessionLogs,
            nextLoggedSets,
            plan.playerLevel
          );
          rotateToNextVariant(
            nextVar && nextVar.id !== activeVariant?.id
              ? `Nuova Variante: ${nextVar.shortLabel}`
              : 'Nuova Variante sbloccata!'
          );
        } else {
          setVariantSetsInSession(newVariantSets);
          setVariantCleanNonBurstInSession(newVariantCleanNonBurst);
          setBurstChallengeBanner(null);
        }
      }

      setSetNumber((s) => s + 1);
      metronome.setBpm(nextSetBpm);
      setRestRemainingSec(currentItem.restSec);
      setPhase('rest');
    } else if (hasMoreExercises) {
      setExerciseIdx((idx) => idx + 1);
      setSetNumber(1);
      setVariantSetsInSession(0);
      setVariantCleanNonBurstInSession(0);
      setVariantBurstFailedInSession(false);
      pendingNewVariantDemoRef.current = false;
      setPendingNewVariantDemo(false);
      setBurstChallengeBanner(null);
      setRestRemainingSec(currentItem.restSec);
      setPhase('rest');
    } else {
      setPhase('summary');
    }
  };

  const handleFinishAndSaveWorkout = () => {
    const finalSets: SetLog[] = sessionSetEntries.map((entry) => entry.setLog);

    const elapsedMin = Math.max(
      1,
      Math.round((Date.now() - sessionStartRef.current) / 60000)
    );
    const avgClean =
      finalSets.length > 0
        ? Number(
            (
              finalSets.reduce((acc, s) => acc + s.cleanliness, 0) /
              finalSets.length
            ).toFixed(1)
          )
        : 4.0;

    const sessionLog: WorkoutSessionLog = {
      id: `sess-${Date.now()}`,
      workoutId: plan.workout.id,
      workoutTitle: plan.workout.title,
      date: new Date().toISOString(),
      durationPreset: plan.preset,
      totalMinutes: elapsedMin,
      sets: finalSets,
      averageCleanliness: avgClean,
    };

    onCompleteSession(sessionLog, [], bpmOverrides);
  };

  const formatMMSS = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const totalSetsInPlan = plan.items.reduce((acc, it) => acc + it.sets, 0);
  const progressPct = Math.min(
    100,
    Math.round((loggedSets.length / Math.max(1, totalSetsInPlan)) * 100)
  );

  if (!currentItem || !currentExercise) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden overscroll-none bg-black text-white">
      {/* Minimal Top Bar */}
      <header className="shrink-0 z-20 border-b border-white/10 bg-black px-4 py-2.5">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => {
                metronome.stop();
                onCancel();
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black border border-white/15 text-white hover:border-white/40 transition"
              aria-label="Chiudi allenamento"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-white/45 tabular-nums truncate leading-tight">
                S{setNumber}/{currentItem.sets}
                {activeVariant ? ` · ${activeVariant.shortLabel}` : ''}
              </div>
              <h2 className="text-sm font-bold text-white truncate leading-tight">
                {currentExercise.title}
              </h2>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {(phase === 'precount' || phase === 'playing') && (
              <button
                type="button"
                onClick={() => {
                  unlockSharedAudioContext().catch(() => {});
                  metronome.setVisualOnly(!metronome.visualOnly);
                }}
                aria-label={
                  metronome.visualOnly
                    ? 'Attiva audio metronomo'
                    : 'Silenzia audio metronomo'
                }
                className={`flex h-8 w-8 items-center justify-center rounded-full border transition ${
                  metronome.visualOnly
                    ? 'border-white/15 bg-black text-white/40 hover:text-white'
                    : 'border-white/20 bg-black text-[#39FF14] hover:border-white/50'
                }`}
              >
                {metronome.visualOnly ? (
                  <VolumeX className="h-3.5 w-3.5" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            {phase === 'playing' && (
              <button
                type="button"
                onClick={() => setShowMetronomeOptions((v) => !v)}
                aria-label="Opzioni Metronomo"
                className={`flex h-8 w-8 items-center justify-center rounded-full border transition ${
                  showMetronomeOptions
                    ? 'border-white bg-white text-black'
                    : 'border-white/15 bg-black text-white/70 hover:text-white'
                }`}
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="mx-auto mt-2 max-w-3xl">
          <div className="h-0.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-[#39FF14] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </header>

      {/* FULL-SCREEN SINGLE-FOCUS STAGE */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {/* 1. AUTOMATIC BPM-SYNCED FRETBOARD DEMO (BEFORE PRE-TIMER & SET TIMER) */}
        {phase === 'demo' && (
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center gap-4 px-4 py-5">
            <div className="text-center space-y-1.5">
              <h3 className="text-lg sm:text-xl font-black text-white">
                {currentExercise.title}
              </h3>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {arpeggioData ? (
                  <>
                    <span className="inline-flex rounded-full border border-[#39FF14]/50 bg-[#39FF14]/12 px-3 py-0.5 text-xs font-black text-[#39FF14] tabular-nums">
                      Formula Gradi: {arpeggioData.pattern.formulaText}
                    </span>
                    <span className="inline-flex rounded-full border border-white/20 bg-black px-2.5 py-0.5 text-[11px] font-bold text-white/80">
                      {arpeggioData.progression.name}
                    </span>
                  </>
                ) : (
                  activeVariant && (
                    <span className="inline-flex rounded-full border border-[#39FF14]/45 bg-[#39FF14]/12 px-3 py-0.5 text-xs font-bold text-[#39FF14]">
                      {activeVariant.name}
                    </span>
                  )
                )}
                <button
                  type="button"
                  onClick={() => {
                    handleToggleSpeedBurst();
                    setDemoReplayKey((k) => k + 1);
                  }}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-black transition ${
                    isSpeedBurst
                      ? 'border-[#39FF14] bg-[#39FF14] text-black'
                      : 'border-white/20 bg-black text-white/60 hover:border-white/45 hover:text-white'
                  }`}
                >
                  ⚡ Burst 1/8→1/16
                </button>
              </div>
            </div>

            {isArpeggioExercise && (
              <div className="flex w-full max-w-2xl flex-wrap items-center justify-center gap-1.5">
                {ARPEGGIO_PROGRESSIONS.map((prog) => {
                  const active = prog.id === selectedArpeggioProgressionId;
                  return (
                    <button
                      key={prog.id}
                      type="button"
                      onClick={() => {
                        setSelectedArpeggioProgressionId(prog.id);
                        setDemoReplayKey((k) => k + 1);
                      }}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${
                        active
                          ? 'border-white bg-white text-black'
                          : 'border-white/15 bg-black text-white/60 hover:border-white/40 hover:text-white'
                      }`}
                    >
                      {prog.shortLabel}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Demo Pass / Recall Guidance Pill */}
            <div className="flex items-center justify-center">
              {demoContext === 'recall' ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-[#39FF14]/45 bg-[#39FF14]/10 px-3.5 py-1 text-xs font-bold text-[#39FF14]">
                  {isDemoBetweenPasses
                    ? 'Riparte tra 2s · Premi "Ok, ho capito" quando sei pronto'
                    : 'Ripasso · Segui lentamente la demo'}
                </span>
              ) : isDemoBetweenPasses ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-[#39FF14]/50 bg-[#39FF14]/12 px-3.5 py-1 text-xs font-bold text-[#39FF14] animate-pulse-fast">
                  Tra 2s si ripete · Preparati a eseguirlo lentamente
                </span>
              ) : demoPass === 1 ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black px-3.5 py-1 text-xs font-bold text-white/85">
                  <span className="text-[#39FF14] font-black tabular-nums">1/2</span>
                  Guarda e capisci l&apos;esercizio
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full border border-[#39FF14]/50 bg-[#39FF14]/12 px-3.5 py-1 text-xs font-bold text-[#39FF14]">
                  <span className="font-black tabular-nums">2/2</span>
                  Ora eseguilo lentamente insieme alla demo
                </span>
              )}
            </div>

            <FretboardViewer
              notes={effectiveFretboardNotes}
              demoSequence={effectiveDemoSequence}
              variant="stage"
              demoMode="slow-intro"
              metronomeSound={metronome.soundId}
              bpm={metronome.bpm}
              speedBurst={isSpeedBurst}
              autoPlayDemo
              replayKey={demoReplayKey}
              onDemoComplete={handleDemoPassComplete}
            />

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => {
                  clearDemoBetweenTimer();
                  if (demoContext === 'intro') setDemoPass(1);
                  setDemoReplayKey((k) => k + 1);
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black px-4 py-2 text-xs font-bold text-white/75 hover:text-white hover:border-white/40 transition"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Rivedi
              </button>
              {demoContext === 'recall' ? (
                <button
                  type="button"
                  onClick={handleRecallUnderstood}
                  className="inline-flex items-center gap-1.5 rounded-full neon-cta px-5 py-2 text-xs font-black transition"
                >
                  <Check className="h-3.5 w-3.5 stroke-[3]" />
                  Ok, ho capito
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startPreCountNow}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-black text-black hover:bg-white/90 transition"
                >
                  <FastForward className="h-3.5 w-3.5" />
                  Salta
                </button>
              )}
            </div>
          </div>
        )}

        {/* 2. FULL-SCREEN PRE-TIMER WITH METRONOME (4-3-2-1) */}
        {phase === 'precount' && (
          <div className="flex min-h-full flex-col items-center justify-center p-6 text-center">
            {burstChallengeBanner && (
              <div
                className={`mb-4 inline-flex items-center rounded-full border px-3.5 py-1 text-xs font-black tracking-wide ${
                  burstChallengeBanner.includes('disattivato')
                    ? 'border-white/25 bg-white/5 text-white/80'
                    : 'border-[#39FF14]/50 bg-[#39FF14]/12 text-[#39FF14]'
                }`}
              >
                {burstChallengeBanner}
              </div>
            )}

            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50 tabular-nums">
              {metronome.bpm} BPM • S{setNumber}/{currentItem.sets}
            </div>

            <div className="my-8 chrome-ring-bezel rounded-full shadow-[0_0_52px_rgba(57,255,20,0.28)]">
              <div className="flex h-44 w-44 items-center justify-center rounded-full border border-[#39FF14]/80 bg-[#050608] text-7xl font-black chrome-text tabular-nums">
                {precountBeat}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => handleOpenRecallDemo('precount')}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black px-4 py-2 text-xs font-bold text-white/80 hover:text-white hover:border-white/45 transition"
              >
                <HelpCircle className="h-3.5 w-3.5 text-[#39FF14]" />
                Non mi ricordo l&apos;esercizio
              </button>
              <button
                type="button"
                onClick={skipPreCountNow}
                className="rounded-full border border-white/15 bg-black px-5 py-2 text-xs font-bold text-white/60 hover:text-white hover:border-white/40 transition"
              >
                Salta
              </button>
            </div>
          </div>
        )}

        {/* 3. FULL-SCREEN FOCUSED ACTIVE PLAYING */}
        {phase === 'playing' && (
          <main className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-between gap-4 px-4 py-5">
            {/* Optional Metronome Drawer (Sound, Subdivision, Gap Click) */}
            {showMetronomeOptions && (
              <div className="space-y-2 rounded-xl bg-black border border-white/15 p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1 rounded-full border border-white/15 p-0.5">
                    {SUBDIVISIONS.map((sub) => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => metronome.setSubdivision(sub)}
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold transition ${
                          metronome.subdivision === sub
                            ? 'bg-white text-black'
                            : 'text-white/50 hover:text-white'
                        }`}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>

                  <select
                    value={metronome.gapClickMode}
                    onChange={(e) =>
                      metronome.setGapClickMode(e.target.value as GapClickMode)
                    }
                    aria-label="Battuta muta"
                    className="rounded-lg bg-black border border-white/15 px-2.5 py-1 text-[11px] font-bold text-white outline-none"
                  >
                    {GAP_MODES.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => metronome.setVisualOnly(!metronome.visualOnly)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                      metronome.visualOnly
                        ? 'bg-white text-black'
                        : 'bg-black border border-white/15 text-white'
                    }`}
                  >
                    {metronome.visualOnly ? (
                      <>
                        <VolumeX className="h-3 w-3" /> Muto
                      </>
                    ) : (
                      <>
                        <Volume2 className="h-3 w-3" /> Click
                      </>
                    )}
                  </button>
                </div>

                {/* Metronome Sound Selector */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                    Suono Metronomo
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {METRONOME_SOUNDS.map((snd) => {
                      const active = metronome.soundId === snd.id;
                      return (
                        <button
                          key={snd.id}
                          type="button"
                          onClick={() => {
                            unlockSharedAudioContext().catch(() => {});
                            metronome.setSoundId(snd.id);
                            onChangeMetronomeSound?.(snd.id);
                            playSoftMetronomeTick(true, snd.id);
                          }}
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition ${
                            active
                              ? 'border-[#39FF14] bg-[#39FF14] text-black'
                              : 'border-white/15 bg-black text-white/65 hover:text-white'
                          }`}
                        >
                          {snd.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Center Minimal Timer + BPM + Beat Dots */}
            <div className="my-auto flex flex-col items-center gap-5">
              {burstChallengeBanner && (
                <div
                  className={`inline-flex items-center rounded-full border px-3.5 py-1 text-[11px] font-black tracking-wide text-center ${
                    burstChallengeBanner.includes('disattivato')
                      ? 'border-white/25 bg-white/5 text-white/80'
                      : 'border-[#39FF14]/50 bg-[#39FF14]/12 text-[#39FF14]'
                  }`}
                >
                  {burstChallengeBanner}
                </div>
              )}

              {/* 4 Minimal Beat Lights */}
              <div className="flex items-center justify-center gap-3">
                {[1, 2, 3, 4].map((beat) => {
                  const isActive =
                    metronome.isPlaying && metronome.currentBeat === beat;
                  const activeStyle = metronome.isGapBar
                    ? 'bg-white/30 scale-110'
                    : beat === 1
                    ? 'bg-[#39FF14] scale-125 shadow-[0_0_16px_rgba(57,255,20,0.7)]'
                    : 'bg-white scale-110 shadow-[0_0_12px_rgba(255,255,255,0.5)]';

                  return (
                    <span
                      key={beat}
                      className={`h-3 w-3 rounded-full transition-all duration-75 ${
                        isActive ? activeStyle : 'bg-white/15'
                      }`}
                    />
                  );
                })}
              </div>

              {metronome.isGapBar && (
                <div className="rounded-full border border-[#39FF14]/50 px-3 py-0.5 text-[11px] font-bold text-[#39FF14] animate-pulse">
                  SILENZIO
                </div>
              )}

              {/* Giant Clean Timer */}
              <div className="text-center">
                <div className="text-6xl sm:text-7xl font-black tracking-tight text-white tabular-nums">
                  {formatMMSS(setRemainingSec)}
                </div>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <span className="text-lg font-black text-[#39FF14] tabular-nums">
                    {metronome.bpm} BPM
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleSpeedBurst}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-black transition ${
                      isSpeedBurst
                        ? 'border-[#39FF14] bg-[#39FF14] text-black'
                        : 'border-white/20 bg-black text-white/55 hover:border-white/45 hover:text-white'
                    }`}
                  >
                    ⚡ Burst 1/8→1/16
                  </button>
                </div>
              </div>

              {/* Continuous Live Animated Fretboard Locked to Web Audio Metronome Clock */}
              <div className="w-full space-y-2">
                {arpeggioData && (
                  <div className="space-y-1.5 text-center">
                    <div className="inline-flex rounded-full border border-[#39FF14]/45 bg-[#39FF14]/12 px-3 py-0.5 text-[11px] font-black text-[#39FF14] tabular-nums">
                      Formula Gradi: {arpeggioData.pattern.formulaText}
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-1">
                      {ARPEGGIO_PROGRESSIONS.map((prog) => {
                        const active = prog.id === selectedArpeggioProgressionId;
                        return (
                          <button
                            key={prog.id}
                            type="button"
                            onClick={() => setSelectedArpeggioProgressionId(prog.id)}
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition ${
                              active
                                ? 'border-white bg-white text-black'
                                : 'border-white/15 bg-black text-white/55 hover:border-white/40 hover:text-white'
                            }`}
                          >
                            {prog.shortLabel}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <FretboardViewer
                  notes={effectiveFretboardNotes}
                  demoSequence={effectiveDemoSequence}
                  variant="compact"
                  demoMode="live-loop"
                  externalStepTick={isSetPaused ? null : metronome.currentSubStep}
                  currentBeat={metronome.currentBeat}
                  subdivisionLabel={metronome.subdivision}
                  muteAudio
                  bpm={metronome.bpm}
                  speedBurst={isSpeedBurst}
                  hideDemoButton
                  forceStopDemo={isSetPaused}
                />
              </div>
            </div>

            {/* Minimal Bottom Actions + Always-Ready Recall Tutorial Button */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => handleOpenRecallDemo('precount')}
                className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-black px-4 py-2 text-xs font-bold text-white/80 hover:text-white hover:border-[#39FF14]/50 transition"
              >
                <HelpCircle className="h-3.5 w-3.5 text-[#39FF14]" />
                Non mi ricordo l&apos;esercizio
              </button>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setIsSetPaused((p) => {
                      const next = !p;
                      if (next) metronome.stop();
                      else metronome.start();
                      return next;
                    });
                  }}
                  className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-black border border-white/20 px-4 py-2.5 text-xs sm:text-sm font-bold text-white hover:border-white/50 transition"
                >
                  {isSetPaused ? (
                    <>
                      <Play className="h-3.5 w-3.5" /> Riprendi
                    </>
                  ) : (
                    <>
                      <Pause className="h-3.5 w-3.5" /> Pausa
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={finishActiveSet}
                  className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-xs sm:text-sm font-black text-black hover:bg-white/90 transition"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                  Ho Finito
                </button>
              </div>
            </div>
          </main>
        )}

        {/* 4. FULL-SCREEN REST */}
        {phase === 'rest' && (
          <div className="flex min-h-full flex-col items-center justify-center p-6 text-center">
            {burstChallengeBanner && (
              <div
                className={`mb-4 inline-flex items-center rounded-full border px-3.5 py-1 text-xs font-black tracking-wide ${
                  burstChallengeBanner.includes('disattivato')
                    ? 'border-white/25 bg-white/5 text-white/80'
                    : 'border-[#39FF14]/50 bg-[#39FF14]/12 text-[#39FF14]'
                }`}
              >
                {burstChallengeBanner}
              </div>
            )}
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">
              Pausa • Prossima {metronome.bpm} BPM
            </div>
            <div className="my-6 text-6xl font-black text-white tabular-nums">
              {formatMMSS(restRemainingSec)}
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setRestRemainingSec((r) => r + 15)}
                className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black px-4 py-2.5 text-xs font-bold text-white hover:border-white/40 transition"
              >
                <Timer className="h-3.5 w-3.5" /> +15s
              </button>
              <button
                type="button"
                onClick={startNextAfterRest}
                className="flex items-center gap-1.5 rounded-full neon-cta px-5 py-2.5 text-xs font-black transition"
              >
                <FastForward className="h-3.5 w-3.5" /> Riprendi
              </button>
            </div>
            <button
              type="button"
              onClick={() => handleOpenRecallDemo('rest')}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black px-4 py-2 text-xs font-bold text-white/75 hover:text-white hover:border-[#39FF14]/50 transition"
            >
              <HelpCircle className="h-3.5 w-3.5 text-[#39FF14]" />
              Non mi ricordo l&apos;esercizio
            </button>
          </div>
        )}

        {/* 5. FULL-SCREEN MINIMAL SUMMARY */}
        {phase === 'summary' && (
          <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-between gap-6 px-4 py-6">
            <div className="space-y-4">
              <div className="flex items-baseline justify-between border-b border-white/15 pb-3">
                <h2 className="text-2xl font-black text-white">Completato</h2>
                <div className="text-xs font-bold text-white/50 tabular-nums">
                  {loggedSets.length} serie ·{' '}
                  {loggedSets.length > 0
                    ? (
                        loggedSets.reduce((a, b) => a + b.cleanliness, 0) /
                        loggedSets.length
                      ).toFixed(1)
                    : '—'}
                  /5
                </div>
              </div>

              <div className="space-y-2">
                {sessionSetEntries.map((entry) => (
                  <div
                    key={entry.setLog.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/15 bg-black px-3.5 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs sm:text-sm font-bold text-white">
                        {entry.exerciseTitle}
                      </div>
                      <div className="text-[11px] font-bold text-white/45 tabular-nums">
                        S{entry.setLog.setNumber} · {entry.setLog.bpm} BPM
                      </div>
                    </div>

                    <span className="shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[11px] font-black text-white tabular-nums">
                      {entry.setLog.cleanliness}/5
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleFinishAndSaveWorkout}
              className="w-full rounded-xl neon-cta px-5 py-3.5 text-sm font-black transition"
            >
              Fine
            </button>
          </div>
        )}
      </div>

      {/* 1-CLICK END-OF-SET RATING MODAL */}
      {phase === 'rating' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/90 backdrop-blur-md p-2 sm:p-4 overscroll-none">
          <div className="w-full max-w-lg rounded-2xl chrome-panel p-4 sm:p-5 shadow-2xl space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-base sm:text-lg font-black text-white">
                Com'è andata?
              </h3>
              <span className="text-[11px] font-bold text-white/45 tabular-nums">
                S{setNumber}/{currentItem.sets} · {metronome.bpm} BPM
              </span>
            </div>

            <div className="space-y-1.5">
              {([5, 4, 3, 2, 1] as CleanlinessScore[]).map((score) => {
                const { delta } = calculateGoldilocksNextBpm(
                  metronome.bpm,
                  currentComfortBpm,
                  score,
                  setNumber
                );
                const deltaText =
                  delta > 0
                    ? `+${delta} BPM`
                    : delta < 0
                    ? `${delta} BPM`
                    : '= BPM';
                const deltaColor =
                  delta > 0
                    ? 'text-[#39FF14]'
                    : delta < 0
                    ? 'text-[#39FF14]'
                    : 'text-white/45';

                return (
                  <button
                    key={score}
                    type="button"
                    onClick={() => handleRateSet(score)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/15 bg-black px-3.5 py-3 text-left hover:border-white/50 hover:bg-white/5 active:scale-[0.99] transition"
                  >
                    <span className="text-xs sm:text-sm font-bold text-white">
                      {score}. {RATING_TEXT[score]}
                    </span>
                    <span
                      className={`shrink-0 text-xs font-black tabular-nums ${deltaColor}`}
                    >
                      {deltaText}
                    </span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                setSetRemainingSec(currentItem.durationSec);
                setPrecountBeat(4);
                setPhase('precount');
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-white/45 hover:text-white transition"
            >
              <RotateCcw className="h-3 w-3" /> Ripeti serie
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
