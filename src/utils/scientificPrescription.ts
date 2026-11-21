import {
  DiagnosticQuizAnswers,
  Exercise,
  ExerciseWeeklyDose,
  FondamentaId,
  PainPointId,
  PathId,
  PlayerLevelId,
  ScaledWorkoutItem,
  ScaledWorkoutPlan,
  ScientificPlanPrescription,
  SecondaryBottleneckId,
  SessionDurationPreset,
  WorkoutSessionLog,
  WorkoutTemplate,
} from '../types/practice';
import {
  ExerciseMasteryScore,
  WeightedVariantBpmSummary,
  computeExerciseScore,
  computeWeightedExerciseBpm,
  pickNextRecommendedVariant,
} from './overloadEngine';

export interface QuizOption<T extends string | number> {
  value: T;
  title: string;
  subtitle: string;
  badge?: string;
}

export interface PathOption {
  value: PathId;
  title: string;
  subtitle: string;
  focusBadges: string[];
}

export const PATH_OPTIONS: PathOption[] = [
  {
    value: 'solista',
    title: 'Percorso Solista',
    subtitle: 'Scioltezza mano sinistra, alternate picking, legato, bending ed espressività.',
    focusBadges: ['Alternate Picking', 'Legato & Bending', 'Manico Libero'],
  },
  {
    value: 'rhythm',
    title: 'Percorso Rhythm',
    subtitle: 'Palm muting, power chords veloci, accordi barrè mobili e timing.',
    focusBadges: ['Palm Mute & Power', 'Barrè Mobili', 'Timing & Groove'],
  },
];

export function resolvePathId(answers: DiagnosticQuizAnswers): PathId {
  if (answers.pathId === 'solista' || answers.pathId === 'rhythm') {
    return answers.pathId;
  }
  return answers.primaryPainPoint === 'timing_drift' ? 'rhythm' : 'solista';
}

export const PAIN_POINT_OPTIONS: QuizOption<PainPointId>[] = [
  {
    value: 'speed_wall',
    title: 'Mi si incartano le dita appena provo ad andare veloce',
    subtitle: 'Voglio suonare assoli veloci e puliti senza sbagliare corda.',
  },
  {
    value: 'left_hand_fatigue',
    title: 'La mano sinistra si stanca subito e il mignolo non risponde',
    subtitle: 'Voglio dita sciolte, leggere e forti senza fare fatica.',
  },
  {
    value: 'timing_drift',
    title: 'Non riesco a suonare in gruppo o su una base a tempo',
    subtitle: 'Voglio tenere il ritmo da solo senza accelerare o rallentare.',
  },
  {
    value: 'neck_trapped',
    title: 'Suono sempre le solite 4 note nello stesso punto del manico',
    subtitle: 'Voglio muovermi su tutta la tastiera senza perdermi.',
  },
];

export const BOTTLENECK_OPTIONS: QuizOption<SecondaryBottleneckId>[] = [
  {
    value: 'string_crossing',
    title: 'Cambiare corda senza incepparmi col plettro',
    subtitle: 'Zero esitazioni tra una corda e l’altra.',
  },
  {
    value: 'finger_tension',
    title: 'Suonare rilassato senza irrigidire mano e spalla',
    subtitle: 'Dita vicine ai tasti e zero sforzo inutile.',
  },
  {
    value: 'rhythm_stiffness',
    title: 'Accompagnare i brani con un polso sciolto e preciso',
    subtitle: 'Accordi ritmici fluidi e sempre nel tempo.',
  },
  {
    value: 'box_isolation',
    title: 'Collegare i tasti bassi a quelli alti negli assoli',
    subtitle: 'Passare da una zona all’altra del manico senza fermarmi.',
  },
];

export const LEVEL_OPTIONS: QuizOption<PlayerLevelId>[] = [
  {
    value: 'foundation',
    title: 'Parto dalle basi',
    subtitle: 'Accordi aperti, prime pentatoniche e pulizia sul tempo.',
  },
  {
    value: 'intermediate',
    title: 'Intermedio',
    subtitle: 'Accordi barrè mobili, fraseggio e velocità sempre più pulita.',
  },
  {
    value: 'advanced',
    title: 'Avanzato',
    subtitle: 'Controllo totale ad alta velocità, barrè mobili ed espressività.',
  },
];

export const WEEKLY_DAYS_OPTIONS: QuizOption<3 | 5 | 7>[] = [
  {
    value: 3,
    title: '3 giorni',
    subtitle: 'Ritmo leggero',
  },
  {
    value: 5,
    title: '5 giorni',
    subtitle: 'Consigliato',
  },
  {
    value: 7,
    title: 'Ogni giorno',
    subtitle: 'Massima costanza',
  },
];

export const SESSION_BUDGET_OPTIONS: QuizOption<SessionDurationPreset>[] = [
  {
    value: 5,
    title: '5 min',
    subtitle: 'Solo l’essenziale',
  },
  {
    value: 15,
    title: '15 min',
    subtitle: 'Veloce e mirato',
  },
  {
    value: 30,
    title: '30 min',
    subtitle: 'Allenamento completo',
  },
  {
    value: 45,
    title: '45 min',
    subtitle: 'Massimi risultati',
  },
];

export const LEGACY_EXERCISE_ID_MAP: Record<string, string> = {
  'ex-picking-pg6': 'ex-speed-bursts',
  'ex-pent-box1': 'ex-pent-licks',
  'ex-lead-phrasing': 'ex-lead-bending',
  'ex-rhythm-chords': 'ex-harmony-scale',
  'ex-rhythm-funk16': 'ex-rhythm-gap',
};

const DOSE_COPY_BY_EXERCISE: Record<
  string,
  { coachMethod: string; scientificRationale: string }
> = {
  'ex-speed-bursts': {
    coachMethod: 'Escape & Speed Burst',
    scientificRationale: 'Alterna ottavi di controllo e burst 1/16 con movimenti di escape USX/DSX.',
  },
  'ex-pent-licks': {
    coachMethod: 'Lick Solisti',
    scientificRationale: 'Vocabolario pentatonico ad alta velocità, sequenze a 3/4 e salti di corda.',
  },
  'ex-picking-spider': {
    coachMethod: 'Indipendenza & Muting',
    scientificRationale: 'Rinforza dita, stretch laterale e string muting mano sinistra senza tensione.',
  },
  'ex-arpeggio-progressions': {
    coachMethod: 'Arpeggi & Songwriting',
    scientificRationale: 'Pattern modulari per gradi (1-3-5-8) applicabili su qualsiasi giro armonico.',
  },
  'ex-legato-trill': {
    coachMethod: 'Legato & Rolling 3NPS',
    scientificRationale: 'Suona legati fluidi, trilli e hammer-on from nowhere senza plettrata.',
  },
  'ex-lead-bending': {
    coachMethod: 'Bending & Target Notes',
    scientificRationale: 'Centra pitch, vibrato, double-stop e note bersaglio sugli accordi.',
  },
  'ex-harmony-scale': {
    coachMethod: 'Armonia, Barrè & Gradi',
    scientificRationale: 'Padroneggia gradi della scala, numeri romani e forme barrè mobili.',
  },
  'ex-pent-diagonal': {
    coachMethod: 'Visione Orizzontale',
    scientificRationale: 'Collega il manico per diagonali, singola corda, triadi ed ottave 3NPS.',
  },
  'ex-rhythm-palmmute': {
    coachMethod: 'Chug, Gallop & Muting',
    scientificRationale: 'Domina palm mute 16ths, gallop, poliritmi 3+3+2, stabs sincopati e stoppate.',
  },
  'ex-rhythm-gap': {
    coachMethod: 'Timing & Groove 16th',
    scientificRationale: 'Orologio interno su battuta muta, sincopi in levare e ghost notes funk.',
  },
};

export function generateScientificPrescription(
  answers: DiagnosticQuizAnswers,
  exercises: Exercise[]
): ScientificPlanPrescription {
  const pathId = resolvePathId(answers);
  const exIdsAvailable = new Set(exercises.map((e) => e.id));

  // Level & frequency volume scaling
  const levelBonus =
    answers.level === 'advanced' ? 2 : answers.level === 'intermediate' ? 1 : 0;
  const freqBonus =
    answers.weeklyDays === 7 ? 2 : answers.weeklyDays === 5 ? 1 : 0;

  const pickedIds: {
    id: string;
    role: 'primario' | 'secondario' | 'fondamentale';
    roleLabel: string;
    minSets: number;
    optSets: number;
    setsPerSession: number;
    durationSec: number;
  }[] = [];

  const addIfAvailable = (
    id: string,
    role: 'primario' | 'secondario' | 'fondamentale',
    roleLabel: string,
    minSets: number,
    optSets: number,
    setsPerSession: number,
    durationSec: number
  ) => {
    if (!exIdsAvailable.has(id)) return;
    if (pickedIds.some((p) => p.id === id)) return;
    pickedIds.push({
      id,
      role,
      roleLabel,
      minSets,
      optSets,
      setsPerSession,
      durationSec,
    });
  };

  if (pathId === 'solista') {
    const solistaPrimary = [
      'ex-speed-bursts',
      'ex-pent-licks',
      'ex-lead-bending',
      'ex-legato-trill',
    ];
    solistaPrimary.forEach((id, idx) => {
      addIfAvailable(
        id,
        'primario',
        `Focus ${idx + 1}`,
        Math.min(8, 5 + levelBonus + freqBonus),
        Math.min(12, 8 + levelBonus + freqBonus * 2),
        3,
        90
      );
    });

    const solistaSupport = [
      'ex-picking-spider',
      'ex-pent-diagonal',
      'ex-arpeggio-progressions',
      'ex-harmony-scale',
    ];
    solistaSupport.forEach((id) => {
      addIfAvailable(
        id,
        'secondario',
        'Supporto',
        4 + Math.min(1, freqBonus),
        6 + levelBonus + freqBonus,
        2,
        90
      );
    });

    const solistaRhythmBase = [
      'ex-rhythm-palmmute',
      'ex-rhythm-gap',
    ];
    solistaRhythmBase.forEach((id) => {
      addIfAvailable(
        id,
        'fondamentale',
        'Fondamenta',
        2 + Math.min(1, freqBonus),
        4 + Math.min(2, freqBonus),
        2,
        75
      );
    });
  } else {
    const rhythmPrimary = [
      'ex-rhythm-palmmute',
      'ex-rhythm-gap',
      'ex-arpeggio-progressions',
      'ex-harmony-scale',
    ];
    rhythmPrimary.forEach((id, idx) => {
      addIfAvailable(
        id,
        'primario',
        `Focus ${idx + 1}`,
        Math.min(8, 5 + levelBonus + freqBonus),
        Math.min(12, 8 + levelBonus + freqBonus * 2),
        3,
        90
      );
    });

    const rhythmSupport = [
      'ex-picking-spider',
      'ex-speed-bursts',
    ];
    rhythmSupport.forEach((id) => {
      addIfAvailable(
        id,
        'secondario',
        'Supporto',
        3 + Math.min(1, freqBonus),
        5 + levelBonus + freqBonus,
        2,
        90
      );
    });

    const rhythmSoloBase = [
      'ex-pent-licks',
      'ex-lead-bending',
      'ex-legato-trill',
      'ex-pent-diagonal',
    ];
    rhythmSoloBase.forEach((id) => {
      addIfAvailable(
        id,
        'fondamentale',
        'Fondamenta',
        2 + Math.min(1, freqBonus),
        4 + Math.min(2, freqBonus),
        2,
        75
      );
    });
  }

  // Include any remaining custom or future exercises as baseline volume
  for (const ex of exercises) {
    addIfAvailable(
      ex.id,
      'fondamentale',
      'Fondamenta',
      2 + Math.min(1, freqBonus),
      4 + freqBonus,
      2,
      60
    );
  }

  const doses: ExerciseWeeklyDose[] = pickedIds.map((item) => {
    const copy = DOSE_COPY_BY_EXERCISE[item.id] ?? {
      coachMethod: 'Su misura',
      scientificRationale: 'Migliora precisione e controllo.',
    };
    return {
      exerciseId: item.id,
      role: item.role,
      roleLabel: item.roleLabel,
      weeklyMinSets: item.minSets,
      weeklyOptimalSets: Math.max(item.minSets + 2, item.optSets),
      setsPerSession: item.setsPerSession,
      setDurationSec: item.durationSec,
      restSec: 15,
      coachMethod: copy.coachMethod,
      scientificRationale: copy.scientificRationale,
    };
  });

  const profileTitle =
    pathId === 'rhythm' ? 'Percorso Rhythm' : 'Percorso Solista';
  const diagnosisSummary =
    pathId === 'rhythm'
      ? 'Focus su palm muting, power chords veloci, accordi barrè mobili e timing.'
      : 'Focus su alternate picking, legato, bending e libertà su tutto il manico.';

  return {
    id: `plan-${Date.now()}`,
    createdAt: new Date().toISOString(),
    answers: {
      ...answers,
      pathId,
    },
    profileTitle,
    diagnosisSummary,
    scientificBasis: '',
    doses,
  };
}

export function createDefaultScientificPrescription(
  exercises: Exercise[],
  activeProgramId?: string,
  preset: SessionDurationPreset = 15
): ScientificPlanPrescription {
  const pathId: PathId =
    activeProgramId === 'prog-rhythm' ? 'rhythm' : 'solista';
  const painByProgram: Record<string, PainPointId> = {
    'prog-picking': 'speed_wall',
    'prog-lefthand': 'left_hand_fatigue',
    'prog-rhythm': 'timing_drift',
    'prog-pentatonic': 'neck_trapped',
    'prog-daily-all': 'speed_wall',
  };
  const secondaryByProgram: Record<string, SecondaryBottleneckId> = {
    'prog-picking': 'string_crossing',
    'prog-lefthand': 'finger_tension',
    'prog-rhythm': 'rhythm_stiffness',
    'prog-pentatonic': 'box_isolation',
    'prog-daily-all': 'finger_tension',
  };

  return generateScientificPrescription(
    {
      pathId,
      primaryPainPoint:
        (activeProgramId && painByProgram[activeProgramId]) || 'speed_wall',
      secondaryBottleneck:
        (activeProgramId && secondaryByProgram[activeProgramId]) ||
        'finger_tension',
      level: 'intermediate',
      weeklyDays: 5,
      sessionPreset: preset,
    },
    exercises
  );
}

export interface ExerciseWeeklyProgressItem {
  dose: ExerciseWeeklyDose;
  exercise: Exercise;
  mastery: ExerciseMasteryScore;
  weightedSummary: WeightedVariantBpmSummary;
  completedSets: number;
  weeklyMinSets: number;
  weeklyOptimalSets: number;
  missingForMin: number;
  missingForOptimal: number;
  minReached: boolean;
  optimalReached: boolean;
  minPct: number;
  optimalPct: number;
  priorityRank: number;
}

export interface WeeklyDoseSummary {
  items: ExerciseWeeklyProgressItem[];
  totalCompletedSets: number;
  totalMinSets: number;
  totalOptimalSets: number;
  totalMissingForMin: number;
  overallMinPct: number;
}

export const FONDAMENTA_CATALOG: Record<
  FondamentaId,
  { id: FondamentaId; title: string; subtitle: string; order: number }
> = {
  velocita: {
    id: 'velocita',
    title: 'Velocità',
    subtitle: 'Alternate picking e cambio corda veloce',
    order: 1,
  },
  precisione: {
    id: 'precisione',
    title: 'Precisione',
    subtitle: 'Indipendenza dita, controllo e palm muting',
    order: 2,
  },
  espressivita: {
    id: 'espressivita',
    title: 'Espressività',
    subtitle: 'Legato, hammer-on, pull-off, bending e vibrato',
    order: 3,
  },
  visione: {
    id: 'visione',
    title: 'Visione',
    subtitle: 'Spostamenti sul manico, accordi e barrè mobili',
    order: 4,
  },
  groove: {
    id: 'groove',
    title: 'Groove & Timing',
    subtitle: 'Orologio interno, battuta muta e polso ritmico',
    order: 5,
  },
};

export interface FondamentaWeeklyGroup {
  fondamentaId: FondamentaId;
  title: string;
  subtitle: string;
  isPrimaryFocus: boolean;
  completedSets: number;
  weeklyMinSets: number;
  weeklyOptimalSets: number;
  minPct: number;
  optimalPct: number;
  minReached: boolean;
  optimalReached: boolean;
  fondamentaLevel: number;
  avgLevelProgressPct: number;
  items: ExerciseWeeklyProgressItem[];
}

export function getFondamentaForExercise(ex: Exercise): FondamentaId {
  switch (ex.id) {
    case 'ex-speed-bursts':
    case 'ex-pent-licks':
      return 'velocita';
    case 'ex-picking-spider':
    case 'ex-arpeggio-progressions':
      return 'precisione';
    case 'ex-legato-trill':
    case 'ex-lead-bending':
      return 'espressivita';
    case 'ex-harmony-scale':
    case 'ex-pent-diagonal':
      return 'visione';
    case 'ex-rhythm-palmmute':
    case 'ex-rhythm-gap':
      return 'groove';
    default:
      if (ex.category === 'picking') return 'velocita';
      if (ex.category === 'fretboard') return 'precisione';
      if (ex.category === 'legato') return 'espressivita';
      if (ex.category === 'pentatonic') return 'visione';
      return 'groove';
  }
}

export function computeWeeklyDoseProgress(
  prescription: ScientificPlanPrescription,
  exercises: Exercise[],
  sessionLogs: WorkoutSessionLog[]
): WeeklyDoseSummary {
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const weeklySetsByExercise = new Map<string, number>();
  for (const log of sessionLogs) {
    const logMs = new Date(log.date).getTime() || 0;
    if (logMs < sevenDaysAgoMs) continue;
    for (const st of log.sets) {
      weeklySetsByExercise.set(
        st.exerciseId,
        (weeklySetsByExercise.get(st.exerciseId) || 0) + 1
      );
    }
  }

  const seenIds = new Set<string>();
  const rawItems: Omit<ExerciseWeeklyProgressItem, 'priorityRank'>[] = [];
  for (const dose of prescription.doses) {
    const exercise = exMap.get(dose.exerciseId);
    if (!exercise || seenIds.has(exercise.id)) continue;
    seenIds.add(exercise.id);

    const completedSets = weeklySetsByExercise.get(exercise.id) || 0;
    const missingForMin = Math.max(0, dose.weeklyMinSets - completedSets);
    const missingForOptimal = Math.max(0, dose.weeklyOptimalSets - completedSets);
    const mastery = computeExerciseScore(exercise, sessionLogs);
    const weightedSummary = computeWeightedExerciseBpm(
      exercise,
      sessionLogs,
      undefined,
      prescription.answers.level
    );
    const minPct = Math.min(
      100,
      Math.round((completedSets / Math.max(1, dose.weeklyMinSets)) * 100)
    );
    const optimalPct = Math.min(
      100,
      Math.round((completedSets / Math.max(1, dose.weeklyOptimalSets)) * 100)
    );

    rawItems.push({
      dose,
      exercise,
      mastery,
      weightedSummary,
      completedSets,
      weeklyMinSets: dose.weeklyMinSets,
      weeklyOptimalSets: dose.weeklyOptimalSets,
      missingForMin,
      missingForOptimal,
      minReached: missingForMin === 0,
      optimalReached: missingForOptimal === 0,
      minPct,
      optimalPct,
    });
  }

  rawItems.sort((a, b) => {
    if (a.missingForMin !== b.missingForMin) {
      return b.missingForMin - a.missingForMin;
    }
    if (a.mastery.totalXp !== b.mastery.totalXp) {
      return a.mastery.totalXp - b.mastery.totalXp;
    }
    return b.missingForOptimal - a.missingForOptimal;
  });

  const items: ExerciseWeeklyProgressItem[] = rawItems.map((it, idx) => ({
    ...it,
    priorityRank: idx + 1,
  }));

  const totalCompletedSets = items.reduce((acc, i) => acc + i.completedSets, 0);
  const totalMinSets = items.reduce((acc, i) => acc + i.weeklyMinSets, 0);
  const totalOptimalSets = items.reduce((acc, i) => acc + i.weeklyOptimalSets, 0);
  const totalMissingForMin = items.reduce((acc, i) => acc + i.missingForMin, 0);
  const overallMinPct =
    totalMinSets > 0
      ? Math.min(100, Math.round((totalCompletedSets / totalMinSets) * 100))
      : 100;

  return {
    items,
    totalCompletedSets,
    totalMinSets,
    totalOptimalSets,
    totalMissingForMin,
    overallMinPct,
  };
}

export function computeFondamentaWeeklyGroups(
  prescription: ScientificPlanPrescription,
  exercises: Exercise[],
  sessionLogs: WorkoutSessionLog[]
): FondamentaWeeklyGroup[] {
  const weekly = computeWeeklyDoseProgress(prescription, exercises, sessionLogs);
  const pathId = resolvePathId(prescription.answers);
  const primaryFondamenta: FondamentaId =
    pathId === 'rhythm' ? 'groove' : 'velocita';
  const pathOrder: FondamentaId[] =
    pathId === 'rhythm'
      ? ['groove', 'precisione', 'visione', 'velocita', 'espressivita']
      : ['velocita', 'espressivita', 'precisione', 'visione', 'groove'];

  const bucket = new Map<FondamentaId, ExerciseWeeklyProgressItem[]>();
  (
    ['velocita', 'precisione', 'espressivita', 'visione', 'groove'] as FondamentaId[]
  ).forEach((fid) => bucket.set(fid, []));

  for (const item of weekly.items) {
    const fid = getFondamentaForExercise(item.exercise);
    bucket.get(fid)!.push(item);
  }

  const groups: FondamentaWeeklyGroup[] = [];
  for (const [fid, items] of bucket.entries()) {
    if (items.length === 0) continue;
    const meta = FONDAMENTA_CATALOG[fid];
    const completedSets = items.reduce((acc, i) => acc + i.completedSets, 0);
    const weeklyMinSets = items.reduce((acc, i) => acc + i.weeklyMinSets, 0);
    const weeklyOptimalSets = items.reduce((acc, i) => acc + i.weeklyOptimalSets, 0);
    const minPct = Math.min(
      100,
      Math.round((completedSets / Math.max(1, weeklyMinSets)) * 100)
    );
    const optimalPct = Math.min(
      100,
      Math.round((completedSets / Math.max(1, weeklyOptimalSets)) * 100)
    );
    const avgLvlRaw =
      items.reduce((acc, i) => acc + i.mastery.level, 0) / items.length;
    const fondamentaLevel = Math.max(1, Math.min(10, Math.round(avgLvlRaw)));
    const avgLevelProgressPct = Math.round(
      items.reduce((acc, i) => acc + i.mastery.levelProgressPct, 0) / items.length
    );

    groups.push({
      fondamentaId: fid,
      title: meta.title,
      subtitle: meta.subtitle,
      isPrimaryFocus: fid === primaryFondamenta,
      completedSets,
      weeklyMinSets,
      weeklyOptimalSets,
      minPct,
      optimalPct,
      minReached: completedSets >= weeklyMinSets,
      optimalReached: completedSets >= weeklyOptimalSets,
      fondamentaLevel,
      avgLevelProgressPct,
      items,
    });
  }

  groups.sort(
    (a, b) =>
      pathOrder.indexOf(a.fondamentaId) - pathOrder.indexOf(b.fondamentaId)
  );

  return groups;
}

export function buildSessionPlanFromPrescription(
  prescription: ScientificPlanPrescription,
  exercises: Exercise[],
  sessionLogs: WorkoutSessionLog[],
  preset: SessionDurationPreset,
  selectedExerciseIds?: string[]
): ScaledWorkoutPlan {
  const weekly = computeWeeklyDoseProgress(prescription, exercises, sessionLogs);

  const countByPreset: Record<SessionDurationPreset, number> = {
    5: 1,
    15: 2,
    30: 3,
    45: 5,
  };

  let chosenProgressItems: ExerciseWeeklyProgressItem[] = [];
  if (selectedExerciseIds && selectedExerciseIds.length > 0) {
    const selectedSet = new Set(selectedExerciseIds);
    chosenProgressItems = weekly.items.filter((i) =>
      selectedSet.has(i.exercise.id)
    );
  }
  if (chosenProgressItems.length === 0) {
    chosenProgressItems = weekly.items.slice(
      0,
      Math.min(countByPreset[preset], weekly.items.length)
    );
  }

  const targetTotalSec = preset * 60;
  const restSec = 15;
  const baseDurByPreset: Record<SessionDurationPreset, number> = {
    5: 85,
    15: 95,
    30: 105,
    45: 120,
  };

  const numExercises = Math.max(1, chosenProgressItems.length);
  const baseDur = baseDurByPreset[preset];
  const maxTotalSets = numExercises * 10;
  const rawTotalSets = Math.round(targetTotalSec / (baseDur + restSec));
  const totalSets = Math.min(
    maxTotalSets,
    Math.max(numExercises, rawTotalSets)
  );

  // Fine-tune per-set duration (in 5s steps, clamped 45s..150s) to match preset minutes
  const idealSetDur = targetTotalSec / totalSets - restSec;
  const durationSec = Math.max(
    45,
    Math.min(150, Math.round(idealSetDur / 5) * 5)
  );

  const baseSetsPerEx = Math.floor(totalSets / numExercises);
  const extraSetsCount = totalSets % numExercises;

  const playerLevel = prescription.answers.level;

  const items: ScaledWorkoutItem[] = chosenProgressItems.map(
    (progItem, idx) => {
      const sets = baseSetsPerEx + (idx < extraSetsCount ? 1 : 0);
      const pickedVar = pickNextRecommendedVariant(
        progItem.exercise,
        sessionLogs,
        undefined,
        playerLevel
      );
      const targetBpm = pickedVar
        ? computeWeightedExerciseBpm(
            progItem.exercise,
            sessionLogs,
            pickedVar.id,
            playerLevel
          ).nextSessionBpm
        : progItem.weightedSummary.nextSessionBpm;
      const reason =
        progItem.missingForMin > 0
          ? `Mancano ${progItem.missingForMin} serie al Weekly Min`
          : progItem.missingForOptimal > 0
          ? `Ottimale (+${progItem.missingForOptimal} serie)`
          : `Lv. ${progItem.mastery.level}`;

      return {
        exerciseId: progItem.exercise.id,
        sets,
        durationSec,
        restSec,
        exercise: progItem.exercise,
        targetBpm,
        preferredVariantId: pickedVar?.id,
        pillarNumber: progItem.priorityRank,
        pillarLabel: progItem.dose.roleLabel,
        selectionReason: reason,
      };
    }
  );

  const totalSec = items.reduce(
    (acc, it) => acc + it.sets * (it.durationSec + it.restSec),
    0
  );

  const syntheticWorkout: WorkoutTemplate = {
    id: `wk-rx-${preset}-${prescription.id}`,
    title: prescription.profileTitle,
    subtitle: `${preset} min • Algoritmo Weekly Minimum`,
    programId: 'scientific-rx',
    dayNumber: 1,
    estimatedMinutes: Math.max(3, Math.round(totalSec / 60)),
    items: items.map((i) => ({
      exerciseId: i.exerciseId,
      sets: i.sets,
      durationSec: i.durationSec,
      restSec: i.restSec,
    })),
  };

  return {
    workout: syntheticWorkout,
    preset,
    modeLabel: `${preset} min • Piano Scientifico`,
    modeDescription: prescription.diagnosisSummary,
    isStandardized: true,
    estimatedMinutes: syntheticWorkout.estimatedMinutes,
    playerLevel,
    items,
  };
}
