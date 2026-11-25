import {
  CleanlinessScore,
  Exercise,
  InstrumentType,
  Subdivision,
  WorkoutSessionLog,
} from '../types/practice';
import {
  BASS_CANONICAL_PILLARS,
  CANONICAL_PILLARS,
  CLEANLINESS_LABELS,
} from './overloadEngine';

export interface CleanBpmPoint {
  sessionId: string;
  date: string;
  dateLabel: string;
  daysFromStart: number;
  avgCleanBpm: number;
  peakCleanBpm: number;
  totalCleanSets: number;
  durationPreset: number;
  trendBpm: number;
}

export interface RpeBucket {
  score: CleanlinessScore;
  label: string;
  deltaText: string;
  count: number;
  pct: number;
  colorClass: string;
}

export interface WeekDayStatus {
  label: string;
  dateKey: string;
  completed: boolean;
  isToday: boolean;
}

export interface PillarComparison {
  pillarNumber: number;
  exerciseId: string;
  title: string;
  shortTitle: string;
  baselineBpm: number;
  avgCleanBpm: number;
  bestCleanBpm: number;
  cleanSetsCount: number;
  gainPct: number;
}

export interface NerdTelemetry {
  // Primary Clean BPM (>= 4/5) Evolution
  series: CleanBpmPoint[];
  currentAvgCleanBpm: number;
  baselineAvgCleanBpm: number;
  cleanBpmDelta: number;
  cleanBpmPctGain: number;
  velocitySlopePerWeek: number;
  projected30dBpm: number;

  // Efficiency & Volume Metrics
  cleanExecutionRatio: number; // % sets >= 4/5
  totalSetsLogged: number;
  totalCleanSetsLogged: number;
  estimatedNotesPlayed: number;

  // Consistency Metrics
  consistency7dPct: number;
  consistency28dPct: number;
  uniqueDays7d: number;
  uniqueDays28d: number;
  currentStreakDays: number;
  avgGapDays: number;

  // Overload & Protection
  overloadConversionRate: number; // % sessions with >=1 set yielding +BPM overload
  deloadShieldCount: number; // sets <= 2/5
  deloadShieldPct: number;

  // Breakdown
  rpeDistribution: RpeBucket[];
  pillarStats: PillarComparison[];
  weekDaysStatus: WeekDayStatus[];
  totalSessionsCount: number;
}

function getSubdivisionMultiplier(sub: Subdivision | undefined): number {
  switch (sub) {
    case '1/4':
      return 1;
    case '1/8':
      return 2;
    case '1/8T':
      return 3;
    case '1/16':
      return 4;
    case '1/16T':
      return 6;
    default:
      return 2;
  }
}

export function computeNerdTelemetry(
  exercises: Exercise[],
  sessionLogs: WorkoutSessionLog[],
  weeklyGoalDays: number,
  filterExerciseId: string = 'all',
  instrument?: InstrumentType
): NerdTelemetry {
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const sorted = [...sessionLogs].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // 1. Clean BPM (>= 4/5) time series (for selected exercise or global canonical average)
  const rawPoints: Omit<CleanBpmPoint, 'trendBpm'>[] = [];
  const firstDateMs =
    sorted.length > 0 ? new Date(sorted[0].date).getTime() : Date.now();

  for (const sess of sorted) {
    const relevantSets = sess.sets.filter((s) =>
      filterExerciseId === 'all' ? true : s.exerciseId === filterExerciseId
    );
    const cleanSets = relevantSets.filter((s) => s.cleanliness >= 4);
    if (cleanSets.length === 0) continue;

    const avgClean =
      cleanSets.reduce((sum, s) => sum + s.bpm, 0) / cleanSets.length;
    const peakClean = Math.max(...cleanSets.map((s) => s.bpm));
    const daysFromStart = Math.max(
      0,
      (new Date(sess.date).getTime() - firstDateMs) / (1000 * 60 * 60 * 24)
    );

    rawPoints.push({
      sessionId: sess.id,
      date: sess.date,
      dateLabel: new Date(sess.date).toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
      }),
      daysFromStart,
      avgCleanBpm: Number(avgClean.toFixed(1)),
      peakCleanBpm: peakClean,
      totalCleanSets: cleanSets.length,
      durationPreset: sess.durationPreset,
    });
  }

  // Linear regression over (daysFromStart, avgCleanBpm)
  let slopePerDay = 0;
  let intercept = rawPoints[0]?.avgCleanBpm ?? 90;

  if (rawPoints.length >= 2) {
    const n = rawPoints.length;
    const sumX = rawPoints.reduce((acc, p) => acc + p.daysFromStart, 0);
    const sumY = rawPoints.reduce((acc, p) => acc + p.avgCleanBpm, 0);
    const meanX = sumX / n;
    const meanY = sumY / n;

    let num = 0;
    let den = 0;
    for (const p of rawPoints) {
      num += (p.daysFromStart - meanX) * (p.avgCleanBpm - meanY);
      den += (p.daysFromStart - meanX) ** 2;
    }

    slopePerDay = den > 0 ? num / den : 0;
    intercept = meanY - slopePerDay * meanX;
  }

  const series: CleanBpmPoint[] = rawPoints.map((p) => ({
    ...p,
    trendBpm: Number((intercept + slopePerDay * p.daysFromStart).toFixed(1)),
  }));

  const velocitySlopePerWeek = Number((slopePerDay * 7).toFixed(1));
  const lastThree = series.slice(-3);
  const firstThree = series.slice(0, 3);

  const currentAvgCleanBpm =
    lastThree.length > 0
      ? Number(
          (
            lastThree.reduce((a, b) => a + b.avgCleanBpm, 0) / lastThree.length
          ).toFixed(1)
        )
      : 0;

  const baselineAvgCleanBpm =
    firstThree.length > 0
      ? Number(
          (
            firstThree.reduce((a, b) => a + b.avgCleanBpm, 0) /
            firstThree.length
          ).toFixed(1)
        )
      : 0;

  const cleanBpmDelta = Number(
    (currentAvgCleanBpm - baselineAvgCleanBpm).toFixed(1)
  );
  const cleanBpmPctGain =
    baselineAvgCleanBpm > 0
      ? Number(((cleanBpmDelta / baselineAvgCleanBpm) * 100).toFixed(1))
      : 0;

  const lastDayX = series[series.length - 1]?.daysFromStart ?? 0;
  const projectedRaw =
    series.length >= 2
      ? currentAvgCleanBpm + velocitySlopePerWeek * (30 / 7)
      : currentAvgCleanBpm;
  const projected30dBpm = Math.max(
    30,
    Math.min(260, Math.round(series.length >= 2 ? projectedRaw : intercept + slopePerDay * (lastDayX + 30)))
  );

  // 2. Global Volume & RPE Efficiency across ALL logged sets
  const allSets = sorted.flatMap((s) => s.sets);
  const totalSetsLogged = allSets.length;
  const totalCleanSetsLogged = allSets.filter((s) => s.cleanliness >= 4).length;
  const cleanExecutionRatio =
    totalSetsLogged > 0
      ? Math.round((totalCleanSetsLogged / totalSetsLogged) * 100)
      : 0;

  const deloadShieldCount = allSets.filter((s) => s.cleanliness <= 2).length;
  const deloadShieldPct =
    totalSetsLogged > 0
      ? Math.round((deloadShieldCount / totalSetsLogged) * 100)
      : 0;

  const estimatedNotesPlayed = Math.round(
    allSets.reduce((acc, s) => {
      const ex = exMap.get(s.exerciseId);
      const subMult = getSubdivisionMultiplier(s.subdivision ?? ex?.subdivision);
      return acc + s.durationSec * (s.bpm / 60) * subMult;
    }, 0)
  );

  // Overload conversion: % sessions with at least 1 set where nextRecommendedBpm > bpm
  const overloadSessions = sorted.filter((sess) =>
    sess.sets.some((s) => s.nextRecommendedBpm > s.bpm)
  ).length;
  const overloadConversionRate =
    sorted.length > 0 ? Math.round((overloadSessions / sorted.length) * 100) : 0;

  // 3. Consistency Metrics (7d, 28d, Streak, Avg Gap Days)
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const uniqueDays7d = new Set(
    sorted
      .filter((s) => now - new Date(s.date).getTime() <= 7 * dayMs)
      .map((s) => s.date.slice(0, 10))
  ).size;
  const uniqueDays28d = new Set(
    sorted
      .filter((s) => now - new Date(s.date).getTime() <= 28 * dayMs)
      .map((s) => s.date.slice(0, 10))
  ).size;

  const consistency7dPct = Math.min(
    100,
    Math.round((uniqueDays7d / Math.max(1, weeklyGoalDays)) * 100)
  );
  const target28dDays = Math.max(1, weeklyGoalDays * 4);
  const consistency28dPct = Math.min(
    100,
    Math.round((uniqueDays28d / target28dDays) * 100)
  );

  // Flexible Streak (counts active distinct training days allowing at most 1 rest day gap in last active window)
  const uniqueDatesAsc = Array.from(
    new Set(sorted.map((s) => s.date.slice(0, 10)))
  ).sort();

  let currentStreakDays = 0;
  if (uniqueDatesAsc.length > 0) {
    const todayKey = new Date().toISOString().slice(0, 10);
    const latestKey = uniqueDatesAsc[uniqueDatesAsc.length - 1];
    const diffFromToday = Math.round(
      (new Date(todayKey).getTime() - new Date(latestKey).getTime()) / dayMs
    );

    if (diffFromToday <= 2) {
      currentStreakDays = 1;
      for (let i = uniqueDatesAsc.length - 2; i >= 0; i--) {
        const d1 = new Date(uniqueDatesAsc[i + 1]).getTime();
        const d0 = new Date(uniqueDatesAsc[i]).getTime();
        const gap = Math.round((d1 - d0) / dayMs);
        if (gap <= 2) {
          currentStreakDays += 1;
        } else {
          break;
        }
      }
    }
  }

  let avgGapDays = 0;
  if (uniqueDatesAsc.length >= 2) {
    let totalGap = 0;
    for (let i = 1; i < uniqueDatesAsc.length; i++) {
      totalGap +=
        (new Date(uniqueDatesAsc[i]).getTime() -
          new Date(uniqueDatesAsc[i - 1]).getTime()) /
        dayMs;
    }
    avgGapDays = Number((totalGap / (uniqueDatesAsc.length - 1)).toFixed(1));
  }

  // 4. RPE 1-5 Histogram (Electric Neon Green + Liquid Chrome scale)
  const rpeMeta: { score: CleanlinessScore; colorClass: string }[] = [
    { score: 5, colorClass: 'bg-[#39FF14] shadow-[0_0_10px_rgba(57,255,20,0.55)]' },
    { score: 4, colorClass: 'bg-[#39FF14]/70' },
    { score: 3, colorClass: 'bg-gradient-to-r from-slate-200 via-white to-slate-300' },
    { score: 2, colorClass: 'bg-slate-400/65' },
    { score: 1, colorClass: 'bg-slate-600/80' },
  ];

  const rpeDistribution: RpeBucket[] = rpeMeta.map(({ score, colorClass }) => {
    const count = allSets.filter((s) => s.cleanliness === score).length;
    return {
      score,
      label: CLEANLINESS_LABELS[score].label,
      deltaText: CLEANLINESS_LABELS[score].deltaText,
      count,
      pct: totalSetsLogged > 0 ? Math.round((count / totalSetsLogged) * 100) : 0,
      colorClass,
    };
  });

  // Current Mon-Sun week status
  const completedDatesSet = new Set(sorted.map((s) => s.date.slice(0, 10)));
  const todayDate = new Date();
  const todayKey = todayDate.toISOString().slice(0, 10);
  const jsDay = todayDate.getDay(); // 0=Sun..6=Sat
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const weekLabels = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  const weekDaysStatus: WeekDayStatus[] = weekLabels.map((label, idx) => {
    const d = new Date();
    d.setDate(todayDate.getDate() + mondayOffset + idx);
    const key = d.toISOString().slice(0, 10);
    return {
      label,
      dateKey: key,
      completed: completedDatesSet.has(key),
      isToday: key === todayKey,
    };
  });

  // 5. Canonical Pillar Breakdown
  const resolvedInstrument: InstrumentType =
    instrument ??
    (exercises.length > 0 && exercises.every((e) => e.instrument === 'bass')
      ? 'bass'
      : 'guitar');
  const activePillars =
    resolvedInstrument === 'bass' ? BASS_CANONICAL_PILLARS : CANONICAL_PILLARS;
  const seenEx = new Set<string>();
  const pillarStats: PillarComparison[] = [];
  for (const p of activePillars) {
    if (seenEx.has(p.exerciseId)) continue;
    seenEx.add(p.exerciseId);
    const ex = exMap.get(p.exerciseId);
    if (!ex) continue;

    const cleanExSets = allSets.filter(
      (s) => s.exerciseId === ex.id && s.cleanliness >= 4
    );
    const avgClean =
      cleanExSets.length > 0
        ? Number(
            (
              cleanExSets.reduce((a, b) => a + b.bpm, 0) / cleanExSets.length
            ).toFixed(1)
          )
        : ex.bestCleanBpm;

    const gainPct =
      ex.baselineBpm > 0
        ? Math.round(((ex.bestCleanBpm - ex.baselineBpm) / ex.baselineBpm) * 100)
        : 0;

    pillarStats.push({
      pillarNumber: p.pillarNumber,
      exerciseId: ex.id,
      title: ex.title,
      shortTitle: ex.title.split('—')[0].trim(),
      baselineBpm: ex.baselineBpm,
      avgCleanBpm: avgClean,
      bestCleanBpm: ex.bestCleanBpm,
      cleanSetsCount: cleanExSets.length,
      gainPct,
    });
  }

  return {
    series,
    currentAvgCleanBpm,
    baselineAvgCleanBpm,
    cleanBpmDelta,
    cleanBpmPctGain,
    velocitySlopePerWeek,
    projected30dBpm,
    cleanExecutionRatio,
    totalSetsLogged,
    totalCleanSetsLogged,
    estimatedNotesPlayed,
    consistency7dPct,
    consistency28dPct,
    uniqueDays7d,
    uniqueDays28d,
    currentStreakDays,
    avgGapDays,
    overloadConversionRate,
    deloadShieldCount,
    deloadShieldPct,
    rpeDistribution,
    pillarStats,
    weekDaysStatus,
    totalSessionsCount: sorted.length,
  };
}
