import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Dumbbell,
  Flame,
  Gauge,
  Music2,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  X,
  Youtube,
  Zap,
} from 'lucide-react';
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
import { OnboardingHeroGuitarBg, PathIllustration } from './PathIllustrations';

interface OnboardingFlowProps {
  exercises: Exercise[];
  showIntroSlides?: boolean;
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

/** Friendly Duolingo-style pick mascot ("Plek") for the onboarding coach bubbles */
const PlekMascot: React.FC<{ mood?: 'wave' | 'coach' | 'rocket' }> = ({
  mood = 'wave',
}) => (
  <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#39FF14]/40 bg-[#39FF14]/12 shadow-[0_0_20px_rgba(57,255,20,0.18)]">
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-9 w-9"
      aria-hidden="true"
    >
      {/* Guitar Pick Body */}
      <path
        d="M24 5C14 5 8 11.5 8 20.5C8 30.5 17.5 39.5 22.3 43.2C23.3 44 24.7 44 25.7 43.2C30.5 39.5 40 30.5 40 20.5C40 11.5 34 5 24 5Z"
        fill="#39FF14"
      />
      {/* Subtle Top Highlight */}
      <path
        d="M15 11.5C17.5 9.2 20.8 8.3 24 8.3C27.2 8.3 30.5 9.2 33 11.5"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Friendly Eyes */}
      <circle cx="18.5" cy="20.5" r="2.6" fill="#000000" />
      <circle cx="29.5" cy="20.5" r="2.6" fill="#000000" />
      <circle cx="19.3" cy="19.6" r="0.9" fill="#FFFFFF" />
      <circle cx="30.3" cy="19.6" r="0.9" fill="#FFFFFF" />
      {/* Smile */}
      {mood === 'rocket' ? (
        <path
          d="M19 26.5C20.5 29.5 27.5 29.5 29 26.5"
          stroke="#000000"
          strokeWidth="2.3"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M19.5 26.8C21.2 28.8 26.8 28.8 28.5 26.8"
          stroke="#000000"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      )}
    </svg>
    {mood === 'wave' && (
      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#39FF14] text-[9px] font-black text-black">
        !
      </span>
    )}
    {mood === 'coach' && (
      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-black">
        <Dumbbell className="h-2.5 w-2.5" />
      </span>
    )}
    {mood === 'rocket' && (
      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#39FF14] text-black">
        <Flame className="h-2.5 w-2.5" />
      </span>
    )}
  </div>
);

interface IntroSlideCoachBubbleProps {
  mood: 'wave' | 'coach' | 'rocket';
  message: string;
}

const IntroSlideCoachBubble: React.FC<IntroSlideCoachBubbleProps> = ({
  mood,
  message,
}) => (
  <div className="flex items-start gap-3">
    <PlekMascot mood={mood} />
    <div className="relative flex-1 rounded-2xl rounded-tl-md border border-white/15 bg-[#0D0D0F] px-3.5 py-2.5 text-xs sm:text-sm font-medium leading-relaxed text-white/90">
      {message}
    </div>
  </div>
);

type IntroSlideIndex = 0 | 1 | 2 | 3 | 4 | 5;
const INTRO_SLIDE_COUNT = 6;
const LAST_INTRO_SLIDE: IntroSlideIndex = 5;

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  exercises,
  showIntroSlides = false,
  onFinishQuiz,
  onCancel,
}) => {
  const [phase, setPhase] = useState<'intro' | 'quiz'>(
    showIntroSlides ? 'intro' : 'quiz'
  );
  const [introSlide, setIntroSlide] = useState<IntroSlideIndex>(0);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [draft, setDraft] = useState<DraftQuizAnswers>(DEFAULT_DRAFT);
  const [animatingChoice, setAnimatingChoice] = useState<string | null>(null);
  const [isTransitioningOut, setIsTransitioningOut] = useState(false);

  const timersRef = useRef<number[]>([]);
  const touchStartXRef = useRef<number | null>(null);

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

  const runTransition = useCallback(
    (action: () => void, reactDelay = 0) => {
      clearPendingTimers();
      const t1 = window.setTimeout(() => {
        setIsTransitioningOut(true);
        const t2 = window.setTimeout(() => {
          action();
          setAnimatingChoice(null);
          setIsTransitioningOut(false);
        }, 140);
        timersRef.current.push(t2);
      }, reactDelay);
      timersRef.current.push(t1);
    },
    [clearPendingTimers]
  );

  const transitionToIntroSlide = useCallback(
    (nextSlide: IntroSlideIndex) => {
      if (isTransitioningOut) return;
      runTransition(() => {
        setPhase('intro');
        setIntroSlide(nextSlide);
      });
    },
    [isTransitioningOut, runTransition]
  );

  const startQuizPhase = useCallback(() => {
    if (isTransitioningOut) return;
    runTransition(() => {
      setPhase('quiz');
      setStep(1);
    });
  }, [isTransitioningOut, runTransition]);

  const transitionToStep = useCallback(
    (nextStep: 1 | 2 | 3, chosenKey?: string) => {
      clearPendingTimers();
      if (chosenKey) {
        setAnimatingChoice(chosenKey);
      }
      runTransition(() => {
        setStep(nextStep);
      }, chosenKey ? 200 : 0);
    },
    [clearPendingTimers, runTransition]
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

  const handleIntroTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  };

  const handleIntroTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartXRef.current;
    const deltaX = endX - touchStartXRef.current;
    touchStartXRef.current = null;
    if (Math.abs(deltaX) < 55) return;
    if (deltaX < 0) {
      if (introSlide < LAST_INTRO_SLIDE) {
        transitionToIntroSlide((introSlide + 1) as IntroSlideIndex);
      } else {
        startQuizPhase();
      }
    } else if (deltaX > 0 && introSlide > 0) {
      transitionToIntroSlide((introSlide - 1) as IntroSlideIndex);
    }
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

  const totalProgressSegments = showIntroSlides ? INTRO_SLIDE_COUNT + 3 : 3;
  const activeProgressSegment =
    phase === 'intro'
      ? introSlide + 1
      : (showIntroSlides ? INTRO_SLIDE_COUNT : 0) + step;

  const canGoBack =
    (phase === 'intro' && introSlide > 0) ||
    (phase === 'quiz' && (step > 1 || showIntroSlides));

  const handleHeaderBack = () => {
    if (phase === 'intro') {
      if (introSlide > 0) {
        transitionToIntroSlide((introSlide - 1) as IntroSlideIndex);
      }
      return;
    }
    if (step > 1) {
      transitionToStep((step - 1) as 1 | 2 | 3);
    } else if (showIntroSlides) {
      transitionToIntroSlide(LAST_INTRO_SLIDE);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#030405] text-white">
      {/* Dramatic Full-Bleed Chrome & Neon Guitar Background on Slide 1 */}
      {phase === 'intro' && introSlide === 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden"
        >
          <OnboardingHeroGuitarBg className="h-[108vh] w-auto max-w-none opacity-85 scale-105 sm:scale-110 transition-opacity duration-300" />
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 48%, rgba(3,4,5,0.42) 0%, rgba(3,4,5,0.68) 58%, rgba(3,4,5,0.94) 100%)',
            }}
          />
        </div>
      )}

      <header className="relative z-10 mx-auto flex w-full max-w-xl items-center justify-between px-5 pt-4 pb-2">
        <div className="flex items-center gap-2.5">
          {canGoBack ? (
            <button
              type="button"
              onClick={handleHeaderBack}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black border border-white/15 text-white hover:border-white/40 active:scale-90 transition"
              aria-label="Torna indietro"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <img
              src="/icon.svg"
              alt="The Shredding Lab"
              className="h-8 w-8 rounded-xl shrink-0 ring-1 ring-slate-200/35 shadow-[0_0_14px_rgba(57,255,20,0.22)]"
            />
          )}
          <span className="text-[11px] font-bold uppercase tracking-widest text-white/55 tabular-nums">
            {phase === 'intro'
              ? `${introSlide + 1} / ${INTRO_SLIDE_COUNT}`
              : `Quiz ${step} / 3`}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 w-28">
            {Array.from({ length: totalProgressSegments }, (_, idx) => {
              const n = idx + 1;
              return (
                <div
                  key={n}
                  className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                    n <= activeProgressSegment ? 'bg-[#39FF14]' : 'bg-white/15'
                  }`}
                />
              );
            })}
          </div>
          {phase === 'intro' && (
            <button
              type="button"
              onClick={startQuizPhase}
              className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-bold text-white/60 hover:border-white/35 hover:text-white transition"
            >
              Salta
            </button>
          )}
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

      <main
        className="relative z-10 mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-4"
        onTouchStart={phase === 'intro' ? handleIntroTouchStart : undefined}
        onTouchEnd={phase === 'intro' ? handleIntroTouchEnd : undefined}
      >
        {phase === 'intro' ? (
          <div
            key={`intro-${introSlide}`}
            className={`space-y-5 transition-all duration-150 ${
              isTransitioningOut
                ? 'opacity-0 -translate-y-2 scale-[0.985]'
                : 'animate-quiz-step'
            }`}
          >
            {/* SLIDE 1: HOOK — ESSENZA */}
            {introSlide === 0 && (
              <div className="space-y-4 py-10 sm:py-14 text-center flex flex-col items-center">
                <h1 className="text-4xl sm:text-5xl font-black tracking-tight chrome-text leading-[1.05] drop-shadow-[0_6px_28px_rgba(0,0,0,0.9)]">
                  Impara a suonare come hai sempre sognato.
                </h1>
                <p className="max-w-sm text-sm sm:text-base text-slate-200/85 leading-relaxed drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)]">
                  Progredisci Scientificamente e raggiungi ciò che non avresti mai pensato possibile.
                </p>
              </div>
            )}

            {/* SLIDE 2: IL PROBLEMA */}
            {introSlide === 1 && (
              <div className="space-y-5 py-2">
                <IntroSlideCoachBubble
                  mood="wave"
                  message="Il blocco non è nella testa. È nelle dita."
                />
                <div className="space-y-3 px-0.5">
                  <h1 className="text-3xl sm:text-4xl font-black tracking-tight chrome-text leading-[1.08]">
                    Sai cosa suonare. Le mani non ti seguono.
                  </h1>
                  <p className="text-sm sm:text-base text-slate-300/75 leading-relaxed">
                    Capire un concetto richiede 5 minuti. Suonarlo{' '}
                    <span className="text-white font-semibold">pulito, a tempo e senza tensione</span>{' '}
                    richiede allenamento vero.
                  </p>
                </div>
              </div>
            )}

            {/* SLIDE 3: TECNICA VS COMPOSIZIONE (MOZART VS STEVE VAI) */}
            {introSlide === 2 && (
              <div className="space-y-5 py-2">
                <div className="px-0.5">
                  <h1 className="text-3xl sm:text-4xl font-black tracking-tight chrome-text leading-[1.08]">
                    Non ti insegniamo a comporre.
                  </h1>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="rounded-2xl chrome-card p-4 space-y-1">
                    <div className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-slate-200">
                      <Music2 className="h-3.5 w-3.5 text-slate-300" />
                      Mozart
                    </div>
                    <p className="text-xs sm:text-sm text-slate-300/75">
                      Comporre melodie, armonia e canzoni.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#39FF14]/45 bg-[#39FF14]/[0.08] p-4 space-y-1 shadow-[0_0_24px_rgba(57,255,20,0.1)]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-[#39FF14]">
                        <Zap className="h-3.5 w-3.5" />
                        Eddie Van Halen
                      </span>
                      <span className="rounded-full bg-[#39FF14]/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#39FF14]">
                        Qui
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-white/95">
                      Velocità, controllo e precisione chirurgica.
                    </p>
                  </div>
                </div>

                <p className="text-xs sm:text-sm text-slate-300/70 px-0.5">
                  Entrambe sono fondamentali ma <span className="text-white font-semibold">The Shredding Lab</span> si concentra al 100% sulla seconda.
                </p>
              </div>
            )}

            {/* SLIDE 4: PREREQUISITI + YOUTUBE */}
            {introSlide === 3 && (
              <div className="space-y-5 py-2">
                <div className="px-0.5">
                  <h1 className="text-3xl sm:text-4xl font-black tracking-tight chrome-text leading-[1.08]">
                    Ti servono già le basi.
                  </h1>
                </div>

                <div className="space-y-2">
                  {[
                    'Teoria musicale di base',
                    'Forme principali di accordi',
                    'Scale fondamentali',
                  ].map((label) => (
                    <div
                      key={label}
                      className="flex items-center gap-3 rounded-2xl chrome-card px-4 py-3"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#39FF14]/15 text-[#39FF14]">
                        <Check className="h-3 w-3 stroke-[3]" />
                      </span>
                      <span className="text-sm font-bold text-white">
                        {label}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2.5 rounded-xl chrome-pill px-3.5 py-2.5 text-xs text-slate-200/85">
                  <Youtube className="h-4 w-4 shrink-0 text-[#39FF14]" />
                  <span>Ti manca qualcosa? Su YouTube lo impari gratis in pochi minuti, poi torni qui ad allenarlo.</span>
                </div>
              </div>
            )}

            {/* SLIDE 5: IL METODO (ZERO ATTRITO + BPM ADATTIVI) */}
            {introSlide === 4 && (
              <div className="space-y-5 py-2">
                <IntroSlideCoachBubble
                  mood="coach"
                  message="Niente decisioni. Niente perdite di tempo."
                />
                <div className="space-y-3 px-0.5">
                  <h1 className="text-3xl sm:text-4xl font-black tracking-tight chrome-text leading-[1.08]">
                    Apri. Suona. I BPM crescono con te.
                  </h1>
                  <p className="text-sm sm:text-base text-slate-300/75 leading-relaxed">
                    Schede pronte da <span className="text-white font-semibold">5 a 45 minuti</span>. Voti la pulizia da 1 a 5 e il metronomo si adatta da solo.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full chrome-pill px-3 py-1.5 text-xs font-bold text-white">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-[#39FF14]" />
                    Scheda pronta
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full chrome-pill px-3 py-1.5 text-xs font-bold text-white">
                    <Gauge className="h-3.5 w-3.5 text-[#39FF14]" />
                    BPM adattivi
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full chrome-pill px-3 py-1.5 text-xs font-bold text-white">
                    <TrendingUp className="h-3.5 w-3.5 text-[#39FF14]" />
                    Progressi reali
                  </span>
                </div>
              </div>
            )}

            {/* SLIDE 6: IL TUO SÉ FUTURO */}
            {introSlide === 5 && (
              <div className="space-y-5 py-2">
                <IntroSlideCoachBubble
                  mood="rocket"
                  message="Chiudi gli occhi un secondo."
                />
                <div className="space-y-3 px-0.5">
                  <h1 className="text-3xl sm:text-4xl font-black tracking-tight chrome-text leading-[1.08]">
                    Prendi la chitarra e le dita volano.
                  </h1>
                  <p className="text-sm sm:text-base text-slate-300/75 leading-relaxed">
                    Attacchi quel riff o quell'assolo veloce e ogni nota esce{' '}
                    <span className="text-white font-semibold">pulita, potente e senza sforzo</span>. Iniziamo.
                  </p>
                </div>
              </div>
            )}

            {/* SLIDE NAVIGATION FOOTER */}
            <div className="pt-4 space-y-3">
              <div className="flex items-center justify-center gap-2">
                {([0, 1, 2, 3, 4, 5] as const).map((idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => transitionToIntroSlide(idx)}
                    aria-label={`Vai alla slide ${idx + 1}`}
                    className={`h-1.5 rounded-full transition-all duration-200 ${
                      introSlide === idx
                        ? 'w-6 bg-[#39FF14] shadow-[0_0_8px_rgba(57,255,20,0.7)]'
                        : 'w-1.5 bg-white/25 hover:bg-white/45'
                    }`}
                  />
                ))}
              </div>

              {introSlide < LAST_INTRO_SLIDE ? (
                <button
                  type="button"
                  onClick={() =>
                    transitionToIntroSlide((introSlide + 1) as IntroSlideIndex)
                  }
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl chrome-active px-5 py-3 text-sm font-black active:scale-[0.98] transition"
                >
                  Continua
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startQuizPhase}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl neon-cta px-5 py-3 text-sm font-black active:scale-[0.98] transition"
                >
                  <Sparkles className="h-4 w-4" />
                  Crea la mia scheda
                </button>
              )}
            </div>
          </div>
        ) : (
          <div
            key={`quiz-${step}`}
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
                          ? 'border-[#39FF14] bg-[#0B0B0B] shadow-[0_0_28px_rgba(57,255,20,0.22)]'
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
                                ? 'border-[#39FF14] bg-[#39FF14] text-black'
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
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#39FF14] px-5 py-3 text-sm font-black text-black hover:bg-[#5EFF3D] active:scale-[0.98] transition"
                >
                  <Sparkles className="h-4 w-4" />
                  Attiva Percorso
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
