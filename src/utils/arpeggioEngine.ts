import {
  DemoStep,
  Exercise,
  ExerciseVariant,
  FretNote,
  PlayerLevelId,
  WorkoutSessionLog,
} from '../types/practice';

export const ARPEGGIO_EXERCISE_ID = 'ex-arpeggio-progressions';

export type ArpeggioDegree = '1' | '3' | '5' | '8';
export type ArpeggioSlot = ArpeggioDegree | 'hold';
export type ArpeggioChordKey = 'Am' | 'F' | 'G' | 'Dm' | 'C' | 'Em' | 'Bdim' | 'D';
export type OpenArpeggioChordKey = 'Am_open' | 'C_open' | 'G_open' | 'Em_open';

export interface MovableChordVoicing {
  key: ArpeggioChordKey | OpenArpeggioChordKey;
  label: string;
  degrees: Record<ArpeggioDegree, FretNote>;
}

export interface ArpeggioProgressionPreset {
  id: string;
  shortLabel: string;
  name: string;
  chords: [ArpeggioChordKey, ArpeggioChordKey, ArpeggioChordKey, ArpeggioChordKey];
}

export interface ArpeggioPatternDef {
  id: string;
  shortLabel: string;
  name: string;
  formulaText: string;
  slots: ArpeggioSlot[];
  difficultyWeight: number;
  minLevel?: PlayerLevelId;
  masteryBpm?: number;
  fixedOpenChords?: OpenArpeggioChordKey[];
  fixedLabel?: string;
}

export const OPEN_ARPEGGIO_VOICINGS: Record<OpenArpeggioChordKey, MovableChordVoicing> = {
  Am_open: {
    key: 'Am_open',
    label: 'Am (Aperto)',
    degrees: {
      '1': { string: 5, fret: 0, label: '1', isRoot: true, finger: 'O' },
      '5': { string: 4, fret: 2, label: '5', finger: '2' },
      '8': { string: 3, fret: 2, label: '8', isRoot: true, finger: '3' },
      '3': { string: 2, fret: 1, label: 'b3', finger: '1' },
    },
  },
  C_open: {
    key: 'C_open',
    label: 'C (Aperto)',
    degrees: {
      '1': { string: 5, fret: 3, label: '1', isRoot: true, finger: '3' },
      '3': { string: 4, fret: 2, label: '3', finger: '2' },
      '5': { string: 3, fret: 0, label: '5', finger: 'O' },
      '8': { string: 2, fret: 1, label: '8', isRoot: true, finger: '1' },
    },
  },
  G_open: {
    key: 'G_open',
    label: 'G (Aperto)',
    degrees: {
      '1': { string: 6, fret: 3, label: '1', isRoot: true, finger: '2' },
      '3': { string: 5, fret: 2, label: '3', finger: '1' },
      '5': { string: 4, fret: 0, label: '5', finger: 'O' },
      '8': { string: 3, fret: 0, label: '8', isRoot: true, finger: 'O' },
    },
  },
  Em_open: {
    key: 'Em_open',
    label: 'Em (Aperto)',
    degrees: {
      '1': { string: 6, fret: 0, label: '1', isRoot: true, finger: 'O' },
      '5': { string: 5, fret: 2, label: '5', finger: '1' },
      '8': { string: 4, fret: 2, label: '8', isRoot: true, finger: '2' },
      '3': { string: 3, fret: 0, label: 'b3', finger: 'O' },
    },
  },
};

export const CHORD_VOICINGS_BY_DEGREE: Record<ArpeggioChordKey, MovableChordVoicing> = {
  Am: {
    key: 'Am',
    label: 'i (Am)',
    degrees: {
      '1': { string: 4, fret: 7, label: '1', isRoot: true, finger: '3' },
      '3': { string: 3, fret: 5, label: '3', finger: '1' },
      '5': { string: 2, fret: 5, label: '5', finger: '1' },
      '8': { string: 1, fret: 5, label: '8', isRoot: true, finger: '1' },
    },
  },
  F: {
    key: 'F',
    label: 'VI (F)',
    degrees: {
      '1': { string: 4, fret: 3, label: '1', isRoot: true, finger: '3' },
      '3': { string: 3, fret: 2, label: '3', finger: '2' },
      '5': { string: 2, fret: 1, label: '5', finger: '1' },
      '8': { string: 1, fret: 1, label: '8', isRoot: true, finger: '1' },
    },
  },
  G: {
    key: 'G',
    label: 'VII (G)',
    degrees: {
      '1': { string: 4, fret: 5, label: '1', isRoot: true, finger: '3' },
      '3': { string: 3, fret: 4, label: '3', finger: '2' },
      '5': { string: 2, fret: 3, label: '5', finger: '1' },
      '8': { string: 1, fret: 3, label: '8', isRoot: true, finger: '1' },
    },
  },
  Dm: {
    key: 'Dm',
    label: 'iv (Dm)',
    degrees: {
      '1': { string: 5, fret: 5, label: '1', isRoot: true, finger: '1' },
      '5': { string: 4, fret: 7, label: '5', finger: '3' },
      '8': { string: 3, fret: 7, label: '8', isRoot: true, finger: '4' },
      '3': { string: 2, fret: 6, label: '3', finger: '2' },
    },
  },
  C: {
    key: 'C',
    label: 'III (C)',
    degrees: {
      '1': { string: 5, fret: 3, label: '1', isRoot: true, finger: '1' },
      '5': { string: 4, fret: 5, label: '5', finger: '2' },
      '8': { string: 3, fret: 5, label: '8', isRoot: true, finger: '3' },
      '3': { string: 2, fret: 5, label: '3', finger: '4' },
    },
  },
  Em: {
    key: 'Em',
    label: 'v (Em)',
    degrees: {
      '1': { string: 5, fret: 7, label: '1', isRoot: true, finger: '1' },
      '5': { string: 4, fret: 9, label: '5', finger: '3' },
      '8': { string: 3, fret: 9, label: '8', isRoot: true, finger: '4' },
      '3': { string: 2, fret: 8, label: '3', finger: '2' },
    },
  },
  Bdim: {
    key: 'Bdim',
    label: 'ii° (B°)',
    degrees: {
      '1': { string: 5, fret: 2, label: '1', isRoot: true, finger: '1' },
      '5': { string: 4, fret: 3, label: '5', finger: '2' },
      '8': { string: 3, fret: 4, label: '8', isRoot: true, finger: '4' },
      '3': { string: 2, fret: 3, label: '3', finger: '3' },
    },
  },
  D: {
    key: 'D',
    label: 'IV (D)',
    degrees: {
      '1': { string: 5, fret: 5, label: '1', isRoot: true, finger: '1' },
      '5': { string: 4, fret: 7, label: '5', finger: '2' },
      '8': { string: 3, fret: 7, label: '8', isRoot: true, finger: '3' },
      '3': { string: 2, fret: 7, label: '3', finger: '4' },
    },
  },
};

export const ARPEGGIO_PROGRESSIONS: ArpeggioProgressionPreset[] = [
  {
    id: 'prog-i-VI-III-VII',
    shortLabel: 'i–VI–III–VII',
    name: 'i – VI – III – VII (Am–F–C–G)',
    chords: ['Am', 'F', 'C', 'G'],
  },
  {
    id: 'prog-i-iv-VII-III',
    shortLabel: 'i–iv–VII–III',
    name: 'i – iv – VII – III (Am–Dm–G–C)',
    chords: ['Am', 'Dm', 'G', 'C'],
  },
  {
    id: 'prog-i-VII-VI-VII',
    shortLabel: 'i–VII–VI–VII',
    name: 'i – VII – VI – VII (Am–G–F–G)',
    chords: ['Am', 'G', 'F', 'G'],
  },
  {
    id: 'prog-i-iv-v-i',
    shortLabel: 'i–iv–v–i',
    name: 'i – iv – v – i (Am–Dm–Em–Am)',
    chords: ['Am', 'Dm', 'Em', 'Am'],
  },
  {
    id: 'prog-VI-VII-i-III',
    shortLabel: 'VI–VII–i–III',
    name: 'VI – VII – i – III (F–G–Am–C)',
    chords: ['F', 'G', 'Am', 'C'],
  },
  {
    id: 'prog-i-v-VII-IV',
    shortLabel: 'i–v–VII–IV',
    name: 'i – v – VII – IV (Am–Em–G–D)',
    chords: ['Am', 'Em', 'G', 'D'],
  },
  {
    id: 'prog-i-ii-v-i',
    shortLabel: 'i–ii°–v–i',
    name: 'i – ii° – v – i (Am–B°–Em–Am)',
    chords: ['Am', 'Bdim', 'Em', 'Am'],
  },
];

export const ARPEGGIO_PATTERNS: ArpeggioPatternDef[] = [
  {
    id: 'arp-step1-am-static',
    shortLabel: 'Step 1 · 1 Accordo (Am)',
    name: '1) Singolo Accordo Fermo: Am Aperto (Mano Fissa)',
    formulaText: '1 · – · 5 · – · 8 · – · 3 · –',
    slots: ['1', 'hold', '5', 'hold', '8', 'hold', '3', 'hold'],
    fixedOpenChords: ['Am_open'],
    fixedLabel: '1 Accordo Statico: Am Aperto',
    difficultyWeight: 0.76,
    masteryBpm: 68,
  },
  {
    id: 'arp-step2-am-flow',
    shortLabel: 'Step 2 · Am Continuo',
    name: '2) Arpeggio Fluido su 1 Solo Accordo (Am Aperto)',
    formulaText: '1 – 5 – 8 – 3 – 8 – 5 – 8 – 5',
    slots: ['1', '5', '8', '3', '8', '5', '8', '5'],
    fixedOpenChords: ['Am_open'],
    fixedLabel: '1 Accordo Statico: Am Aperto',
    difficultyWeight: 0.82,
    masteryBpm: 72,
  },
  {
    id: 'arp-step3-pivot-am-c',
    shortLabel: 'Step 3 · 2 Accordi (Am↔C)',
    name: '3) Cambio Guidato a 2 Accordi con Dito Pivot (Am ↔ C)',
    formulaText: '1 – 5 – 8 – 3 – 5 – 8 – [Cambio]',
    slots: ['1', '5', '8', '3', '5', '8', 'hold', 'hold'],
    fixedOpenChords: ['Am_open', 'C_open'],
    fixedLabel: '2 Accordi Pivot: Am ↔ C',
    difficultyWeight: 0.88,
    masteryBpm: 74,
  },
  {
    id: 'arp-step4-open-4chords',
    shortLabel: 'Step 4 · Giro Aperto',
    name: '4) Giro Songwriting 4 Accordi Aperti (Am – C – G – Em)',
    formulaText: '1 – 5 – 8 – 3 – 8 – 5 – [Cambio]',
    slots: ['1', '5', '8', '3', '8', '5', 'hold', 'hold'],
    fixedOpenChords: ['Am_open', 'C_open', 'G_open', 'Em_open'],
    fixedLabel: 'Giro Aperto: Am – C – G – Em',
    difficultyWeight: 0.94,
    masteryBpm: 76,
  },
  {
    id: 'arp-pat-00',
    shortLabel: 'Triadi Mobili 1-3-5',
    name: '5) Triadi Mobili con Respiro (1–3–5–3)',
    formulaText: '1 · – · 3 · – · 5 · – · 3 · –',
    slots: ['1', 'hold', '3', 'hold', '5', 'hold', '3', 'hold'],
    difficultyWeight: 1.0,
    minLevel: 'intermediate',
    masteryBpm: 76,
  },
  {
    id: 'v-arp-135hold-8',
    shortLabel: '1-3-5-Tenuta (8/8)',
    name: 'Respiro Ritmico: 1 – 3 – 5 – [—] – 8 – 5 – 3 – [—]',
    formulaText: '1 – 3 – 5 – — – 8 – 5 – 3 – —',
    slots: ['1', '3', '5', 'hold', '8', '5', '3', 'hold'],
    difficultyWeight: 1.04,
    minLevel: 'intermediate',
    masteryBpm: 78,
  },
  {
    id: 'v-arp-1535-8',
    shortLabel: '1-5-3-5 (8/8)',
    name: 'Pendolo 3ª–5ª: 1 – 5 – 3 – 5 – 3 – 5 – 3 – 5',
    formulaText: '1 – 5 – 3 – 5 – 3 – 5 – 3 – 5',
    slots: ['1', '5', '3', '5', '3', '5', '3', '5'],
    difficultyWeight: 1.06,
    minLevel: 'intermediate',
    masteryBpm: 78,
  },
  {
    id: 'v-arp-1358-wave-8',
    shortLabel: '1-3-5-8-5-3 (8/8)',
    name: 'Onda Completa: 1 – 3 – 5 – 8 – 5 – 3 – 5 – 3',
    formulaText: '1 – 3 – 5 – 8 – 5 – 3 – 5 – 3',
    slots: ['1', '3', '5', '8', '5', '3', '5', '3'],
    difficultyWeight: 1.08,
    minLevel: 'intermediate',
    masteryBpm: 80,
  },
  {
    id: 'v-arp-1583-8',
    shortLabel: '1-5-8-3 (8/8)',
    name: 'Open Voicing: 1 – 5 – 8 – 3 – 5 – 8 – 3 – 5',
    formulaText: '1 – 5 – 8 – 3 – 5 – 8 – 3 – 5',
    slots: ['1', '5', '8', '3', '5', '8', '3', '5'],
    difficultyWeight: 1.11,
    minLevel: 'intermediate',
    masteryBpm: 80,
  },
  {
    id: 'v-arp-1585-pedal-8',
    shortLabel: '1-5-8-5-3-5 (8/8)',
    name: 'Pivot sulla 5ª: 1 – 5 – 8 – 5 – 3 – 5 – 8 – 5',
    formulaText: '1 – 5 – 8 – 5 – 3 – 5 – 8 – 5',
    slots: ['1', '5', '8', '5', '3', '5', '8', '5'],
    difficultyWeight: 1.13,
    minLevel: 'intermediate',
    masteryBpm: 82,
  },
  {
    id: 'v-arp-1835-jump-8',
    shortLabel: '1-8-3-5 (8/8)',
    name: 'Salto d’Ottava: 1 – 8 – 3 – 5 – 8 – 3 – 5 – 3',
    formulaText: '1 – 8 – 3 – 5 – 8 – 3 – 5 – 3',
    slots: ['1', '8', '3', '5', '8', '3', '5', '3'],
    difficultyWeight: 1.18,
    minLevel: 'advanced',
    masteryBpm: 84,
  },
  {
    id: 'v-arp-1535-4',
    shortLabel: '1-5-3-5 (4/8)',
    name: 'Cambio Rapido: 1 – 5 – 3 – 5 (2 accordi/battuta)',
    formulaText: '1 – 5 – 3 – 5',
    slots: ['1', '5', '3', '5'],
    difficultyWeight: 1.2,
    minLevel: 'advanced',
    masteryBpm: 84,
  },
  {
    id: 'v-arp-1358-4',
    shortLabel: '1-3-5-8 (4/8)',
    name: 'Salita Diretta: 1 – 3 – 5 – 8 (2 accordi/battuta)',
    formulaText: '1 – 3 – 5 – 8',
    slots: ['1', '3', '5', '8'],
    difficultyWeight: 1.22,
    minLevel: 'advanced',
    masteryBpm: 86,
  },
  {
    id: 'v-arp-1583-4',
    shortLabel: '1-5-8-3 (4/8)',
    name: 'Spread Rapido: 1 – 5 – 8 – 3 (2 accordi/battuta)',
    formulaText: '1 – 5 – 8 – 3',
    slots: ['1', '5', '8', '3'],
    difficultyWeight: 1.25,
    minLevel: 'advanced',
    masteryBpm: 86,
  },
  {
    id: 'v-arp-1853-4',
    shortLabel: '1-8-5-3 (4/8)',
    name: 'Cascata dall’Ottava: 1 – 8 – 5 – 3 (2 accordi/battuta)',
    formulaText: '1 – 8 – 5 – 3',
    slots: ['1', '8', '5', '3'],
    difficultyWeight: 1.28,
    minLevel: 'advanced',
    masteryBpm: 88,
  },
];

export function getArpeggioPattern(patternId?: string): ArpeggioPatternDef {
  return (
    ARPEGGIO_PATTERNS.find((p) => p.id === patternId) ?? ARPEGGIO_PATTERNS[0]
  );
}

export function getArpeggioProgression(
  progressionId?: string
): ArpeggioProgressionPreset {
  return (
    ARPEGGIO_PROGRESSIONS.find((p) => p.id === progressionId) ??
    ARPEGGIO_PROGRESSIONS[0]
  );
}

export function pickRecommendedProgression(
  sessionLogsCount: number,
  sessionLogs?: WorkoutSessionLog[]
): ArpeggioProgressionPreset {
  if (sessionLogs && sessionLogs.length > 0) {
    const fixedIds = new Set(
      ARPEGGIO_PATTERNS.filter((p) => p.fixedOpenChords).map((p) => p.id)
    );
    const movableCleanSets = sessionLogs
      .flatMap((s) => s.sets)
      .filter(
        (st) =>
          st.exerciseId === ARPEGGIO_EXERCISE_ID &&
          st.cleanliness >= 4 &&
          (!st.variantId || !fixedIds.has(st.variantId))
      ).length;
    if (movableCleanSets < 6) {
      return ARPEGGIO_PROGRESSIONS[0];
    }
    const idx =
      Math.floor(movableCleanSets / 6) % ARPEGGIO_PROGRESSIONS.length;
    return ARPEGGIO_PROGRESSIONS[idx];
  }
  if (sessionLogsCount < 3) {
    return ARPEGGIO_PROGRESSIONS[0];
  }
  const idx =
    ((Math.floor(sessionLogsCount / 3) % ARPEGGIO_PROGRESSIONS.length) +
      ARPEGGIO_PROGRESSIONS.length) %
    ARPEGGIO_PROGRESSIONS.length;
  return ARPEGGIO_PROGRESSIONS[idx];
}

export function buildArpeggioExerciseData(
  variantId?: string,
  progressionId?: string
): {
  pattern: ArpeggioPatternDef;
  progression: ArpeggioProgressionPreset;
  isFixedChordStep: boolean;
  fretboardNotes: FretNote[];
  demoSequence: DemoStep[];
} {
  const pattern = getArpeggioPattern(variantId);
  const isFixedChordStep = Boolean(
    pattern.fixedOpenChords && pattern.fixedOpenChords.length > 0
  );
  const progression: ArpeggioProgressionPreset = isFixedChordStep
    ? {
        id: 'fixed-open',
        shortLabel: pattern.shortLabel,
        name: pattern.fixedLabel ?? pattern.shortLabel,
        chords: ['Am', 'F', 'C', 'G'],
      }
    : getArpeggioProgression(progressionId);

  const uniqueNotesMap = new Map<string, FretNote>();
  const demoSequence: DemoStep[] = [];

  const voicings: MovableChordVoicing[] = isFixedChordStep
    ? pattern.fixedOpenChords!.map((k) => OPEN_ARPEGGIO_VOICINGS[k])
    : progression.chords.map((k) => CHORD_VOICINGS_BY_DEGREE[k]);

  for (const voicing of voicings) {
    const chordNotes: FretNote[] = [
      voicing.degrees['1'],
      voicing.degrees['3'],
      voicing.degrees['5'],
      voicing.degrees['8'],
    ];

    for (const note of chordNotes) {
      const k = `${note.string}-${note.fret}`;
      if (!uniqueNotesMap.has(k)) {
        uniqueNotesMap.set(k, note);
      }
    }

    for (const slot of pattern.slots) {
      if (slot === 'hold') {
        demoSequence.push({
          notes: [],
          chordNotes,
          chordLabel: voicing.label,
          sustain: true,
          technique: `${voicing.label} · Tenuta`,
        });
      } else {
        demoSequence.push({
          notes: [voicing.degrees[slot]],
          chordNotes,
          chordLabel: voicing.label,
          technique: `${voicing.label} · Grado ${slot}`,
        });
      }
    }
  }

  return {
    pattern,
    progression,
    isFixedChordStep,
    fretboardNotes: Array.from(uniqueNotesMap.values()),
    demoSequence,
  };
}

export const buildArpeggioWorkoutData = buildArpeggioExerciseData;

export function buildSeedArpeggioExercise(): Exercise {
  const defaultData = buildArpeggioExerciseData(
    ARPEGGIO_PATTERNS[0].id,
    ARPEGGIO_PROGRESSIONS[0].id
  );

  const variants: ExerciseVariant[] = ARPEGGIO_PATTERNS.map((pat) => {
    const data = buildArpeggioExerciseData(pat.id, ARPEGGIO_PROGRESSIONS[0].id);
    return {
      id: pat.id,
      shortLabel: pat.shortLabel,
      name: pat.name,
      difficultyWeight: pat.difficultyWeight,
      minLevel: pat.minLevel,
      masteryBpm: pat.masteryBpm,
      fretboardNotes: data.fretboardNotes,
      demoSequence: data.demoSequence,
    };
  });

  return {
    id: ARPEGGIO_EXERCISE_ID,
    pillarName: 'Precisione',
    title: 'Arpeggi & Progressioni Songwriting',
    category: 'fretboard',
    forWho:
      'Per imparare prima arpeggi su 1 accordo fermo, poi cambi a 2 accordi e infine pattern mobili su qualsiasi giro.',
    expectedOutcome:
      'Costruire una toolbox personale di pattern ritmici applicabili dal 1° accordo aperto alle progressioni mobili.',
    description:
      'Da 1 accordo aperto statico fino ai pattern universali (1-3-5-8) su 7 progressioni diverse.',
    scientificRationale:
      'Isolare prima la mano destra su un solo accordo aperto e introdurre i cambi con dita pivot evita sovraccarico cognitivo e accelera il passaggio alle forme mobili.',
    coachingCues: [
      'Nei primi step tieni la forma sinistra ferma e guarda solo quali corde pizzica il plettro.',
      'Quando cambia l’accordo, anticipa con lo sguardo la forma successiva sull’ultima nota della battuta.',
    ],
    defaultBpm: 60,
    currentTargetBpm: 60,
    baselineBpm: 60,
    bestCleanBpm: 60,
    defaultSets: 3,
    defaultSetDurationSec: 90,
    defaultRestSec: 15,
    subdivision: '1/8',
    gapClickMode: 'off',
    speedBurst: false,
    isBenchmark: true,
    activeVariantId: ARPEGGIO_PATTERNS[0].id,
    fretboardNotes: defaultData.fretboardNotes,
    demoSequence: defaultData.demoSequence,
    variants,
  };
}
