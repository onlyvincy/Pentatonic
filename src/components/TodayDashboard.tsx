import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Play,
  RotateCcw,
  SlidersHorizontal,
  UserPlus,
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
  computeWeeklyDoseProgress,
} from '../utils/scientificPrescription';

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
  onCreateCleanProfile: () => void;
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
  onCreateCleanProfile,
}) => {
  const nerd = useMemo(
    () => computeNerdTelemetry(exercises, sessionLogs, weeklyGoalDays, 'all'),
    [exercises, sessionLogs, weeklyGoalDays]
  );

  const weekly = useMemo(
    () => computeWeeklyDoseProgress(prescription, exercises, sessionLogs),
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

  const topDeficitItem = weekly.items[0];
  const plekHeadline =
    weekly.totalMissingForMin > 0
      ? `Mancano ${weekly.totalMissingForMin} serie al minimo.`
      : 'Minimo settimanale raggiunto.';
  const plekSub =
    weekly.totalMissingForMin > 0 && topDeficitItem
      ? `Oggi partiamo da ${topDeficitItem.exercise.pillarName || topDeficitItem.exercise.title}.`
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
    (exerciseId: string) => {
      setLauncherPreset(selectedPreset);
      setCustomSelectedIds([exerciseId]);
      setShowLauncher(true);
    },
    [selectedPreset]
  );

  const completedMissions = weekly.items.filter((i) => i.minReached).length;
  const todoItems = useMemo(
    () =>
      [...weekly.items].sort(
        (a, b) => Number(a.minReached) - Number(b.minReached)
      ),
    [weekly.items]
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
      {/* Compact Week Strip + Coach Plek (Pitch Black + White Border; Orange ONLY on Plek Logo) */}
      <section className="rounded-2xl bg-black border border-white/15 p-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/15 pb-2">
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
            <button
              type="button"
              onClick={onCreateCleanProfile}
              className="inline-flex items-center gap-1 rounded-full bg-black border border-white/15 px-2.5 py-0.5 text-[10px] font-bold text-white/60 hover:text-white hover:border-white/35 transition"
            >
              <UserPlus className="h-2.5 w-2.5 text-[#FF6B00]" /> Nuovo Profilo
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

        <div className="flex items-start gap-3">
          {/* Coach Plek Logo (Orange accent) */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black border border-[#FF6B00]/50">
            <svg viewBox="0 0 40 40" className="h-6 w-6">
              <path
                d="M20 4C11 4 6 10 6 18C6 27 16 36 20 37C24 36 34 27 34 18C34 10 29 4 20 4Z"
                fill="#FF6B00"
              />
              <circle cx="15" cy="16" r="2.3" fill="#000000" />
              <circle cx="25" cy="16" r="2.3" fill="#000000" />
              <path
                d="M15 23C17 25.5 23 25.5 25 23"
                stroke="#000000"
                strokeWidth="2.2"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </div>

          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-black uppercase tracking-[0.14em] text-white/50">
              COACH PLEK
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

      {/* ABOVE THE FOLD: Large Circular Animated Hold-to-Start "Inizia" Button */}
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
              stroke="rgba(255,255,255,0.16)"
              strokeWidth="3"
            />
            <circle
              cx="110"
              cy="110"
              r={ringRadius}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={ringCircumference}
              strokeDashoffset={ringDashOffset}
            />
          </svg>

          {/* Larger Round Orange Button — Black Electric Guitar Silhouette + Curved "INIZIA" */}
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
                ? `scale(${0.95 + holdProgress * 0.08})`
                : 'scale(1)',
              boxShadow: isHolding
                ? `0 0 ${28 + holdProgress * 46}px rgba(255, 107, 0, ${0.42 + holdProgress * 0.48})`
                : '0 0 32px rgba(255, 107, 0, 0.24)',
            }}
            className="absolute flex h-48 w-48 sm:h-50 sm:w-50 select-none touch-none items-center justify-center overflow-hidden rounded-full bg-[#FF6B00] text-black transition-transform duration-75 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <span
              aria-hidden="true"
              style={{
                transform: `scale(${holdProgress})`,
                opacity: isHolding ? 0.3 : 0,
              }}
              className="pointer-events-none absolute inset-0 rounded-full bg-white transition-opacity duration-100"
            />
            <svg
              viewBox="0 0 200 200"
              className="pointer-events-none relative z-10 h-full w-full"
              aria-hidden="true"
            >
              <defs>
                <path
                  id="inizia-bottom-arc"
                  d="M 28,118 A 74,74 0 0,0 172,118"
                  fill="none"
                />
              </defs>

              {/* Central Large Black Electric Guitar Silhouette */}
              <g transform="translate(100 84) rotate(-32) scale(0.96) translate(-100 -84)">
                {/* Double-Cutaway Contoured Electric Guitar Body */}
                <path
                  d="M 95,74 C 90,74 87,64 81,64 C 75,64 73,74 77,84 C 81,92 84,96 81,103 C 75,113 69,122 72,134 C 75,144 87,148 100,148 C 114,148 125,143 128,132 C 130,120 123,112 118,102 C 115,96 116,90 120,82 C 123,75 119,69 114,70 C 109,71 107,79 105,79 L 104,74 Z"
                  fill="#000000"
                />
                {/* Tapered Neck */}
                <path d="M 96.5,37 L 103.5,37 L 104.8,76 L 95.2,76 Z" fill="#000000" />
                {/* 6-Inline Angled Electric Headstock */}
                <path
                  d="M 96,37 L 95,21 C 95,14 103,11 108,15 C 111,18 110,25 106,29 L 104,37 Z"
                  fill="#000000"
                />
                {/* Tuning Peg Silhouettes */}
                <circle cx="92.5" cy="21" r="1.7" fill="#000000" />
                <circle cx="92.5" cy="25.5" r="1.7" fill="#000000" />
                <circle cx="93" cy="30" r="1.7" fill="#000000" />
                <circle cx="93.5" cy="34.5" r="1.7" fill="#000000" />
                {/* Pickup & Bridge Details in Negative Orange */}
                <rect x="93.5" y="88" width="13" height="4" rx="1.5" fill="#FF6B00" />
                <rect x="92.5" y="100" width="15" height="4.5" rx="1.5" fill="#FF6B00" />
                <rect x="91" y="114" width="18" height="7" rx="2" fill="#FF6B00" />
                <circle cx="117" cy="127" r="2.2" fill="#FF6B00" />
                <circle cx="112" cy="134" r="2.2" fill="#FF6B00" />
              </g>

              {/* Arched "INIZIA" text curving along bottom circle contour */}
              <text
                fill="#000000"
                fontSize="21"
                fontWeight="900"
                letterSpacing="0.24em"
                className="font-brand uppercase"
              >
                <textPath
                  href="#inizia-bottom-arc"
                  startOffset="50%"
                  textAnchor="middle"
                >
                  INIZIA
                </textPath>
              </text>
            </svg>
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
                {completedMissions}/{weekly.items.length} completati
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
          {todoItems.map((item) => (
            <button
              key={item.exercise.id}
              type="button"
              onClick={() => openTodoLauncher(item.exercise.id)}
              className="flex w-full items-center justify-between gap-3 rounded-2xl bg-black border border-white/15 px-3.5 py-2.5 text-left hover:border-white/40 active:scale-[0.99] transition"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                {item.minReached ? (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-black">
                    <Check className="h-3 w-3 stroke-[3]" />
                  </span>
                ) : item.completedSets > 0 ? (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[#FF6B00]">
                    <span className="h-2 w-2 rounded-full bg-[#FF6B00]" />
                  </span>
                ) : (
                  <span className="h-5 w-5 shrink-0 rounded-full border border-white/25" />
                )}

                <span
                  className={`truncate text-xs sm:text-sm font-black ${
                    item.minReached ? 'line-through text-white/45' : 'text-white'
                  }`}
                >
                  {item.exercise.pillarName || item.exercise.title}
                </span>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <div className="flex items-center gap-0.5" aria-hidden="true">
                  {Array.from({ length: item.weeklyMinSets }, (_, idx) => {
                    const filled = idx < item.completedSets;
                    return (
                      <span
                        key={idx}
                        className={`h-2.5 w-1.5 rounded-sm transition-colors ${
                          item.minReached
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
                  {item.completedSets}/{item.weeklyMinSets}
                </span>

                <span className="rounded-lg border border-white/15 bg-black px-1.5 py-0.5 text-[10px] font-black text-[#FF6B00] tabular-nums">
                  {item.mastery.weightedBpm} BPM
                </span>

                <span className="rounded-lg border border-white/15 bg-black px-1.5 py-0.5 text-[10px] font-black text-white tabular-nums">
                  Lv. {item.mastery.level}
                </span>
              </div>
            </button>
          ))}
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
                          {wItem.exercise.pillarName || wItem.exercise.title}
                        </div>
                        <div
                          className={`text-[11px] font-medium tabular-nums ${
                            isSelected ? 'text-black/75' : 'text-white/55'
                          }`}
                        >
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
