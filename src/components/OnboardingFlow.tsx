import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Sparkles, X } from 'lucide-react';
import {
  DiagnosticQuizAnswers,
  Exercise,
  PathId,
  PlayerLevelId,
  ScientificPlanPrescription,
  SessionDurationPreset,
} from '../types/practice';
import {
  LEVEL_OPTIONS,
  PATH_OPTIONS,
  SESSION_BUDGET_OPTIONS,
  WEEKLY_DAYS_OPTIONS,
  generateScientificPrescription,
} from '../utils/scientificPrescription';
import { PathIllustration } from './PathIllustrations';

interface OnboardingFlowProps {
  exercises: Exercise[];
  onFinishQuiz: (
    prescription: ScientificPlanPrescription,
    launchWorkoutNow: boolean
  ) => void;
  onCancel?: () => void;
}

interface DraftQuizAnswers {
  pathId: PathId | null;
  level: PlayerLevelId | null;
  weeklyDays: 3 | 5 | 7;
  sessionPreset: SessionDurationPreset;
}

const DEFAULT_DRAFT: DraftQuizAnswers = {
  pathId: null,
  level: null,
  weeklyDays: 5,
  sessionPreset: 15,
};

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  exercises,
  onFinishQuiz,
  onCancel,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<DraftQuizAnswers>(DEFAULT_DRAFT);
  const [animatingChoice, setAnimatingChoice] = useState<string | null>(null);
  const [isTransitioningOut, setIsTransitioningOut] = useState(false);

  const timersRef = useRef<number[]>([]);

  const clearPendingTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  useEffect(() => {
    return () => clearPendingTimers();
  }, [clearPendingTimers]);

  const resolvedAnswers: DiagnosticQuizAnswers = useMemo(() => {
    const pathId = draft.pathId ?? 'solista';
    return {
      pathId,
      primaryPainPoint: pathId === 'rhythm' ? 'timing_drift' : 'speed_wall',
      secondaryBottleneck:
        pathId === 'rhythm' ? 'rhythm_stiffness' : 'string_crossing',
      level: draft.level ?? 'intermediate',
      weeklyDays: draft.weeklyDays,
      sessionPreset: draft.sessionPreset,
    };
  }, [draft]);

  const generatedPrescription = useMemo(
    () => generateScientificPrescription(resolvedAnswers, exercises),
    [resolvedAnswers, exercises]
  );

  const transitionToStep = useCallback(
    (nextStep: 1 | 2 | 3, chosenKey?: string) => {
      clearPendingTimers();
      if (chosenKey) {
        setAnimatingChoice(chosenKey);
      }

      const reactDelay = chosenKey ? 200 : 0;
      const t1 = window.setTimeout(() => {
        setIsTransitioningOut(true);
        const t2 = window.setTimeout(() => {
          setStep(nextStep);
          setAnimatingChoice(null);
          setIsTransitioningOut(false);
        }, 140);
        timersRef.current.push(t2);
      }, reactDelay);

      timersRef.current.push(t1);
    },
    [clearPendingTimers]
  );

  const handleSelectPath = (pathId: PathId) => {
    if (isTransitioningOut || animatingChoice) return;
    setDraft((prev) => ({ ...prev, pathId }));
    transitionToStep(2, pathId);
  };

  const handleSelectLevel = (level: PlayerLevelId) => {
    if (isTransitioningOut || animatingChoice) return;
    setDraft((prev) => ({ ...prev, level }));
    transitionToStep(3, level);
  };

  const stepHeaders: Record<1 | 2 | 3, { title: string; subtitle: string }> = {
    1: {
      title: 'Scegli il tuo percorso',
      subtitle: 'Allenerai tutti i fondamentali, con focus mirato sul tuo stile.',
    },
    2: {
      title: 'A che livello sei?',
      subtitle: 'Adatteremo accordi, velocità e difficoltà senza farti sforzare.',
    },
    3: {
      title: 'Il tuo ritmo settimanale',
      subtitle: 'Nessuna pressione: scegli quanto tempo dedicare di solito.',
    },
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-black text-white">
      <header className="mx-auto flex w-full max-w-xl items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-2.5">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => transitionToStep((step - 1) as 1 | 2 | 3)}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black border border-white/15 text-white hover:border-white/40 active:scale-90 transition"
              aria-label="Torna indietro"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <img
              src="/icon.svg"
              alt="PENTATONIC"
              className="h-8 w-8 rounded-xl shrink-0"
            />
          )}
          <span className="text-[11px] font-bold uppercase tracking-widest text-white/55 tabular-nums">
            {step} / 3
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 w-24">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                  n <= step ? 'bg-[#FF6B00]' : 'bg-white/15'
                }`}
              />
            ))}
          </div>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              aria-label="Chiudi"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-black text-white/60 hover:text-white active:scale-90 transition"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-4">
        <div
          key={step}
          className={`space-y-5 transition-all duration-150 ${
            isTransitioningOut
              ? 'opacity-0 -translate-y-2 scale-[0.985]'
              : 'animate-quiz-step'
          }`}
        >
          <div className="space-y-1 px-0.5">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              {stepHeaders[step].title}
            </h1>
            <p className="text-xs sm:text-sm text-white/55">
              {stepHeaders[step].subtitle}
            </p>
          </div>

          {/* STEP 1: PERCORSO SOLISTA vs PERCORSO RHYTHM */}
          {step === 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {PATH_OPTIONS.map((opt) => {
                const isAnimating = animatingChoice === opt.value;
                const isSelected = isAnimating || draft.pathId === opt.value;
                const isDimmed = animatingChoice !== null && !isAnimating;

                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelectPath(opt.value)}
                    className={`group flex flex-col justify-between overflow-hidden rounded-3xl border p-4 text-left transition-all duration-150 active:scale-[0.98] ${
                      isSelected
                        ? 'border-[#FF6B00] bg-[#0B0B0B] shadow-[0_0_28px_rgba(255,107,0,0.22)]'
                        : 'border-white/15 bg-black hover:border-white/45'
                    } ${isDimmed ? 'opacity-40' : ''}`}
                  >
                    <div className="mb-3 w-full overflow-hidden rounded-2xl border border-white/10 bg-black/80 px-2 py-2">
                      <PathIllustration
                        pathId={opt.value}
                        className="mx-auto h-32 w-full"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <h2 className="text-lg font-black text-white">
                          {opt.title}
                        </h2>
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition ${
                            isSelected
                              ? 'border-[#FF6B00] bg-[#FF6B00] text-black'
                              : 'border-white/15 text-white/50 group-hover:border-white/40 group-hover:text-white'
                          }`}
                        >
                          {isSelected ? (
                            <Check className="h-3.5 w-3.5 stroke-[3]" />
                          ) : (
                            <ArrowRight className="h-3.5 w-3.5" />
                          )}
                        </span>
                      </div>

                      <p className="text-xs text-white/60 leading-relaxed">
                        {opt.subtitle}
                      </p>

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {opt.focusBadges.map((badge) => (
                          <span
                            key={badge}
                            className="rounded-full border border-white/15 bg-black px-2.5 py-0.5 text-[10px] font-bold text-white/75"
                          >
                            {badge}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* STEP 2: LIVELLO */}
          {step === 2 && (
            <div className="space-y-2.5">
              {LEVEL_OPTIONS.map((opt) => {
                const isAnimating = animatingChoice === opt.value;
                const isSelected = isAnimating || draft.level === opt.value;
                const isDimmed = animatingChoice !== null && !isAnimating;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelectLevel(opt.value)}
                    className={`flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition-all duration-150 active:scale-[0.98] ${
                      isSelected
                        ? 'bg-white text-black border-white shadow-[0_0_24px_rgba(255,255,255,0.18)]'
                        : 'bg-black text-white border-white/15 hover:border-white/45'
                    } ${isDimmed ? 'opacity-40' : ''}`}
                  >
                    <div className="space-y-0.5">
                      <div className="text-sm sm:text-base font-black">
                        {opt.title}
                      </div>
                      <p
                        className={`text-xs transition-colors ${
                          isSelected ? 'text-black/75' : 'text-white/55'
                        }`}
                      >
                        {opt.subtitle}
                      </p>
                    </div>
                    {isSelected ? (
                      <Check className="h-4 w-4 shrink-0 stroke-[3]" />
                    ) : (
                      <ArrowRight className="h-4 w-4 shrink-0 text-white/50" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* STEP 3: RITMO SETTIMANALE + ATTIVA PERCORSO */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3.5 rounded-2xl border border-white/15 bg-black p-3">
                <div className="h-14 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black">
                  <PathIllustration
                    pathId={resolvedAnswers.pathId ?? 'solista'}
                    className="h-full w-full"
                  />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-black text-white">
                    {generatedPrescription.profileTitle}
                  </div>
                  <div className="text-xs text-white/55">
                    {
                      LEVEL_OPTIONS.find((l) => l.value === resolvedAnswers.level)
                        ?.title
                    }
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-white/60">
                  Giorni a settimana
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {WEEKLY_DAYS_OPTIONS.map((opt) => {
                    const selected = draft.weeklyDays === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            weeklyDays: opt.value as 3 | 5 | 7,
                          }))
                        }
                        className={`rounded-xl border p-3 text-center transition-all duration-150 active:scale-95 ${
                          selected
                            ? 'bg-white text-black border-white'
                            : 'bg-black text-white border-white/15 hover:border-white/40'
                        }`}
                      >
                        <div className="text-sm font-black">{opt.title}</div>
                        <div
                          className={`mt-0.5 text-[10px] font-semibold ${
                            selected ? 'text-black/75' : 'text-white/50'
                          }`}
                        >
                          {opt.subtitle}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-white/60">
                  Minuti al giorno
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {SESSION_BUDGET_OPTIONS.map((opt) => {
                    const selected = draft.sessionPreset === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            sessionPreset: opt.value as SessionDurationPreset,
                          }))
                        }
                        className={`rounded-xl border p-3 text-center transition-all duration-150 active:scale-95 ${
                          selected
                            ? 'bg-white text-black border-white'
                            : 'bg-black text-white border-white/15 hover:border-white/40'
                        }`}
                      >
                        <div className="text-sm font-black">{opt.title}</div>
                        <div
                          className={`mt-0.5 text-[10px] font-semibold ${
                            selected ? 'text-black/75' : 'text-white/50'
                          }`}
                        >
                          {opt.subtitle}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onFinishQuiz(generatedPrescription, false)}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#FF6B00] px-5 py-3 text-sm font-black text-black hover:bg-[#ff7d1f] active:scale-[0.98] transition"
              >
                <Sparkles className="h-4 w-4" />
                Attiva Percorso
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
