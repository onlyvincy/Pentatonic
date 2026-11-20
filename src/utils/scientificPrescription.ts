import {
  DiagnosticQuizAnswers,
  Exercise,
  ExerciseWeeklyDose,
  FondamentaId,
  PainPointId,
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
} from './overloadEngine';

export interface QuizOption<T extends string | number> {
  value: T;
  title: string;
  subtitle: string;
  badge?: string;
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
    subtitle: 'Faccio ancora fatica a suonare pulito e a tempo.',
  },
  {
    value: 'intermediate',
    title: 'Suono già ma sono bloccato',
    subtitle: 'Le cose lente vengono bene, ma appena accelero sporco tutto.',
  },
  {
    value: 'advanced',
    title: 'Suono veloce ma voglio zero errori',
    subtitle: 'Voglio pulizia totale anche nei passaggi più difficili.',
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

interface ProfileTemplate {
  profileTitle: string;
  diagnosisSummary: string;
  scientificBasis: string;
  primaryIds: [string, string];
  fallbackAnchorId: string;
}

const PROFILE_TEMPLATES: Record<PainPointId, ProfileTemplate> = {
  speed_wall: {
    profileTitle: 'Velocità & Pulizia sugli Assoli',
    diagnosisSummary:
      'Sblocca la sincronia tra le due mani per correre senza sporcare le note.',
    scientificBasis: '',
    primaryIds: ['ex-picking-pg6', 'ex-pent-box1'],
    fallbackAnchorId: 'ex-rhythm-gap',
  },
  left_hand_fatigue: {
    profileTitle: 'Mano Sinistra Sciolta & Leggera',
    diagnosisSummary:
      'Rendi tutte e 4 le dita veloci e indipendenti senza stancarti.',
    scientificBasis: '',
    primaryIds: ['ex-legato-trill', 'ex-picking-spider'],
    fallbackAnchorId: 'ex-rhythm-gap',
  },
  timing_drift: {
    profileTitle: 'Sempre a Tempo su Basi e Gruppo',
    diagnosisSummary:
      'Costruisci un ritmo interno automatico anche quando la batteria si ferma.',
    scientificBasis: '',
    primaryIds: ['ex-rhythm-gap', 'ex-rhythm-funk16'],
    fallbackAnchorId: 'ex-pent-box1',
  },
  neck_trapped: {
    profileTitle: 'Libertà su Tutto il Manico',
    diagnosisSummary:
      'Improvvisa su tutta la tastiera senza restare chiuso in un solo box.',
    scientificBasis: '',
    primaryIds: ['ex-pent-diagonal', 'ex-pent-box1'],
    fallbackAnchorId: 'ex-rhythm-gap',
  },
};

const BOTTLENECK_EXERCISE_MAP: Record<SecondaryBottleneckId, string> = {
  string_crossing: 'ex-pent-box1',
  finger_tension: 'ex-picking-spider',
  rhythm_stiffness: 'ex-rhythm-funk16',
  box_isolation: 'ex-pent-diagonal',
};

const DOSE_COPY_BY_EXERCISE: Record<
  string,
  { coachMethod: string; scientificRationale: string }
> = {
  'ex-pent-box1': {
    coachMethod: 'Cambio corda',
    scientificRationale: 'Passa da una corda all’altra senza intoppi.',
  },
  'ex-picking-pg6': {
    coachMethod: 'Velocità',
    scientificRationale: 'Sincronizza plettro e dita nei passaggi rapidi.',
  },
  'ex-rhythm-gap': {
    coachMethod: 'Tempo interno',
    scientificRationale: 'Resta a tempo da solo anche nel silenzio.',
  },
  'ex-legato-trill': {
    coachMethod: 'Forza mano sinistra',
    scientificRationale: 'Suona legati forti e chiari senza plettro.',
  },
  'ex-pent-diagonal': {
    coachMethod: 'Tutto il manico',
    scientificRationale: 'Collega tasti bassi e alti con un gesto fluido.',
  },
  'ex-picking-spider': {
    coachMethod: 'Controllo dita',
    scientificRationale: 'Rinforza mignolo e anulare senza tensione.',
  },
  'ex-rhythm-funk16': {
    coachMethod: 'Polso sciolto',
    scientificRationale: 'Tieni il groove sugli accordi senza irrigidirti.',
  },
};

export function generateScientificPrescription(
  answers: DiagnosticQuizAnswers,
  exercises: Exercise[]
): ScientificPlanPrescription {
  const tpl = PROFILE_TEMPLATES[answers.primaryPainPoint];
  const exIdsAvailable = new Set(exercises.map((e) => e.id));

  // Level & frequency volume scaling: MEV (Minimum Effective Volume) & MAV (Maximum Adaptive Volume)
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

  // Primary deficiency core (#1 & #2)
  addIfAvailable(
    tpl.primaryIds[0],
    'primario',
    'Priorità 1',
    6 + levelBonus + freqBonus,
    9 + levelBonus + freqBonus * 2,
    3,
    90
  );
  addIfAvailable(
    tpl.primaryIds[1],
    'primario',
    'Priorità 2',
    5 + levelBonus,
    8 + levelBonus + freqBonus,
    3,
    90
  );

  // Secondary bottleneck exercise
  const secondaryId = BOTTLENECK_EXERCISE_MAP[answers.secondaryBottleneck];
  addIfAvailable(
    secondaryId,
    'secondario',
    'Supporto',
    4 + freqBonus,
    6 + levelBonus + freqBonus,
    2,
    90
  );

  // Foundational timing / versatility anchor
  addIfAvailable(
    tpl.fallbackAnchorId,
    'fondamentale',
    'Base',
    3 + Math.min(1, freqBonus),
    5 + freqBonus,
    2,
    90
  );

  // Include all remaining exercises across the 4 Fondamenta as baseline volume
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

  return {
    id: `plan-${Date.now()}`,
    createdAt: new Date().toISOString(),
    answers,
    profileTitle: tpl.profileTitle,
    diagnosisSummary: tpl.diagnosisSummary,
    scientificBasis: tpl.scientificBasis,
    doses,
  };
}

export function createDefaultScientificPrescription(
  exercises: Exercise[],
  activeProgramId?: string,
  preset: SessionDurationPreset = 15
): ScientificPlanPrescription {
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
  picking: {
    id: 'picking',
    title: 'Plettro & Velocità',
    subtitle: 'Sincronia mani, cambio corda e indipendenza dita',
    order: 1,
  },
  legato: {
    id: 'legato',
    title: 'Mano Sinistra & Legato',
    subtitle: 'Forza dita, hammer-on, pull-off e controllo',
    order: 2,
  },
  pentatonic: {
    id: 'pentatonic',
    title: 'Assoli & Manico',
    subtitle: 'Pentatonica, fraseggio e visione orizzontale',
    order: 3,
  },
  rhythm: {
    id: 'rhythm',
    title: 'Ritmo & Groove',
    subtitle: 'Orologio interno, battuta muta e polso destro',
    order: 4,
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
  if (ex.category === 'picking') return 'picking';
  if (ex.category === 'legato') return 'legato';
  if (ex.category === 'rhythm') return 'rhythm';
  return 'pentatonic';
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
    const weightedSummary = computeWeightedExerciseBpm(exercise, sessionLogs);
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

const PRIORITY_FONDAMENTA_BY_PAIN: Record<PainPointId, FondamentaId> = {
  speed_wall: 'picking',
  left_hand_fatigue: 'legato',
  timing_drift: 'rhythm',
  neck_trapped: 'pentatonic',
};

export function computeFondamentaWeeklyGroups(
  prescription: ScientificPlanPrescription,
  exercises: Exercise[],
  sessionLogs: WorkoutSessionLog[]
): FondamentaWeeklyGroup[] {
  const weekly = computeWeeklyDoseProgress(prescription, exercises, sessionLogs);
  const primaryFondamenta =
    PRIORITY_FONDAMENTA_BY_PAIN[prescription.answers.primaryPainPoint];

  const bucket = new Map<FondamentaId, ExerciseWeeklyProgressItem[]>();
  (['picking', 'legato', 'pentatonic', 'rhythm'] as FondamentaId[]).forEach((fid) =>
    bucket.set(fid, [])
  );

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

  groups.sort((a, b) => {
    if (a.isPrimaryFocus !== b.isPrimaryFocus) {
      return a.isPrimaryFocus ? -1 : 1;
    }
    const defA = Math.max(0, a.weeklyMinSets - a.completedSets);
    const defB = Math.max(0, b.weeklyMinSets - b.completedSets);
    if (defA !== defB) return defB - defA;
    return FONDAMENTA_CATALOG[a.fondamentaId].order - FONDAMENTA_CATALOG[b.fondamentaId].order;
  });

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

  const items: ScaledWorkoutItem[] = chosenProgressItems.map(
    (progItem, idx) => {
      const sets = baseSetsPerEx + (idx < extraSetsCount ? 1 : 0);
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
        targetBpm: progItem.weightedSummary.nextSessionBpm,
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
    items,
  };
}
