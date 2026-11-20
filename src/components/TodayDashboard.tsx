import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Play,
  RotateCcw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  Exercise,
  ScientificPlanPrescription,
  SessionDurationPreset,
  WorkoutSessionLog,
} from '../types/practice';
import { computeNerdTelemetry } from '../utils/nerdStats';
import {
  buildSessionPlanFromPrescription,
  computeFondamentaWeeklyGroups,
  computeWeeklyDoseProgress,
} from '../utils/scientificPrescription';
import {
  CoachVectorEmblem,
  IniziaButtonIllustration,
} from './PathIllustrations';

interface TodayDashboardProps {
  exercises: Exercise[];
  sessionLogs: WorkoutSessionLog[];
  prescription: ScientificPlanPrescription;
  selectedPreset: SessionDurationPreset;
  weeklyGoalDays: number;
  onSelectPreset: (preset: SessionDurationPreset) => void;
  onStartPrescribedSession: (
    preset: SessionDurationPreset,
    selectedExerciseIds?: string[]
  ) => void;
  onOpenDiagnosticQuiz: () => void;
}

const LAUNCHER_TIME_OPTIONS: {
  preset: SessionDurationPreset;
  title: string;
  sub: string;
}[] = [
  { preset: 5, title: '5 min', sub: '1 carente' },
  { preset: 15, title: '15 min', sub: '2 esercizi' },
  { preset: 30, title: '30 min', sub: '3 esercizi' },
  { preset: 45, title: '45 min', sub: 'Completo' },
];

const HOLD_DURATION_MS = 850;

export const TodayDashboard: React.FC<TodayDashboardProps> = ({
  exercises,
  sessionLogs,
  prescription,
  selectedPreset,
  weeklyGoalDays,
  onSelectPreset,
  onStartPrescribedSession,
  onOpenDiagnosticQuiz,
}) => {
  const nerd = useMemo(
    () => computeNerdTelemetry(exercises, sessionLogs, weeklyGoalDays, 'all'),
    [exercises, sessionLogs, weeklyGoalDays]
  );

  const weekly = useMemo(
    () => computeWeeklyDoseProgress(prescription, exercises, sessionLogs),
    [prescription, exercises, sessionLogs]
  );

  const fondamentaGroups = useMemo(
    () => computeFondamentaWeeklyGroups(prescription, exercises, sessionLogs),
    [prescription, exercises, sessionLogs]
  );

  // Post-hold Tactical Session Launcher state
  const [showLauncher, setShowLauncher] = useState(false);
  const [launcherPreset, setLauncherPreset] =
    useState<SessionDurationPreset>(selectedPreset);
  const [customSelectedIds, setCustomSelectedIds] = useState<string[] | null>(
    null
  );

  const previewPlan = useMemo(
    () =>
      buildSessionPlanFromPrescription(
        prescription,
        exercises,
        sessionLogs,
        launcherPreset,
        customSelectedIds ?? undefined
      ),
    [prescription, exercises, sessionLogs, launcherPreset, customSelectedIds]
  );

  const activeLauncherIds = useMemo(
    () => new Set(previewPlan.items.map((it) => it.exerciseId)),
    [previewPlan]
  );

  const topDeficitGroup = useMemo(() => {
    const incomplete = fondamentaGroups.filter((g) => !g.minReached);
    if (incomplete.length === 0) return fondamentaGroups[0];
    return [...incomplete].sort(
      (a, b) =>
        b.weeklyMinSets -
        b.completedSets -
        (a.weeklyMinSets - a.completedSets)
    )[0];
  }, [fondamentaGroups]);

  const plekHeadline =
    weekly.totalMissingForMin > 0
      ? `Mancano ${weekly.totalMissingForMin} serie al minimo.`
      : 'Minimo settimanale raggiunto.';
  const plekSub =
    weekly.totalMissingForMin > 0 && topDeficitGroup
      ? `Oggi partiamo da ${topDeficitGroup.title}.`
      : 'Tieni premuto Inizia per allenarti.';

  // Hold-to-start circle animation (0..1)
  const [holdProgress, setHoldProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const holdStartRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const triggeredRef = useRef(false);

  const cancelHold = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    holdStartRef.current = null;
    setIsHolding(false);
    setHoldProgress(0);
  }, []);

  const openSessionLauncher = useCallback(() => {
    setLauncherPreset(selectedPreset);
    setCustomSelectedIds(null);
    setShowLauncher(true);
  }, [selectedPreset]);

  const openTodoLauncher = useCallback(
    (exerciseIds: string[]) => {
      setLauncherPreset(selectedPreset);
      setCustomSelectedIds(exerciseIds);
      setShowLauncher(true);
    },
    [selectedPreset]
  );

  const completedGroups = fondamentaGroups.filter((g) => g.minReached).length;
  const todoGroups = useMemo(
    () =>
      [...fondamentaGroups].sort(
        (a, b) => Number(a.minReached) - Number(b.minReached)
      ),
    [fondamentaGroups]
  );

  const beginHold = useCallback(() => {
    cancelHold();
    triggeredRef.current = false;
    setIsHolding(true);
    holdStartRef.current = performance.now();

    const tick = (now: number) => {
      if (holdStartRef.current === null) return;
      const elapsed = now - holdStartRef.current;
      const pct = Math.min(1, elapsed / HOLD_DURATION_MS);
      setHoldProgress(pct);

      if (pct >= 1) {
        if (!triggeredRef.current) {
          triggeredRef.current = true;
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try {
              navigator.vibrate(35);
            } catch {
              // Ignore if unsupported
            }
          }
          cancelHold();
          openSessionLauncher();
        }
        return;
      }

      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
  }, [cancelHold, openSessionLauncher]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const handleToggleExerciseInLauncher = (exerciseId: string) => {
    const currentList = Array.from(activeLauncherIds);
    const exists = currentList.includes(exerciseId);
    if (exists) {
      if (currentList.length <= 1) return; // keep at least 1 exercise
      setCustomSelectedIds(currentList.filter((id) => id !== exerciseId));
    } else {
      setCustomSelectedIds([...currentList, exerciseId]);
    }
  };

  // Large circular button geometry (kept strictly above the fold on 688px viewports)
  const ringRadius = 104;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference * (1 - holdProgress);

  return (
    <div className="space-y-4">
      {/* Compact Week Strip + Coach Plek (Pitch Black + White Border; Orange Vector Accents) */}
      <section className="relative overflow-hidden rounded-3xl bg-black border border-white/15 p-3.5 space-y-2.5">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 left-1/2 h-36 w-48 -translate-x-1/2 rounded-full bg-[#FF6B00]/10 blur-3xl"
        />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-b border-white/15 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-white/55">
              La tua settimana
            </span>
            <button
              type="button"
              onClick={onOpenDiagnosticQuiz}
              className="inline-flex items-center gap-1 rounded-full bg-black border border-white/15 px-2.5 py-0.5 text-[10px] font-bold text-white/60 hover:text-white hover:border-white/35 transition"
            >
              <RotateCcw className="h-2.5 w-2.5" /> Quiz
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {nerd.weekDaysStatus.map((day) => (
              <div key={day.dateKey} className="flex flex-col items-center gap-0.5">
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black transition ${
                    day.completed
                      ? 'bg-white text-black'
                      : day.isToday
                      ? 'border border-white bg-black text-white'
                      : 'border border-white/15 bg-black text-white/40'
                  }`}
                >
                  {day.completed ? <Check className="h-3 w-3 stroke-[3]" /> : day.label[0]}
                </div>
                <span
                  className={`text-[9px] font-semibold ${
                    day.isToday ? 'text-white' : 'text-white/45'
                  }`}
                >
                  {day.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-start gap-3">
          {/* Vector Coach Emblem */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#080808] border border-white/15">
            <CoachVectorEmblem className="h-6 w-6" />
          </div>

          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#FF6B00]">
              {prescription.profileTitle}
            </span>
            <h1 className="text-sm font-bold text-white leading-snug">
              {plekHeadline}
            </h1>
            <p className="mt-0.5 text-[11px] text-white/55 leading-snug">
              {plekSub}
            </p>
          </div>
        </div>
      </section>

      {/* ABOVE THE FOLD: Large Circular Dark-Vector Hold-to-Start "Inizia" Button */}
      <section className="flex flex-col items-center justify-center py-2">
        <div className="relative flex items-center justify-center">
          <svg
            viewBox="0 0 220 220"
            className="pointer-events-none h-[220px] w-[220px] -rotate-90"
            aria-hidden="true"
          >
            <circle
              cx="110"
              cy="110"
              r={ringRadius}
              fill="none"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth="2.5"
            />
            <circle
              cx="110"
              cy="110"
              r={ringRadius}
              fill="none"
              stroke="#FF6B00"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeDasharray={ringCircumference}
              strokeDashoffset={ringDashOffset}
            />
          </svg>

          <button
            type="button"
            onPointerDown={beginHold}
            onPointerUp={cancelHold}
            onPointerLeave={cancelHold}
            onPointerCancel={cancelHold}
            onKeyDown={(e) => {
              if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
                e.preventDefault();
                beginHold();
              }
            }}
            onKeyUp={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                cancelHold();
              }
            }}
            onContextMenu={(e) => e.preventDefault()}
            aria-label="Inizia"
            style={{
              transform: isHolding
                ? `scale(${0.96 + holdProgress * 0.06})`
                : 'scale(1)',
              boxShadow: isHolding
                ? `0 0 ${28 + holdProgress * 44}px rgba(255, 107, 0, ${0.38 + holdProgress * 0.48})`
                : '0 0 28px rgba(255, 107, 0, 0.16)',
            }}
            className="absolute flex h-48 w-48 sm:h-50 sm:w-50 select-none touch-none items-center justify-center overflow-hidden rounded-full border border-white/20 bg-[#060606] text-white transition-transform duration-75 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
          >
            <span
              aria-hidden="true"
              style={{
                transform: `scale(${holdProgress})`,
                opacity: isHolding ? 0.14 : 0,
              }}
              className="pointer-events-none absolute inset-0 z-20 rounded-full bg-[#FF6B00] transition-opacity duration-100"
            />
            <IniziaButtonIllustration
              isHolding={isHolding}
              holdProgress={holdProgress}
            />
          </button>
        </div>
      </section>

      {/* BELOW INIZIA: Gamified Ultra-Minimal Weekly To-Do List */}
      <section className="space-y-2.5 pt-1">
        <div className="space-y-2 px-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-white/60">
                To-Do Settimana
              </span>
              <span className="rounded-full border border-white/15 bg-black px-2 py-0.5 text-[10px] font-black text-white tabular-nums">
                {completedGroups}/{fondamentaGroups.length} completati
              </span>
            </div>

            <button
              type="button"
              onClick={onOpenDiagnosticQuiz}
              className="inline-flex items-center gap-1.5 rounded-full bg-black border border-white/15 px-3 py-1 text-[11px] font-bold text-white/75 hover:text-white hover:border-white/40 transition"
            >
              <SlidersHorizontal className="h-3 w-3" />
              Ricalibra
            </button>
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-[#FF6B00] transition-all duration-300"
              style={{ width: `${weekly.overallMinPct}%` }}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          {todoGroups.map((group) => {
            const totalTicks = Math.min(10, Math.max(1, group.weeklyMinSets));
            const filledTicks =
              group.weeklyMinSets > 0
                ? Math.min(
                    totalTicks,
                    Math.round(
                      (group.completedSets / group.weeklyMinSets) * totalTicks
                    )
                  )
                : 0;

            return (
              <button
                key={group.fondamentaId}
                type="button"
                onClick={() =>
                  openTodoLauncher(group.items.map((it) => it.exercise.id))
                }
                className="flex w-full items-center justify-between gap-3 rounded-2xl bg-black border border-white/15 px-3.5 py-2.5 text-left hover:border-white/40 active:scale-[0.99] transition"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  {group.minReached ? (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-black">
                      <Check className="h-3 w-3 stroke-[3]" />
                    </span>
                  ) : group.completedSets > 0 ? (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#FF6B00]">
                      <span className="h-2 w-2 rounded-full bg-[#FF6B00]" />
                    </span>
                  ) : (
                    <span className="h-5 w-5 shrink-0 rounded-full border border-white/25" />
                  )}

                  <span
                    className={`truncate text-xs sm:text-sm font-black ${
                      group.minReached ? 'line-through text-white/45' : 'text-white'
                    }`}
                  >
                    {group.title}
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-2.5">
                  <div className="flex items-center gap-0.5" aria-hidden="true">
                    {Array.from({ length: totalTicks }, (_, idx) => {
                      const filled = idx < filledTicks;
                      return (
                        <span
                          key={idx}
                          className={`h-2.5 w-1.5 rounded-sm transition-colors ${
                            group.minReached
                              ? 'bg-white'
                              : filled
                              ? 'bg-[#FF6B00]'
                              : 'bg-white/15'
                          }`}
                        />
                      );
                    })}
                  </div>

                  <span className="text-[11px] font-black text-white/80 tabular-nums">
                    {group.completedSets}/{group.weeklyMinSets}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* POST-HOLD TACTICAL SESSION LAUNCHER (Appears ONLY after holding "Inizia") */}
      {showLauncher && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/90 backdrop-blur-md p-2 sm:p-4 overscroll-none">
          <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto overscroll-contain rounded-2xl bg-black border border-white/20 p-4 sm:p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-3">
              <h2 className="text-base sm:text-lg font-black text-white">
                Allenamento di oggi
              </h2>
              <button
                type="button"
                onClick={() => setShowLauncher(false)}
                aria-label="Chiudi configurazione"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-white/70 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 1. Quanto tempo hai adesso? */}
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-white/60">
                Quanto tempo hai?
              </div>
              <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-black border border-white/15 p-1">
                {LAUNCHER_TIME_OPTIONS.map((opt) => {
                  const active = launcherPreset === opt.preset;
                  return (
                    <button
                      key={opt.preset}
                      type="button"
                      onClick={() => {
                        setLauncherPreset(opt.preset);
                        onSelectPreset(opt.preset);
                        setCustomSelectedIds(null);
                      }}
                      className={`rounded-lg py-2 px-1 text-center transition ${
                        active
                          ? 'bg-white text-black'
                          : 'text-white/55 hover:text-white'
                      }`}
                    >
                      <div className="text-xs sm:text-sm font-black tabular-nums">
                        {opt.title}
                      </div>
                      <div
                        className={`text-[9px] font-semibold ${
                          active ? 'text-black/75' : 'text-white/45'
                        }`}
                      >
                        {opt.sub}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Exercises to Train Today */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-white/60">
                  Esercizi di oggi
                </span>
                <span className="text-[10px] font-bold text-white/45">
                  Tocca per scegliere
                </span>
              </div>

              <div className="space-y-1.5">
                {weekly.items.map((wItem) => {
                  const isSelected = activeLauncherIds.has(wItem.exercise.id);
                  const plannedItem = previewPlan.items.find(
                    (p) => p.exerciseId === wItem.exercise.id
                  );
                  const plannedSets = plannedItem?.sets ?? wItem.dose.setsPerSession;

                  return (
                    <button
                      key={wItem.exercise.id}
                      type="button"
                      onClick={() =>
                        handleToggleExerciseInLauncher(wItem.exercise.id)
                      }
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition ${
                        isSelected
                          ? 'bg-white text-black border-white'
                          : 'bg-black text-white border-white/15 hover:border-white/40'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs sm:text-sm font-black">
                          {wItem.exercise.title}
                        </div>
                        <div
                          className={`text-[11px] font-medium tabular-nums ${
                            isSelected ? 'text-black/75' : 'text-white/55'
                          }`}
                        >
                          {wItem.exercise.pillarName ? `${wItem.exercise.pillarName} • ` : ''}
                          {wItem.completedSets}/{wItem.weeklyMinSets} min
                          {isSelected ? ` • +${plannedSets} oggi` : ''}
                        </div>
                      </div>

                      <div
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                          isSelected
                            ? 'border-black bg-black text-white'
                            : 'border-white/25'
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowLauncher(false);
                onStartPrescribedSession(
                  launcherPreset,
                  customSelectedIds ?? previewPlan.items.map((i) => i.exerciseId)
                );
              }}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#FF6B00] px-5 py-3 text-sm sm:text-base font-black text-black hover:bg-[#ff7d1f] transition"
            >
              <Play className="h-4 w-4 fill-current" />
              Avvia Allenamento ({previewPlan.estimatedMinutes} min)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
