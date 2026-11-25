import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  FastForward,
  HelpCircle,
  Music,
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
  getExerciseInstrument,
} from '../types/practice';
import {
  PlateauIntervention,
  calculateGoldilocksNextBpm,
  calculateWarmupBpm,
  canTransposeNotes,
  computeAdvancedTransposeOffset,
  computeExerciseStreakContext,
  computeWeightedExerciseBpm,
  detectPlateauIntervention,
  getLevelFilteredVariants,
  isVariantMastered,
  pickEasierVariantInSession,
  pickNextRecommendedVariant,
  pickNextVariantInSession,
  shouldEnableSpeedBurstForSkill,
  transposeVariantData,
} from '../utils/overloadEngine';
import { useMetronome } from '../hooks/useMetronome';
import { useWakeLock } from '../hooks/useWakeLock';
import {
  METRONOME_SOUNDS,
  isIosMicSessionActive,
  playSoftMetronomeTick,
  recoverPlaybackAfterMic,
  resolveChordDroneParams,
  startBackingDrone,
  stopBackingDrone,
  unlockSharedAudioContext,
  updateBackingDrone,
} from '../utils/guitarSynth';
import {
  ARPEGGIO_EXERCISE_ID,
  ARPEGGIO_PROGRESSIONS,
  buildArpeggioWorkoutData,
  pickRecommendedProgression,
} from '../utils/arpeggioEngine';
import {
  BASS_ARPEGGIO_EXERCISE_ID,
  BASS_ARPEGGIO_PROGRESSIONS,
  buildBassArpeggioWorkoutData,
  pickRecommendedBassProgression,
} from '../utils/bassArpeggioEngine';
import { FretboardViewer } from './FretboardViewer';
import { ExerciseFamilyBriefingModal } from './ExerciseFamilyBriefingModal';
import {
  FamilyBriefingSrsStatus,
  getExerciseFamilyBriefing,
  getFamilyBriefingSrsStatus,
  markFamilyBriefingSeen,
} from '../utils/spacedRepetitionCoach';

type SessionBpmUpdateMap = Record<
  string,
  {
    targetBpm: number;
    bestCleanBpm?: number;
    activeVariantId?: string;
    variantBpms?: Record<string, number>;
  }
>;

interface LiveWorkoutPlayerProps {
  plan: ScaledWorkoutPlan;
  sessionLogs?: WorkoutSessionLog[];
  initialVisualOnly: boolean;
  initialMetronomeSound?: MetronomeSoundId;
  initialDroneEnabled?: boolean;
  onChangeMetronomeSound?: (sound: MetronomeSoundId) => void;
  onChangeDroneEnabled?: (enabled: boolean) => void;
  onSaveProgress?: (
    sessionLog: WorkoutSessionLog,
    updatedBpmByExercise: SessionBpmUpdateMap
  ) => void;
  onCompleteSession: (
    sessionLog: WorkoutSessionLog,
    newRecordings: FeedRecording[],
    updatedBpmByExercise: SessionBpmUpdateMap
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

const SUBDIVISIONS: Subdivision[] = ['1/4', '1/8', '1/8T', '1/16', '1/16T'];
const GAP_MODES: { value: GapClickMode; label: string }[] = [
  { value: 'off', label: 'Battuta muta: No' },
  { value: '1-in-4', label: 'Battuta muta: 1 ogni 4' },
  { value: 'random-25', label: 'Battuta muta: Casuale' },
];

function extractDroneChordToken(technique?: string): string | undefined {
  if (!technique) return undefined;
  const match = technique.match(
    /(?:Power|Barrè|Strum(?:\s+Giù|\s+Su)?\s*·|Accento|Ottava|\b[ivIV°]+\s*\()\s*([A-G](?:b|#)?(?:m7|maj7|m|dim|°|sus\d?|5|7)?)/i
  );
  return match?.[1];
}

export const LiveWorkoutPlayer: React.FC<LiveWorkoutPlayerProps> = ({
  plan,
  sessionLogs = [],
  initialVisualOnly,
  initialMetronomeSound = 'woodblock',
  initialDroneEnabled = false,
  onChangeMetronomeSound,
  onChangeDroneEnabled,
  onSaveProgress,
  onCompleteSession,
  onCancel,
}) => {
  const sessionIdRef = useRef<string>(`sess-${Date.now()}`);
  const sessionDateRef = useRef<string>(new Date().toISOString());
  const sessionStartRef = useRef<number>(Date.now());

  const priorSessionLogs = useMemo(
    () => sessionLogs.filter((s) => s.id !== sessionIdRef.current),
    [sessionLogs]
  );
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
  const [droneEnabled, setDroneEnabled] = useState<boolean>(initialDroneEnabled);
  const [transposeSemitones, setTransposeSemitones] = useState<number>(0);
  const [, setPlateauAction] = useState<PlateauIntervention>({
    type: 'none',
    pillLabel: '',
    bpmDeltaFactor: 1,
  });
  const lastDroneChordRef = useRef<string>('Am');
  const [showFamilyBriefing, setShowFamilyBriefing] = useState<boolean>(() => {
    const firstEx = plan.items[0]?.exercise;
    return firstEx ? getFamilyBriefingSrsStatus(firstEx.id).isDue : false;
  });
  const [familyBriefingManualMode, setFamilyBriefingManualMode] =
    useState(false);
  const [currentSrsStatus, setCurrentSrsStatus] =
    useState<FamilyBriefingSrsStatus>(() => {
      const firstEx = plan.items[0]?.exercise;
      return firstEx
        ? getFamilyBriefingSrsStatus(firstEx.id)
        : {
            isDue: false,
            isFirstTime: false,
            exposures: 0,
            nextIntervalDays: 1,
            record: null,
          };
    });
  const checkedSrsExerciseIdxRef = useRef<number>(0);
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
  const activeInstrument =
    plan.instrument ?? getExerciseInstrument(currentExercise);

  const initialFirstVariant = useMemo(() => {
    const first = plan.items[0];
    if (!first) return undefined;
    return pickNextRecommendedVariant(
      first.exercise,
      priorSessionLogs,
      first.preferredVariantId,
      plan.playerLevel
    );
  }, [plan.items, priorSessionLogs, plan.playerLevel]);

  const [isSpeedBurst, setIsSpeedBurst] = useState<boolean>(() => {
    const firstEx = plan.items[0]?.exercise;
    if (!firstEx) return false;
    return shouldEnableSpeedBurstForSkill(
      firstEx,
      priorSessionLogs,
      plan.playerLevel,
      initialFirstVariant
    );
  });

  const [bpmOverrides, setBpmOverrides] = useState<SessionBpmUpdateMap>({});

  const [variantBpmMap, setVariantBpmMap] = useState<
    Record<string, Record<string, number>>
  >({});

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    () => initialFirstVariant?.id ?? null
  );

  const [loggedSets, setLoggedSets] = useState<SetLog[]>([]);

  const combinedHistoryLogs = useMemo<WorkoutSessionLog[]>(() => {
    if (loggedSets.length === 0) return priorSessionLogs;
    return [
      ...priorSessionLogs,
      {
        id: 'sess-in-progress',
        instrument: activeInstrument,
        workoutId: plan.workout.id,
        workoutTitle: plan.workout.title,
        date: sessionDateRef.current,
        durationPreset: plan.preset,
        totalMinutes: 1,
        sets: loggedSets,
        averageCleanliness: 4,
      },
    ];
  }, [
    priorSessionLogs,
    loggedSets,
    activeInstrument,
    plan.workout.id,
    plan.workout.title,
    plan.preset,
  ]);

  const activeVariant: ExerciseVariant | undefined = useMemo(() => {
    if (!currentExercise) return undefined;
    const vars = getLevelFilteredVariants(
      currentExercise,
      plan.playerLevel,
      combinedHistoryLogs
    );
    if (vars.length === 0) return undefined;
    return vars.find((v) => v.id === selectedVariantId) ?? vars[0];
  }, [currentExercise, selectedVariantId, plan.playerLevel, combinedHistoryLogs]);

  const [selectedArpeggioProgressionId, setSelectedArpeggioProgressionId] =
    useState<string>(() =>
      (plan.instrument ?? getExerciseInstrument(plan.items[0]?.exercise)) ===
      'bass'
        ? pickRecommendedBassProgression(
            priorSessionLogs.length,
            priorSessionLogs
          ).id
        : pickRecommendedProgression(
            priorSessionLogs.length,
            priorSessionLogs
          ).id
    );

  const isGuitarArpeggioExercise = currentExercise?.id === ARPEGGIO_EXERCISE_ID;
  const isBassArpeggioExercise =
    currentExercise?.id === BASS_ARPEGGIO_EXERCISE_ID;
  const isArpeggioExercise = isGuitarArpeggioExercise || isBassArpeggioExercise;
  const activeArpeggioProgressions = isBassArpeggioExercise
    ? BASS_ARPEGGIO_PROGRESSIONS
    : ARPEGGIO_PROGRESSIONS;
  const arpeggioData = useMemo(() => {
    if (isGuitarArpeggioExercise) {
      return buildArpeggioWorkoutData(
        activeVariant?.id,
        selectedArpeggioProgressionId
      );
    }
    if (isBassArpeggioExercise) {
      return buildBassArpeggioWorkoutData(
        activeVariant?.id,
        selectedArpeggioProgressionId
      );
    }
    return null;
  }, [
    isGuitarArpeggioExercise,
    isBassArpeggioExercise,
    activeVariant?.id,
    selectedArpeggioProgressionId,
  ]);

  const isMusicalExercise = Boolean(
    currentExercise && currentExercise.category !== 'fretboard'
  );

  const rawFretboardNotes =
    arpeggioData?.fretboardNotes ??
    activeVariant?.fretboardNotes ??
    currentExercise?.fretboardNotes ??
    [];
  const rawDemoSequence =
    arpeggioData?.demoSequence ??
    activeVariant?.demoSequence ??
    currentExercise?.demoSequence;

  const transposedDisplay = useMemo(() => {
    if (!transposeSemitones || isArpeggioExercise) {
      return {
        fretboardNotes: rawFretboardNotes,
        demoSequence: rawDemoSequence,
      };
    }
    return transposeVariantData(
      rawFretboardNotes,
      rawDemoSequence,
      transposeSemitones
    );
  }, [rawFretboardNotes, rawDemoSequence, transposeSemitones, isArpeggioExercise]);

  const effectiveFretboardNotes = transposedDisplay.fretboardNotes;
  const effectiveDemoSequence = transposedDisplay.demoSequence;

  const familyBriefing = useMemo(() => {
    if (!currentExercise) return null;
    return getExerciseFamilyBriefing(currentExercise, activeVariant);
  }, [currentExercise, activeVariant]);

  const resolveVariantBpm = useCallback(
    (ex: Exercise, varId: string | undefined, fallbackBpm: number): number => {
      if (varId && variantBpmMap[ex.id]?.[varId]) {
        return variantBpmMap[ex.id][varId];
      }
      return (
        computeWeightedExerciseBpm(
          ex,
          priorSessionLogs,
          varId,
          plan.playerLevel
        ).nextSessionBpm || fallbackBpm
      );
    },
    [variantBpmMap, priorSessionLogs, plan.playerLevel]
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
      priorSessionLogs,
      first.preferredVariantId,
      plan.playerLevel
    );
    const comfort = computeWeightedExerciseBpm(
      first.exercise,
      priorSessionLogs,
      initVar?.id,
      plan.playerLevel
    ).nextSessionBpm;
    // Set 1 of every workout starts below capacity (-15%) to warm up cleanly
    return calculateWarmupBpm(comfort);
  }, [plan.items, plan.playerLevel, priorSessionLogs]);

  const [setRemainingSec, setSetRemainingSec] = useState(
    currentItem?.durationSec ?? 60
  );
  const [isSetPaused, setIsSetPaused] = useState(false);
  const [restRemainingSec, setRestRemainingSec] = useState(
    currentItem?.restSec ?? 15
  );

  const [sessionSetEntries, setSessionSetEntries] = useState<SessionSetEntry[]>([]);
  const pendingSetIdRef = useRef<string | null>(null);
  const pendingDurationSecRef = useRef<number | null>(null);
  const provisionalSetRef = useRef<SetLog | null>(null);
  const provisionalOverridesRef = useRef<SessionBpmUpdateMap | null>(null);
  const hasTriggeredFinishForSetRef = useRef<boolean>(false);

  const isWarmupSet = exerciseIdx === 0 && setNumber === 1;
  const streakCtx = useMemo(() => {
    if (!currentExercise) {
      return {
        streak5Count: 0,
        streak4PlusCount: 0,
        consecutiveFail1Count: 0,
        hasHitCeilingInSession: false,
      };
    }
    return computeExerciseStreakContext(
      currentExercise.id,
      priorSessionLogs,
      loggedSets
    );
  }, [currentExercise, priorSessionLogs, loggedSets]);

  const effectiveStepCount = useMemo(() => {
    if (effectiveDemoSequence && effectiveDemoSequence.length > 0) {
      return effectiveDemoSequence.length;
    }
    return Math.max(1, effectiveFretboardNotes.length);
  }, [effectiveDemoSequence, effectiveFretboardNotes]);

  const metronome = useMetronome({
    initialBpm: initialFirstBpm,
    initialSubdivision:
      initialFirstVariant?.overrideSubdivision ??
      currentExercise?.subdivision ??
      '1/8',
    initialGapClick:
      initialFirstVariant?.overrideGapClick ??
      currentExercise?.gapClickMode ??
      'off',
    initialSound: initialMetronomeSound,
    initialBackbeatMode: initialFirstVariant?.clickBackbeat ?? false,
    visualOnly: initialVisualOnly,
    speedBurst: isSpeedBurst,
    initialBurstCycleSteps: effectiveStepCount,
  });

  useEffect(() => {
    metronome.setBurstCycleSteps(effectiveStepCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveStepCount]);

  // Bulletproof screen anti-sleep lock + ensure pure 'playback' speaker session
  useWakeLock(true);

  useEffect(() => {
    if (isIosMicSessionActive()) {
      recoverPlaybackAfterMic();
    }
    unlockSharedAudioContext().catch(() => {});
    return () => {
      stopBackingDrone();
    };
  }, []);

  // Active drone chord resolution & lifecycle
  const activeStepTechnique = useMemo(() => {
    if (!effectiveDemoSequence || effectiveDemoSequence.length === 0) {
      return undefined;
    }
    const idx = metronome.currentSubStep % effectiveDemoSequence.length;
    return effectiveDemoSequence[idx]?.technique;
  }, [effectiveDemoSequence, metronome.currentSubStep]);

  const activeDroneChord = useMemo(() => {
    const token = extractDroneChordToken(activeStepTechnique);
    if (token) {
      lastDroneChordRef.current = token;
      return token;
    }
    if (metronome.currentSubStep === 0) {
      lastDroneChordRef.current = 'Am';
    }
    return lastDroneChordRef.current;
  }, [activeStepTechnique, metronome.currentSubStep]);

  useEffect(() => {
    const shouldPlayDrone =
      phase === 'playing' &&
      !isSetPaused &&
      droneEnabled &&
      isMusicalExercise &&
      !metronome.visualOnly;

    if (!shouldPlayDrone) {
      stopBackingDrone();
      return;
    }

    const params = resolveChordDroneParams(
      lastDroneChordRef.current,
      isArpeggioExercise ? 0 : transposeSemitones
    );
    startBackingDrone(params.rootHz, params.quality);
    return () => {
      stopBackingDrone();
    };
  }, [phase, isSetPaused, droneEnabled, isMusicalExercise, metronome.visualOnly, isArpeggioExercise, transposeSemitones]);

  useEffect(() => {
    if (
      phase !== 'playing' ||
      isSetPaused ||
      !droneEnabled ||
      !isMusicalExercise ||
      metronome.visualOnly
    ) {
      return;
    }
    const params = resolveChordDroneParams(
      activeDroneChord,
      isArpeggioExercise ? 0 : transposeSemitones
    );
    updateBackingDrone(params.rootHz, params.quality);
  }, [
    activeDroneChord,
    transposeSemitones,
    isArpeggioExercise,
    phase,
    isSetPaused,
    droneEnabled,
    isMusicalExercise,
    metronome.visualOnly,
  ]);

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

  // Sync metronome, variant, transposition & plateau breaker when switching to a new exercise
  useEffect(() => {
    if (!currentItem || !currentExercise) return;
    lastDroneChordRef.current = 'Am';
    const pickedVar = pickNextRecommendedVariant(
      currentExercise,
      combinedHistoryLogs,
      currentItem.preferredVariantId,
      plan.playerLevel
    );
    setSelectedVariantId(pickedVar?.id ?? null);
    const comfortBpm = resolveVariantBpm(
      currentExercise,
      pickedVar?.id,
      currentItem.targetBpm
    );

    const isArpEx =
      currentExercise.id === ARPEGGIO_EXERCISE_ID ||
      currentExercise.id === BASS_ARPEGGIO_EXERCISE_ID;
    const canTranspose =
      !isArpEx &&
      canTransposeNotes(
        pickedVar?.fretboardNotes ?? currentExercise.fretboardNotes,
        pickedVar?.demoSequence ?? currentExercise.demoSequence
      );
    const intervention = detectPlateauIntervention(
      currentExercise.id,
      pickedVar?.id,
      combinedHistoryLogs,
      canTranspose
    );
    setPlateauAction(intervention);

    const nextTranspose =
      plan.playerLevel === 'advanced' || intervention.forceTranspose
        ? computeAdvancedTransposeOffset(
            currentExercise,
            pickedVar,
            combinedHistoryLogs,
            plan.playerLevel,
            Boolean(intervention.forceTranspose)
          )
        : 0;
    setTransposeSemitones(nextTranspose);

    const effectiveSub = pickedVar?.overrideSubdivision ?? currentExercise.subdivision;
    metronome.setSubdivision(effectiveSub);
    metronome.setGapClickMode(
      pickedVar?.overrideGapClick ?? currentExercise.gapClickMode
    );
    metronome.setBackbeatMode(
      Boolean(pickedVar?.clickBackbeat || intervention.forceBackbeat)
    );

    const canBurstSub =
      effectiveSub !== '1/8T' &&
      effectiveSub !== '1/16' &&
      effectiveSub !== '1/16T';
    const nextBurst =
      intervention.forceSpeedBurst && canBurstSub
        ? true
        : shouldEnableSpeedBurstForSkill(
            currentExercise,
            combinedHistoryLogs,
            plan.playerLevel,
            pickedVar
          );
    setIsSpeedBurst(nextBurst);
    metronome.setSpeedBurst(nextBurst);

    // Warmup (-15%) applies ONLY to Exercise 1, Set 1; subsequent exercises start at full comfort BPM
    const baseBpm =
      exerciseIdx === 0 ? calculateWarmupBpm(comfortBpm) : comfortBpm;
    const adjustedBpm =
      intervention.type !== 'none'
        ? Math.max(40, Math.round(baseBpm * intervention.bpmDeltaFactor))
        : baseBpm;
    metronome.setBpm(adjustedBpm);

    setVariantSetsInSession(0);
    setVariantCleanNonBurstInSession(0);
    setVariantBurstFailedInSession(false);
    pendingNewVariantDemoRef.current = false;
    setPendingNewVariantDemo(false);
    setBurstChallengeBanner(
      intervention.type !== 'none' ? intervention.pillLabel : null
    );
    setSetRemainingSec(currentItem.durationSec);
    setRestRemainingSec(currentItem.restSec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseIdx]);

  useEffect(() => {
    if (!currentExercise) return;
    if (
      phase === 'demo' &&
      demoContext === 'intro' &&
      checkedSrsExerciseIdxRef.current !== exerciseIdx
    ) {
      checkedSrsExerciseIdxRef.current = exerciseIdx;
      const srs = getFamilyBriefingSrsStatus(currentExercise.id);
      setCurrentSrsStatus(srs);
      if (srs.isDue) {
        clearDemoBetweenTimer();
        setFamilyBriefingManualMode(false);
        setShowFamilyBriefing(true);
      }
    }
  }, [phase, demoContext, exerciseIdx, currentExercise, clearDemoBetweenTimer]);

  const handleConfirmFamilyBriefing = useCallback(() => {
    if (currentExercise && !familyBriefingManualMode) {
      markFamilyBriefingSeen(currentExercise.id);
      setCurrentSrsStatus(getFamilyBriefingSrsStatus(currentExercise.id));
    }
    setShowFamilyBriefing(false);
    const wasManual = familyBriefingManualMode;
    setFamilyBriefingManualMode(false);
    if (!wasManual || phase === 'demo') {
      clearDemoBetweenTimer();
      setDemoPass(1);
      setDemoReplayKey((k) => k + 1);
    }
  }, [
    currentExercise,
    familyBriefingManualMode,
    phase,
    clearDemoBetweenTimer,
  ]);

  const handleOpenManualFamilyBriefing = useCallback(() => {
    if (!currentExercise) return;
    clearDemoBetweenTimer();
    if (phase === 'playing') {
      setIsSetPaused(true);
      metronome.stop();
    } else if (phase === 'precount') {
      metronome.stop();
    }
    setCurrentSrsStatus(getFamilyBriefingSrsStatus(currentExercise.id));
    setFamilyBriefingManualMode(true);
    setShowFamilyBriefing(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentExercise, phase, clearDemoBetweenTimer]);

  const startPreCountNow = useCallback(() => {
    clearDemoBetweenTimer();
    unlockSharedAudioContext().catch(() => {});
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
    hasTriggeredFinishForSetRef.current = false;
    setPhase('playing');
    setIsSetPaused(false);
    metronome.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-timer locked 1:1 to the Web Audio metronome clock at the exact exercise BPM & subdivision,
  // transitioning seamlessly into Bar 1 Beat 1 of active playing with zero drift or gap.
  useEffect(() => {
    if (phase !== 'precount' || showFamilyBriefing) return;
    unlockSharedAudioContext().catch(() => {});
    metronome.start({
      countInBeats: 4,
      onCountInComplete: () => {
        hasTriggeredFinishForSetRef.current = false;
        setIsSetPaused(false);
        setPhase('playing');
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, showFamilyBriefing]);

  const buildSessionLogSnapshot = useCallback(
    (sets: SetLog[]): WorkoutSessionLog => {
      const elapsedMin = Math.max(
        1,
        Math.round((Date.now() - sessionStartRef.current) / 60000)
      );
      const avgClean =
        sets.length > 0
          ? Number(
              (
                sets.reduce((acc, s) => acc + s.cleanliness, 0) / sets.length
              ).toFixed(1)
            )
          : 4.0;

      return {
        id: sessionIdRef.current,
        instrument: activeInstrument,
        workoutId: plan.workout.id,
        workoutTitle: plan.workout.title,
        date: sessionDateRef.current,
        durationPreset: plan.preset,
        totalMinutes: elapsedMin,
        sets,
        averageCleanliness: avgClean,
      };
    },
    [activeInstrument, plan.preset, plan.workout.id, plan.workout.title]
  );

  const computeSetOutcome = useCallback(
    (
      score: CleanlinessScore,
      setId: string,
      durationSecOverride?: number
    ) => {
      if (!currentItem || !currentExercise) return null;

      const feedback = calculateGoldilocksNextBpm(
        metronome.bpm,
        currentComfortBpm,
        score,
        setNumber,
        {
          streak5Count: streakCtx.streak5Count,
          streak4PlusCount: streakCtx.streak4PlusCount,
          isWarmupSet,
          isSpeedBurstSet: isSpeedBurst,
          hasHitCeilingInSession: streakCtx.hasHitCeilingInSession,
        }
      );
      const nextBpmForScore = feedback.nextBpm;

      const newSetLog: SetLog = {
        id: setId,
        exerciseId: currentExercise.id,
        variantId: activeVariant?.id,
        variantLabel: activeVariant?.shortLabel,
        setNumber,
        bpm: metronome.bpm,
        subdivision: metronome.subdivision,
        durationSec:
          durationSecOverride ??
          Math.max(10, currentItem.durationSec - setRemainingSec),
        cleanliness: score,
        nextRecommendedBpm: nextBpmForScore,
        speedBurst: isSpeedBurst,
        timestamp: new Date().toISOString(),
      };

      const nextLoggedSets = [...loggedSets, newSetLog];

      const existingVariantBpms = {
        ...(currentExercise.variantBpms ?? {}),
        ...(variantBpmMap[currentExercise.id] ?? {}),
      };
      const savedVariantBpm =
        (isWarmupSet || isSpeedBurst) && score >= 3
          ? Math.max(currentComfortBpm, nextBpmForScore)
          : nextBpmForScore;
      const updatedExVariantBpms = activeVariant
        ? { ...existingVariantBpms, [activeVariant.id]: savedVariantBpm }
        : existingVariantBpms;

      // Keep the exact same variant for all sets of this exercise within the workout;
      // variant rotation happens automatically across different workouts via pickNextRecommendedVariant.
      const updatedExerciseForCalc: Exercise = {
        ...currentExercise,
        variantBpms: updatedExVariantBpms,
        activeVariantId: activeVariant?.id,
      };

      const syntheticHistory: WorkoutSessionLog[] = [
        ...priorSessionLogs,
        {
          id: 'sess-in-progress',
          workoutId: plan.workout.id,
          workoutTitle: plan.workout.title,
          date: sessionDateRef.current,
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
        bpmOverrides[currentExercise.id]?.bestCleanBpm ??
        currentExercise.bestCleanBpm;
      const newBest =
        score >= 4 && metronome.bpm > prevBest ? metronome.bpm : prevBest;

      const nextBpmOverrides: SessionBpmUpdateMap = {
        ...bpmOverrides,
        [currentExercise.id]: {
          targetBpm: newWeighted.weightedBpm,
          bestCleanBpm: newBest,
          activeVariantId: activeVariant?.id,
          variantBpms: updatedExVariantBpms,
        },
      };

      return {
        newSetLog,
        nextLoggedSets,
        updatedExVariantBpms,
        nextBpmOverrides,
        nextBpmForScore,
      };
    },
    [
      activeVariant,
      bpmOverrides,
      currentComfortBpm,
      currentExercise,
      currentItem,
      isSpeedBurst,
      isWarmupSet,
      loggedSets,
      metronome.bpm,
      plan.playerLevel,
      plan.preset,
      plan.workout.id,
      plan.workout.title,
      priorSessionLogs,
      setNumber,
      setRemainingSec,
      streakCtx,
      variantBpmMap,
    ]
  );

  const finishActiveSet = useCallback(
    (durationSecOverride?: number) => {
      if (hasTriggeredFinishForSetRef.current) return;
      hasTriggeredFinishForSetRef.current = true;
      metronome.stop();
      if (currentItem && currentExercise) {
        const setId = `set-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
        const elapsedSec =
          durationSecOverride ??
          Math.max(10, currentItem.durationSec - setRemainingSec);
        pendingSetIdRef.current = setId;
        pendingDurationSecRef.current = elapsedSec;
        const provisional = computeSetOutcome(4, setId, elapsedSec);
        if (provisional) {
          provisionalSetRef.current = provisional.newSetLog;
          provisionalOverridesRef.current = provisional.nextBpmOverrides;
          onSaveProgress?.(
            buildSessionLogSnapshot(provisional.nextLoggedSets),
            provisional.nextBpmOverrides
          );
        }
      }
      setPhase('rating');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      buildSessionLogSnapshot,
      computeSetOutcome,
      currentExercise,
      currentItem,
      onSaveProgress,
      setRemainingSec,
    ]
  );

  // Active set countdown timer
  useEffect(() => {
    if (phase !== 'playing' || isSetPaused) return;
    const timer = window.setInterval(() => {
      setSetRemainingSec((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase, isSetPaused]);

  useEffect(() => {
    if (phase === 'playing' && setRemainingSec === 0) {
      finishActiveSet(currentItem?.durationSec ?? 60);
    }
  }, [phase, setRemainingSec, finishActiveSet, currentItem?.durationSec]);

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
    hasTriggeredFinishForSetRef.current = false;
    setSetRemainingSec(currentItem?.durationSec ?? 60);
    if (setNumber === 1 || pendingNewVariantDemoRef.current) {
      pendingNewVariantDemoRef.current = false;
      setPendingNewVariantDemo(false);
      setDemoContext('intro');
      setDemoPass(1);
      setDemoReplayKey((k) => k + 1);
      setPhase('demo');
    } else {
      setPhase('precount');
    }
  };

  const skipPreCountNow = () => {
    startPlayingNow();
  };

  const handleRateSet = (score: CleanlinessScore) => {
    if (!currentItem || !currentExercise) return;

    const setId =
      pendingSetIdRef.current ??
      `set-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const elapsedSec =
      pendingDurationSecRef.current ??
      Math.max(10, currentItem.durationSec - setRemainingSec);

    pendingSetIdRef.current = null;
    pendingDurationSecRef.current = null;
    provisionalSetRef.current = null;
    provisionalOverridesRef.current = null;

    const outcome = computeSetOutcome(score, setId, elapsedSec);
    if (!outcome) return;

    const {
      newSetLog,
      nextLoggedSets,
      updatedExVariantBpms,
      nextBpmOverrides,
      nextBpmForScore,
    } = outcome;

    const hasMoreSets = setNumber < currentItem.sets;
    const hasMoreExercises = exerciseIdx < plan.items.length - 1;

    setLoggedSets(nextLoggedSets);
    setSessionSetEntries((prev) => [
      ...prev,
      {
        setLog: newSetLog,
        exerciseTitle: currentExercise.title,
      },
    ]);
    setVariantBpmMap((prev) => ({
      ...prev,
      [currentExercise.id]: updatedExVariantBpms,
    }));
    setBpmOverrides(nextBpmOverrides);

    // Save immediately after every rated set so progress and BPM gains are never lost
    onSaveProgress?.(
      buildSessionLogSnapshot(nextLoggedSets),
      nextBpmOverrides
    );

    if (hasMoreSets) {
      let nextSetBpm = nextBpmForScore;
      const newVariantSets = variantSetsInSession + 1;
      const newVariantCleanNonBurst =
        variantCleanNonBurstInSession + (!isSpeedBurst && score >= 3 ? 1 : 0);

      const syntheticAfterSetHistory: WorkoutSessionLog[] = [
        ...priorSessionLogs,
        buildSessionLogSnapshot(nextLoggedSets),
      ];
      const updatedStreakCtx = computeExerciseStreakContext(
        currentExercise.id,
        priorSessionLogs,
        nextLoggedSets
      );

      const allVariants = getLevelFilteredVariants(
        currentExercise,
        plan.playerLevel,
        syntheticAfterSetHistory
      );
      const defaultVarId = allVariants[0]?.id;
      const setsForActiveVariant = [
        ...priorSessionLogs.flatMap((s) => s.sets),
        ...nextLoggedSets,
      ].filter(
        (st) =>
          st.exerciseId === currentExercise.id &&
          (st.variantId ?? defaultVarId) === activeVariant?.id
      );
      const activeVariantMastered = activeVariant
        ? isVariantMastered(activeVariant, setsForActiveVariant)
        : false;

      const switchVariantInSession = (
        targetVar: ExerciseVariant,
        bannerText: string,
        overrideBpm?: number
      ) => {
        setSelectedVariantId(targetVar.id);
        setVariantSetsInSession(0);
        setVariantCleanNonBurstInSession(0);
        setVariantBurstFailedInSession(false);
        pendingNewVariantDemoRef.current = true;
        setPendingNewVariantDemo(true);
        const nextSub =
          targetVar.overrideSubdivision ?? currentExercise.subdivision;
        metronome.setSubdivision(nextSub);
        metronome.setBackbeatMode(Boolean(targetVar.clickBackbeat));
        metronome.setGapClickMode(
          targetVar.overrideGapClick ?? currentExercise.gapClickMode
        );
        const nextBurst = shouldEnableSpeedBurstForSkill(
          currentExercise,
          syntheticAfterSetHistory,
          plan.playerLevel,
          targetVar
        );
        setIsSpeedBurst(nextBurst);
        metronome.setSpeedBurst(nextBurst);
        setPlateauAction({ type: 'none', pillLabel: '', bpmDeltaFactor: 1 });
        setTransposeSemitones(
          plan.playerLevel === 'advanced' && !isArpeggioExercise
            ? computeAdvancedTransposeOffset(
                currentExercise,
                targetVar,
                syntheticAfterSetHistory,
                plan.playerLevel,
                false
              )
            : 0
        );
        nextSetBpm =
          overrideBpm ??
          computeWeightedExerciseBpm(
            {
              ...currentExercise,
              variantBpms: updatedExVariantBpms,
              activeVariantId: targetVar.id,
            },
            syntheticAfterSetHistory,
            targetVar.id,
            plan.playerLevel
          ).nextSessionBpm;
        setBurstChallengeBanner(bannerText);
      };

      const nextVar = pickNextVariantInSession(
        currentExercise,
        activeVariant?.id,
        priorSessionLogs,
        nextLoggedSets,
        plan.playerLevel
      );

      // Case A: Struggle / Auto-Regression (score <= 2)
      if (score <= 2) {
        if (isSpeedBurst) {
          setIsSpeedBurst(false);
          metronome.setSpeedBurst(false);
          setVariantBurstFailedInSession(true);
          nextSetBpm = Math.max(40, Math.round(currentComfortBpm * 0.96));
          setVariantSetsInSession(newVariantSets);
          setVariantCleanNonBurstInSession(newVariantCleanNonBurst);
          setBurstChallengeBanner(null);
        } else if (metronome.gapClickMode !== 'off' && score === 1) {
          metronome.setGapClickMode('off');
          setVariantSetsInSession(newVariantSets);
          setVariantCleanNonBurstInSession(newVariantCleanNonBurst);
          setBurstChallengeBanner('Click continuo');
        } else if (
          score === 1 &&
          (streakCtx.consecutiveFail1Count >= 1 || metronome.bpm <= 52)
        ) {
          const easierVar = pickEasierVariantInSession(
            currentExercise,
            activeVariant?.id,
            plan.playerLevel,
            syntheticAfterSetHistory
          );
          if (easierVar && easierVar.id !== activeVariant?.id) {
            switchVariantInSession(
              easierVar,
              easierVar.shortLabel,
              Math.max(48, Math.min(metronome.bpm, 60))
            );
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
      } else if (
        // Case B: Fast-Track Promotion when user aces (5/5) and masters current step
        score === 5 &&
        activeVariantMastered &&
        nextVar &&
        nextVar.id !== activeVariant?.id &&
        nextVar.difficultyWeight > (activeVariant?.difficultyWeight ?? 0)
      ) {
        switchVariantInSession(nextVar, nextVar.shortLabel);
      } else if (isSpeedBurst) {
        if (
          activeVariantMastered &&
          nextVar &&
          nextVar.id !== activeVariant?.id
        ) {
          switchVariantInSession(nextVar, nextVar.shortLabel);
        } else {
          setVariantSetsInSession(newVariantSets);
          setVariantCleanNonBurstInSession(newVariantCleanNonBurst);
          setBurstChallengeBanner(null);
        }
      } else {
        // Case C: Calibrated Boss Fight or Consolidation
        const BOSS_FIGHT_EXCLUDED = new Set([
          'ex-arpeggio-progressions',
          'ex-harmony-scale',
          'ex-lead-bending',
          'ex-rhythm-gap',
          'ex-bass-arpeggios',
          'ex-bass-pocket-groove',
        ]);
        const bossMinBpm = plan.playerLevel === 'foundation' ? 76 : 68;
        const canBossBurstSub =
          metronome.subdivision === '1/4' || metronome.subdivision === '1/8';
        const readyForBossFight =
          canBossBurstSub &&
          !BOSS_FIGHT_EXCLUDED.has(currentExercise.id) &&
          currentExercise.id !== 'ex-speed-bursts' &&
          currentExercise.id !== 'ex-bass-fingerstyle' &&
          metronome.gapClickMode === 'off' &&
          (score !== 5 || updatedStreakCtx.streak5Count === 0) &&
          metronome.bpm >= bossMinBpm &&
          !variantBurstFailedInSession &&
          newVariantCleanNonBurst >= 2 &&
          newVariantSets < currentItem.sets;

        if (readyForBossFight) {
          setIsSpeedBurst(true);
          metronome.setSpeedBurst(true);
          nextSetBpm = Math.max(40, Math.round(metronome.bpm * 0.92));
          setVariantSetsInSession(newVariantSets);
          setVariantCleanNonBurstInSession(newVariantCleanNonBurst);
          setBurstChallengeBanner(null);
        } else if (
          activeVariantMastered &&
          newVariantSets >= 3 &&
          nextVar &&
          nextVar.id !== activeVariant?.id &&
          nextVar.difficultyWeight > (activeVariant?.difficultyWeight ?? 0)
        ) {
          switchVariantInSession(nextVar, nextVar.shortLabel);
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
    onCompleteSession(buildSessionLogSnapshot(finalSets), [], bpmOverrides);
  };

  const handleClosePlayer = () => {
    metronome.stop();
    clearDemoBetweenTimer();
    if (phase === 'rating' && provisionalSetRef.current) {
      const finalSets = [...loggedSets, provisionalSetRef.current];
      const finalOverrides = provisionalOverridesRef.current ?? bpmOverrides;
      onCompleteSession(
        buildSessionLogSnapshot(finalSets),
        [],
        finalOverrides
      );
      return;
    }
    if (loggedSets.length > 0) {
      onCompleteSession(
        buildSessionLogSnapshot(loggedSets),
        [],
        bpmOverrides
      );
      return;
    }
    onCancel();
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
              onClick={handleClosePlayer}
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
            <button
              type="button"
              onClick={handleOpenManualFamilyBriefing}
              aria-label="Tecnica"
              title="Tecnica"
              className="flex h-8 items-center gap-1 rounded-full border border-white/15 bg-black px-2.5 text-[11px] font-bold text-white/75 hover:border-[#39FF14]/50 hover:text-[#39FF14] transition"
            >
              <BookOpen className="h-3.5 w-3.5 text-[#39FF14]" />
              <span className="hidden sm:inline">Tecnica</span>
            </button>
            {isMusicalExercise && (phase === 'precount' || phase === 'playing') && (
              <button
                type="button"
                onClick={() => {
                  unlockSharedAudioContext().catch(() => {});
                  const next = !droneEnabled;
                  setDroneEnabled(next);
                  onChangeDroneEnabled?.(next);
                }}
                aria-label={droneEnabled ? 'Disattiva drone' : 'Attiva drone'}
                title={droneEnabled ? 'Drone attivo' : 'Drone spento'}
                className={`flex h-8 w-8 items-center justify-center rounded-full border transition ${
                  droneEnabled
                    ? 'border-[#39FF14]/60 bg-[#39FF14]/15 text-[#39FF14]'
                    : 'border-white/15 bg-black text-white/45 hover:text-white'
                }`}
              >
                <Music className="h-3.5 w-3.5" />
              </button>
            )}
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
            {isArpeggioExercise && !arpeggioData?.isFixedChordStep && (
              <div className="flex w-full max-w-2xl flex-wrap items-center justify-center gap-1.5">
                {activeArpeggioProgressions.map((prog) => {
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
                  {isDemoBetweenPasses ? 'Riparte tra 2s...' : 'Ripasso'}
                </span>
              ) : isDemoBetweenPasses ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-[#39FF14]/50 bg-[#39FF14]/12 px-3.5 py-1 text-xs font-bold text-[#39FF14] animate-pulse-fast">
                  Tra 2s riprova
                </span>
              ) : demoPass === 1 ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black px-3.5 py-1 text-xs font-bold text-white/85">
                  <span className="text-[#39FF14] font-black tabular-nums">1/2</span>
                  Guarda
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-full border border-[#39FF14]/50 bg-[#39FF14]/12 px-3.5 py-1 text-xs font-bold text-[#39FF14]">
                  <span className="font-black tabular-nums">2/2</span>
                  Prova
                </span>
              )}
            </div>

            <FretboardViewer
              instrument={activeInstrument}
              notes={effectiveFretboardNotes}
              demoSequence={effectiveDemoSequence}
              variant="stage"
              demoMode="slow-intro"
              metronomeSound={metronome.soundId}
              subdivisionLabel={metronome.subdivision}
              bpm={metronome.bpm}
              speedBurst={isSpeedBurst}
              autoPlayDemo={!showFamilyBriefing}
              forceStopDemo={showFamilyBriefing}
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
              {metronome.bpm} BPM • {metronome.subdivision} • S{setNumber}/{currentItem.sets}
            </div>

            {/* 4 Beat Lights locked to Web Audio count-in clock */}
            <div className="mt-4 flex items-center justify-center gap-3">
              {[1, 2, 3, 4].map((beat) => {
                const isActive =
                  metronome.isPlaying && metronome.currentBeat === beat;
                const activeStyle =
                  beat === 1
                    ? 'bg-[#39FF14] scale-125 shadow-[0_0_16px_rgba(57,255,20,0.75)]'
                    : 'bg-white scale-110 shadow-[0_0_12px_rgba(255,255,255,0.55)]';
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

            <div
              key={metronome.pulseCounter}
              className={`my-7 chrome-ring-bezel rounded-full transition-transform duration-75 ${
                metronome.currentBeat === 1
                  ? 'scale-[1.03] shadow-[0_0_64px_rgba(57,255,20,0.42)]'
                  : 'shadow-[0_0_48px_rgba(57,255,20,0.24)]'
              }`}
            >
              <div className="flex h-44 w-44 items-center justify-center rounded-full border border-[#39FF14]/80 bg-[#050608] text-7xl font-black chrome-text tabular-nums">
                {metronome.countInBeat || 4}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => handleOpenRecallDemo('precount')}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black px-4 py-2 text-xs font-bold text-white/80 hover:text-white hover:border-white/45 transition"
              >
                <HelpCircle className="h-3.5 w-3.5 text-[#39FF14]" />
                Rivedi demo
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
                    onClick={() => metronome.setBackbeatMode(!metronome.backbeatMode)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition ${
                      metronome.backbeatMode
                        ? 'border-[#39FF14] bg-[#39FF14] text-black'
                        : 'border-white/15 bg-black text-white/60 hover:text-white'
                    }`}
                  >
                    Backbeat 2&amp;4
                  </button>

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
                </div>
              </div>

              {/* Continuous Live Animated Fretboard Locked to Web Audio Metronome Clock */}
              <div className="w-full space-y-2">
                {arpeggioData && !arpeggioData.isFixedChordStep && (
                  <div className="flex flex-wrap items-center justify-center gap-1">
                    {activeArpeggioProgressions.map((prog) => {
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
                )}

                <FretboardViewer
                  instrument={activeInstrument}
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
                Rivedi demo
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
                  onClick={() => finishActiveSet()}
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
              Rivedi demo
            </button>
          </div>
        )}

        {/* 5. FULL-SCREEN MINIMAL SUMMARY */}
        {phase === 'summary' && (
          <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-between gap-6 px-4 py-6">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/15 pb-3">
                <div className="flex items-center gap-2.5">
                  <h2 className="text-2xl font-black text-white">Completato</h2>
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#39FF14]/45 bg-[#39FF14]/12 px-2.5 py-0.5 text-[11px] font-bold text-[#39FF14]">
                    <Check className="h-3 w-3 stroke-[3]" />
                    Salvato automaticamente
                  </span>
                </div>
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
                  setNumber,
                  {
                    streak5Count: streakCtx.streak5Count,
                    streak4PlusCount: streakCtx.streak4PlusCount,
                    isWarmupSet,
                    isSpeedBurstSet: isSpeedBurst,
                    hasHitCeilingInSession: streakCtx.hasHitCeilingInSession,
                  }
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
                pendingSetIdRef.current = null;
                pendingDurationSecRef.current = null;
                provisionalSetRef.current = null;
                provisionalOverridesRef.current = null;
                hasTriggeredFinishForSetRef.current = false;
                onSaveProgress?.(
                  buildSessionLogSnapshot(loggedSets),
                  bpmOverrides
                );
                setSetRemainingSec(currentItem.durationSec);
                setPhase('precount');
              }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold text-white/45 hover:text-white transition"
            >
              <RotateCcw className="h-3 w-3" /> Ripeti serie
            </button>
          </div>
        </div>
      )}

      {familyBriefing && (
        <ExerciseFamilyBriefingModal
          isOpen={showFamilyBriefing}
          briefing={familyBriefing}
          srsStatus={currentSrsStatus}
          manualPreview={familyBriefingManualMode}
          onConfirm={handleConfirmFamilyBriefing}
          onClose={() => {
            setShowFamilyBriefing(false);
            setFamilyBriefingManualMode(false);
          }}
        />
      )}
    </div>
  );
};
