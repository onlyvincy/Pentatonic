import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Cloud,
  Dumbbell,
  Flame,
  Gauge,
  Layers,
  Music2,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  X,
  Youtube,
  Zap,
} from 'lucide-react';
import {
  BassPathId,
  DiagnosticQuizAnswers,
  Exercise,
  GuitarPathId,
  InstrumentMode,
  InstrumentType,
  PlayerLevelId,
  ScientificPlanPrescription,
  SessionDurationPreset,
} from '../types/practice';
import {
  BASS_LEVEL_OPTIONS,
  BASS_PATH_OPTIONS,
  BOTH_LEVEL_OPTIONS,
  LEVEL_OPTIONS,
  PATH_OPTIONS,
  SESSION_BUDGET_OPTIONS,
  WEEKLY_DAYS_OPTIONS,
  generateScientificPrescription,
} from '../utils/scientificPrescription';
import { OnboardingHeroGuitarBg, PathIllustration } from './PathIllustrations';

export interface OnboardingCompletionResult {
  instrumentMode: InstrumentMode;
  activeInstrument: InstrumentType;
  guitarPrescription?: ScientificPlanPrescription;
  bassPrescription?: ScientificPlanPrescription;
  launchWorkoutNow: boolean;
}

interface OnboardingFlowProps {
  exercises: Exercise[];
  showIntroSlides?: boolean;
  initialInstrumentMode?: InstrumentMode;
  initialActiveInstrument?: InstrumentType;
  onFinishQuiz: (result: OnboardingCompletionResult) => void;
  onCancel?: () => void;
  onOpenCloudLogin?: () => void;
}

interface DraftQuizAnswers {
  guitarPathId: GuitarPathId | null;
  bassPathId: BassPathId | null;
  level: PlayerLevelId | null;
  weeklyDays: 3 | 5 | 7;
  sessionPreset: SessionDurationPreset;
  startInstrument: InstrumentType;
}

const DEFAULT_DRAFT: DraftQuizAnswers = {
  guitarPathId: null,
  bassPathId: null,
  level: null,
  weeklyDays: 5,
  sessionPreset: 15,
  startInstrument: 'guitar',
};

const INSTRUMENT_OPTIONS: {
  value: InstrumentMode;
  title: string;
  badge: string;
  subtitle: string;
  tags: string[];
}[] = [
  {
    value: 'guitar',
    title: 'Chitarra',
    badge: '6 corde · EADGBE',
    subtitle: 'Tecnica solista, alternate picking, legato, bending, riff e accordi mobili.',
    tags: ['Alternate Picking', 'Legato & Bending', 'Riff & Accordi'],
  },
  {
    value: 'bass',
    title: 'Basso',
    badge: '4 corde · EADG',
    subtitle: 'Groove, pocket, fingerstyle, slap & pop e basslines mirate (zero accordi da chitarra).',
    tags: ['Pocket & Ghost Notes', 'Fingerstyle & Raking', 'Slap & Pop'],
  },
  {
    value: 'both',
    title: 'Entrambi',
    badge: 'Chitarra + Basso',
    subtitle: 'Switcher rapido in alto con schede, tastiera, accordatore e progressi separati.',
    tags: ['2 Piani Separati', 'Switcher Rapido', 'Progressi Indipendenti'],
  },
];

/** Friendly Duolingo-style pick/groove mascot ("Plek") for the onboarding coach bubbles */
const PlekMascot: React.FC<{
  mood?: 'wave' | 'coach' | 'rocket';
  isBass?: boolean;
}> = ({ mood = 'wave', isBass = false }) => (
  <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#39FF14]/40 bg-[#39FF14]/12 shadow-[0_0_20px_rgba(57,255,20,0.18)]">
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-9 w-9"
      aria-hidden="true"
    >
      {isBass ? (
        <circle cx="24" cy="24" r="18" fill="#39FF14" />
      ) : (
        <path
          d="M24 5C14 5 8 11.5 8 20.5C8 30.5 17.5 39.5 22.3 43.2C23.3 44 24.7 44 25.7 43.2C30.5 39.5 40 30.5 40 20.5C40 11.5 34 5 24 5Z"
          fill="#39FF14"
        />
      )}
      <path
        d="M15 11.5C17.5 9.2 20.8 8.3 24 8.3C27.2 8.3 30.5 9.2 33 11.5"
        stroke="rgba(255,255,255,0.45)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="18.5" cy="20.5" r="2.6" fill="#000000" />
      <circle cx="29.5" cy="20.5" r="2.6" fill="#000000" />
      <circle cx="19.3" cy="19.6" r="0.9" fill="#FFFFFF" />
      <circle cx="30.3" cy="19.6" r="0.9" fill="#FFFFFF" />
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
  isBass?: boolean;
}

const IntroSlideCoachBubble: React.FC<IntroSlideCoachBubbleProps> = ({
  mood,
  message,
  isBass = false,
}) => (
  <div className="flex items-start gap-3">
    <PlekMascot mood={mood} isBass={isBass} />
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
  initialInstrumentMode,
  initialActiveInstrument,
  onFinishQuiz,
  onCancel,
  onOpenCloudLogin,
}) => {
  const [phase, setPhase] = useState<'instrument' | 'intro' | 'quiz'>('instrument');
  const [instrumentMode, setInstrumentMode] = useState<InstrumentMode | null>(
    showIntroSlides ? null : initialInstrumentMode ?? 'guitar'
  );
  const [introSlide, setIntroSlide] = useState<IntroSlideIndex>(0);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [draft, setDraft] = useState<DraftQuizAnswers>(() => ({
    ...DEFAULT_DRAFT,
    startInstrument:
      initialActiveInstrument ??
      (initialInstrumentMode === 'bass' ? 'bass' : 'guitar'),
  }));
  const [animatingChoice, setAnimatingChoice] = useState<string | null>(null);
  const [isTransitioningOut, setIsTransitioningOut] = useState(false);

  const timersRef = useRef<number[]>([]);
  const touchStartXRef = useRef<number | null>(null);

  const effectiveMode: InstrumentMode = instrumentMode ?? 'guitar';
  const totalQuizSteps = effectiveMode === 'both' ? 4 : 3;

  const clearPendingTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  }, []);

  useEffect(() => {
    return () => clearPendingTimers();
  }, [clearPendingTimers]);

  const resolvedGuitarAnswers: DiagnosticQuizAnswers = useMemo(() => {
    const pathId = draft.guitarPathId ?? 'solista';
    return {
      instrument: 'guitar',
      pathId,
      primaryPainPoint: pathId === 'rhythm' ? 'timing_drift' : 'speed_wall',
      secondaryBottleneck:
        pathId === 'rhythm' ? 'rhythm_stiffness' : 'string_crossing',
      level: draft.level ?? 'intermediate',
      weeklyDays: draft.weeklyDays,
      sessionPreset: draft.sessionPreset,
    };
  }, [draft]);

  const resolvedBassAnswers: DiagnosticQuizAnswers = useMemo(() => {
    const pathId = draft.bassPathId ?? 'groove_pocket';
    return {
      instrument: 'bass',
      pathId,
      primaryPainPoint:
        pathId === 'groove_pocket' ? 'timing_drift' : 'speed_wall',
      secondaryBottleneck:
        pathId === 'groove_pocket' ? 'rhythm_stiffness' : 'string_crossing',
      level: draft.level ?? 'intermediate',
      weeklyDays: draft.weeklyDays,
      sessionPreset: draft.sessionPreset,
    };
  }, [draft]);

  const generatedGuitarPrescription = useMemo(
    () => generateScientificPrescription(resolvedGuitarAnswers, exercises),
    [resolvedGuitarAnswers, exercises]
  );

  const generatedBassPrescription = useMemo(
    () => generateScientificPrescription(resolvedBassAnswers, exercises),
    [resolvedBassAnswers, exercises]
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

  const transitionToInstrumentScreen = useCallback(() => {
    if (isTransitioningOut) return;
    runTransition(() => {
      setPhase('instrument');
    });
  }, [isTransitioningOut, runTransition]);

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
    (nextStep: 1 | 2 | 3 | 4, chosenKey?: string) => {
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

  const handleSelectInstrumentMode = (mode: InstrumentMode) => {
    if (isTransitioningOut || animatingChoice) return;
    setInstrumentMode(mode);
    setDraft((prev) => ({
      ...prev,
      startInstrument: mode === 'bass' ? 'bass' : mode === 'guitar' ? 'guitar' : prev.startInstrument,
    }));
    setAnimatingChoice(mode);
    runTransition(() => {
      if (showIntroSlides) {
        setPhase('intro');
        setIntroSlide(0);
      } else {
        setPhase('quiz');
        setStep(1);
      }
    }, 200);
  };

  const handleSelectGuitarPath = (guitarPathId: GuitarPathId) => {
    if (isTransitioningOut || animatingChoice) return;
    setDraft((prev) => ({ ...prev, guitarPathId }));
    transitionToStep(effectiveMode === 'both' ? 2 : 2, guitarPathId);
  };

  const handleSelectBassPath = (bassPathId: BassPathId) => {
    if (isTransitioningOut || animatingChoice) return;
    setDraft((prev) => ({ ...prev, bassPathId }));
    transitionToStep(effectiveMode === 'both' ? 3 : 2, bassPathId);
  };

  const handleSelectLevel = (level: PlayerLevelId) => {
    if (isTransitioningOut || animatingChoice) return;
    setDraft((prev) => ({ ...prev, level }));
    transitionToStep(effectiveMode === 'both' ? 4 : 3, level);
  };

  const handleActivatePlan = () => {
    const mode = effectiveMode;
    const activeInstrument: InstrumentType =
      mode === 'bass'
        ? 'bass'
        : mode === 'guitar'
        ? 'guitar'
        : draft.startInstrument;

    onFinishQuiz({
      instrumentMode: mode,
      activeInstrument,
      guitarPrescription:
        mode === 'guitar' || mode === 'both'
          ? generatedGuitarPrescription
          : undefined,
      bassPrescription:
        mode === 'bass' || mode === 'both'
          ? generatedBassPrescription
          : undefined,
      launchWorkoutNow: false,
    });
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
    } else if (deltaX > 0) {
      if (introSlide > 0) {
        transitionToIntroSlide((introSlide - 1) as IntroSlideIndex);
      } else {
        transitionToInstrumentScreen();
      }
    }
  };

  const quizStepKind: 'guitar_path' | 'bass_path' | 'level' | 'schedule' =
    effectiveMode === 'guitar'
      ? step === 1
        ? 'guitar_path'
        : step === 2
        ? 'level'
        : 'schedule'
      : effectiveMode === 'bass'
      ? step === 1
        ? 'bass_path'
        : step === 2
        ? 'level'
        : 'schedule'
      : step === 1
      ? 'guitar_path'
      : step === 2
      ? 'bass_path'
      : step === 3
      ? 'level'
      : 'schedule';

  const stepHeaderCopy: Record<
    'guitar_path' | 'bass_path' | 'level' | 'schedule',
    { title: string; subtitle: string }
  > = {
    guitar_path: {
      title:
        effectiveMode === 'both'
          ? 'Percorso Chitarra'
          : 'Scegli il tuo percorso',
      subtitle:
        'Allenerai tutti i fondamentali chitarra, con focus mirato sul tuo stile.',
    },
    bass_path: {
      title:
        effectiveMode === 'both'
          ? 'Percorso Basso (4 corde)'
          : 'Scegli il tuo percorso al basso',
      subtitle:
        'Zero accordi da chitarra: solo groove, tecnica sulle 4 corde e basslines.',
    },
    level: {
      title: 'A che livello sei?',
      subtitle:
        effectiveMode === 'bass'
          ? 'Adatteremo groove, velocità e tecnica sulle 4 corde senza farti sforzare.'
          : effectiveMode === 'both'
          ? 'Adatteremo tecnica, velocità e difficoltà per entrambi gli strumenti.'
          : 'Adatteremo accordi, velocità e difficoltà senza farti sforzare.',
    },
    schedule: {
      title: 'Il tuo ritmo settimanale',
      subtitle:
        'Nessuna pressione: scegli quanto tempo dedicare di solito.',
    },
  };

  const levelOptionsForMode =
    effectiveMode === 'bass'
      ? BASS_LEVEL_OPTIONS
      : effectiveMode === 'both'
      ? BOTH_LEVEL_OPTIONS
      : LEVEL_OPTIONS;

  const totalProgressSegments =
    1 + (showIntroSlides ? INTRO_SLIDE_COUNT : 0) + totalQuizSteps;
  const activeProgressSegment =
    phase === 'instrument'
      ? 1
      : phase === 'intro'
      ? 1 + (introSlide + 1)
      : 1 + (showIntroSlides ? INTRO_SLIDE_COUNT : 0) + step;

  const canGoBack = phase !== 'instrument';

  const handleHeaderBack = () => {
    if (phase === 'intro') {
      if (introSlide > 0) {
        transitionToIntroSlide((introSlide - 1) as IntroSlideIndex);
      } else {
        transitionToInstrumentScreen();
      }
      return;
    }
    if (phase === 'quiz') {
      if (step > 1) {
        transitionToStep((step - 1) as 1 | 2 | 3 | 4);
      } else if (showIntroSlides) {
        transitionToIntroSlide(LAST_INTRO_SLIDE);
      } else {
        transitionToInstrumentScreen();
      }
    }
  };

  const isBassMode = effectiveMode === 'bass';
  const isBothMode = effectiveMode === 'both';

  const introPrereqList = isBassMode
    ? [
        'Teoria musicale di base',
        'Note sul manico a 4 corde (E–A–D–G)',
        'Triadi e scale fondamentali',
      ]
    : isBothMode
    ? [
        'Teoria musicale di base',
        'Accordi base (chitarra) e note 4 corde (basso)',
        'Scale e triadi fondamentali',
      ]
    : [
        'Teoria musicale di base',
        'Forme principali di accordi',
        'Scale fondamentali',
      ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#030405] text-white">
      {/* Dramatic Full-Bleed Chrome & Neon Background on Intro Slide 1 */}
      {phase === 'intro' && introSlide === 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0 flex items-center justify-center overflow-hidden"
        >
          <OnboardingHeroGuitarBg
            instrument={isBassMode ? 'bass' : 'guitar'}
            className="h-[108vh] w-auto max-w-none opacity-85 scale-105 sm:scale-110 transition-opacity duration-300"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 48%, rgba(3,4,5,0.42) 0%, rgba(3,4,5,0.68) 58%, rgba(3,4,5,0.94) 100%)',
            }}
          />
        </div>
      )}

      <header className="relative z-10 mx-auto flex w-full max-w-xl flex-col gap-2 px-5 pt-4 pb-2">
        <div className="flex w-full items-center justify-between gap-2">
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
              {phase === 'instrument'
                ? 'Strumento'
                : phase === 'intro'
                ? `${introSlide + 1} / ${INTRO_SLIDE_COUNT}`
                : `Quiz ${step} / ${totalQuizSteps}`}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1 w-20 sm:w-28">
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
        </div>

        {onOpenCloudLogin && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={onOpenCloudLogin}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/80 px-3 py-1 text-[11px] font-bold text-slate-200 hover:border-[#39FF14]/55 hover:text-white transition"
            >
              <Cloud className="h-3 w-3 text-[#39FF14]" />
              Hai già un account? Accedi
            </button>
          </div>
        )}
      </header>

      <main
        className="relative z-10 mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-4"
        onTouchStart={phase === 'intro' ? handleIntroTouchStart : undefined}
        onTouchEnd={phase === 'intro' ? handleIntroTouchEnd : undefined}
      >
        {phase === 'instrument' ? (
          <div
            key="phase-instrument"
            className={`space-y-5 transition-all duration-150 ${
              isTransitioningOut
                ? 'opacity-0 -translate-y-2 scale-[0.985]'
                : 'animate-quiz-step'
            }`}
          >
            <div className="space-y-1.5 px-0.5">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#39FF14]/40 bg-[#39FF14]/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest text-[#39FF14]">
                <Layers className="h-3 w-3" />
                The Shredding Lab
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight chrome-text leading-tight">
                Cosa suoni?
              </h1>
              <p className="text-xs sm:text-sm text-white/60">
                Costruiremo esercizi, tastiera, suoni e accordatore su misura per il tuo strumento.
              </p>
            </div>

            <div className="space-y-3">
              {INSTRUMENT_OPTIONS.map((opt) => {
                const isAnimating = animatingChoice === opt.value;
                const isSelected =
                  isAnimating || instrumentMode === opt.value;
                const isDimmed = animatingChoice !== null && !isAnimating;

                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelectInstrumentMode(opt.value)}
                    className={`group flex w-full flex-col gap-2.5 rounded-3xl border p-4 text-left transition-all duration-150 active:scale-[0.98] ${
                      isSelected
                        ? 'border-[#39FF14] bg-[#0B0B0B] shadow-[0_0_28px_rgba(57,255,20,0.22)]'
                        : 'border-white/15 bg-black hover:border-white/45'
                    } ${isDimmed ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <h2 className="text-lg sm:text-xl font-black text-white">
                          {opt.title}
                        </h2>
                        <span className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[10px] font-black tracking-wide text-[#39FF14]">
                          {opt.badge}
                        </span>
                      </div>

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

                    <p className="text-xs text-white/65 leading-relaxed">
                      {opt.subtitle}
                    </p>

                    <div className="flex flex-wrap gap-1.5">
                      {opt.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-white/12 bg-black px-2.5 py-0.5 text-[10px] font-bold text-white/75"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : phase === 'intro' ? (
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
                  {isBassMode
                    ? 'Impara a suonare il basso come hai sempre sognato.'
                    : 'Impara a suonare come hai sempre sognato.'}
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
                  isBass={isBassMode}
                  message="Il blocco non è nella testa. È nelle dita."
                />
                <div className="space-y-3 px-0.5">
                  <h1 className="text-3xl sm:text-4xl font-black tracking-tight chrome-text leading-[1.08]">
                    {isBassMode
                      ? 'Senti il groove in testa. Le mani non ti seguono.'
                      : 'Sai cosa suonare. Le mani non ti seguono.'}
                  </h1>
                  <p className="text-sm sm:text-base text-slate-300/75 leading-relaxed">
                    Capire un concetto richiede 5 minuti. Suonarlo{' '}
                    <span className="text-white font-semibold">pulito, a tempo e senza tensione</span>{' '}
                    richiede allenamento vero.
                  </p>
                </div>
              </div>
            )}

            {/* SLIDE 3: TECNICA VS COMPOSIZIONE */}
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
                        {isBassMode
                          ? 'Jaco Pastorius & Flea'
                          : isBothMode
                          ? 'Van Halen & Flea'
                          : 'Eddie Van Halen'}
                      </span>
                      <span className="rounded-full bg-[#39FF14]/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#39FF14]">
                        Qui
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-white/95">
                      {isBassMode
                        ? 'Groove, velocità, precisione e articolazione chirurgica.'
                        : 'Velocità, controllo e precisione chirurgica.'}
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
                  {introPrereqList.map((label) => (
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
                  isBass={isBassMode}
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
                  isBass={isBassMode}
                  message="Chiudi gli occhi un secondo."
                />
                <div className="space-y-3 px-0.5">
                  <h1 className="text-3xl sm:text-4xl font-black tracking-tight chrome-text leading-[1.08]">
                    {isBassMode
                      ? 'Prendi il basso e il groove scorre da solo.'
                      : isBothMode
                      ? 'Prendi chitarra o basso e le dita volano.'
                      : 'Prendi la chitarra e le dita volano.'}
                  </h1>
                  <p className="text-sm sm:text-base text-slate-300/75 leading-relaxed">
                    {isBassMode
                      ? 'Attacchi quella linea o quel fill veloce e ogni nota esce '
                      : "Attacchi quel riff o quell'assolo veloce e ogni nota esce "}
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
            key={`quiz-${effectiveMode}-${step}`}
            className={`space-y-5 transition-all duration-150 ${
              isTransitioningOut
                ? 'opacity-0 -translate-y-2 scale-[0.985]'
                : 'animate-quiz-step'
            }`}
          >
            <div className="space-y-1 px-0.5">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                {stepHeaderCopy[quizStepKind].title}
              </h1>
              <p className="text-xs sm:text-sm text-white/55">
                {stepHeaderCopy[quizStepKind].subtitle}
              </p>
            </div>

            {/* PERCORSO CHITARRA */}
            {quizStepKind === 'guitar_path' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {PATH_OPTIONS.map((opt) => {
                  const isAnimating = animatingChoice === opt.value;
                  const isSelected =
                    isAnimating || draft.guitarPathId === opt.value;
                  const isDimmed = animatingChoice !== null && !isAnimating;

                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleSelectGuitarPath(opt.value)}
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

            {/* PERCORSO BASSO */}
            {quizStepKind === 'bass_path' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {BASS_PATH_OPTIONS.map((opt) => {
                  const isAnimating = animatingChoice === opt.value;
                  const isSelected =
                    isAnimating || draft.bassPathId === opt.value;
                  const isDimmed = animatingChoice !== null && !isAnimating;

                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handleSelectBassPath(opt.value)}
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

            {/* LIVELLO */}
            {quizStepKind === 'level' && (
              <div className="space-y-2.5">
                {levelOptionsForMode.map((opt) => {
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

            {/* RITMO SETTIMANALE + ATTIVA PERCORSO */}
            {quizStepKind === 'schedule' && (
              <div className="space-y-4">
                {effectiveMode === 'both' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-black p-3">
                      <div className="h-12 w-16 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black">
                        <PathIllustration
                          pathId={resolvedGuitarAnswers.pathId ?? 'solista'}
                          className="h-full w-full"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#39FF14]">
                          Chitarra
                        </div>
                        <div className="text-xs font-black text-white truncate">
                          {generatedGuitarPrescription.profileTitle}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-black p-3">
                      <div className="h-12 w-16 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black">
                        <PathIllustration
                          pathId={resolvedBassAnswers.pathId ?? 'groove_pocket'}
                          className="h-full w-full"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#39FF14]">
                          Basso 4 Corde
                        </div>
                        <div className="text-xs font-black text-white truncate">
                          {generatedBassPrescription.profileTitle}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3.5 rounded-2xl border border-white/15 bg-black p-3">
                    <div className="h-14 w-20 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black">
                      <PathIllustration
                        pathId={
                          isBassMode
                            ? resolvedBassAnswers.pathId ?? 'groove_pocket'
                            : resolvedGuitarAnswers.pathId ?? 'solista'
                        }
                        className="h-full w-full"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-black text-white">
                        {isBassMode
                          ? generatedBassPrescription.profileTitle
                          : generatedGuitarPrescription.profileTitle}
                      </div>
                      <div className="text-xs text-white/55">
                        {
                          levelOptionsForMode.find(
                            (l) =>
                              l.value ===
                              (isBassMode
                                ? resolvedBassAnswers.level
                                : resolvedGuitarAnswers.level)
                          )?.title
                        }
                      </div>
                    </div>
                  </div>
                )}

                {effectiveMode === 'both' && (
                  <div className="space-y-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-white/60">
                      Con quale strumento inizi oggi?
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(['guitar', 'bass'] as const).map((inst) => {
                        const selected = draft.startInstrument === inst;
                        return (
                          <button
                            key={inst}
                            type="button"
                            onClick={() =>
                              setDraft((prev) => ({
                                ...prev,
                                startInstrument: inst,
                              }))
                            }
                            className={`rounded-xl border p-2.5 text-center text-xs font-black transition-all duration-150 ${
                              selected
                                ? 'border-[#39FF14] bg-[#39FF14]/15 text-[#39FF14]'
                                : 'border-white/15 bg-black text-white/70 hover:border-white/40'
                            }`}
                          >
                            {inst === 'guitar' ? 'Chitarra (6 corde)' : 'Basso (4 corde)'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

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
                  onClick={handleActivatePlan}
                  className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-[#39FF14] px-5 py-3 text-sm font-black text-black hover:bg-[#5EFF3D] active:scale-[0.98] transition"
                >
                  <Sparkles className="h-4 w-4" />
                  {effectiveMode === 'both'
                    ? 'Attiva Entrambi i Percorsi'
                    : 'Attiva Percorso'}
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
