import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Play,
  Sparkles,
  X,
} from 'lucide-react';
import {
  DiagnosticQuizAnswers,
  Exercise,
  PainPointId,
  PlayerLevelId,
  ScientificPlanPrescription,
  SecondaryBottleneckId,
  SessionDurationPreset,
} from '../types/practice';
import {
  BOTTLENECK_OPTIONS,
  LEVEL_OPTIONS,
  PAIN_POINT_OPTIONS,
  SESSION_BUDGET_OPTIONS,
  WEEKLY_DAYS_OPTIONS,
  generateScientificPrescription,
} from '../utils/scientificPrescription';

interface OnboardingFlowProps {
  exercises: Exercise[];
  onFinishQuiz: (
    prescription: ScientificPlanPrescription,
    launchWorkoutNow: boolean
  ) => void;
  onCancel?: () => void;
}

interface DraftQuizAnswers {
  primaryPainPoint: PainPointId | null;
  secondaryBottleneck: SecondaryBottleneckId | null;
  level: PlayerLevelId | null;
  weeklyDays: 3 | 5 | 7 | null;
  sessionPreset: SessionDurationPreset | null;
}

const EMPTY_DRAFT: DraftQuizAnswers = {
  primaryPainPoint: null,
  secondaryBottleneck: null,
  level: null,
  weeklyDays: null,
  sessionPreset: null,
};

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  exercises,
  onFinishQuiz,
  onCancel,
}) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [draft, setDraft] = useState<DraftQuizAnswers>(EMPTY_DRAFT);
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

  const resolvedAnswers: DiagnosticQuizAnswers = useMemo(
    () => ({
      primaryPainPoint: draft.primaryPainPoint ?? 'speed_wall',
      secondaryBottleneck: draft.secondaryBottleneck ?? 'string_crossing',
      level: draft.level ?? 'intermediate',
      weeklyDays: draft.weeklyDays ?? 5,
      sessionPreset: draft.sessionPreset ?? 15,
    }),
    [draft]
  );

  const generatedPrescription = useMemo(
    () => generateScientificPrescription(resolvedAnswers, exercises),
    [resolvedAnswers, exercises]
  );

  const exerciseMap = useMemo(
    () => new Map(exercises.map((e) => [e.id, e])),
    [exercises]
  );

  const transitionToStep = useCallback(
    (nextStep: 1 | 2 | 3 | 4 | 5, chosenKey?: string) => {
      clearPendingTimers();
      if (chosenKey) {
        setAnimatingChoice(chosenKey);
      }

      const reactDelay = chosenKey ? 220 : 0;
      const t1 = window.setTimeout(() => {
        setIsTransitioningOut(true);
        const t2 = window.setTimeout(() => {
          setStep(nextStep);
          setAnimatingChoice(null);
          setIsTransitioningOut(false);
        }, 150);
        timersRef.current.push(t2);
      }, reactDelay);

      timersRef.current.push(t1);
    },
    [clearPendingTimers]
  );

  const handleSelectStep1 = (value: PainPointId) => {
    if (isTransitioningOut || animatingChoice) return;
    setDraft((prev) => ({ ...prev, primaryPainPoint: value }));
    transitionToStep(2, value);
  };

  const handleSelectStep2 = (value: SecondaryBottleneckId) => {
    if (isTransitioningOut || animatingChoice) return;
    setDraft((prev) => ({ ...prev, secondaryBottleneck: value }));
    transitionToStep(3, value);
  };

  const handleSelectStep3 = (value: PlayerLevelId) => {
    if (isTransitioningOut || animatingChoice) return;
    setDraft((prev) => ({ ...prev, level: value }));
    transitionToStep(4, value);
  };

  const handleGoToStep5 = () => {
    if (!draft.weeklyDays || !draft.sessionPreset || isTransitioningOut) return;
    transitionToStep(5, 'create-plan');
  };

  const stepHeaders: Record<1 | 2 | 3 | 4 | 5, string> = {
    1: 'Cosa vuoi risolvere per prima cosa?',
    2: 'Cosa vorresti fare senza fatica?',
    3: 'Come suoni oggi?',
    4: 'Quanto tempo hai di solito?',
    5: generatedPrescription.profileTitle,
  };

  const canProceedStep4 = draft.weeklyDays !== null && draft.sessionPreset !== null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-black text-white">
      <header className="mx-auto flex w-full max-w-xl items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-2.5">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => {
                const prevStep = (step - 1) as 1 | 2 | 3 | 4 | 5;
                transitionToStep(prevStep);
              }}
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
          <span className="text-[11px] font-bold uppercase tracking-widest text-white/55">
            {step} / 5
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 w-28">
            {[1, 2, 3, 4, 5].map((n) => (
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
              aria-label="Chiudi quiz"
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
          {/* Compact 1-line Coach Plek Prompt */}
          <div className="flex items-center gap-3.5 rounded-2xl bg-black border border-white/15 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black border border-[#FF6B00]/50">
              <svg viewBox="0 0 40 40" className="h-7 w-7">
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
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-black text-white leading-snug">
                {stepHeaders[step]}
              </h1>
              {step === 5 && (
                <p className="mt-0.5 text-xs text-white/60">
                  {generatedPrescription.diagnosisSummary}
                </p>
              )}
            </div>
          </div>

          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-2.5">
              {PAIN_POINT_OPTIONS.map((opt) => {
                const isAnimating = animatingChoice === opt.value;
                const isSelected = isAnimating || draft.primaryPainPoint === opt.value;
                const isDimmed = animatingChoice !== null && !isAnimating;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelectStep1(opt.value)}
                    className={`flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition-all duration-150 active:scale-[0.97] ${
                      isSelected
                        ? 'bg-white text-black border-white scale-[0.985] shadow-[0_0_24px_rgba(255,255,255,0.2)]'
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

          {/* STEP 2 */}
          {step === 2 && (
            <div className="space-y-2.5">
              {BOTTLENECK_OPTIONS.map((opt) => {
                const isAnimating = animatingChoice === opt.value;
                const isSelected =
                  isAnimating || draft.secondaryBottleneck === opt.value;
                const isDimmed = animatingChoice !== null && !isAnimating;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelectStep2(opt.value)}
                    className={`flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition-all duration-150 active:scale-[0.97] ${
                      isSelected
                        ? 'bg-white text-black border-white scale-[0.985] shadow-[0_0_24px_rgba(255,255,255,0.2)]'
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

          {/* STEP 3 */}
          {step === 3 && (
            <div className="space-y-2.5">
              {LEVEL_OPTIONS.map((opt) => {
                const isAnimating = animatingChoice === opt.value;
                const isSelected = isAnimating || draft.level === opt.value;
                const isDimmed = animatingChoice !== null && !isAnimating;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelectStep3(opt.value)}
                    className={`flex w-full items-center justify-between gap-4 rounded-2xl border p-4 text-left transition-all duration-150 active:scale-[0.97] ${
                      isSelected
                        ? 'bg-white text-black border-white scale-[0.985] shadow-[0_0_24px_rgba(255,255,255,0.2)]'
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

          {/* STEP 4: Clean Compact Grid with Zero Pre-Selection */}
          {step === 4 && (
            <div className="space-y-4">
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
                            ? 'bg-white text-black border-white scale-[0.98]'
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
                            ? 'bg-white text-black border-white scale-[0.98]'
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
                disabled={!canProceedStep4}
                onClick={handleGoToStep5}
                className={`flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-black transition-all duration-150 active:scale-[0.98] ${
                  canProceedStep4
                    ? 'bg-[#FF6B00] text-black hover:bg-[#ff7d1f]'
                    : 'border border-white/15 bg-black text-white/35 cursor-not-allowed'
                }`}
              >
                <Sparkles className="h-4 w-4" />
                Crea il Mio Piano
              </button>
            </div>
          )}

          {/* STEP 5: Clean Minimal Summary */}
          {step === 5 && (
            <div className="space-y-3">
              <div className="space-y-2">
                {generatedPrescription.doses.map((dose) => {
                  const ex = exerciseMap.get(dose.exerciseId);
                  if (!ex) return null;
                  return (
                    <div
                      key={dose.exerciseId}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-black border border-white/15 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-black text-white">
                          {ex.pillarName || ex.title}
                        </div>
                        <div className="text-xs text-white/55">{ex.title}</div>
                      </div>
                      <div className="shrink-0 text-right tabular-nums">
                        <span className="text-xs font-black text-white">
                          {dose.weeklyMinSets} min
                        </span>
                        <span className="mx-1 text-white/30">•</span>
                        <span className="text-[11px] font-semibold text-white/55">
                          {dose.weeklyOptimalSets} ottimali
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => onFinishQuiz(generatedPrescription, true)}
                  className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-[#FF6B00] px-5 py-3 text-sm font-black text-black hover:bg-[#ff7d1f] active:scale-[0.98] transition"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Inizia Subito
                </button>
                <button
                  type="button"
                  onClick={() => onFinishQuiz(generatedPrescription, false)}
                  className="flex min-h-[42px] w-full items-center justify-center rounded-xl bg-black border border-white/15 px-5 py-2.5 text-xs font-bold text-white hover:border-white/40 active:scale-[0.98] transition"
                >
                  Vai a Oggi
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
