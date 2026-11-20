import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Compass,
  Flame,
  Radio,
} from 'lucide-react';
import {
  AppState,
  Exercise,
  FeedRecording,
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
  ensureSeededMediaBlobs,
} from './data/scientificSeed';
import {
  clearAllRecordingBlobs,
  deleteRecordingBlob,
  loadPersistedState,
  savePersistedState,
} from './services/storage';
import {
  buildSessionPlanFromPrescription,
  createDefaultScientificPrescription,
  generateScientificPrescription,
} from './utils/scientificPrescription';
import { computeWeightedExerciseBpm } from './utils/overloadEngine';
import { computeNerdTelemetry } from './utils/nerdStats';
import { TodayDashboard } from './components/TodayDashboard';
import { ProgramsAndBuilder } from './components/ProgramsAndBuilder';
import { TunerAndCheatSheet } from './components/TunerAndCheatSheet';
import { AnalyticsView } from './components/AnalyticsView';
import { LiveWorkoutPlayer } from './components/LiveWorkoutPlayer';
import { OnboardingFlow } from './components/OnboardingFlow';

export type NavTab = 'today' | 'programs' | 'analytics' | 'tuner';

export function App() {
  const [appState, setAppState] = useState<AppState>(() => {
    const saved = loadPersistedState();
    if (!saved) return createInitialAppState();
    const seedById = new Map(SEED_EXERCISES.map((ex) => [ex.id, ex]));
    const hydratedExercises = saved.exercises.map((ex) => {
      const seed = seedById.get(ex.id);
      if (!seed) return ex;
      return {
        ...ex,
        title: seed.title,
        description: seed.description,
        scientificRationale: seed.scientificRationale,
        subdivision: seed.subdivision,
        fretboardNotes: seed.fretboardNotes,
        demoSequence: seed.demoSequence,
        variants: seed.variants,
        activeVariantId: ex.activeVariantId ?? seed.activeVariantId,
      };
    });
    const hydratedPlan = saved.settings.scientificPlan
      ? generateScientificPrescription(
          saved.settings.scientificPlan.answers,
          hydratedExercises
        )
      : createDefaultScientificPrescription(
          hydratedExercises,
          saved.settings.activeProgramId,
          saved.settings.selectedPreset
        );

    return {
      ...saved,
      exercises: hydratedExercises,
      settings: {
        ...saved.settings,
        scientificPlan: hydratedPlan,
      },
    };
  });

  const [activeTab, setActiveTab] = useState<NavTab>('today');
  const [activeLivePlan, setActiveLivePlan] =
    useState<ScaledWorkoutPlan | null>(null);
  const [showDiagnosticQuiz, setShowDiagnosticQuiz] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (appState.feedRecordings.some((r) => r.isSyntheticDemo)) {
      ensureSeededMediaBlobs().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    savePersistedState(appState);
  }, [appState]);

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
    setAppState((prev) => ({
      ...prev,
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

    if (launchWorkoutNow) {
      setActiveLivePlan(
        buildSessionPlanFromPrescription(
          prescription,
          appState.exercises,
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
    const startTargetBpm = computeWeightedExerciseBpm(
      exercise,
      appState.sessionLogs,
      preferredVariantId
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

  const handleCompleteSession = (
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
  ) => {
    setAppState((prev) => ({
      ...prev,
      sessionLogs: [sessionLog, ...prev.sessionLogs],
      feedRecordings: [...newRecordings, ...prev.feedRecordings],
      exercises: prev.exercises.map((ex) => {
        const upd = updatedBpmByExercise[ex.id];
        if (!upd) return ex;
        return {
          ...ex,
          currentTargetBpm: upd.targetBpm,
          bestCleanBpm:
            upd.bestCleanBpm && upd.bestCleanBpm > ex.bestCleanBpm
              ? upd.bestCleanBpm
              : ex.bestCleanBpm,
          activeVariantId: upd.activeVariantId ?? ex.activeVariantId,
          variantBpms: upd.variantBpms
            ? { ...(ex.variantBpms ?? {}), ...upd.variantBpms }
            : ex.variantBpms,
        };
      }),
    }));
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
    const fresh = createInitialAppState();
    setAppState(fresh);
    await ensureSeededMediaBlobs();
    showToast('Dati ripristinati');
  };

  const handleCreateCleanProfile = async () => {
    await clearAllRecordingBlobs();
    const clean = createCleanProfileAppState();
    setAppState(clean);
    setActiveLivePlan(null);
    setShowDiagnosticQuiz(true);
    showToast('Nuovo profilo creato • Zero dati di test');
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
      <OnboardingFlow
        exercises={appState.exercises}
        onFinishQuiz={handleFinishQuiz}
        onCancel={
          appState.settings.hasCompletedOnboarding
            ? () => setShowDiagnosticQuiz(false)
            : undefined
        }
      />
    );
  }

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-black text-white pb-24 sm:pb-10">
      {/* Clean Top Bar */}
      <header className="sticky top-0 z-30 border-b border-white/15 bg-black/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2.5 shrink-0">
            <img
              src="/icon.svg"
              alt="PENTATONIC"
              className="h-8 w-8 rounded-xl shrink-0"
            />
            <span className="font-brand text-sm text-white whitespace-nowrap">
              PENTATONIC<span className="text-[#FF6B00] ml-0.5">•</span>
            </span>
          </div>

          {/* Desktop 4 Clear Tabs (Minimal B&W) */}
          <nav className="hidden sm:flex items-center gap-1 rounded-full bg-black border border-white/15 p-1">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold transition ${
                    active
                      ? 'bg-white text-black'
                      : 'text-white/55 hover:text-white'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Minimal Streak Pill */}
          <div className="flex items-center gap-1.5 rounded-full bg-black border border-white/15 px-3 py-1.5 text-xs font-bold text-white tabular-nums">
            <Flame className="h-3.5 w-3.5 text-white" />
            <span>{nerd.currentStreakDays} di fila</span>
          </div>
        </div>
      </header>

      {toastMessage && (
        <div className="fixed top-16 right-4 z-40 rounded-full bg-black border border-white/30 px-4 py-2 text-xs font-bold text-white shadow-2xl">
          {toastMessage}
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
            onCreateCleanProfile={handleCreateCleanProfile}
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
              setAppState(imported);
              showToast('Backup importato');
            }}
            onResetDemoData={handleResetDemoData}
            onCreateCleanProfile={handleCreateCleanProfile}
          />
        )}

        {activeTab === 'tuner' && <TunerAndCheatSheet />}
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="fixed bottom-0 inset-x-0 z-30 flex sm:hidden border-t border-white/15 bg-black/95 backdrop-blur-xl">
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-bold transition ${
                active ? 'text-white' : 'text-white/45'
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          );
        })}
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
          onCompleteSession={handleCompleteSession}
          onCancel={() => setActiveLivePlan(null)}
        />
      )}
    </div>
  );
}

export default App;
