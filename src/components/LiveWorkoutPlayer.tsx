import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookmarkCheck,
  FastForward,
  Mic,
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
  CLEANLINESS_LABELS,
  calculateGoldilocksNextBpm,
  calculateGoldilocksTargetBpm,
  calculateWarmupBpm,
  computeExerciseBpmRamp,
  computeExerciseScore,
  computeWeightedExerciseBpm,
  pickNextRecommendedVariant,
} from '../utils/overloadEngine';
import { useMetronome } from '../hooks/useMetronome';
import { CapturedTake, useShadowplayRecorder } from '../hooks/useShadowplayRecorder';
import { useWakeLock } from '../hooks/useWakeLock';
import {
  METRONOME_SOUNDS,
  playSoftMetronomeTick,
  unlockSharedAudioContext,
} from '../utils/guitarSynth';
import { FretboardViewer } from './FretboardViewer';
import { saveRecordingBlob } from '../services/storage';

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
  baselineBpm: number;
  isBenchmark: boolean;
  take: CapturedTake | null;
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
  // demo (automatic BPM-synced fretboard) -> precount (metronome 4-3-2-1) -> playing (set timer)
  const [phase, setPhase] = useState<PlayerPhase>('demo');
  const [demoReplayKey, setDemoReplayKey] = useState(0);
  const [showMetronomeOptions, setShowMetronomeOptions] = useState(false);

  const currentItem = plan.items[exerciseIdx];
  const currentExercise: Exercise | undefined = currentItem?.exercise;

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
          first.preferredVariantId
        )?.id ?? null
      );
    }
  );

  const activeVariant: ExerciseVariant | undefined = useMemo(() => {
    const vars = currentExercise?.variants;
    if (!vars || vars.length === 0) return undefined;
    return vars.find((v) => v.id === selectedVariantId) ?? vars[0];
  }, [currentExercise, selectedVariantId]);

  const resolveVariantBpm = useCallback(
    (ex: Exercise, varId: string | undefined, fallbackBpm: number): number => {
      if (varId && variantBpmMap[ex.id]?.[varId]) {
        return variantBpmMap[ex.id][varId];
      }
      return computeWeightedExerciseBpm(ex, sessionLogs, varId).nextSessionBpm || fallbackBpm;
    },
    [variantBpmMap, sessionLogs]
  );

  const currentComfortBpm = useMemo(() => {
    if (!currentItem || !currentExercise) return 80;
    return resolveVariantBpm(
      currentExercise,
      activeVariant?.id,
      bpmOverrides[currentExercise.id]?.targetBpm ?? currentItem.targetBpm
    );
  }, [currentItem, currentExercise, activeVariant, resolveVariantBpm, bpmOverrides]);

  const currentRamp = useMemo(() => {
    if (!currentItem || !currentExercise) {
      return { minBpm: 68, maxBpm: 88, setBpms: [68] };
    }
    return computeExerciseBpmRamp(currentExercise, currentItem.sets, currentComfortBpm);
  }, [currentItem, currentExercise, currentComfortBpm]);

  const initialFirstBpm = useMemo(() => {
    const first = plan.items[0];
    if (!first) return 68;
    const initVar = pickNextRecommendedVariant(
      first.exercise,
      sessionLogs,
      first.preferredVariantId
    );
    const comfort = computeWeightedExerciseBpm(first.exercise, sessionLogs, initVar?.id)
      .nextSessionBpm;
    // Set 1 of every workout starts below capacity (-15%) to warm up cleanly
    return calculateWarmupBpm(comfort);
  }, [plan.items, sessionLogs]);

  const [precountBeat, setPrecountBeat] = useState(4);
  const [setRemainingSec, setSetRemainingSec] = useState(
    currentItem?.durationSec ?? 60
  );
  const [isSetPaused, setIsSetPaused] = useState(false);
  const [restRemainingSec, setRestRemainingSec] = useState(
    currentItem?.restSec ?? 15
  );

  const [capturedTake, setCapturedTake] = useState<CapturedTake | null>(null);
  const [loggedSets, setLoggedSets] = useState<SetLog[]>([]);
  const [sessionSetEntries, setSessionSetEntries] = useState<SessionSetEntry[]>([]);
  const [savedSetIds, setSavedSetIds] = useState<Set<string>>(() => new Set());
  const [expandedAudioSetId, setExpandedAudioSetId] = useState<string | null>(null);
  const [isSavingSummary, setIsSavingSummary] = useState(false);
  const takeUrlsRef = useRef<string[]>([]);
  const sessionStartRef = useRef<number>(Date.now());

  useEffect(() => {
    return () => {
      takeUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      takeUrlsRef.current = [];
    };
  }, []);

  const metronome = useMetronome({
    initialBpm: initialFirstBpm,
    initialSubdivision: currentExercise?.subdivision ?? '1/8',
    initialGapClick: currentExercise?.gapClickMode ?? 'off',
    initialSound: initialMetronomeSound,
    visualOnly: initialVisualOnly,
  });

  const shadowplay = useShadowplayRecorder();

  const currentMastery = useMemo(() => {
    if (!currentExercise) return null;
    return computeExerciseScore(currentExercise, sessionLogs);
  }, [currentExercise, sessionLogs]);

  // Bulletproof screen anti-sleep lock + pre-unlocked shared AudioContext
  useWakeLock(true);

  useEffect(() => {
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
      currentItem.preferredVariantId
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
    setSetRemainingSec(currentItem.durationSec);
    setRestRemainingSec(currentItem.restSec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseIdx]);

  const startPreCountNow = useCallback(() => {
    unlockSharedAudioContext().catch(() => {});
    setPrecountBeat(4);
    setPhase('precount');
  }, []);

  const startPlayingNow = useCallback(() => {
    unlockSharedAudioContext().catch(() => {});
    metronome.playPreCountBeep(true);
    setPhase('playing');
    setIsSetPaused(false);
    metronome.start();
    shadowplay.startCapture('audio').finally(() => {
      // Re-unlock shared AudioContext in case getUserMedia temporarily suspended playback
      unlockSharedAudioContext().catch(() => {});
    });
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

  const finishActiveSet = async () => {
    metronome.stop();
    const take = await shadowplay.stopCapture(metronome.bpm);
    setCapturedTake(take);
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
    shadowplay.discardPreview();
    setCapturedTake(null);
    setSetRemainingSec(currentItem?.durationSec ?? 60);
    if (setNumber === 1) {
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

    let retainedTake: CapturedTake | null = null;
    if (capturedTake) {
      const ownedUrl = URL.createObjectURL(capturedTake.blob);
      takeUrlsRef.current.push(ownedUrl);
      retainedTake = { ...capturedTake, url: ownedUrl };
    }
    shadowplay.discardPreview();
    setCapturedTake(null);

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
      timestamp: new Date().toISOString(),
    };

    const nextLoggedSets = [...loggedSets, newSetLog];
    setLoggedSets(nextLoggedSets);
    setSessionSetEntries((prev) => [
      ...prev,
      {
        setLog: newSetLog,
        exerciseTitle: currentExercise.title,
        baselineBpm: currentExercise.baselineBpm,
        isBenchmark: Boolean(currentExercise.isBenchmark),
        take: retainedTake,
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

    const vars = currentExercise.variants ?? [];
    let nextVariant = activeVariant;
    // Anti-boredom rotation: rotate to a fresh variant when clean/edge (>= 3);
    // keep the same variant when sloppy (<= 2) to repair motor control first.
    if (hasMoreSets && vars.length > 1 && activeVariant && score >= 3) {
      const currIdx = vars.findIndex((v) => v.id === activeVariant.id);
      nextVariant = vars[(currIdx + 1) % vars.length];
    }

    const updatedExerciseForCalc: Exercise = {
      ...currentExercise,
      variantBpms: updatedExVariantBpms,
      activeVariantId: nextVariant?.id ?? activeVariant?.id,
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
      nextVariant?.id
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
        activeVariantId: nextVariant?.id,
        variantBpms: updatedExVariantBpms,
      },
    }));

    if (hasMoreSets) {
      setSetNumber((s) => s + 1);
      if (nextVariant && nextVariant.id !== activeVariant?.id) {
        setSelectedVariantId(nextVariant.id);
        const nextVarEntry = newWeighted.byVariant.find(
          (b) => b.variantId === nextVariant!.id
        );
        const targetNextVarBpm =
          nextVarEntry && nextVarEntry.isPracticed
            ? calculateGoldilocksTargetBpm(nextVarEntry.bpm)
            : nextBpmForScore;
        metronome.setBpm(targetNextVarBpm);
      } else {
        metronome.setBpm(nextBpmForScore);
      }
      setRestRemainingSec(currentItem.restSec);
      setPhase('rest');
    } else if (hasMoreExercises) {
      setExerciseIdx((idx) => idx + 1);
      setSetNumber(1);
      setRestRemainingSec(currentItem.restSec);
      setPhase('rest');
    } else {
      setPhase('summary');
    }
  };

  const toggleSaveSetRecording = (setId: string) => {
    setSavedSetIds((prev) => {
      const next = new Set(prev);
      if (next.has(setId)) next.delete(setId);
      else next.add(setId);
      return next;
    });
  };

  const handleFinishAndSaveWorkout = async () => {
    if (isSavingSummary) return;
    setIsSavingSummary(true);

    const recordingsToPersist: FeedRecording[] = [];
    const finalSets: SetLog[] = [];

    for (const entry of sessionSetEntries) {
      let savedRecordingId: string | undefined;
      if (entry.take && savedSetIds.has(entry.setLog.id)) {
        savedRecordingId = `rec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        await saveRecordingBlob(savedRecordingId, entry.take.blob);
        recordingsToPersist.push({
          id: savedRecordingId,
          exerciseId: entry.setLog.exerciseId,
          exerciseTitle: entry.exerciseTitle,
          workoutTitle: plan.workout.title,
          date: entry.setLog.timestamp,
          bpm: entry.setLog.bpm,
          baselineBpmAtTime: entry.baselineBpm,
          cleanliness: entry.setLog.cleanliness,
          mediaType: entry.take.mediaType,
          durationSec: entry.take.durationSec,
          note: `S${entry.setLog.setNumber} • ${entry.setLog.bpm} BPM (${CLEANLINESS_LABELS[entry.setLog.cleanliness].label})`,
          isBenchmarkCheckpoint: entry.isBenchmark,
        });
      }
      finalSets.push(
        savedRecordingId
          ? { ...entry.setLog, savedRecordingId }
          : entry.setLog
      );
    }

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

    shadowplay.releaseMicrophone();
    onCompleteSession(sessionLog, recordingsToPersist, bpmOverrides);
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
                shadowplay.discardPreview();
                shadowplay.releaseMicrophone();
                onCancel();
              }}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black border border-white/15 text-white hover:border-white/40 transition"
              aria-label="Chiudi allenamento"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-bold text-white/55">
                <span>
                  S{setNumber}/{currentItem.sets}
                </span>
                {currentMastery && (
                  <span className="rounded-full border border-[#FF6B00]/50 px-2 py-0.5 text-[10px] font-black text-[#FF6B00] tabular-nums">
                    Lv. {currentMastery.level} ({currentMastery.levelProgressPct}%)
                  </span>
                )}
                {activeVariant && (
                  <span className="truncate text-[10px] font-bold text-white/75">
                    • {activeVariant.shortLabel}
                  </span>
                )}
              </div>
              <h2 className="text-sm font-bold text-white truncate">
                {currentExercise.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {shadowplay.isRecording && !shadowplay.isFallbackStream ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-2.5 py-0.5 text-[10px] font-bold text-white animate-pulse-fast">
                <span className="h-1.5 w-1.5 rounded-full bg-[#FF6B00]" />
                REC
              </span>
            ) : !shadowplay.hasMicPermission &&
              (phase === 'demo' || phase === 'precount' || phase === 'playing') ? (
              <button
                type="button"
                onClick={() => {
                  shadowplay.primeMicrophone().then((granted) => {
                    if (granted && phase === 'playing') {
                      shadowplay.startCapture('audio').finally(() => {
                        unlockSharedAudioContext().catch(() => {});
                      });
                    }
                  });
                }}
                aria-label="Attiva microfono"
                className="inline-flex items-center gap-1 rounded-full border border-[#FF6B00]/60 bg-[#FF6B00]/10 px-2.5 py-1 text-[10px] font-bold text-[#FF6B00] hover:bg-[#FF6B00]/20 transition"
              >
                <Mic className="h-3 w-3" />
                Mic
              </button>
            ) : null}
            {(phase === 'precount' || phase === 'playing') && (
              <button
                type="button"
                onClick={() => {
                  unlockSharedAudioContext().catch(() => {});
                  metronome.setVisualOnly(!metronome.visualOnly);
                }}
                aria-label="Attiva o disattiva audio metronomo"
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition ${
                  metronome.visualOnly
                    ? 'border-[#FF6B00]/60 bg-black text-[#FF6B00]'
                    : 'border-white/20 bg-black text-white hover:border-white/50'
                }`}
              >
                {metronome.visualOnly ? (
                  <>
                    <VolumeX className="h-3 w-3" />
                    Muto
                  </>
                ) : (
                  <>
                    <Volume2 className="h-3 w-3 text-[#FF6B00]" />
                    Click ON
                  </>
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
              className="h-full bg-[#FF6B00] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </header>

      {/* FULL-SCREEN SINGLE-FOCUS STAGE */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {/* 1. AUTOMATIC BPM-SYNCED FRETBOARD DEMO (BEFORE PRE-TIMER & SET TIMER) */}
        {phase === 'demo' && (
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center gap-5 px-4 py-5">
            <h3 className="text-center text-lg sm:text-xl font-black text-white">
              {currentExercise.title}
            </h3>

            <FretboardViewer
              notes={activeVariant?.fretboardNotes ?? currentExercise.fretboardNotes}
              demoSequence={activeVariant?.demoSequence ?? currentExercise.demoSequence}
              variant="stage"
              demoMode="slow-intro"
              metronomeSound={metronome.soundId}
              bpm={metronome.bpm}
              autoPlayDemo
              replayKey={demoReplayKey}
              onDemoComplete={startPreCountNow}
            />

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDemoReplayKey((k) => k + 1)}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black px-4 py-2 text-xs font-bold text-white/70 hover:text-white hover:border-white/40 transition"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Rivedi
              </button>
              <button
                type="button"
                onClick={() => {
                  shadowplay.primeMicrophone();
                  startPreCountNow();
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-black text-black hover:bg-white/90 transition"
              >
                <FastForward className="h-3.5 w-3.5" />
                Salta
              </button>
            </div>
          </div>
        )}

        {/* 2. FULL-SCREEN PRE-TIMER WITH METRONOME (4-3-2-1) */}
        {phase === 'precount' && (
          <div className="flex min-h-full flex-col items-center justify-center p-6 text-center">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-white/50 tabular-nums">
              <span>
                {metronome.bpm} BPM • S{setNumber}/{currentItem.sets}
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[9px] font-black tracking-wider ${
                  setNumber === 1
                    ? 'border-white/25 text-white/75'
                    : 'border-[#FF6B00]/50 bg-[#FF6B00]/10 text-[#FF6B00]'
                }`}
              >
                {setNumber === 1 ? 'RISCALDAMENTO' : 'GOLDILOCKS'}
              </span>
            </div>

            <div className="my-8 flex h-44 w-44 items-center justify-center rounded-full border-2 border-[#FF6B00] bg-black text-7xl font-black text-white tabular-nums shadow-[0_0_50px_rgba(255,107,0,0.2)]">
              {precountBeat}
            </div>

            <button
              type="button"
              onClick={() => {
                shadowplay.primeMicrophone();
                skipPreCountNow();
              }}
              className="rounded-full border border-white/15 bg-black px-5 py-2 text-xs font-bold text-white/60 hover:text-white hover:border-white/40 transition"
            >
              Salta
            </button>
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
                              ? 'border-[#FF6B00] bg-[#FF6B00] text-black'
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
              {/* 4 Minimal Beat Lights */}
              <div className="flex items-center justify-center gap-3">
                {[1, 2, 3, 4].map((beat) => {
                  const isActive =
                    metronome.isPlaying && metronome.currentBeat === beat;
                  const activeStyle = metronome.isGapBar
                    ? 'bg-white/30 scale-110'
                    : beat === 1
                    ? 'bg-[#FF6B00] scale-125 shadow-[0_0_16px_rgba(255,107,0,0.7)]'
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
                <div className="rounded-full border border-[#FF6B00]/50 px-3 py-0.5 text-[11px] font-bold text-[#FF6B00] animate-pulse">
                  SILENZIO
                </div>
              )}

              {/* Giant Clean Timer */}
              <div className="text-center">
                <div className="text-6xl sm:text-7xl font-black tracking-tight text-white tabular-nums">
                  {formatMMSS(setRemainingSec)}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  <span className="text-lg font-black text-[#FF6B00] tabular-nums">
                    {metronome.bpm} BPM
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                      setNumber === 1
                        ? 'border-white/25 bg-white/5 text-white/80'
                        : 'border-[#FF6B00]/50 bg-[#FF6B00]/10 text-[#FF6B00]'
                    }`}
                  >
                    {setNumber === 1 ? 'Riscaldamento' : 'Goldilocks'}
                  </span>
                  {activeVariant && (
                    <>
                      <span className="text-white/25">•</span>
                      <span className="rounded-full border border-white/20 px-2.5 py-0.5 text-[11px] font-bold text-white">
                        {activeVariant.shortLabel}
                      </span>
                    </>
                  )}
                  <span className="text-white/25">•</span>
                  <div className="flex items-center gap-1">
                    {currentRamp.setBpms.map((stepBpm, idx) => {
                      const isCurrent = idx + 1 === setNumber;
                      const isDone = idx + 1 < setNumber;
                      return (
                        <span
                          key={idx}
                          className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                            isCurrent
                              ? 'bg-white text-black'
                              : isDone
                              ? 'text-white/40 line-through'
                              : 'text-white/45'
                          }`}
                        >
                          {stepBpm}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Continuous Live Animated Fretboard Locked to Web Audio Metronome Clock */}
              <div className="w-full">
                <FretboardViewer
                  notes={activeVariant?.fretboardNotes ?? currentExercise.fretboardNotes}
                  demoSequence={activeVariant?.demoSequence ?? currentExercise.demoSequence}
                  variant="compact"
                  demoMode="live-loop"
                  externalStepTick={isSetPaused ? null : metronome.currentSubStep}
                  currentBeat={metronome.currentBeat}
                  subdivisionLabel={metronome.subdivision}
                  muteAudio
                  bpm={metronome.bpm}
                  hideDemoButton
                  forceStopDemo={isSetPaused}
                />
              </div>
            </div>

            {/* Minimal Bottom Actions */}
            <div className="grid grid-cols-2 gap-2.5 pt-2">
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
          </main>
        )}

        {/* 4. FULL-SCREEN REST */}
        {phase === 'rest' && (
          <div className="flex min-h-full flex-col items-center justify-center p-6 text-center">
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
                className="flex items-center gap-1.5 rounded-full bg-[#FF6B00] px-5 py-2.5 text-xs font-black text-black hover:bg-[#ff7d1f] transition"
              >
                <FastForward className="h-3.5 w-3.5" /> Riprendi
              </button>
            </div>
          </div>
        )}

        {/* 5. FULL-SCREEN MINIMAL SUMMARY (WITH OPTIONAL END-OF-WORKOUT RECORDING SAVE) */}
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
                {sessionSetEntries.map((entry) => {
                  const isSaved = savedSetIds.has(entry.setLog.id);
                  const isAudioOpen = expandedAudioSetId === entry.setLog.id;

                  return (
                    <div
                      key={entry.setLog.id}
                      className="rounded-xl border border-white/15 bg-black px-3.5 py-2.5 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs sm:text-sm font-bold text-white">
                            {entry.exerciseTitle}
                          </div>
                          <div className="text-[11px] font-bold text-white/45 tabular-nums">
                            S{entry.setLog.setNumber} · {entry.setLog.bpm} BPM
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded-full border border-white/15 px-2 py-0.5 text-[11px] font-black text-white tabular-nums">
                            {entry.setLog.cleanliness}/5
                          </span>

                          {entry.take && (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedAudioSetId((curr) =>
                                    curr === entry.setLog.id ? null : entry.setLog.id
                                  )
                                }
                                aria-label="Ascolta registrazione"
                                className={`flex h-7 w-7 items-center justify-center rounded-full border transition ${
                                  isAudioOpen
                                    ? 'border-white bg-white text-black'
                                    : 'border-white/15 bg-black text-white/65 hover:border-white/40 hover:text-white'
                                }`}
                              >
                                <Play className="h-3 w-3 fill-current ml-0.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleSaveSetRecording(entry.setLog.id)}
                                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black transition ${
                                  isSaved
                                    ? 'border-[#FF6B00] bg-[#FF6B00] text-black'
                                    : 'border-white/15 bg-black text-white/60 hover:border-white/40 hover:text-white'
                                }`}
                              >
                                <BookmarkCheck className="h-3 w-3" />
                                {isSaved ? 'Salvata' : 'Salva'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {entry.take && isAudioOpen && (
                        <audio
                          src={entry.take.url}
                          controls
                          className="w-full h-8"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              disabled={isSavingSummary}
              onClick={handleFinishAndSaveWorkout}
              className="w-full rounded-xl bg-[#FF6B00] px-5 py-3.5 text-sm font-black text-black hover:bg-[#ff7d1f] disabled:opacity-50 transition"
            >
              {savedSetIds.size > 0
                ? `Fine (${savedSetIds.size} clip)`
                : 'Fine'}
            </button>
          </div>
        )}
      </div>

      {/* 1-CLICK END-OF-SET RATING MODAL */}
      {phase === 'rating' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/90 backdrop-blur-md p-2 sm:p-4 overscroll-none">
          <div className="w-full max-w-lg rounded-2xl bg-black border border-white/20 p-4 sm:p-5 shadow-2xl space-y-3">
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
                    ? 'text-[#A4FF00]'
                    : delta < 0
                    ? 'text-[#FF6B00]'
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
                shadowplay.discardPreview();
                setCapturedTake(null);
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
