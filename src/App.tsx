import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Cloud,
  Compass,
  Flame,
  Radio,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  AppState,
  Exercise,
  FeedRecording,
  PlayerLevelId,
  ScaledWorkoutPlan,
  ScientificPlanPrescription,
  SessionDurationPreset,
  UserSettings,
  WorkoutSessionLog,
  WorkoutTemplate,
} from './types/practice';
import {
  SEED_EXERCISES,
  createCleanProfileAppState,
  createInitialAppState,
} from './data/scientificSeed';
import {
  clearAllRecordingBlobs,
  deleteRecordingBlob,
  loadPersistedState,
  savePersistedState,
} from './services/storage';
import {
  LEGACY_EXERCISE_ID_MAP,
  buildSessionPlanFromPrescription,
  createDefaultScientificPrescription,
  generateScientificPrescription,
} from './utils/scientificPrescription';
import {
  computeWeightedExerciseBpm,
  getStartingBpmForLevel,
} from './utils/overloadEngine';
import { computeNerdTelemetry } from './utils/nerdStats';
import { TodayDashboard } from './components/TodayDashboard';
import { ProgramsAndBuilder } from './components/ProgramsAndBuilder';
import { TunerAndCheatSheet } from './components/TunerAndCheatSheet';
import { AnalyticsView } from './components/AnalyticsView';
import { LiveWorkoutPlayer } from './components/LiveWorkoutPlayer';
import { OnboardingFlow } from './components/OnboardingFlow';
import {
  BeforeInstallPromptEvent,
  PostOnboardingGuide,
  PostOnboardingStep,
} from './components/PostOnboardingGuide';
import { CloudSyncModal, CloudSyncStatus } from './components/CloudSyncModal';
import { clearAllFamilyBriefingSrs } from './utils/spacedRepetitionCoach';
import { useAppUpdate } from './hooks/useAppUpdate';
import {
  CloudUserProfile,
  computeSyncFingerprint,
  getCurrentCloudUser,
  isSupabaseConfigured,
  mergeAppStates,
  onCloudAuthStateChange,
  pullCloudProgress,
  pushCloudProgress,
} from './services/supabaseCloud';

export type NavTab = 'today' | 'programs' | 'analytics' | 'tuner';

const POST_ONBOARDING_STEP_KEY = 'pentatonic_post_onboarding_step';

function readStoredPostOnboardingStep(): PostOnboardingStep | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(POST_ONBOARDING_STEP_KEY);
    return raw === 'google' || raw === 'install' ? raw : null;
  } catch {
    return null;
  }
}

function writeStoredPostOnboardingStep(step: PostOnboardingStep | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (step) {
      localStorage.setItem(POST_ONBOARDING_STEP_KEY, step);
    } else {
      localStorage.removeItem(POST_ONBOARDING_STEP_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

function applyLevelBaselineToUnpracticed(
  exercises: Exercise[],
  sessionLogs: WorkoutSessionLog[],
  level?: PlayerLevelId
): Exercise[] {
  const practicedIds = new Set(
    sessionLogs.flatMap((log) => log.sets.map((st) => st.exerciseId))
  );
  const levelBpm = getStartingBpmForLevel(level);
  return exercises.map((ex) => {
    if (ex.isCustom) return ex;
    const hasVariantHistory =
      ex.variantBpms && Object.keys(ex.variantBpms).length > 0;
    if (practicedIds.has(ex.id) || hasVariantHistory) {
      return ex;
    }
    return {
      ...ex,
      defaultBpm: levelBpm,
      baselineBpm: levelBpm,
      currentTargetBpm: levelBpm,
      bestCleanBpm: levelBpm,
    };
  });
}

function hydrateAppState(saved: AppState): AppState {
  const seedById = new Map(SEED_EXERCISES.map((ex) => [ex.id, ex]));
  const activeSavedExercises = (saved.exercises ?? []).filter(
    (ex) => seedById.has(ex.id) || ex.isCustom
  );
  const savedIds = new Set(activeSavedExercises.map((ex) => ex.id));
  const hydratedSavedExercises = activeSavedExercises.map((ex) => {
    const seed = seedById.get(ex.id);
    if (!seed) return ex;
    return {
      ...ex,
      pillarName: seed.pillarName,
      title: seed.title,
      description: seed.description,
      scientificRationale: seed.scientificRationale,
      category: seed.category,
      subdivision: seed.subdivision,
      speedBurst: seed.speedBurst,
      fretboardNotes: seed.fretboardNotes,
      demoSequence: seed.demoSequence,
      variants: seed.variants,
      activeVariantId: seed.variants?.some((v) => v.id === ex.activeVariantId)
        ? ex.activeVariantId
        : seed.activeVariantId,
    };
  });
  const missingSeedExercises = SEED_EXERCISES.filter(
    (seed) => !savedIds.has(seed.id)
  );
  const hydratedExercises = [
    ...hydratedSavedExercises,
    ...missingSeedExercises,
  ];
  const migratedSessionLogs = (saved.sessionLogs ?? []).map((log) => ({
    ...log,
    sets: log.sets.map((st) => ({
      ...st,
      exerciseId: LEGACY_EXERCISE_ID_MAP[st.exerciseId] ?? st.exerciseId,
    })),
  }));
  const migratedRecordings = (saved.feedRecordings ?? []).map((rec) => ({
    ...rec,
    exerciseId: LEGACY_EXERCISE_ID_MAP[rec.exerciseId] ?? rec.exerciseId,
  }));

  const savedPlan = saved.settings?.scientificPlan;
  const generatedPlan = savedPlan
    ? generateScientificPrescription(savedPlan.answers, hydratedExercises)
    : createDefaultScientificPrescription(
        hydratedExercises,
        saved.settings.activeProgramId,
        saved.settings.selectedPreset
      );

  const customDoses = (savedPlan?.doses ?? []).filter(
    (d) => d.roleLabel === 'Esercizio Personale'
  );
  const generatedWithoutCustom = generatedPlan.doses.filter(
    (d) => !customDoses.some((cd) => cd.exerciseId === d.exerciseId)
  );
  const hydratedPlan: ScientificPlanPrescription = savedPlan
    ? {
        ...generatedPlan,
        id: savedPlan.id,
        createdAt: savedPlan.createdAt,
        doses: [...generatedWithoutCustom, ...customDoses],
      }
    : generatedPlan;

  const calibratedExercises = applyLevelBaselineToUnpracticed(
    hydratedExercises,
    migratedSessionLogs,
    hydratedPlan.answers.level
  );

  return {
    ...saved,
    exercises: calibratedExercises,
    sessionLogs: migratedSessionLogs,
    feedRecordings: migratedRecordings,
    settings: {
      ...saved.settings,
      scientificPlan: hydratedPlan,
    },
  };
}

export function App() {
  const [appState, setAppState] = useState<AppState>(() => {
    const saved = loadPersistedState();
    if (!saved) return createInitialAppState();
    return hydrateAppState(saved);
  });

  const [activeTab, setActiveTab] = useState<NavTab>('today');
  const [activeLivePlan, setActiveLivePlan] =
    useState<ScaledWorkoutPlan | null>(null);
  const [showDiagnosticQuiz, setShowDiagnosticQuiz] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const appUpdate = useAppUpdate();

  const [cloudUser, setCloudUser] = useState<CloudUserProfile | null>(null);
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus>('idle');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showCloudModal, setShowCloudModal] = useState<boolean>(false);
  const [authConfigVersion, setAuthConfigVersion] = useState<number>(0);
  const [postOnboardingStep, setPostOnboardingStep] =
    useState<PostOnboardingStep | null>(() => readStoredPostOnboardingStep());
  const [deferredInstallPrompt, setDeferredInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  const appStateRef = useRef(appState);
  appStateRef.current = appState;
  const cloudUserRef = useRef(cloudUser);
  cloudUserRef.current = cloudUser;
  const initialCloudSyncDoneRef = useRef<string | null>(null);
  const lastPushedFingerprintRef = useRef<string>('');
  const isSyncingRef = useRef<boolean>(false);

  const syncWithCloud = useCallback(
    async (overrideUser?: CloudUserProfile | null) => {
      const activeUser = overrideUser ?? cloudUserRef.current;
      if (!activeUser || isSyncingRef.current) return;
      isSyncingRef.current = true;
      setSyncStatus('syncing');
      setSyncError(null);
      try {
        const { state: remoteState } = await pullCloudProgress(activeUser.id);
        const currentLocal = appStateRef.current;
        const nextMerged = remoteState
          ? hydrateAppState(mergeAppStates(currentLocal, remoteState))
          : {
              ...currentLocal,
              settings: {
                ...currentLocal.settings,
                cloudSyncEnabled: true,
              },
            };

        const mergedFingerprint = computeSyncFingerprint(nextMerged);
        const remoteFingerprint = remoteState
          ? computeSyncFingerprint(hydrateAppState(remoteState))
          : '';

        let finalSyncedAt = nextMerged.settings.lastSyncedAt;
        if (!remoteState || mergedFingerprint !== remoteFingerprint) {
          const pushed = await pushCloudProgress(activeUser.id, nextMerged);
          finalSyncedAt = pushed.syncedAt;
        }

        const finalState: AppState = {
          ...nextMerged,
          settings: {
            ...nextMerged.settings,
            cloudSyncEnabled: true,
            lastSyncedAt: finalSyncedAt ?? new Date().toISOString(),
          },
        };

        lastPushedFingerprintRef.current = computeSyncFingerprint(finalState);
        initialCloudSyncDoneRef.current = activeUser.id;
        setAppState(finalState);
        setSyncStatus('synced');
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Errore sincronizzazione cloud.';
        setSyncStatus('error');
        setSyncError(msg);
      } finally {
        isSyncingRef.current = false;
      }
    },
    []
  );

  useEffect(() => {
    savePersistedState(appState);
  }, [appState]);

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setDeferredInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (cloudUser && postOnboardingStep === 'google') {
      setPostOnboardingStep('install');
      writeStoredPostOnboardingStep('install');
    }
  }, [cloudUser, postOnboardingStep]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setCloudUser(null);
      initialCloudSyncDoneRef.current = null;
      return;
    }

    let active = true;
    void getCurrentCloudUser()
      .then((user) => {
        if (!active) return;
        setCloudUser(user);
        if (user) {
          void syncWithCloud(user);
        } else {
          initialCloudSyncDoneRef.current = null;
          setSyncStatus('idle');
        }
      })
      .catch((err) => {
        if (!active) return;
        setSyncStatus('error');
        setSyncError(
          err instanceof Error ? err.message : 'Errore autenticazione cloud.'
        );
      });

    const unsubscribe = onCloudAuthStateChange((user) => {
      if (!active) return;
      setCloudUser(user);
      if (user) {
        void syncWithCloud(user);
      } else {
        initialCloudSyncDoneRef.current = null;
        lastPushedFingerprintRef.current = '';
        setSyncStatus('idle');
        setSyncError(null);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [authConfigVersion, syncWithCloud]);

  useEffect(() => {
    if (!cloudUser) return;
    if (initialCloudSyncDoneRef.current !== cloudUser.id) return;
    const fingerprint = computeSyncFingerprint(appState);
    if (fingerprint === lastPushedFingerprintRef.current) return;

    const timerId = window.setTimeout(() => {
      const activeUser = cloudUserRef.current;
      if (!activeUser || isSyncingRef.current) return;
      const latestState = appStateRef.current;
      const latestFingerprint = computeSyncFingerprint(latestState);
      if (latestFingerprint === lastPushedFingerprintRef.current) return;

      setSyncStatus('syncing');
      setSyncError(null);
      void pushCloudProgress(activeUser.id, latestState)
        .then(({ syncedAt }) => {
          lastPushedFingerprintRef.current = latestFingerprint;
          setAppState((prev) => ({
            ...prev,
            settings: {
              ...prev.settings,
              cloudSyncEnabled: true,
              lastSyncedAt: syncedAt,
            },
          }));
          setSyncStatus('synced');
        })
        .catch((err) => {
          setSyncStatus('error');
          setSyncError(
            err instanceof Error ? err.message : 'Errore salvataggio cloud.'
          );
        });
    }, 1200);

    return () => window.clearTimeout(timerId);
  }, [appState, cloudUser]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        cloudUserRef.current &&
        !isSyncingRef.current
      ) {
        void syncWithCloud(cloudUserRef.current);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [syncWithCloud]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [activeTab]);

  const nerd = useMemo(
    () =>
      computeNerdTelemetry(
        appState.exercises,
        appState.sessionLogs,
        appState.settings.weeklyGoalDays,
        'all'
      ),
    [appState.exercises, appState.sessionLogs, appState.settings.weeklyGoalDays]
  );

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 3500);
  };

  const updateSettings = (partial: Partial<UserSettings>) => {
    setAppState((prev) => ({
      ...prev,
      settings: { ...prev.settings, ...partial },
    }));
  };

  const activePrescription: ScientificPlanPrescription = useMemo(
    () =>
      appState.settings.scientificPlan ||
      createDefaultScientificPrescription(
        appState.exercises,
        appState.settings.activeProgramId,
        appState.settings.selectedPreset
      ),
    [
      appState.settings.scientificPlan,
      appState.exercises,
      appState.settings.activeProgramId,
      appState.settings.selectedPreset,
    ]
  );

  const handleFinishQuiz = (
    prescription: ScientificPlanPrescription,
    launchWorkoutNow: boolean
  ) => {
    const isFirstOnboarding = !appState.settings.hasCompletedOnboarding;
    const calibratedExercises = applyLevelBaselineToUnpracticed(
      appState.exercises,
      appState.sessionLogs,
      prescription.answers.level
    );
    setAppState((prev) => ({
      ...prev,
      exercises: applyLevelBaselineToUnpracticed(
        prev.exercises,
        prev.sessionLogs,
        prescription.answers.level
      ),
      settings: {
        ...prev.settings,
        weeklyGoalDays: prescription.answers.weeklyDays,
        selectedPreset: prescription.answers.sessionPreset,
        hasCompletedOnboarding: true,
        scientificPlan: prescription,
      },
    }));
    setShowDiagnosticQuiz(false);
    setActiveTab('today');
    showToast('Piano scientifico calibrato!');

    if (isFirstOnboarding) {
      const nextStep: PostOnboardingStep = cloudUser ? 'install' : 'google';
      setPostOnboardingStep(nextStep);
      writeStoredPostOnboardingStep(nextStep);
    }

    if (launchWorkoutNow) {
      setActiveLivePlan(
        buildSessionPlanFromPrescription(
          prescription,
          calibratedExercises,
          appState.sessionLogs,
          prescription.answers.sessionPreset
        )
      );
    }
  };

  const handleStartPrescribedSession = (
    preset: SessionDurationPreset,
    selectedExerciseIds?: string[]
  ) => {
    const plan = buildSessionPlanFromPrescription(
      activePrescription,
      appState.exercises,
      appState.sessionLogs,
      preset,
      selectedExerciseIds
    );
    setActiveLivePlan(plan);
  };

  const handleStartSingleExercise = (
    exercise: Exercise,
    preferredVariantId?: string
  ) => {
    const playerLevel = activePrescription.answers.level;
    const startTargetBpm = computeWeightedExerciseBpm(
      exercise,
      appState.sessionLogs,
      preferredVariantId,
      playerLevel
    ).nextSessionBpm;

    const singleWorkout: WorkoutTemplate = {
      id: `wk-single-${exercise.id}`,
      title: exercise.title,
      subtitle: exercise.description,
      programId: appState.settings.activeProgramId,
      dayNumber: 1,
      estimatedMinutes: Math.max(
        2,
        Math.round((exercise.defaultSets * exercise.defaultSetDurationSec) / 60)
      ),
      items: [
        {
          exerciseId: exercise.id,
          sets: Math.min(3, exercise.defaultSets),
          durationSec: exercise.defaultSetDurationSec,
          restSec: exercise.defaultRestSec,
        },
      ],
    };
    const plan: ScaledWorkoutPlan = {
      workout: singleWorkout,
      preset: 15,
      modeLabel: 'Esercizio Singolo',
      modeDescription: exercise.description,
      isStandardized: false,
      estimatedMinutes: singleWorkout.estimatedMinutes,
      playerLevel,
      items: [
        {
          exerciseId: exercise.id,
          sets: Math.min(3, exercise.defaultSets),
          durationSec: exercise.defaultSetDurationSec,
          restSec: exercise.defaultRestSec,
          exercise,
          targetBpm: startTargetBpm,
          preferredVariantId,
          pillarNumber: 1,
          pillarLabel: 'Esercizio Mirato',
        },
      ],
    };
    setActiveLivePlan(plan);
  };

  type SessionBpmUpdateMap = Record<
    string,
    {
      targetBpm: number;
      bestCleanBpm?: number;
      activeVariantId?: string;
      variantBpms?: Record<string, number>;
    }
  >;

  const applySessionUpsertToState = useCallback(
    (
      prev: AppState,
      sessionLog: WorkoutSessionLog,
      updatedBpmByExercise: SessionBpmUpdateMap,
      newRecordings: FeedRecording[] = []
    ): AppState => {
      const existingIdx = prev.sessionLogs.findIndex(
        (s) => s.id === sessionLog.id
      );
      let nextSessionLogs: WorkoutSessionLog[];
      if (sessionLog.sets.length === 0) {
        nextSessionLogs =
          existingIdx >= 0
            ? prev.sessionLogs.filter((s) => s.id !== sessionLog.id)
            : prev.sessionLogs;
      } else if (existingIdx >= 0) {
        nextSessionLogs = prev.sessionLogs.map((s) =>
          s.id === sessionLog.id ? sessionLog : s
        );
      } else {
        nextSessionLogs = [sessionLog, ...prev.sessionLogs];
      }

      const baselineById = new Map(
        (activeLivePlan?.items ?? []).map((it) => [it.exerciseId, it.exercise])
      );

      return {
        ...prev,
        sessionLogs: nextSessionLogs,
        feedRecordings:
          newRecordings.length > 0
            ? [...newRecordings, ...prev.feedRecordings]
            : prev.feedRecordings,
        exercises: prev.exercises.map((ex) => {
          const upd = updatedBpmByExercise[ex.id];
          const baselineEx = baselineById.get(ex.id);
          if (!upd) {
            if (!baselineEx) return ex;
            return {
              ...ex,
              currentTargetBpm: baselineEx.currentTargetBpm,
              bestCleanBpm: baselineEx.bestCleanBpm,
              activeVariantId: baselineEx.activeVariantId,
              variantBpms: baselineEx.variantBpms,
            };
          }
          const baseBest = baselineEx?.bestCleanBpm ?? ex.bestCleanBpm;
          const baseVariantBpms =
            baselineEx?.variantBpms ?? ex.variantBpms ?? {};
          return {
            ...ex,
            currentTargetBpm: upd.targetBpm,
            bestCleanBpm:
              upd.bestCleanBpm && upd.bestCleanBpm > baseBest
                ? upd.bestCleanBpm
                : baseBest,
            activeVariantId: upd.activeVariantId ?? ex.activeVariantId,
            variantBpms: upd.variantBpms
              ? { ...baseVariantBpms, ...upd.variantBpms }
              : ex.variantBpms,
          };
        }),
      };
    },
    [activeLivePlan]
  );

  const handleSaveSessionProgress = useCallback(
    (
      sessionLog: WorkoutSessionLog,
      updatedBpmByExercise: SessionBpmUpdateMap
    ) => {
      setAppState((prev) =>
        applySessionUpsertToState(prev, sessionLog, updatedBpmByExercise)
      );
    },
    [applySessionUpsertToState]
  );

  const handleCompleteSession = (
    sessionLog: WorkoutSessionLog,
    newRecordings: FeedRecording[],
    updatedBpmByExercise: SessionBpmUpdateMap
  ) => {
    setAppState((prev) =>
      applySessionUpsertToState(
        prev,
        sessionLog,
        updatedBpmByExercise,
        newRecordings
      )
    );
    setActiveLivePlan(null);
    showToast(`Allenamento salvato • ${sessionLog.sets.length} serie`);
    if (newRecordings.length > 0) {
      setActiveTab('analytics');
    }
  };

  const handleCreateExercise = (newEx: Exercise) => {
    setAppState((prev) => {
      const currentPlan =
        prev.settings.scientificPlan ||
        createDefaultScientificPrescription(
          prev.exercises,
          prev.settings.activeProgramId,
          prev.settings.selectedPreset
        );

      return {
        ...prev,
        exercises: [newEx, ...prev.exercises],
        settings: {
          ...prev.settings,
          scientificPlan: {
            ...currentPlan,
            doses: [
              ...currentPlan.doses,
              {
                exerciseId: newEx.id,
                role: 'secondario',
                roleLabel: 'Esercizio Personale',
                weeklyMinSets: 4,
                weeklyOptimalSets: 7,
                setsPerSession: 2,
                setDurationSec: newEx.defaultSetDurationSec,
                restSec: newEx.defaultRestSec,
                coachMethod: 'Protocollo Personale',
                scientificRationale: newEx.description,
              },
            ],
          },
        },
      };
    });
    showToast('Esercizio aggiunto al tuo Piano!');
  };

  const handleToggleBenchmark = (recordingId: string) => {
    setAppState((prev) => ({
      ...prev,
      feedRecordings: prev.feedRecordings.map((r) =>
        r.id === recordingId
          ? { ...r, isBenchmarkCheckpoint: !r.isBenchmarkCheckpoint }
          : r
      ),
    }));
  };

  const handleDeleteRecording = async (recordingId: string) => {
    await deleteRecordingBlob(recordingId);
    setAppState((prev) => ({
      ...prev,
      feedRecordings: prev.feedRecordings.filter((r) => r.id !== recordingId),
    }));
    showToast('Registrazione eliminata');
  };

  const handleResetDemoData = async () => {
    await clearAllRecordingBlobs();
    clearAllFamilyBriefingSrs();
    const clean = createCleanProfileAppState();
    setAppState(clean);
    setActiveLivePlan(null);
    setPostOnboardingStep(null);
    writeStoredPostOnboardingStep(null);
    setShowDiagnosticQuiz(true);
    showToast('Dati azzerati');
  };

  const navItems: {
    id: NavTab;
    label: string;
    icon: React.ReactNode;
  }[] = [
    { id: 'today', label: 'Oggi', icon: <Flame className="h-4 w-4" /> },
    {
      id: 'programs',
      label: 'Obiettivi',
      icon: <Compass className="h-4 w-4" />,
    },
    {
      id: 'analytics',
      label: 'Progressi',
      icon: <BarChart3 className="h-4 w-4" />,
    },
    { id: 'tuner', label: 'Tuner', icon: <Radio className="h-4 w-4" /> },
  ];

  // Interactive Diagnostic Quiz (first onboarding or on-demand recalibration)
  if (!appState.settings.hasCompletedOnboarding || showDiagnosticQuiz) {
    return (
      <>
        <OnboardingFlow
          exercises={appState.exercises}
          showIntroSlides={!appState.settings.hasCompletedOnboarding}
          onFinishQuiz={handleFinishQuiz}
          onOpenCloudLogin={() => setShowCloudModal(true)}
          onCancel={
            appState.settings.hasCompletedOnboarding
              ? () => setShowDiagnosticQuiz(false)
              : undefined
          }
        />
        <CloudSyncModal
          isOpen={showCloudModal}
          onClose={() => setShowCloudModal(false)}
          user={cloudUser}
          syncStatus={syncStatus}
          syncError={syncError}
          lastSyncedAt={appState.settings.lastSyncedAt}
          onForceSync={() => syncWithCloud()}
          onAuthConfigured={() => setAuthConfigVersion((v) => v + 1)}
        />
      </>
    );
  }

  if (postOnboardingStep) {
    return (
      <>
        <PostOnboardingGuide
          step={postOnboardingStep}
          user={cloudUser}
          deferredInstallPrompt={deferredInstallPrompt}
          onClearInstallPrompt={() => setDeferredInstallPrompt(null)}
          onSkipGoogle={() => {
            setPostOnboardingStep('install');
            writeStoredPostOnboardingStep('install');
          }}
          onOpenCloudSetup={() => setShowCloudModal(true)}
          onComplete={() => {
            setPostOnboardingStep(null);
            writeStoredPostOnboardingStep(null);
          }}
        />
        <CloudSyncModal
          isOpen={showCloudModal}
          onClose={() => setShowCloudModal(false)}
          user={cloudUser}
          syncStatus={syncStatus}
          syncError={syncError}
          lastSyncedAt={appState.settings.lastSyncedAt}
          onForceSync={() => syncWithCloud()}
          onAuthConfigured={() => setAuthConfigVersion((v) => v + 1)}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-transparent text-white pb-24 sm:pb-10">
      {/* Chrome + Electric Neon Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/20 bg-[#050608]/92 backdrop-blur-xl shadow-[0_8px_28px_rgba(0,0,0,0.65)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 px-4 py-2.5">
          <div className="flex items-center gap-2.5 shrink-0 min-w-0">
            <img
              src="/icon.svg"
              alt="The Shredding Lab"
              className="h-8 w-8 rounded-xl shrink-0 ring-1 ring-slate-200/35 shadow-[0_0_16px_rgba(57,255,20,0.22)]"
            />
            <span className="font-brand text-[11px] sm:text-sm whitespace-nowrap tracking-[0.14em] sm:tracking-[0.18em]">
              <span className="chrome-text">THE SHREDDING LAB</span>
              <span className="text-[#39FF14] ml-1 drop-shadow-[0_0_8px_rgba(57,255,20,0.9)]">•</span>
            </span>
          </div>

          {/* Desktop 4 Clear Tabs (Polished Chrome) */}
          <nav className="hidden sm:flex items-center gap-1 rounded-full chrome-pill p-1">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition ${
                    active
                      ? 'chrome-active'
                      : 'text-slate-300/70 hover:text-white'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Chrome Streak Pill + Cloud / Google Account */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="flex items-center gap-1.5 rounded-full chrome-pill px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold text-slate-100 tabular-nums shrink-0">
              <Flame className="h-3.5 w-3.5 text-[#39FF14] drop-shadow-[0_0_6px_rgba(57,255,20,0.75)]" />
              <span>{nerd.currentStreakDays} di fila</span>
            </div>

            <button
              type="button"
              onClick={() => setShowCloudModal(true)}
              aria-label={cloudUser ? 'Account Cloud' : 'Accedi al Cloud'}
              className="relative flex items-center gap-1.5 rounded-full chrome-pill px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-bold text-slate-100 hover:border-white/40 transition shrink-0"
            >
              {cloudUser ? (
                <>
                  {cloudUser.avatarUrl ? (
                    <img
                      src={cloudUser.avatarUrl}
                      alt={cloudUser.fullName ?? cloudUser.email ?? 'Account'}
                      className="h-4 w-4 rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#39FF14]/20 text-[9px] font-black text-[#39FF14]">
                      {(cloudUser.fullName || cloudUser.email || 'U')[0].toUpperCase()}
                    </span>
                  )}
                  <span
                    className={`h-2 w-2 rounded-full ${
                      syncStatus === 'error'
                        ? 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.85)]'
                        : syncStatus === 'syncing'
                          ? 'bg-amber-300 animate-pulse-fast'
                          : 'bg-[#39FF14] shadow-[0_0_8px_rgba(57,255,20,0.85)]'
                    }`}
                  />
                </>
              ) : (
                <>
                  <Cloud className="h-3.5 w-3.5 text-[#39FF14]" />
                  <span>Accedi</span>
                </>
              )}
            </button>
          </div>
        </div>
        <div className="chrome-hairline w-full opacity-60" />
      </header>

      {toastMessage && (
        <div className="fixed top-16 right-4 z-40 rounded-full chrome-panel px-4 py-2 text-xs font-bold text-white shadow-2xl">
          {toastMessage}
        </div>
      )}

      {/* PWA New Deploy Update Popup */}
      {appUpdate.updateAvailable && !activeLivePlan && (
        <div className="fixed bottom-20 sm:bottom-6 inset-x-4 sm:left-auto sm:right-6 z-40 mx-auto sm:mx-0 max-w-sm rounded-2xl chrome-panel backdrop-blur-xl px-4 py-3 shadow-2xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="h-2 w-2 shrink-0 rounded-full bg-[#39FF14] shadow-[0_0_10px_rgba(57,255,20,0.9)] animate-pulse-fast" />
            <span className="truncate text-xs font-bold text-white">
              Nuova versione disponibile
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              disabled={appUpdate.isUpdating}
              onClick={appUpdate.applyUpdate}
              className="inline-flex items-center gap-1.5 rounded-full neon-cta px-3 py-1.5 text-[11px] font-black disabled:opacity-60 transition"
            >
              <RefreshCw
                className={`h-3 w-3 ${appUpdate.isUpdating ? 'animate-spin' : ''}`}
              />
              {appUpdate.isUpdating ? 'Aggiorno...' : 'Aggiorna app'}
            </button>
            <button
              type="button"
              onClick={appUpdate.dismissUpdate}
              aria-label="Chiudi avviso aggiornamento"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200/20 text-slate-300/60 hover:text-white transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="mx-auto w-full min-w-0 max-w-4xl px-4 py-4 sm:py-5">
        {activeTab === 'today' && (
          <TodayDashboard
            exercises={appState.exercises}
            sessionLogs={appState.sessionLogs}
            prescription={activePrescription}
            selectedPreset={appState.settings.selectedPreset}
            weeklyGoalDays={appState.settings.weeklyGoalDays}
            onSelectPreset={(preset) => updateSettings({ selectedPreset: preset })}
            onStartPrescribedSession={handleStartPrescribedSession}
            onOpenDiagnosticQuiz={() => setShowDiagnosticQuiz(true)}
          />
        )}

        {activeTab === 'programs' && (
          <ProgramsAndBuilder
            exercises={appState.exercises}
            sessionLogs={appState.sessionLogs}
            prescription={activePrescription}
            onOpenDiagnosticQuiz={() => setShowDiagnosticQuiz(true)}
            onNavigateToToday={() => setActiveTab('today')}
            onStartSingleExercise={handleStartSingleExercise}
            onCreateExercise={handleCreateExercise}
          />
        )}

        {activeTab === 'analytics' && (
          <AnalyticsView
            appState={appState}
            exercises={appState.exercises}
            sessionLogs={appState.sessionLogs}
            recordings={appState.feedRecordings}
            settings={appState.settings}
            onUpdateSettings={updateSettings}
            onToggleBenchmark={handleToggleBenchmark}
            onDeleteRecording={handleDeleteRecording}
            onImportState={(imported) => {
              setAppState(hydrateAppState(imported));
              showToast('Backup importato');
            }}
            onResetDemoData={handleResetDemoData}
            onOpenCloudModal={() => setShowCloudModal(true)}
            cloudUserEmail={cloudUser?.email ?? null}
          />
        )}

        {activeTab === 'tuner' && (
          <TunerAndCheatSheet
            initialMetronomeSound={appState.settings.metronomeSound ?? 'woodblock'}
            onChangeMetronomeSound={(sound) =>
              updateSettings({ metronomeSound: sound })
            }
          />
        )}
      </main>

      {/* Mobile Bottom Tab Bar (Chrome Rim + Neon Active) */}
      <nav className="fixed bottom-0 inset-x-0 z-30 flex sm:hidden flex-col border-t border-slate-200/20 bg-[#050608]/95 backdrop-blur-xl shadow-[0_-8px_28px_rgba(0,0,0,0.75)]">
        <div className="chrome-hairline w-full opacity-55" />
        <div className="flex">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-bold transition ${
                  active
                    ? 'text-[#39FF14] drop-shadow-[0_0_8px_rgba(57,255,20,0.55)]'
                    : 'text-slate-300/50 hover:text-slate-200'
                }`}
              >
                {active && (
                  <span className="absolute top-0 h-[2px] w-8 rounded-full bg-[#39FF14] shadow-[0_0_10px_rgba(57,255,20,0.9)]" />
                )}
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Live Guided Player */}
      {activeLivePlan && (
        <LiveWorkoutPlayer
          plan={activeLivePlan}
          sessionLogs={appState.sessionLogs}
          initialVisualOnly={appState.settings.visualMetronomeOnly}
          initialMetronomeSound={appState.settings.metronomeSound ?? 'woodblock'}
          onChangeMetronomeSound={(sound) =>
            updateSettings({ metronomeSound: sound })
          }
          onSaveProgress={handleSaveSessionProgress}
          onCompleteSession={handleCompleteSession}
          onCancel={() => setActiveLivePlan(null)}
        />
      )}

      {/* Cloud Sync & Google Account Modal */}
      <CloudSyncModal
        isOpen={showCloudModal}
        onClose={() => setShowCloudModal(false)}
        user={cloudUser}
        syncStatus={syncStatus}
        syncError={syncError}
        lastSyncedAt={appState.settings.lastSyncedAt}
        onForceSync={() => syncWithCloud()}
        onAuthConfigured={() => setAuthConfigVersion((v) => v + 1)}
      />
    </div>
  );
}

export default App;
