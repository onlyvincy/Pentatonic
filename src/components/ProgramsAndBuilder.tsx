import React, { useMemo, useState } from 'react';
import { Play, Plus, RotateCcw, X } from 'lucide-react';
import {
  Exercise,
  ExerciseCategory,
  FretNote,
  GapClickMode,
  ScientificPlanPrescription,
  Subdivision,
  WorkoutSessionLog,
} from '../types/practice';
import {
  computeFondamentaWeeklyGroups,
  computeWeeklyDoseProgress,
  resolvePathId,
} from '../utils/scientificPrescription';
import {
  getLevelFilteredVariants,
  getStartingBpmForLevel,
} from '../utils/overloadEngine';
import {
  ARPEGGIO_EXERCISE_ID,
  ARPEGGIO_PROGRESSIONS,
  buildArpeggioWorkoutData,
  pickRecommendedProgression,
} from '../utils/arpeggioEngine';
import { FretboardViewer } from './FretboardViewer';
import { PathIllustration } from './PathIllustrations';

interface ProgramsAndBuilderProps {
  exercises: Exercise[];
  sessionLogs: WorkoutSessionLog[];
  prescription: ScientificPlanPrescription;
  onOpenDiagnosticQuiz: () => void;
  onNavigateToToday?: () => void;
  onStartSingleExercise: (
    exercise: Exercise,
    preferredVariantId?: string
  ) => void;
  onCreateExercise: (ex: Exercise) => void;
}

const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  picking: 'Velocità',
  fretboard: 'Precisione',
  legato: 'Espressività',
  pentatonic: 'Visione',
  rhythm: 'Groove & Timing',
};

export const ProgramsAndBuilder: React.FC<ProgramsAndBuilderProps> = ({
  exercises,
  sessionLogs,
  prescription,
  onOpenDiagnosticQuiz,
  onStartSingleExercise,
  onCreateExercise,
}) => {
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [activeExId, setActiveExId] = useState<string | null>(null);
  const [selectedVariantByEx, setSelectedVariantByEx] = useState<
    Record<string, string>
  >({});
  const [speedBurstByEx, setSpeedBurstByEx] = useState<Record<string, boolean>>(
    {}
  );
  const [selectedArpeggioProgId, setSelectedArpeggioProgId] = useState<string>(
    () => pickRecommendedProgression(sessionLogs.length).id
  );

  const [exTitle, setExTitle] = useState('');
  const [exCategory, setExCategory] = useState<ExerciseCategory>('pentatonic');
  const [exBpm, setExBpm] = useState(() =>
    getStartingBpmForLevel(prescription.answers.level)
  );
  const [exSub, setExSub] = useState<Subdivision>('1/8');
  const [exGap, setExGap] = useState<GapClickMode>('off');
  const [exNotes, setExNotes] = useState<FretNote[]>([
    { string: 6, fret: 5, label: 'R', isRoot: true, finger: '1' },
    { string: 6, fret: 8, label: 'b3', finger: '4' },
  ]);

  const weekly = useMemo(
    () => computeWeeklyDoseProgress(prescription, exercises, sessionLogs),
    [prescription, exercises, sessionLogs]
  );

  const fondamentaGroups = useMemo(
    () => computeFondamentaWeeklyGroups(prescription, exercises, sessionLogs),
    [prescription, exercises, sessionLogs]
  );

  const activeSelection = useMemo(() => {
    if (!activeExId) return null;
    for (const group of fondamentaGroups) {
      const found = group.items.find((it) => it.exercise.id === activeExId);
      if (found) {
        return { group, item: found };
      }
    }
    return null;
  }, [activeExId, fondamentaGroups]);

  const handleToggleFretNote = (
    stringNum: 1 | 2 | 3 | 4 | 5 | 6,
    fret: number
  ) => {
    setExNotes((prev) => {
      const exists = prev.some(
        (n) => n.string === stringNum && n.fret === fret
      );
      if (exists) {
        return prev.filter(
          (n) => !(n.string === stringNum && n.fret === fret)
        );
      }
      return [
        ...prev,
        {
          string: stringNum,
          fret,
          label: prev.length === 0 ? 'R' : '•',
          isRoot: prev.length === 0,
          finger: '1',
        },
      ];
    });
  };

  const submitNewExercise = (e: React.FormEvent) => {
    e.preventDefault();
    if (!exTitle.trim()) return;
    const baseSteps =
      exNotes.length > 0
        ? Array.from({ length: 8 }, (_, idx) => ({
            notes: [exNotes[idx % exNotes.length]],
          }))
        : [];

    const newEx: Exercise = {
      id: `ex-custom-${Date.now()}`,
      pillarName: CATEGORY_LABELS[exCategory],
      title: exTitle.trim(),
      category: exCategory,
      description: 'Esercizio personalizzato 4/4.',
      scientificRationale: '',
      coachingCues: [],
      defaultBpm: exBpm,
      currentTargetBpm: exBpm,
      baselineBpm: exBpm,
      bestCleanBpm: exBpm,
      defaultSets: 3,
      defaultSetDurationSec: 90,
      defaultRestSec: 15,
      subdivision: exSub,
      gapClickMode: exGap,
      fretboardNotes: exNotes,
      demoSequence: baseSteps,
      isBenchmark: true,
      isCustom: true,
    };
    onCreateExercise(newEx);
    setExTitle('');
    setShowExerciseModal(false);
  };

  const overallOpt = Math.max(1, weekly.totalOptimalSets);
  const overallFillPct = Math.min(
    100,
    Math.round((weekly.totalCompletedSets / overallOpt) * 100)
  );
  const overallMinMarkerPct = Math.min(
    96,
    Math.max(8, Math.round((weekly.totalMinSets / overallOpt) * 100))
  );
  const overallOptimalReached =
    weekly.totalOptimalSets > 0 &&
    weekly.totalCompletedSets >= weekly.totalOptimalSets;
  const overallMinReached =
    weekly.totalMinSets > 0 && weekly.totalCompletedSets >= weekly.totalMinSets;
  const overallBarColor = overallOptimalReached
    ? 'bg-[#39FF14]'
    : overallMinReached
    ? 'bg-white'
    : 'bg-[#39FF14]';
  const activePathId = resolvePathId(prescription.answers);

  return (
    <div className="space-y-8 pb-4">
      {/* MAIN GOAL: LARGE VERTICAL RECTANGULAR CHROME CARD */}
      <section className="pt-1">
        <div className="relative mx-auto flex aspect-[3/4] w-full max-w-[320px] sm:max-w-[340px] flex-col justify-between overflow-hidden rounded-3xl chrome-card p-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-[#39FF14]/15 blur-3xl"
          />

          <div className="relative z-10 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#39FF14] drop-shadow-[0_0_8px_rgba(57,255,20,0.45)]">
              Obiettivo
            </span>
            <button
              type="button"
              onClick={onOpenDiagnosticQuiz}
              aria-label="Cambia obiettivo"
              title="Cambia obiettivo"
              className="flex h-8 w-8 items-center justify-center rounded-full chrome-pill text-slate-300 hover:text-white transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="relative z-10 my-auto flex flex-col items-start gap-4 py-2">
            <div className="w-full overflow-hidden rounded-2xl border border-slate-200/15 bg-[#050608]/85 px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
              <PathIllustration
                pathId={activePathId}
                className="mx-auto h-32 sm:h-36 w-full"
              />
            </div>
            <h1 className="text-3xl sm:text-[34px] font-black tracking-tight leading-[1.08] chrome-text">
              {prescription.profileTitle}
            </h1>
          </div>

          <div className="relative z-10 space-y-2.5">
            <div className="flex items-baseline justify-between tabular-nums">
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-white">
                  {weekly.totalCompletedSets}
                </span>
                <span className="text-xs font-bold text-white/45">
                  /{weekly.totalMinSets} min
                </span>
              </div>
              <span className="text-[11px] font-bold text-white/35">
                ott {weekly.totalOptimalSets}
              </span>
            </div>

            <div className="relative h-1.5 w-full rounded-full bg-white/15">
              <div
                className={`h-full rounded-full transition-all duration-300 ${overallBarColor}`}
                style={{ width: `${overallFillPct}%` }}
              />
              <div
                className="absolute -top-0.5 h-2.5 w-0.5 rounded-full bg-white"
                style={{ left: `${overallMinMarkerPct}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* WEEKLY PLANNED EXERCISES: FONDAMENTA -> ESERCIZIO -> SERIE FATTE / MIN / OTT */}
      <div className="space-y-6">
        {fondamentaGroups.map((group) => (
          <section key={group.fondamentaId} className="space-y-2">
            <h2 className="px-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white/45">
              {group.title}
            </h2>

            <div className="space-y-2">
              {group.items.map((item) => {
                const ex = item.exercise;
                const optTarget = Math.max(1, item.weeklyOptimalSets);
                const fillPct = Math.min(
                  100,
                  Math.round((item.completedSets / optTarget) * 100)
                );
                const minMarkerPct = Math.min(
                  96,
                  Math.max(8, Math.round((item.weeklyMinSets / optTarget) * 100))
                );
                const barColorClass = item.optimalReached
                  ? 'bg-[#39FF14]'
                  : item.minReached
                  ? 'bg-white'
                  : 'bg-[#39FF14]';

                return (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => setActiveExId(ex.id)}
                    className="w-full rounded-2xl border border-white/15 bg-black px-4 py-3.5 text-left space-y-2.5 hover:border-white/40 active:scale-[0.99] transition"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm font-bold text-white">
                        {ex.title}
                      </span>

                      <div className="flex shrink-0 items-baseline gap-1.5 text-xs tabular-nums">
                        <span className="font-black text-white">
                          {item.completedSets}
                          <span className="font-bold text-white/45">
                            /{item.weeklyMinSets}
                          </span>
                        </span>
                        <span className="text-[11px] font-bold text-white/35">
                          · {item.weeklyOptimalSets}
                        </span>
                      </div>
                    </div>

                    <div className="relative h-1.5 w-full rounded-full bg-white/15">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barColorClass}`}
                        style={{ width: `${fillPct}%` }}
                      />
                      <div
                        className="absolute -top-0.5 h-2.5 w-0.5 rounded-full bg-white/90"
                        style={{ left: `${minMarkerPct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Minimal Custom Exercise Action */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={() => setShowExerciseModal(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black px-3.5 py-1.5 text-[11px] font-bold text-white/55 hover:border-white/40 hover:text-white transition"
        >
          <Plus className="h-3.5 w-3.5 text-[#39FF14]" />
          Aggiungi esercizio
        </button>
      </div>

      {/* EXERCISE DETAIL SHEET (BPM, VARIANTS, FRETBOARD & START) */}
      {activeSelection && (() => {
        const { group, item } = activeSelection;
        const ex = item.exercise;
        const variants = getLevelFilteredVariants(ex, prescription.answers.level);
        const requestedVarId = selectedVariantByEx[ex.id] || ex.activeVariantId;
        const activeVarId =
          variants.find((v) => v.id === requestedVarId)?.id ?? variants[0]?.id;
        const selectedVariant = variants.find((v) => v.id === activeVarId);
        const selectedVariantEntry = item.weightedSummary.byVariant.find(
          (b) => b.variantId === activeVarId
        );
        const targetForSelected =
          selectedVariantEntry?.bpm ?? item.weightedSummary.nextSessionBpm;

        const optTarget = Math.max(1, item.weeklyOptimalSets);
        const fillPct = Math.min(
          100,
          Math.round((item.completedSets / optTarget) * 100)
        );
        const minMarkerPct = Math.min(
          96,
          Math.max(8, Math.round((item.weeklyMinSets / optTarget) * 100))
        );
        const barColorClass = item.optimalReached
          ? 'bg-[#39FF14]'
          : item.minReached
          ? 'bg-white'
          : 'bg-[#39FF14]';

        const isArpeggioEx = ex.id === ARPEGGIO_EXERCISE_ID;
        const arpData = isArpeggioEx
          ? buildArpeggioWorkoutData(activeVarId, selectedArpeggioProgId)
          : null;
        const exSpeedBurst = speedBurstByEx[ex.id] ?? Boolean(ex.speedBurst);

        return (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/90 backdrop-blur-md p-2 sm:p-4 overscroll-none"
            onClick={() => setActiveExId(null)}
          >
            <div
              className="w-full max-w-lg max-h-[92vh] overflow-y-auto overscroll-contain rounded-2xl border border-white/20 bg-black p-4 sm:p-5 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 border-b border-white/15 pb-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#39FF14]">
                    {group.title}
                  </div>
                  <h3 className="mt-0.5 text-base sm:text-lg font-black text-white">
                    {ex.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveExId(null)}
                  aria-label="Chiudi scheda"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 text-white/70 hover:text-white transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Minimal Sets & BPM Row */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 tabular-nums">
                  <div className="text-xs font-bold text-white/55">
                    <span className="font-black text-white">
                      {item.completedSets}
                    </span>
                    /{item.weeklyMinSets} min · ott {item.weeklyOptimalSets}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSpeedBurstByEx((prev) => ({
                          ...prev,
                          [ex.id]: !exSpeedBurst,
                        }))
                      }
                      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black transition ${
                        exSpeedBurst
                          ? 'border-[#39FF14] bg-[#39FF14] text-black'
                          : 'border-white/20 bg-black text-white/55 hover:border-white/45 hover:text-white'
                      }`}
                    >
                      ⚡ Burst 1/8→1/16
                    </button>
                    <div className="text-sm font-black text-[#39FF14]">
                      {targetForSelected} BPM
                    </div>
                  </div>
                </div>

                <div className="relative h-1.5 w-full rounded-full bg-white/15">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${barColorClass}`}
                    style={{ width: `${fillPct}%` }}
                  />
                  <div
                    className="absolute -top-0.5 h-2.5 w-0.5 rounded-full bg-white"
                    style={{ left: `${minMarkerPct}%` }}
                  />
                </div>
              </div>

              {/* Variants Selector */}
              {item.weightedSummary.byVariant.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {item.weightedSummary.byVariant.map((vEntry) => {
                    const isSelected = vEntry.variantId === activeVarId;
                    return (
                      <button
                        key={vEntry.variantId}
                        type="button"
                        onClick={() =>
                          setSelectedVariantByEx((prev) => ({
                            ...prev,
                            [ex.id]: vEntry.variantId,
                          }))
                        }
                        title={vEntry.name}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold tabular-nums transition ${
                          isSelected
                            ? 'border-white bg-white text-black'
                            : vEntry.isPracticed
                            ? 'border-white/25 bg-black text-white/85 hover:border-white/50'
                            : 'border-white/10 bg-black text-white/45 hover:border-white/30 hover:text-white/75'
                        }`}
                      >
                        <span>{vEntry.shortLabel}</span>
                        <span
                          className={
                            isSelected ? 'text-black/70' : 'text-[#39FF14]'
                          }
                        >
                          {vEntry.bpm}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Modular Progression Selector for Arpeggio Exercise */}
              {arpData && (
                <div className="space-y-2 border-t border-white/10 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full border border-[#39FF14]/50 bg-[#39FF14]/12 px-2.5 py-0.5 text-[11px] font-black text-[#39FF14] tabular-nums">
                      Formula Gradi: {arpData.pattern.formulaText}
                    </span>
                    <span className="text-[11px] font-bold text-white/60">
                      {arpData.progression.name}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {ARPEGGIO_PROGRESSIONS.map((prog) => {
                      const active = prog.id === selectedArpeggioProgId;
                      return (
                        <button
                          key={prog.id}
                          type="button"
                          onClick={() => setSelectedArpeggioProgId(prog.id)}
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-bold transition ${
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

              {/* Fretboard Preview */}
              <FretboardViewer
                notes={
                  arpData?.fretboardNotes ??
                  selectedVariant?.fretboardNotes ??
                  ex.fretboardNotes
                }
                demoSequence={
                  arpData?.demoSequence ??
                  selectedVariant?.demoSequence ??
                  ex.demoSequence
                }
                bpm={targetForSelected}
                speedBurst={exSpeedBurst}
                variant="compact"
              />

              {/* Start Single Exercise */}
              <button
                type="button"
                onClick={() => {
                  setActiveExId(null);
                  onStartSingleExercise(ex, activeVarId);
                }}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl neon-cta px-5 py-3 text-sm sm:text-base font-black transition"
              >
                <Play className="h-4 w-4 fill-current" />
                Allena
              </button>
            </div>
          </div>
        );
      })()}

      {/* CREATE PERSONAL EXERCISE MODAL */}
      {showExerciseModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-3"
          onClick={() => setShowExerciseModal(false)}
        >
          <form
            onSubmit={submitNewExercise}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl chrome-panel p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                Nuovo esercizio
              </h3>
              <button
                type="button"
                onClick={() => setShowExerciseModal(false)}
                className="rounded-full border border-white/15 bg-black p-1.5 text-white/60 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                required
                value={exTitle}
                onChange={(e) => setExTitle(e.target.value)}
                placeholder="Nome esercizio *"
                className="w-full rounded-xl bg-black border border-white/15 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-white/40"
              />
              <select
                value={exCategory}
                onChange={(e) => setExCategory(e.target.value as ExerciseCategory)}
                className="w-full rounded-xl bg-black border border-white/15 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
              >
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <input
                type="number"
                min={40}
                max={240}
                value={exBpm}
                onChange={(e) => setExBpm(Number(e.target.value))}
                aria-label="BPM iniziale"
                className="w-full rounded-xl bg-black border border-white/15 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
              />
              <select
                value={exSub}
                onChange={(e) => setExSub(e.target.value as Subdivision)}
                className="w-full rounded-xl bg-black border border-white/15 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
              >
                <option value="1/4">1/4</option>
                <option value="1/8">1/8</option>
                <option value="1/8T">1/8T</option>
                <option value="1/16">1/16</option>
              </select>
              <select
                value={exGap}
                onChange={(e) => setExGap(e.target.value as GapClickMode)}
                className="w-full rounded-xl bg-black border border-white/15 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
              >
                <option value="off">Battuta muta: No</option>
                <option value="1-in-4">1 ogni 4 muta</option>
                <option value="random-25">Casuale</option>
              </select>
            </div>

            <FretboardViewer
              notes={exNotes}
              interactive
              onToggleNote={handleToggleFretNote}
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowExerciseModal(false)}
                className="rounded-xl border border-white/15 bg-black px-4 py-2 text-xs font-bold text-white/60 hover:text-white"
              >
                Annulla
              </button>
              <button
                type="submit"
                className="rounded-xl bg-[#39FF14] px-5 py-2 text-xs font-black text-black hover:bg-[#5EFF3D]"
              >
                Salva
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
