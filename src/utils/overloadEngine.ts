import {
  CleanlinessScore,
  Exercise,
  ExerciseVariant,
  PlayerLevelId,
  ScaledWorkoutItem,
  ScaledWorkoutPlan,
  SessionDurationPreset,
  SetLog,
  WorkoutSessionLog,
  WorkoutTemplate,
} from '../types/practice';

export interface VariantBpmEntry {
  variantId: string;
  shortLabel: string;
  name: string;
  bpm: number;
  setsCount: number;
  isPracticed: boolean;
}

export interface WeightedVariantBpmSummary {
  /** Weighted average target BPM across all variants (normalized for variant difficulty & recency) */
  weightedBpm: number;
  /** Next workout target BPM when playing the active variant */
  nextSessionBpm: number;
  /** Per-variant current BPMs */
  byVariant: VariantBpmEntry[];
  practicedVariantsCount: number;
  totalVariantsCount: number;
}

export interface ExerciseMasteryScore {
  score: number;
  level: number;
  levelProgressPct: number;
  totalXp: number;
  nextLevelXp: number;
  weightedBpm: number;
  practicedVariantsCount: number;
  totalVariantsCount: number;
  tierLabel: string;
  color: string;
  setsCompleted: number;
  daysSinceLastPracticed: number;
}

export interface ExerciseBpmRamp {
  minBpm: number;
  maxBpm: number;
  setBpms: number[];
}

export interface OverloadResult {
  nextBpm: number;
  delta: number;
  verdict: string;
  scientificAdvice: string;
  plekQuip: string;
  color: string;
  badgeBg: string;
  badgeBorder: string;
}

export function calculateWarmupBpm(comfortBpm: number): number {
  return Math.max(44, Math.min(240, Math.round(comfortBpm * 0.85)));
}

export function calculateGoldilocksTargetBpm(comfortBpm: number): number {
  return Math.max(
    48,
    Math.min(260, Math.max(comfortBpm + 2, Math.round(comfortBpm * 1.04)))
  );
}

/**
 * Adaptive Goldilocks Zone progression:
 * - Set 1 is always a Warm-up (~85% of capacity) to loosen hands and lock the 4/4 groove.
 * - After Set 1, jumps directly into the Goldilocks Zone (+4% to +6% above comfort) if clean.
 * - On Set 2+, dynamically micro-adjusts BPM so the guitarist stays just outside their comfort zone
 *   (85% rule / optimal myelinization) without boredom or tension breakdown.
 */
export function calculateGoldilocksNextBpm(
  playedBpm: number,
  comfortBpm: number,
  cleanliness: CleanlinessScore,
  setNumber: number
): OverloadResult {
  const clamp = (val: number) => Math.max(36, Math.min(260, Math.round(val)));

  if (setNumber === 1) {
    const goldilocksBase = calculateGoldilocksTargetBpm(comfortBpm);
    const goldilocksPush = clamp(Math.max(comfortBpm + 4, Math.round(comfortBpm * 1.06)));

    switch (cleanliness) {
      case 5: {
        const nextBpm = goldilocksPush;
        const delta = nextBpm - playedBpm;
        return {
          nextBpm,
          delta,
          verdict: `Riscaldato • Zona Goldilocks (${nextBpm} BPM)`,
          plekQuip: 'Mani calde e sciolte: si entra subito in Zona Goldilocks.',
          scientificAdvice:
            'Riscaldamento perfetto: portiamo il metronomo appena sopra la tua zona di comfort.',
          color: 'text-[#A4FF00]',
          badgeBg: 'bg-[#A4FF00]/10',
          badgeBorder: 'border-[#A4FF00]/35',
        };
      }
      case 4: {
        const nextBpm = goldilocksBase;
        const delta = nextBpm - playedBpm;
        return {
          nextBpm,
          delta,
          verdict: `Mani calde • Zona Goldilocks (${nextBpm} BPM)`,
          plekQuip: 'Groove agganciato: ora spingiamo un pelo oltre il comfort.',
          scientificAdvice:
            'Ottimo riscaldamento: passiamo alla Zona Goldilocks (+4% sopra il tuo comfort).',
          color: 'text-[#A4FF00]',
          badgeBg: 'bg-[#A4FF00]/10',
          badgeBorder: 'border-[#A4FF00]/30',
        };
      }
      case 3: {
        const nextBpm = clamp(comfortBpm);
        const delta = nextBpm - playedBpm;
        return {
          nextBpm,
          delta,
          verdict: `Ingranato • Target base (${nextBpm} BPM)`,
          plekQuip: 'Bene: saliamo gradualmente alla tua velocità di riferimento.',
          scientificAdvice:
            'Saliamo al tuo BPM base senza forzare prima di spingere oltre.',
          color: 'text-[#FF6B00]',
          badgeBg: 'bg-[#FF6B00]/10',
          badgeBorder: 'border-[#FF6B00]/35',
        };
      }
      case 2: {
        const nextBpm = clamp(playedBpm);
        return {
          nextBpm,
          delta: 0,
          verdict: `Consolida riscaldamento (${nextBpm} BPM)`,
          plekQuip: 'Teniamo questo passo comodo ancora una serie per sciogliere le dita.',
          scientificAdvice:
            'Restiamo a velocità di riscaldamento finché il movimento non è fluido.',
          color: 'text-[#FF6B00]',
          badgeBg: 'bg-[#FF6B00]/15',
          badgeBorder: 'border-[#FF6B00]/45',
        };
      }
      case 1: {
        const nextBpm = clamp(playedBpm - 4);
        return {
          nextBpm,
          delta: nextBpm - playedBpm,
          verdict: `Rallenta e ripulisci (${nextBpm} BPM)`,
          plekQuip: 'Scendiamo di -4 BPM per rimettere a fuoco il pattern.',
          scientificAdvice:
            'Rallentiamo leggermente per costruire memoria muscolare pulita.',
          color: 'text-[#FF6B00]',
          badgeBg: 'bg-[#FF6B00]/20',
          badgeBorder: 'border-[#FF6B00]/50',
        };
      }
    }
  }

  // Set 2+ (Goldilocks Zone micro-adaptation)
  switch (cleanliness) {
    case 5: {
      const step = Math.max(4, Math.round(playedBpm * 0.05));
      const nextBpm = clamp(playedBpm + step);
      return {
        nextBpm,
        delta: nextBpm - playedBpm,
        verdict: `Troppo facile • Spinta Goldilocks (+${nextBpm - playedBpm} BPM)`,
        plekQuip: `Troppo comodo! Saliamo di +${nextBpm - playedBpm} BPM per restare nella sfida.`,
        scientificAdvice:
          'Sei dentro la zona di comfort: aumentiamo di +5% per riattivare la mielinizzazione.',
        color: 'text-[#A4FF00]',
        badgeBg: 'bg-[#A4FF00]/10',
        badgeBorder: 'border-[#A4FF00]/35',
      };
    }
    case 4: {
      const step = Math.max(2, Math.round(playedBpm * 0.03));
      const nextBpm = clamp(playedBpm + step);
      return {
        nextBpm,
        delta: nextBpm - playedBpm,
        verdict: `Conquistato • Goldilocks (+${nextBpm - playedBpm} BPM)`,
        plekQuip: `Pulito! Alziamo l’asticella di +${nextBpm - playedBpm} BPM.`,
        scientificAdvice:
          'Velocità dominata: micro-incremento del +3% per restare sul bordo del comfort.',
        color: 'text-[#A4FF00]',
        badgeBg: 'bg-[#A4FF00]/10',
        badgeBorder: 'border-[#A4FF00]/30',
      };
    }
    case 3:
      return {
        nextBpm: clamp(playedBpm),
        delta: 0,
        verdict: 'Zona Goldilocks Perfetta (+0 BPM)',
        plekQuip: 'Punto esatto di crescita! Teniamo questi BPM e cambiamo variante.',
        scientificAdvice:
          'Sei esattamente all’85% di controllo: qui il cervello impara più velocemente.',
        color: 'text-[#FF6B00]',
        badgeBg: 'bg-[#FF6B00]/10',
        badgeBorder: 'border-[#FF6B00]/35',
      };
    case 2: {
      const step = Math.max(3, Math.round(playedBpm * 0.04));
      const nextBpm = clamp(playedBpm - step);
      return {
        nextBpm,
        delta: nextBpm - playedBpm,
        verdict: `Troppo teso • Rientro Goldilocks (-${playedBpm - nextBpm} BPM)`,
        plekQuip: `Scendiamo di -${playedBpm - nextBpm} BPM per tornare nel punto ottimale.`,
        scientificAdvice:
          'Leggermente oltre il limite: -4% ripristina pulizia e scioltezza.',
        color: 'text-[#FF6B00]',
        badgeBg: 'bg-[#FF6B00]/15',
        badgeBorder: 'border-[#FF6B00]/45',
      };
    }
    case 1: {
      const step = Math.max(6, Math.round(playedBpm * 0.08));
      const nextBpm = clamp(playedBpm - step);
      return {
        nextBpm,
        delta: nextBpm - playedBpm,
        verdict: `Reset controllo (-${playedBpm - nextBpm} BPM)`,
        plekQuip: `Rallentiamo di -${playedBpm - nextBpm} BPM: la velocità nasce dal controllo.`,
        scientificAdvice:
          'Troppi errori: riduciamo dell’8% per rientrare nella finestra di apprendimento.',
        color: 'text-[#FF6B00]',
        badgeBg: 'bg-[#FF6B00]/20',
        badgeBorder: 'border-[#FF6B00]/50',
      };
    }
  }
}

export function calculateNextBpm(
  currentBpm: number,
  cleanliness: CleanlinessScore
): OverloadResult {
  return calculateGoldilocksNextBpm(currentBpm, currentBpm, cleanliness, 2);
}

export function isVariantAllowedForLevel(
  variant: ExerciseVariant,
  level?: PlayerLevelId
): boolean {
  if (!level) return true;
  if (variant.maxLevel === 'foundation' && level !== 'foundation') {
    return false;
  }
  if (variant.minLevel === 'intermediate' && level === 'foundation') {
    return false;
  }
  if (variant.minLevel === 'advanced' && level !== 'advanced') {
    return false;
  }
  return true;
}

export function getLevelFilteredVariants(
  exercise: Exercise,
  level?: PlayerLevelId
): ExerciseVariant[] {
  const all = exercise.variants ?? [];
  if (!level || all.length === 0) return all;
  const filtered = all.filter((v) => isVariantAllowedForLevel(v, level));
  return filtered.length > 0 ? filtered : all;
}

/**
 * Computes recency-weighted, difficulty-normalized BPM across all variants of an exercise.
 * Ensures practicing one variant at 90 BPM cleanly immediately steps that variant's next BPM up (92/95 BPM)
 * while weighting harder permutations without skewing overall progress.
 */
export function computeWeightedExerciseBpm(
  exercise: Exercise,
  sessionLogs: WorkoutSessionLog[] = [],
  preferredVariantId?: string,
  playerLevel?: PlayerLevelId
): WeightedVariantBpmSummary {
  const matchingSets: SetLog[] = sessionLogs
    .flatMap((s) => s.sets.filter((st) => st.exerciseId === exercise.id))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const variants = getLevelFilteredVariants(exercise, playerLevel);

  if (variants.length === 0) {
    if (matchingSets.length === 0) {
      return {
        weightedBpm: exercise.baselineBpm,
        nextSessionBpm: Math.max(exercise.baselineBpm, exercise.currentTargetBpm),
        byVariant: [],
        practicedVariantsCount: 0,
        totalVariantsCount: 1,
      };
    }
    const last5 = matchingSets.slice(-5);
    const lastSet = last5[last5.length - 1];
    const delta = calculateNextBpm(lastSet.bpm, lastSet.cleanliness).delta;
    const overloadTarget = Math.max(30, Math.min(260, lastSet.bpm + delta));
    let wSum = 0;
    let wTotal = 0;
    last5.forEach((st, idx) => {
      const w = (idx + 1) * (st.cleanliness >= 4 ? 1.0 : st.cleanliness === 3 ? 0.75 : 0.4);
      wSum += w * st.bpm;
      wTotal += w;
    });
    const histAvg = wTotal > 0 ? wSum / wTotal : exercise.baselineBpm;
    const weighted =
      delta >= 0
        ? Math.max(Math.round(histAvg), overloadTarget)
        : Math.round(histAvg * 0.4 + overloadTarget * 0.6);
    return {
      weightedBpm: weighted,
      nextSessionBpm: overloadTarget,
      byVariant: [],
      practicedVariantsCount: 1,
      totalVariantsCount: 1,
    };
  }

  const defaultVariantId = variants[0].id;
  const setsByVariant = new Map<string, SetLog[]>();
  variants.forEach((v) => setsByVariant.set(v.id, []));

  const allVariantIds = new Set((exercise.variants ?? []).map((v) => v.id));
  for (const st of matchingSets) {
    if (st.variantId && allVariantIds.has(st.variantId) && !setsByVariant.has(st.variantId)) {
      continue;
    }
    const vid =
      st.variantId && setsByVariant.has(st.variantId) ? st.variantId : defaultVariantId;
    setsByVariant.get(vid)!.push(st);
  }

  const rawComputedById = new Map<
    string,
    { bpm: number; setsCount: number; isPracticed: boolean; diffWeight: number }
  >();

  for (const v of variants) {
    const sets = setsByVariant.get(v.id) ?? [];
    const storedBpm = exercise.variantBpms?.[v.id];
    if (sets.length > 0) {
      const last5 = sets.slice(-5);
      const lastSet = last5[last5.length - 1];
      const delta = calculateNextBpm(lastSet.bpm, lastSet.cleanliness).delta;
      const overloadNext = Math.max(30, Math.min(260, lastSet.bpm + delta));

      let wSum = 0;
      let wTotal = 0;
      last5.forEach((st, idx) => {
        const cleanW = st.cleanliness >= 4 ? 1.0 : st.cleanliness === 3 ? 0.8 : 0.45;
        const w = (idx + 1) * cleanW;
        wSum += w * st.bpm;
        wTotal += w;
      });
      const histMean = wTotal > 0 ? wSum / wTotal : exercise.baselineBpm;
      const computedBpm =
        delta >= 0
          ? Math.max(storedBpm ?? 0, overloadNext, Math.round(histMean))
          : overloadNext;

      rawComputedById.set(v.id, {
        bpm: computedBpm,
        setsCount: sets.length,
        isPracticed: true,
        diffWeight: v.difficultyWeight,
      });
    } else if (typeof storedBpm === 'number' && storedBpm > 0) {
      rawComputedById.set(v.id, {
        bpm: storedBpm,
        setsCount: 1,
        isPracticed: true,
        diffWeight: v.difficultyWeight,
      });
    }
  }

  const practicedEntries = Array.from(rawComputedById.values());
  const practicedMean =
    practicedEntries.length > 0
      ? practicedEntries.reduce((acc, e) => acc + e.bpm, 0) / practicedEntries.length
      : exercise.baselineBpm;

  let weightedNumerator = 0;
  let weightedDenominator = 0;

  const byVariant: VariantBpmEntry[] = variants.map((v) => {
    const practiced = rawComputedById.get(v.id);
    const isPracticed = Boolean(practiced);
    const setsCount = practiced?.setsCount ?? 0;
    const bv = practiced ? practiced.bpm : Math.round(practicedMean);
    const omega = isPracticed ? 1.0 + 0.25 * Math.min(4, setsCount) : 0.35;

    weightedNumerator += omega * bv * v.difficultyWeight;
    weightedDenominator += omega * v.difficultyWeight;

    return {
      variantId: v.id,
      shortLabel: v.shortLabel,
      name: v.name,
      bpm: bv,
      setsCount,
      isPracticed,
    };
  });

  const weightedBpm =
    practicedEntries.length === 0
      ? exercise.baselineBpm
      : Math.round(weightedNumerator / Math.max(0.0001, weightedDenominator));

  const rawTargetVarId =
    preferredVariantId ?? exercise.activeVariantId ?? variants[0].id;
  const targetVarId = variants.some((v) => v.id === rawTargetVarId)
    ? rawTargetVarId
    : variants[0].id;
  const activeEntry =
    byVariant.find((b) => b.variantId === targetVarId) ?? byVariant[0];

  const nextSessionBpm = activeEntry ? activeEntry.bpm : weightedBpm;

  return {
    weightedBpm,
    nextSessionBpm,
    byVariant,
    practicedVariantsCount: practicedEntries.length,
    totalVariantsCount: variants.length,
  };
}

/**
 * Picks the least-practiced variant (or first unpracticed) so all variants train evenly.
 */
export function pickNextRecommendedVariant(
  exercise: Exercise,
  sessionLogs: WorkoutSessionLog[] = [],
  preferredVariantId?: string,
  playerLevel?: PlayerLevelId
): ExerciseVariant | undefined {
  const variants = getLevelFilteredVariants(exercise, playerLevel);
  if (variants.length === 0) return undefined;
  if (preferredVariantId) {
    const found = variants.find((v) => v.id === preferredVariantId);
    if (found) return found;
  }
  const summary = computeWeightedExerciseBpm(
    exercise,
    sessionLogs,
    undefined,
    playerLevel
  );
  const sorted = [...summary.byVariant].sort((a, b) => a.setsCount - b.setsCount);
  const targetId = sorted[0]?.variantId ?? variants[0].id;
  return variants.find((v) => v.id === targetId) ?? variants[0];
}

const XP_PER_LEVEL = 100;

/**
 * Computes Level 1–10 progression strictly starting at Lv. 1 when 0 sets are logged.
 * Advances slowly with consistency, weighted BPM growth above baseline, and variant mastery.
 */
export function computeExerciseScore(
  exercise: Exercise,
  sessionLogs: WorkoutSessionLog[] = []
): ExerciseMasteryScore {
  const matchingSets = sessionLogs.flatMap((s) =>
    s.sets.filter((st) => st.exerciseId === exercise.id)
  );

  const setsCompleted = matchingSets.length;
  const weightedSummary = computeWeightedExerciseBpm(exercise, sessionLogs);

  let daysSinceLastPracticed = 999;
  if (matchingSets.length > 0) {
    const latestTs = Math.max(
      ...matchingSets.map((st) => new Date(st.timestamp).getTime() || 0)
    );
    if (latestTs > 0) {
      daysSinceLastPracticed = Math.max(
        0,
        Math.floor((Date.now() - latestTs) / (1000 * 60 * 60 * 24))
      );
    }
  }

  if (setsCompleted === 0) {
    return {
      score: 5,
      level: 1,
      levelProgressPct: 0,
      totalXp: 0,
      nextLevelXp: XP_PER_LEVEL,
      weightedBpm: weightedSummary.weightedBpm,
      practicedVariantsCount: weightedSummary.practicedVariantsCount,
      totalVariantsCount: weightedSummary.totalVariantsCount,
      tierLabel: 'Fondamenta',
      color: 'text-[#FF6B00]',
      setsCompleted: 0,
      daysSinceLastPracticed: 999,
    };
  }

  const distinctDays = new Set(matchingSets.map((s) => s.timestamp.slice(0, 10))).size;
  const consistencySetsXp = matchingSets.reduce((acc, st) => {
    if (st.cleanliness >= 4) return acc + 16;
    if (st.cleanliness === 3) return acc + 7;
    return acc + 2;
  }, 0);
  const consistencyXp = consistencySetsXp + distinctDays * 14;
  const bpmGainXp = Math.max(0, weightedSummary.weightedBpm - exercise.baselineBpm) * 10;
  const variantCoverageXp = weightedSummary.practicedVariantsCount * 20;

  const totalXp = Math.round(consistencyXp + bpmGainXp + variantCoverageXp);
  const level = Math.min(10, 1 + Math.floor(totalXp / XP_PER_LEVEL));
  const levelProgressPct = level >= 10 ? 100 : totalXp % XP_PER_LEVEL;
  const score = Math.min(100, Math.max(8, Math.round((totalXp / 900) * 100)));

  let tierLabel = 'Fondamenta';
  let color = 'text-[#FF6B00]';
  if (level >= 9) {
    tierLabel = 'Maestro';
    color = 'text-[#A4FF00]';
  } else if (level >= 7) {
    tierLabel = 'Avanzato';
    color = 'text-[#A4FF00]';
  } else if (level >= 5) {
    tierLabel = 'Solido';
    color = 'text-white';
  } else if (level >= 3) {
    tierLabel = 'In Crescita';
    color = 'text-white';
  }

  return {
    score,
    level,
    levelProgressPct,
    totalXp,
    nextLevelXp: XP_PER_LEVEL,
    weightedBpm: weightedSummary.weightedBpm,
    practicedVariantsCount: weightedSummary.practicedVariantsCount,
    totalVariantsCount: weightedSummary.totalVariantsCount,
    tierLabel,
    color,
    setsCompleted,
    daysSinceLastPracticed,
  };
}

/**
 * Goldilocks Zone BPM Ramp:
 * - Set 1: Warm-up (~85% of comfort BPM) to loosen hands & lock the 4/4 groove.
 * - Set 2: Goldilocks Zone (~104% of comfort BPM — just outside comfort zone).
 * - Set 3+: Progressive Goldilocks climb (+3% / min +2 BPM per subsequent set).
 */
export function computeExerciseBpmRamp(
  exercise: Exercise,
  totalSets: number,
  targetBpmOverride?: number
): ExerciseBpmRamp {
  const comfortBpm = Math.max(
    44,
    Math.min(250, Math.round(targetBpmOverride ?? exercise.currentTargetBpm))
  );
  const warmupBpm = calculateWarmupBpm(comfortBpm);
  const goldilocksBpm = calculateGoldilocksTargetBpm(comfortBpm);

  if (totalSets <= 1) {
    return { minBpm: warmupBpm, maxBpm: warmupBpm, setBpms: [warmupBpm] };
  }

  const stepInc = Math.max(2, Math.round(comfortBpm * 0.03));
  const setBpms = Array.from({ length: totalSets }, (_, idx) => {
    if (idx === 0) return warmupBpm;
    return Math.min(260, goldilocksBpm + (idx - 1) * stepInc);
  });

  return {
    minBpm: setBpms[0],
    maxBpm: setBpms[setBpms.length - 1],
    setBpms,
  };
}

/**
 * Picks the lowest-level / most neglected exercise for 5-minute targeting.
 */
export function pickWeakestExercise(
  candidates: Exercise[],
  sessionLogs: WorkoutSessionLog[] = []
): { exercise: Exercise; mastery: ExerciseMasteryScore } | null {
  if (candidates.length === 0) return null;
  const scored = candidates.map((exercise) => ({
    exercise,
    mastery: computeExerciseScore(exercise, sessionLogs),
  }));
  scored.sort((a, b) => {
    if (a.mastery.totalXp !== b.mastery.totalXp) {
      return a.mastery.totalXp - b.mastery.totalXp;
    }
    return b.mastery.daysSinceLastPracticed - a.mastery.daysSinceLastPracticed;
  });
  return scored[0];
}

export const STANDARDIZED_WORKOUT_ID = 'wk-standardized-daily';

export const CANONICAL_PILLARS: {
  pillarNumber: number;
  exerciseId: string;
  pillarLabel: string;
  minPreset: SessionDurationPreset;
  setsByPreset: Partial<Record<SessionDurationPreset, { sets: number; durationSec: number; restSec: number }>>;
}[] = [
  {
    pillarNumber: 1,
    exerciseId: 'ex-pent-box1',
    pillarLabel: 'Esercizio 1 • Fondamentale ogni giorno',
    minPreset: 5,
    setsByPreset: {
      5: { sets: 2, durationSec: 90, restSec: 15 },
      15: { sets: 3, durationSec: 120, restSec: 20 },
      30: { sets: 4, durationSec: 120, restSec: 20 },
      45: { sets: 4, durationSec: 120, restSec: 20 },
    },
  },
  {
    pillarNumber: 2,
    exerciseId: 'ex-picking-pg6',
    pillarLabel: 'Esercizio 2 • Velocità e Sincronia',
    minPreset: 15,
    setsByPreset: {
      15: { sets: 3, durationSec: 90, restSec: 20 },
      30: { sets: 4, durationSec: 90, restSec: 20 },
      45: { sets: 4, durationSec: 120, restSec: 20 },
    },
  },
  {
    pillarNumber: 3,
    exerciseId: 'ex-rhythm-gap',
    pillarLabel: 'Esercizio 3 • Senso del Tempo',
    minPreset: 30,
    setsByPreset: {
      30: { sets: 3, durationSec: 120, restSec: 20 },
      45: { sets: 4, durationSec: 120, restSec: 20 },
    },
  },
  {
    pillarNumber: 4,
    exerciseId: 'ex-legato-trill',
    pillarLabel: 'Esercizio 4 • Forza Mano Sinistra',
    minPreset: 45,
    setsByPreset: {
      45: { sets: 3, durationSec: 90, restSec: 20 },
    },
  },
  {
    pillarNumber: 5,
    exerciseId: 'ex-pent-diagonal',
    pillarLabel: 'Esercizio 5 • Tastiera Orizzontale',
    minPreset: 45,
    setsByPreset: {
      45: { sets: 3, durationSec: 120, restSec: 20 },
    },
  },
];

export const CLEANLINESS_LABELS: Record<
  CleanlinessScore,
  { short: string; label: string; deltaText: string; description: string }
> = {
  5: {
    short: '5/5',
    label: 'Perfetto',
    deltaText: '+5 BPM',
    description: 'Fluido, pulito, zero fatica',
  },
  4: {
    short: '4/5',
    label: 'Pulito',
    deltaText: '+2 BPM',
    description: 'Bene e controllato',
  },
  3: {
    short: '3/5',
    label: 'Al Limite',
    deltaText: '+0 BPM',
    description: 'Giusto ma al massimo sforzo',
  },
  2: {
    short: '2/5',
    label: 'Teso / Sporco',
    deltaText: '-5 BPM',
    description: 'Tensione o note impastate',
  },
  1: {
    short: '1/5',
    label: 'Disastro',
    deltaText: '-5 BPM',
    description: 'Fuori tempo o troppo veloce',
  },
};

export function scaleWorkoutForPreset(
  workout: WorkoutTemplate,
  preset: SessionDurationPreset,
  exercises: Exercise[],
  sessionLogs: WorkoutSessionLog[] = []
): ScaledWorkoutPlan {
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const isStandardized = workout.id === STANDARDIZED_WORKOUT_ID;

  if (isStandardized) {
    const items: ScaledWorkoutItem[] = [];

    if (preset === 5) {
      const weakest = pickWeakestExercise(exercises, sessionLogs);
      if (weakest) {
        items.push({
          exerciseId: weakest.exercise.id,
          sets: 3,
          durationSec: 60,
          restSec: 15,
          exercise: weakest.exercise,
          targetBpm: weakest.mastery.weightedBpm,
          pillarNumber: 1,
          pillarLabel: `Algoritmo 5 min • Priorità`,
          selectionReason: `Lv. ${weakest.mastery.level}`,
        });
      }
    } else {
      for (const pillar of CANONICAL_PILLARS) {
        const cfg = pillar.setsByPreset[preset];
        const ex = exMap.get(pillar.exerciseId);
        if (cfg && ex) {
          items.push({
            exerciseId: ex.id,
            sets: cfg.sets,
            durationSec: cfg.durationSec,
            restSec: cfg.restSec,
            exercise: ex,
            targetBpm: computeWeightedExerciseBpm(ex, sessionLogs).nextSessionBpm,
            pillarNumber: pillar.pillarNumber,
            pillarLabel: pillar.pillarLabel,
          });
        }
      }
    }

    if (preset >= 15) {
      const canonicalIds = new Set(CANONICAL_PILLARS.map((p) => p.exerciseId));
      for (const extra of workout.items) {
        if (canonicalIds.has(extra.exerciseId)) continue;
        const ex = exMap.get(extra.exerciseId);
        if (ex) {
          items.push({
            ...extra,
            exercise: ex,
            targetBpm: computeWeightedExerciseBpm(ex, sessionLogs).nextSessionBpm,
          });
        }
      }
    }

    const totalSec = items.reduce(
      (acc, it) => acc + it.sets * (it.durationSec + it.restSec),
      0
    );

    const metaByPreset: Record<
      SessionDurationPreset,
      { label: string; desc: string }
    > = {
      5: {
        label: 'Focus Carenze (5 min)',
        desc: 'Esercizio con livello più basso.',
      },
      15: {
        label: 'Essenziale (2 esercizi)',
        desc: 'Pentatonica + Pennata Alternata.',
      },
      30: {
        label: 'Completo (3 esercizi)',
        desc: 'Pentatonica, Pennata e Ritmo.',
      },
      45: {
        label: 'Intensivo (5 esercizi)',
        desc: 'Tutti i pilastri completi.',
      },
    };

    return {
      workout,
      preset,
      modeLabel: metaByPreset[preset].label,
      modeDescription: metaByPreset[preset].desc,
      isStandardized: true,
      estimatedMinutes: Math.max(3, Math.round(totalSec / 60)),
      items,
    };
  }

  const validItems = workout.items
    .map((item) => {
      const ex = exMap.get(item.exerciseId);
      return ex ? { ...item, exercise: ex } : null;
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  let scaledItems: ScaledWorkoutItem[] = [];
  let modeLabel = 'Completo (30 min)';
  let modeDescription = 'Tutti gli esercizi.';

  if (preset === 5) {
    modeLabel = 'Focus Carenze (5 min)';
    modeDescription = 'Esercizio prioritario.';
    const candidateExercises = validItems.map((i) => i.exercise);
    const weakest = pickWeakestExercise(candidateExercises, sessionLogs);
    const matchedItem = weakest
      ? validItems.find((i) => i.exerciseId === weakest.exercise.id) || validItems[0]
      : validItems[0];
    if (matchedItem && weakest) {
      scaledItems = [
        {
          ...matchedItem,
          sets: 3,
          durationSec: 60,
          restSec: 15,
          targetBpm: weakest.mastery.weightedBpm,
          selectionReason: `Lv. ${weakest.mastery.level}`,
        },
      ];
    }
  } else if (preset === 15) {
    modeLabel = 'Essenziale (15 min)';
    modeDescription = 'I primi 2 esercizi.';
    scaledItems = validItems.slice(0, 2).map((item) => ({
      ...item,
      sets: Math.max(2, Math.min(3, item.sets - 1)),
      durationSec: Math.min(120, item.durationSec),
      restSec: Math.min(20, item.restSec),
      targetBpm: computeWeightedExerciseBpm(item.exercise, sessionLogs).nextSessionBpm,
    }));
  } else if (preset === 30) {
    scaledItems = validItems.map((item) => ({
      ...item,
      targetBpm: computeWeightedExerciseBpm(item.exercise, sessionLogs).nextSessionBpm,
    }));
  } else {
    modeLabel = 'Intensivo (45+ min)';
    modeDescription = 'Serie extra.';
    scaledItems = validItems.map((item, idx) => ({
      ...item,
      sets: idx === 0 ? item.sets + 2 : item.sets + 1,
      durationSec: Math.min(240, Math.round(item.durationSec * 1.25)),
      targetBpm: computeWeightedExerciseBpm(item.exercise, sessionLogs).nextSessionBpm,
    }));
  }

  const totalSec = scaledItems.reduce(
    (acc, it) => acc + it.sets * (it.durationSec + it.restSec),
    0
  );

  return {
    workout,
    preset,
    modeLabel,
    modeDescription,
    isStandardized: false,
    estimatedMinutes: Math.max(3, Math.round(totalSec / 60)),
    items: scaledItems,
  };
}
