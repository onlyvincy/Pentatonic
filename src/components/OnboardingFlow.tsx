import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Dumbbell,
  Flame,
  Gauge,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingUp,
  X,
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
import { PathIllustration } from './PathIllustrations';

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
  <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#FF6B00]/40 bg-[#FF6B00]/12 shadow-[0_0_20px_rgba(255,107,0,0.18)]">
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
        fill="#FF6B00"
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
      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#A4FF00] text-[9px] font-black text-black">
        !
      </span>
    )}
    {mood === 'coach' && (
      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-black">
        <Dumbbell className="h-2.5 w-2.5" />
      </span>
    )}
    {mood === 'rocket' && (
      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#A4FF00] text-black">
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

export const OnboardingFlow: React.FC<OnboardingFlowProps> = ({
  exercises,
  showIntroSlides = false,
  onFinishQuiz,
  onCancel,
}) => {
  const [phase, setPhase] = useState<'intro' | 'quiz'>(
    showIntroSlides ? 'intro' : 'quiz'
  );
  const [introSlide, setIntroSlide] = useState<0 | 1 | 2>(0);
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
    (nextSlide: 0 | 1 | 2) => {
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
      if (introSlide < 2) {
        transitionToIntroSlide((introSlide + 1) as 0 | 1 | 2);
      } else {
        startQuizPhase();
      }
    } else if (deltaX > 0 && introSlide > 0) {
      transitionToIntroSlide((introSlide - 1) as 0 | 1 | 2);
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

  const totalProgressSegments = showIntroSlides ? 6 : 3;
  const activeProgressSegment =
    phase === 'intro'
      ? introSlide + 1
      : (showIntroSlides ? 3 : 0) + step;

  const canGoBack =
    (phase === 'intro' && introSlide > 0) ||
    (phase === 'quiz' && (step > 1 || showIntroSlides));

  const handleHeaderBack = () => {
    if (phase === 'intro') {
      if (introSlide > 0) {
        transitionToIntroSlide((introSlide - 1) as 0 | 1 | 2);
      }
      return;
    }
    if (step > 1) {
      transitionToStep((step - 1) as 1 | 2 | 3);
    } else if (showIntroSlides) {
      transitionToIntroSlide(2);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-black text-white">
      <header className="mx-auto flex w-full max-w-xl items-center justify-between px-5 pt-4 pb-2">
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
              alt="PENTATONIC"
              className="h-8 w-8 rounded-xl shrink-0"
            />
          )}
          <span className="text-[11px] font-bold uppercase tracking-widest text-white/55 tabular-nums">
            {phase === 'intro'
              ? `Intro ${introSlide + 1} / 3`
              : `${step} / 3`}
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
                    n <= activeProgressSegment ? 'bg-[#FF6B00]' : 'bg-white/15'
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
        className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-4"
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
            {/* INTRO SLIDE 1: COS'È PENTATONIC & PER CHI È */}
            {introSlide === 0 && (
              <>
                <IntroSlideCoachBubble
                  mood="wave"
                  message="Ciao! Sono Plek. Prima di prendere in mano la chitarra, ti spiego in 30 secondi cos'è davvero Pentatonic — e cosa NON è."
                />

                <div className="space-y-2.5 px-0.5">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-[#FF6B00]/35 bg-[#FF6B00]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#FF6B00]">
                    <Target className="h-3.5 w-3.5" />
                    Laboratorio di Tecnica
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
                    Trasforma in musica le idee che hai già in testa.
                  </h1>
                  <p className="text-sm text-white/65 leading-relaxed">
                    Pentatonic <span className="text-white font-semibold">non è un'app per imparare da zero la teoria musicale o le shape</span> sulla tastiera. È uno spazio dedicato al 100% ad affinare la tua tecnica sui{' '}
                    <span className="text-white font-semibold">Fondamentali</span>, così le dita riescono finalmente a seguire quello che immagini.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="rounded-2xl border border-white/10 bg-[#0A0A0C] p-3.5 space-y-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-white/45">
                      Cosa NON facciamo
                    </div>
                    <p className="text-xs sm:text-sm text-white/70 leading-snug">
                      Lezioni di teoria base, spiegazioni infinite di scale o primi accordi da zero.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#A4FF00]/30 bg-[#A4FF00]/[0.06] p-3.5 space-y-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#A4FF00]">
                      Cosa alleni qui
                    </div>
                    <p className="text-xs sm:text-sm text-white/90 leading-snug">
                      Velocità, precisione, espressività, visione del manico e groove sui fondamentali.
                    </p>
                  </div>
                </div>
              </>
            )}

            {/* INTRO SLIDE 2: TEORIA VS TECNICA (SCHEDA PALESTRA) */}
            {introSlide === 1 && (
              <>
                <IntroSlideCoachBubble
                  mood="coach"
                  message="La teoria musicale oggi la trovi ovunque su YouTube, libri e corsi. Il vero collo di bottiglia è quasi sempre un altro."
                />

                <div className="space-y-2.5 px-0.5">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-[#FF6B00]/35 bg-[#FF6B00]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#FF6B00]">
                    <Dumbbell className="h-3.5 w-3.5" />
                    Come una scheda in palestra
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
                    La tecnica non si studia. Si allena ogni giorno.
                  </h1>
                  <p className="text-sm text-white/65 leading-relaxed">
                    Per capire un concetto bastano 10 minuti di video. Per far obbedire le mani servono{' '}
                    <span className="text-white font-semibold">routine, disciplina e zero attrito</span>: aprire l'app e sapere subito cosa fare, proprio come quando entri in palestra con la tua scheda pronta.
                  </p>
                </div>

                <div className="space-y-2">
                  {[
                    {
                      title: 'Zero decisioni, zero attrito',
                      desc: 'Niente 15 minuti persi a decidere cosa studiare: premi Play e parti subito.',
                    },
                    {
                      title: 'Routine sostenibile',
                      desc: 'Anche 5 o 15 minuti fatti bene battono 2 ore fatte una volta al mese.',
                    },
                    {
                      title: 'Sovraccarico progressivo',
                      desc: 'Come i pesi in palestra: serie, recuperi e BPM che salgono solo quando sei pulito.',
                    },
                  ].map((item) => (
                    <div
                      key={item.title}
                      className="flex items-start gap-3 rounded-2xl border border-white/12 bg-[#0A0A0C] px-3.5 py-3"
                    >
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FF6B00]/15 text-[#FF6B00]">
                        <Check className="h-3 w-3 stroke-[3]" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-white">
                          {item.title}
                        </div>
                        <p className="text-xs text-white/55 leading-snug mt-0.5">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* INTRO SLIDE 3: COME FUNZIONA IN BREVE */}
            {introSlide === 2 && (
              <>
                <IntroSlideCoachBubble
                  mood="rocket"
                  message="Tutto chiaro? Allora ecco in 3 punti come funziona la tua sessione su Pentatonic. Ci vorrà un attimo!"
                />

                <div className="space-y-2 px-0.5">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-[#A4FF00]/35 bg-[#A4FF00]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[#A4FF00]">
                    <Sparkles className="h-3.5 w-3.5" />
                    Come funziona
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
                    Scegli il tempo. Suona. Al resto pensa l'app.
                  </h1>
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-start gap-3.5 rounded-2xl border border-white/15 bg-[#0A0A0C] p-3.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FF6B00]/15 text-[#FF6B00]">
                      <SlidersHorizontal className="h-4 w-4" />
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-sm font-black text-white">
                        1. Scheda pronta in 1 tap (5–45 min)
                      </div>
                      <p className="text-xs text-white/60 leading-relaxed">
                        Ogni giorno trovi gli esercizi prioritari sui 5 Fondamentali con tastiera interattiva, varianti e metronomo integrato.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5 rounded-2xl border border-white/15 bg-[#0A0A0C] p-3.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#A4FF00]/15 text-[#A4FF00]">
                      <Gauge className="h-4 w-4" />
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-sm font-black text-white">
                        2. BPM adattivi (Zona Goldilocks)
                      </div>
                      <p className="text-xs text-white/60 leading-relaxed">
                        Si parte sempre comodi per scaldare le mani. A fine serie voti da 1 a 5 la pulizia: se è facile sale subito, se sei teso rallenta.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5 rounded-2xl border border-white/15 bg-[#0A0A0C] p-3.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
                      <TrendingUp className="h-4 w-4" />
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-sm font-black text-white">
                        3. Misura la tua crescita
                      </div>
                      <p className="text-xs text-white/60 leading-relaxed">
                        Traccia le serie settimanali, sali di livello su ogni fondamentale e riascolta le tue registrazioni nel tempo.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* SLIDE NAVIGATION FOOTER */}
            <div className="pt-2 space-y-3">
              <div className="flex items-center justify-center gap-2">
                {([0, 1, 2] as const).map((idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => transitionToIntroSlide(idx)}
                    aria-label={`Vai alla slide ${idx + 1}`}
                    className={`h-1.5 rounded-full transition-all duration-200 ${
                      introSlide === idx
                        ? 'w-6 bg-[#FF6B00]'
                        : 'w-1.5 bg-white/25 hover:bg-white/45'
                    }`}
                  />
                ))}
              </div>

              {introSlide < 2 ? (
                <button
                  type="button"
                  onClick={() =>
                    transitionToIntroSlide((introSlide + 1) as 0 | 1 | 2)
                  }
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-black text-black hover:bg-white/90 active:scale-[0.98] transition"
                >
                  Continua
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={startQuizPhase}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#FF6B00] px-5 py-3 text-sm font-black text-black hover:bg-[#ff7d1f] active:scale-[0.98] transition"
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
        )}
      </main>
    </div>
  );
};
