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

export interface OverloadContextOptions {
  /** Consecutive immediately-preceding 5/5 sets on this exercise */
  streak5Count?: number;
  /** Consecutive immediately-preceding >=4/5 sets on this exercise */
  streak4PlusCount?: number;
  /** True ONLY on Exercise 1, Set 1 of the workout */
  isWarmupSet?: boolean;
  /** True when set was played in 1/8->1/16 burst mode (-8% base tempo) */
  isSpeedBurstSet?: boolean;
  /** True once user rated <= 3 on this exercise in current session */
  hasHitCeilingInSession?: boolean;
}

export interface ExerciseStreakContext {
  streak5Count: number;
  streak4PlusCount: number;
  consecutiveFail1Count: number;
  hasHitCeilingInSession: boolean;
}

export const STARTING_BPM_BY_LEVEL: Record<PlayerLevelId, number> = {
  foundation: 50,
  intermediate: 60,
  advanced: 75,
};

export function getStartingBpmForLevel(level?: PlayerLevelId): number {
  return STARTING_BPM_BY_LEVEL[level ?? 'intermediate'];
}

export function calculateWarmupBpm(comfortBpm: number): number {
  return Math.max(42, Math.min(240, Math.round(comfortBpm * 0.88)));
}

export function calculateGoldilocksTargetBpm(comfortBpm: number): number {
  return Math.max(
    48,
    Math.min(260, Math.max(comfortBpm + 3, Math.round(comfortBpm * 1.045)))
  );
}

/**
 * Computes recent consecutive streak metrics for an exercise from historical + in-session sets.
 */
export function computeExerciseStreakContext(
  exerciseId: string,
  priorSessionLogs: WorkoutSessionLog[] = [],
  inSessionSets: SetLog[] = []
): ExerciseStreakContext {
  const historicalSets = priorSessionLogs
    .flatMap((s) => s.sets.filter((st) => st.exerciseId === exerciseId))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const currentSets = inSessionSets.filter((st) => st.exerciseId === exerciseId);
  const allSets = [...historicalSets, ...currentSets];

  let streak5Count = 0;
  for (let i = allSets.length - 1; i >= 0; i--) {
    if (allSets[i].cleanliness === 5) streak5Count++;
    else break;
  }

  let streak4PlusCount = 0;
  for (let i = allSets.length - 1; i >= 0; i--) {
    if (allSets[i].cleanliness >= 4) streak4PlusCount++;
    else break;
  }

  let consecutiveFail1Count = 0;
  for (let i = allSets.length - 1; i >= 0; i--) {
    if (allSets[i].cleanliness === 1) consecutiveFail1Count++;
    else break;
  }

  const hasHitCeilingInSession = currentSets.some((st) => st.cleanliness <= 3);

  return {
    streak5Count,
    streak4PlusCount,
    consecutiveFail1Count,
    hasHitCeilingInSession,
  };
}

/**
 * Adaptive Goldilocks Flow Engine 2.0 (Accelerated Kesten-Glicko Staircase):
 * - Exercise 1, Set 1 starts at -12% warmup capacity; subsequent exercises start at full comfort BPM.
 * - Consecutive 5/5 ratings trigger exponential Fast-Track calibration (+8% -> +12% -> +16%)
 *   until hitting a real physiological limit (<= 3/5), at which point steps tighten surgically.
 * - Speed Burst (-8%) sets never overwrite normal comfort BPM downward when rated cleanly (>= 3/5).
 */
export function calculateGoldilocksNextBpm(
  playedBpm: number,
  comfortBpm: number,
  cleanliness: CleanlinessScore,
  setNumber: number,
  options?: OverloadContextOptions
): OverloadResult {
  const clamp = (val: number) => Math.max(36, Math.min(260, Math.round(val)));

  const isWarmupSet =
    options?.isWarmupSet ?? (setNumber === 1 && playedBpm < comfortBpm);
  const isSpeedBurstSet = Boolean(options?.isSpeedBurstSet);
  const hasHitCeiling = Boolean(options?.hasHitCeilingInSession);
  const s5 = options?.streak5Count ?? 0;
  const s4 = options?.streak4PlusCount ?? 0;

  let refBpm = playedBpm;
  if (isSpeedBurstSet) {
    refBpm =
      cleanliness >= 3
        ? Math.max(comfortBpm, playedBpm, Math.round(playedBpm / 0.92))
        : Math.max(playedBpm, Math.round(comfortBpm * 0.96));
  } else if (isWarmupSet && cleanliness >= 3) {
    refBpm = Math.max(playedBpm, comfortBpm);
  }

  switch (cleanliness) {
    case 5: {
      const step = hasHitCeiling
        ? Math.max(5, Math.round(refBpm * 0.065))
        : s5 === 0
        ? Math.max(6, Math.round(refBpm * 0.08))
        : s5 === 1
        ? Math.max(10, Math.round(refBpm * 0.12))
        : Math.max(14, Math.round(refBpm * 0.16));
      const nextBpm = clamp(refBpm + step);
      const delta = nextBpm - playedBpm;
      const pctLabel =
        hasHitCeiling ? '+6.5%' : s5 === 0 ? '+8%' : s5 === 1 ? '+12%' : '+16%';
      return {
        nextBpm,
        delta,
        verdict:
          s5 >= 1 && !hasHitCeiling
            ? `Fast-Track x${s5 + 1} • Salto (${nextBpm} BPM)`
            : `Troppo facile • Spinta Goldilocks (${nextBpm} BPM)`,
        plekQuip:
          s5 >= 1 && !hasHitCeiling
            ? `È tutto facile! Acceleriamo di +${delta} BPM (${pctLabel}) per portarti subito al tuo vero livello.`
            : `Troppo comodo! Saliamo di +${delta} BPM (${pctLabel}) per riattivare la sfida.`,
        scientificAdvice:
          'Streak 5/5 rilevata: la staircase accelerata amplia il passo per uscire rapidamente dalla zona di noia.',
        color: 'text-[#39FF14]',
        badgeBg: 'bg-[#39FF14]/10',
        badgeBorder: 'border-[#39FF14]/35',
      };
    }
    case 4: {
      const step = hasHitCeiling
        ? Math.max(2, Math.round(refBpm * 0.03))
        : s4 === 0
        ? Math.max(3, Math.round(refBpm * 0.045))
        : Math.max(5, Math.round(refBpm * 0.065));
      const nextBpm = clamp(refBpm + step);
      const delta = nextBpm - playedBpm;
      return {
        nextBpm,
        delta,
        verdict: `Conquistato • Goldilocks (${nextBpm} BPM)`,
        plekQuip: `Pulito e controllato! Alziamo l’asticella di +${delta} BPM.`,
        scientificAdvice:
          'Esecuzione solida: micro-incremento adattivo per restare sul bordo della zona ottimale.',
        color: 'text-[#39FF14]',
        badgeBg: 'bg-[#39FF14]/10',
        badgeBorder: 'border-[#39FF14]/30',
      };
    }
    case 3: {
      const nextBpm = clamp(
        isWarmupSet
          ? comfortBpm
          : isSpeedBurstSet
          ? Math.max(comfortBpm, playedBpm)
          : playedBpm
      );
      const delta = nextBpm - playedBpm;
      return {
        nextBpm,
        delta,
        verdict:
          delta > 0
            ? `Ingranato • Target base (${nextBpm} BPM)`
            : 'Zona Goldilocks Perfetta (+0 BPM)',
        plekQuip:
          delta > 0
            ? `Bene: saliamo al tuo riferimento (${nextBpm} BPM) senza forzare.`
            : 'Punto esatto dell’85%! Qui il cervello mielinizza al massimo: consolidiamo questi BPM.',
        scientificAdvice:
          'Sei esattamente nell’85% di controllo: massima attenzione e apprendimento motorio senza errori.',
        color: 'text-[#39FF14]',
        badgeBg: 'bg-[#39FF14]/10',
        badgeBorder: 'border-[#39FF14]/35',
      };
    }
    case 2: {
      if (isWarmupSet) {
        const nextBpm = clamp(playedBpm);
        return {
          nextBpm,
          delta: 0,
          verdict: `Consolida riscaldamento (${nextBpm} BPM)`,
          plekQuip: 'Teniamo questo passo ancora una serie per sciogliere le dita senza tensione.',
          scientificAdvice:
            'Restiamo a velocità di riscaldamento finché il movimento non diventa fluido.',
          color: 'text-slate-200',
          badgeBg: 'bg-white/10',
          badgeBorder: 'border-slate-300/35',
        };
      }
      const step = Math.max(4, Math.round(playedBpm * 0.05));
      const nextBpm = clamp(playedBpm - step);
      const drop = playedBpm - nextBpm;
      return {
        nextBpm,
        delta: -drop,
        verdict: `Troppo teso • Rientro Goldilocks (-${drop} BPM)`,
        plekQuip: `Scendiamo di -${drop} BPM per togliere rigidità e tornare nel punto ottimale.`,
        scientificAdvice:
          'Leggermente oltre soglia: -5% ripristina pulizia e coordinazione.',
        color: 'text-slate-200',
        badgeBg: 'bg-white/10',
        badgeBorder: 'border-slate-300/35',
      };
    }
    case 1: {
      const step = isWarmupSet ? 5 : Math.max(8, Math.round(playedBpm * 0.12));
      const nextBpm = clamp(playedBpm - step);
      const drop = playedBpm - nextBpm;
      return {
        nextBpm,
        delta: -drop,
        verdict: `Reset controllo (-${drop} BPM)`,
        plekQuip: `Rallentiamo di -${drop} BPM (o semplifichiamo lo step) per ritrovare controllo totale.`,
        scientificAdvice:
          'Carico cognitivo o velocità eccessiva: riduciamo del 12% per rientrare nella finestra di apprendimento.',
        color: 'text-slate-300',
        badgeBg: 'bg-white/12',
        badgeBorder: 'border-slate-300/40',
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

export function getVariantMasteryBpm(variant: ExerciseVariant): number {
  if (typeof variant.masteryBpm === 'number' && variant.masteryBpm > 0) {
    return variant.masteryBpm;
  }
  if (variant.difficultyWeight <= 0.86) return 68;
  if (variant.difficultyWeight <= 0.95) return 74;
  return 78;
}

/**
 * Dual-track mastery check for a variant:
 * - Track A (Consolidation): >= 3 clean sets (>= 4/5) reaching masteryBpm (or 2 clean >=4 + >=3 sets >=3 at masteryBpm).
 * - Track B (Fast-Track Skip): 2 sets at 5/5 near masteryBpm (-10 BPM), OR 1 set at 5/5 clearly above masteryBpm (+8 BPM).
 */
export function isVariantMastered(
  variant: ExerciseVariant,
  setsForVariant: SetLog[]
): boolean {
  if (setsForVariant.length === 0) return false;
  const masteryBpm = getVariantMasteryBpm(variant);

  const clean4Sets = setsForVariant.filter((s) => s.cleanliness >= 4);
  const bestClean4Bpm =
    clean4Sets.length > 0 ? Math.max(...clean4Sets.map((s) => s.bpm)) : 0;
  const setsAtMasteryBpm = setsForVariant.filter(
    (s) => s.cleanliness >= 3 && s.bpm >= masteryBpm
  );

  const consolidated =
    (clean4Sets.length >= 3 && bestClean4Bpm >= masteryBpm) ||
    (clean4Sets.length >= 2 &&
      setsAtMasteryBpm.length >= 3 &&
      bestClean4Bpm >= masteryBpm);

  const fiveSets = setsForVariant.filter((s) => s.cleanliness === 5);
  const bestFiveBpm =
    fiveSets.length > 0 ? Math.max(...fiveSets.map((s) => s.bpm)) : 0;
  const fastTracked =
    (fiveSets.length >= 2 && bestFiveBpm >= masteryBpm - 10) ||
    fiveSets.some((s) => s.bpm >= masteryBpm + 8);

  return consolidated || fastTracked;
}

function mapExerciseSetsByVariant(
  exercise: Exercise,
  sessionLogs: WorkoutSessionLog[] = []
): Map<string, SetLog[]> {
  const all = exercise.variants ?? [];
  const sorted = [...all].sort((a, b) => a.difficultyWeight - b.difficultyWeight);
  const defaultId = sorted[0]?.id ?? exercise.activeVariantId;
  const validIds = new Set(all.map((v) => v.id));
  const map = new Map<string, SetLog[]>();
  all.forEach((v) => map.set(v.id, []));

  for (const session of sessionLogs) {
    for (const st of session.sets) {
      if (st.exerciseId !== exercise.id) continue;
      const vid =
        st.variantId && validIds.has(st.variantId) ? st.variantId : defaultId;
      if (!vid || !map.has(vid)) continue;
      map.get(vid)!.push(st);
    }
  }
  return map;
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

/**
 * Dynamically promotes a student's effective level on an exercise once they master
 * all variants of their current tier.
 */
export function getEffectivePlayerLevel(
  exercise: Exercise,
  level?: PlayerLevelId,
  sessionLogs?: WorkoutSessionLog[]
): PlayerLevelId | undefined {
  if (!level || level === 'advanced' || !sessionLogs || sessionLogs.length === 0) {
    return level;
  }
  const all = exercise.variants ?? [];
  if (all.length === 0) return level;

  const setsByVar = mapExerciseSetsByVariant(exercise, sessionLogs);
  let effective: PlayerLevelId = level;

  if (effective === 'foundation') {
    const foundationVars = all.filter((v) =>
      isVariantAllowedForLevel(v, 'foundation')
    );
    if (
      foundationVars.length > 0 &&
      foundationVars.every((v) =>
        isVariantMastered(v, setsByVar.get(v.id) ?? [])
      )
    ) {
      effective = 'intermediate';
    }
  }

  if (effective === 'intermediate') {
    const intermediateVars = all.filter((v) =>
      isVariantAllowedForLevel(v, 'intermediate')
    );
    if (
      intermediateVars.length > 0 &&
      intermediateVars.every((v) =>
        isVariantMastered(v, setsByVar.get(v.id) ?? [])
      )
    ) {
      effective = 'advanced';
    }
  }

  return effective;
}

export function getLevelFilteredVariants(
  exercise: Exercise,
  level?: PlayerLevelId,
  sessionLogs?: WorkoutSessionLog[]
): ExerciseVariant[] {
  const all = exercise.variants ?? [];
  if (!level || all.length === 0) return all;
  const effectiveLevel = getEffectivePlayerLevel(exercise, level, sessionLogs);
  const filtered = all.filter((v) => isVariantAllowedForLevel(v, effectiveLevel));
  return filtered.length > 0 ? filtered : all;
}

/**
 * Returns variants unlocked for automatic daily prescription based on the player's
 * current Skill Level and mastered variants on this exercise, ordered easiest -> hardest.
 */
export function getSkillUnlockedVariants(
  exercise: Exercise,
  sessionLogs: WorkoutSessionLog[] = [],
  playerLevel?: PlayerLevelId
): ExerciseVariant[] {
  const effectiveLevel = getEffectivePlayerLevel(exercise, playerLevel, sessionLogs);
  const filtered = getLevelFilteredVariants(exercise, playerLevel, sessionLogs);
  if (filtered.length <= 1) return filtered;

  const sortedByDifficulty = [...filtered].sort(
    (a, b) => a.difficultyWeight - b.difficultyWeight
  );

  if (effectiveLevel === 'advanced') {
    return sortedByDifficulty;
  }

  const setsByVar = mapExerciseSetsByVariant(exercise, sessionLogs);
  const masteredCount = sortedByDifficulty.filter((v) =>
    isVariantMastered(v, setsByVar.get(v.id) ?? [])
  ).length;

  const unlockCount =
    effectiveLevel === 'foundation'
      ? Math.max(1, masteredCount + 1)
      : Math.max(2, masteredCount + 2);

  return sortedByDifficulty.slice(
    0,
    Math.min(sortedByDifficulty.length, unlockCount)
  );
}

/**
 * Picks the next variant in ascending difficulty order during an ongoing multi-set
 * exercise session, unlocking further variants automatically as earlier ones are mastered.
 */
export function pickNextVariantInSession(
  exercise: Exercise,
  currentVariantId: string | undefined,
  sessionLogs: WorkoutSessionLog[],
  inSessionSets: SetLog[],
  playerLevel?: PlayerLevelId
): ExerciseVariant | undefined {
  const syntheticHistory: WorkoutSessionLog[] =
    inSessionSets.length > 0
      ? [
          ...sessionLogs,
          {
            id: 'sess-in-progress-variant',
            workoutId: 'in-progress',
            workoutTitle: 'Sessione',
            date: new Date().toISOString(),
            durationPreset: 15,
            totalMinutes: 1,
            sets: inSessionSets,
            averageCleanliness: 4,
          },
        ]
      : sessionLogs;

  const filtered = getLevelFilteredVariants(
    exercise,
    playerLevel,
    syntheticHistory
  );
  if (filtered.length === 0) return undefined;
  const sortedByDifficulty = [...filtered].sort(
    (a, b) => a.difficultyWeight - b.difficultyWeight
  );

  const unlocked = getSkillUnlockedVariants(
    exercise,
    syntheticHistory,
    playerLevel
  );
  const pool = unlocked.length > 0 ? unlocked : sortedByDifficulty;
  if (pool.length === 1) return pool[0];

  const setsByVar = mapExerciseSetsByVariant(exercise, syntheticHistory);
  const currentIdxInPool = currentVariantId
    ? pool.findIndex((v) => v.id === currentVariantId)
    : -1;

  // Prefer the first unmastered variant strictly harder than the current one
  if (currentIdxInPool >= 0) {
    for (let i = currentIdxInPool + 1; i < pool.length; i++) {
      const cand = pool[i];
      if (!isVariantMastered(cand, setsByVar.get(cand.id) ?? [])) {
        return cand;
      }
    }
  }

  // Next, pick any other unmastered variant in pool
  const otherUnmastered = pool.find(
    (v) =>
      v.id !== currentVariantId &&
      !isVariantMastered(v, setsByVar.get(v.id) ?? [])
  );
  if (otherUnmastered) {
    return otherUnmastered;
  }

  const others = pool.filter((v) => v.id !== currentVariantId);
  const candidates = others.length > 0 ? others : pool;
  candidates.sort(
    (a, b) =>
      (setsByVar.get(a.id)?.length ?? 0) - (setsByVar.get(b.id)?.length ?? 0)
  );
  return candidates[0] ?? pool[0];
}

/**
 * Picks one step easier variant for intelligent auto-regression when a student struggles (1/5).
 */
export function pickEasierVariantInSession(
  exercise: Exercise,
  currentVariantId: string | undefined,
  playerLevel?: PlayerLevelId,
  sessionLogs: WorkoutSessionLog[] = []
): ExerciseVariant | undefined {
  const filtered = getLevelFilteredVariants(exercise, playerLevel, sessionLogs);
  if (filtered.length <= 1) return undefined;
  const sorted = [...filtered].sort(
    (a, b) => a.difficultyWeight - b.difficultyWeight
  );
  const idx = currentVariantId
    ? sorted.findIndex((v) => v.id === currentVariantId)
    : -1;
  if (idx > 0) {
    return sorted[idx - 1];
  }
  return undefined;
}

/**
 * Determines whether Speed Burst (1/8 -> 1/16) should start active on Set 1.
 * Respects per-variant overrideSpeedBurst and protects Level 1 (foundation) from premature bursts.
 */
export function shouldEnableSpeedBurstForSkill(
  exercise: Exercise,
  _sessionLogs: WorkoutSessionLog[] = [],
  playerLevel?: PlayerLevelId,
  activeVariant?: ExerciseVariant
): boolean {
  if (activeVariant?.overrideSpeedBurst !== undefined) {
    return activeVariant.overrideSpeedBurst;
  }
  if (playerLevel === 'foundation') {
    return false;
  }
  return (
    exercise.id === 'ex-speed-bursts' ||
    exercise.id === 'ex-bass-fingerstyle'
  );
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
  const clampBpm = (val: number) => Math.max(36, Math.min(260, Math.round(val)));
  const matchingSets: SetLog[] = sessionLogs
    .flatMap((s) => s.sets.filter((st) => st.exerciseId === exercise.id))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const variants = getLevelFilteredVariants(exercise, playerLevel, sessionLogs);
  const unpracticedBaseBpm =
    !exercise.isCustom && playerLevel
      ? getStartingBpmForLevel(playerLevel)
      : exercise.baselineBpm;

  if (variants.length === 0) {
    if (matchingSets.length === 0) {
      return {
        weightedBpm: unpracticedBaseBpm,
        nextSessionBpm: exercise.isCustom
          ? Math.max(exercise.baselineBpm, exercise.currentTargetBpm)
          : unpracticedBaseBpm,
        byVariant: [],
        practicedVariantsCount: 0,
        totalVariantsCount: 1,
      };
    }
    const last5 = matchingSets.slice(-5);
    const lastSet = last5[last5.length - 1];
    const delta = calculateNextBpm(lastSet.bpm, lastSet.cleanliness).delta;
    const overloadTarget =
      lastSet.nextRecommendedBpm > 0
        ? clampBpm(lastSet.nextRecommendedBpm)
        : clampBpm(lastSet.bpm + delta);
    let wSum = 0;
    let wTotal = 0;
    last5.forEach((st, idx) => {
      const w = (idx + 1) * (st.cleanliness >= 4 ? 1.0 : st.cleanliness === 3 ? 0.75 : 0.4);
      wSum += w * st.bpm;
      wTotal += w;
    });
    const histAvg = wTotal > 0 ? wSum / wTotal : exercise.baselineBpm;
    const weighted =
      lastSet.cleanliness >= 4
        ? Math.max(Math.round(histAvg), overloadTarget)
        : Math.round(histAvg * 0.35 + overloadTarget * 0.65);
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
    {
      bpm: number;
      setsCount: number;
      isPracticed: boolean;
      diffWeight: number;
      latestTs: number;
      lastCleanliness: CleanlinessScore;
    }
  >();

  for (const v of variants) {
    const sets = setsByVariant.get(v.id) ?? [];
    const storedBpm = exercise.variantBpms?.[v.id];
    if (sets.length > 0) {
      const lastSet = sets[sets.length - 1];
      const fallbackDelta = calculateNextBpm(lastSet.bpm, lastSet.cleanliness).delta;
      const overloadNext =
        lastSet.nextRecommendedBpm > 0
          ? clampBpm(lastSet.nextRecommendedBpm)
          : clampBpm(lastSet.bpm + fallbackDelta);

      const computedBpm =
        lastSet.cleanliness >= 4
          ? Math.max(storedBpm ?? 0, overloadNext)
          : overloadNext;

      const latestTs = new Date(lastSet.timestamp).getTime() || 0;
      rawComputedById.set(v.id, {
        bpm: computedBpm,
        setsCount: sets.length,
        isPracticed: true,
        diffWeight: v.difficultyWeight,
        latestTs,
        lastCleanliness: lastSet.cleanliness,
      });
    } else if (typeof storedBpm === 'number' && storedBpm > 0) {
      rawComputedById.set(v.id, {
        bpm: storedBpm,
        setsCount: 1,
        isPracticed: true,
        diffWeight: v.difficultyWeight,
        latestTs: 0,
        lastCleanliness: 4,
      });
    }
  }

  const practicedEntries = Array.from(rawComputedById.values());
  let estimatedBaseSkillBpm = unpracticedBaseBpm;
  if (practicedEntries.length > 0) {
    const sortedEntries = [...practicedEntries].sort(
      (a, b) => b.latestTs - a.latestTs
    );
    let normSum = 0;
    let weightTotal = 0;
    sortedEntries.forEach((entry, idx) => {
      const w =
        idx === 0
          ? 3.0
          : idx === 1
          ? 1.5
          : idx === 2
          ? 0.8
          : Math.max(0.25, 0.5 / (idx - 1));
      normSum += w * entry.bpm * entry.diffWeight;
      weightTotal += w;
    });
    estimatedBaseSkillBpm = weightTotal > 0 ? normSum / weightTotal : unpracticedBaseBpm;

    if (sortedEntries[0].lastCleanliness === 5) {
      estimatedBaseSkillBpm = Math.max(
        estimatedBaseSkillBpm,
        sortedEntries[0].bpm * sortedEntries[0].diffWeight * 0.97
      );
    }
  }

  const byVariant: VariantBpmEntry[] = variants.map((v) => {
    const practiced = rawComputedById.get(v.id);
    const isPracticed = Boolean(practiced);
    const setsCount = practiced?.setsCount ?? 0;
    const bv = practiced
      ? practiced.bpm
      : Math.max(
          38,
          Math.min(240, Math.round(estimatedBaseSkillBpm / Math.max(0.7, v.difficultyWeight)))
        );

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
      ? unpracticedBaseBpm
      : Math.max(38, Math.min(240, Math.round(estimatedBaseSkillBpm)));

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
 * Picks the next recommended variant within the player's skill-unlocked pool.
 * Uses dual-track mastery (consolidation at masteryBpm OR fast-track 5/5 streak)
 * so beginners are protected on foundational steps while fast learners advance immediately.
 */
export function pickNextRecommendedVariant(
  exercise: Exercise,
  sessionLogs: WorkoutSessionLog[] = [],
  preferredVariantId?: string,
  playerLevel?: PlayerLevelId
): ExerciseVariant | undefined {
  const allFiltered = getLevelFilteredVariants(exercise, playerLevel, sessionLogs);
  if (allFiltered.length === 0) return undefined;
  if (preferredVariantId) {
    const found = allFiltered.find((v) => v.id === preferredVariantId);
    if (found) return found;
  }

  const unlocked = getSkillUnlockedVariants(exercise, sessionLogs, playerLevel);
  const pool = unlocked.length > 0 ? unlocked : allFiltered;
  const setsByVar = mapExerciseSetsByVariant(exercise, sessionLogs);

  const nextUnmastered = pool.find(
    (v) => !isVariantMastered(v, setsByVar.get(v.id) ?? [])
  );
  if (nextUnmastered) {
    return nextUnmastered;
  }

  const sortedByUsage = [...pool].sort(
    (a, b) =>
      (setsByVar.get(a.id)?.length ?? 0) - (setsByVar.get(b.id)?.length ?? 0)
  );
  return sortedByUsage[0] ?? pool[0];
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
      color: 'text-[#39FF14]',
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
  let color = 'text-[#39FF14]';
  if (level >= 9) {
    tierLabel = 'Maestro';
    color = 'text-[#39FF14]';
  } else if (level >= 7) {
    tierLabel = 'Avanzato';
    color = 'text-[#39FF14]';
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
    exerciseId: 'ex-pent-licks',
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
    exerciseId: 'ex-speed-bursts',
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

export const BASS_CANONICAL_PILLARS: {
  pillarNumber: number;
  exerciseId: string;
  pillarLabel: string;
}[] = [
  {
    pillarNumber: 1,
    exerciseId: 'ex-bass-fingerstyle',
    pillarLabel: 'Pilastro 1 • Fingerstyle & Raking',
  },
  {
    pillarNumber: 2,
    exerciseId: 'ex-bass-pocket-groove',
    pillarLabel: 'Pilastro 2 • Pocket & Ghost Notes',
  },
  {
    pillarNumber: 3,
    exerciseId: 'ex-bass-slap-pop',
    pillarLabel: 'Pilastro 3 • Slap & Pop',
  },
  {
    pillarNumber: 4,
    exerciseId: 'ex-bass-arpeggios',
    pillarLabel: 'Pilastro 4 • Arpeggi & Basslines',
  },
  {
    pillarNumber: 5,
    exerciseId: 'ex-bass-neck-legato',
    pillarLabel: 'Pilastro 5 • Manico 4 Corde & Legato',
  },
];

export const CLEANLINESS_LABELS: Record<
  CleanlinessScore,
  { short: string; label: string; deltaText: string; description: string }
> = {
  5: {
    short: '5/5',
    label: 'Perfetto',
    deltaText: '+6..+16%',
    description: 'Fluido, pulito, zero fatica',
  },
  4: {
    short: '4/5',
    label: 'Pulito',
    deltaText: '+3..+7%',
    description: 'Bene e controllato',
  },
  3: {
    short: '3/5',
    label: 'Al Limite',
    deltaText: '= BPM',
    description: 'Giusto ma al massimo sforzo',
  },
  2: {
    short: '2/5',
    label: 'Teso / Sporco',
    deltaText: '-5%',
    description: 'Tensione o note impastate',
  },
  1: {
    short: '1/5',
    label: 'Disastro',
    deltaText: '-12%',
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
