import { DemoStep, Exercise, ExerciseVariant, FretNote } from '../types/practice';

export const ARPEGGIO_EXERCISE_ID = 'ex-arpeggio-progressions';

export type ArpeggioDegree = '1' | '3' | '5' | '8';
export type ArpeggioSlot = ArpeggioDegree | 'hold';
export type ArpeggioChordKey = 'Am' | 'F' | 'G' | 'Dm' | 'C' | 'Em' | 'Bdim' | 'D';

export interface MovableChordVoicing {
  key: ArpeggioChordKey;
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
}

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
    id: 'arp-pat-00',
    shortLabel: 'Base Lento 1-3-5',
    name: '1) Arpeggio Lento con Respiro (1–3–5–3)',
    formulaText: '1 · – · 3 · – · 5 · – · 3 · –',
    slots: ['1', 'hold', '3', 'hold', '5', 'hold', '3', 'hold'],
    difficultyWeight: 0.9,
  },
  {
    id: 'v-arp-1535-8',
    shortLabel: '1-5-3-5 (8/8)',
    name: 'Pendolo 3ª–5ª: 1 – 5 – 3 – 5 – 3 – 5 – 3 – 5',
    formulaText: '1 – 5 – 3 – 5 – 3 – 5 – 3 – 5',
    slots: ['1', '5', '3', '5', '3', '5', '3', '5'],
    difficultyWeight: 1.0,
  },
  {
    id: 'v-arp-1583-8',
    shortLabel: '1-5-8-3 (8/8)',
    name: 'Open Voicing: 1 – 5 – 8 – 3 – 5 – 8 – 3 – 5',
    formulaText: '1 – 5 – 8 – 3 – 5 – 8 – 3 – 5',
    slots: ['1', '5', '8', '3', '5', '8', '3', '5'],
    difficultyWeight: 1.04,
  },
  {
    id: 'v-arp-1358-wave-8',
    shortLabel: '1-3-5-8-5-3 (8/8)',
    name: 'Onda Completa: 1 – 3 – 5 – 8 – 5 – 3 – 5 – 3',
    formulaText: '1 – 3 – 5 – 8 – 5 – 3 – 5 – 3',
    slots: ['1', '3', '5', '8', '5', '3', '5', '3'],
    difficultyWeight: 1.03,
  },
  {
    id: 'v-arp-1585-pedal-8',
    shortLabel: '1-5-8-5-3-5 (8/8)',
    name: 'Pivot sulla 5ª: 1 – 5 – 8 – 5 – 3 – 5 – 8 – 5',
    formulaText: '1 – 5 – 8 – 5 – 3 – 5 – 8 – 5',
    slots: ['1', '5', '8', '5', '3', '5', '8', '5'],
    difficultyWeight: 1.05,
  },
  {
    id: 'v-arp-1835-jump-8',
    shortLabel: '1-8-3-5 (8/8)',
    name: 'Salto d’Ottava: 1 – 8 – 3 – 5 – 8 – 3 – 5 – 3',
    formulaText: '1 – 8 – 3 – 5 – 8 – 3 – 5 – 3',
    slots: ['1', '8', '3', '5', '8', '3', '5', '3'],
    difficultyWeight: 1.08,
  },
  {
    id: 'v-arp-135hold-8',
    shortLabel: '1-3-5-Tenuta (8/8)',
    name: 'Respiro Ritmico: 1 – 3 – 5 – [—] – 8 – 5 – 3 – [—]',
    formulaText: '1 – 3 – 5 – — – 8 – 5 – 3 – —',
    slots: ['1', '3', '5', 'hold', '8', '5', '3', 'hold'],
    difficultyWeight: 1.02,
  },
  {
    id: 'v-arp-1535-4',
    shortLabel: '1-5-3-5 (4/8)',
    name: 'Cambio Rapido: 1 – 5 – 3 – 5 (2 accordi/battuta)',
    formulaText: '1 – 5 – 3 – 5',
    slots: ['1', '5', '3', '5'],
    difficultyWeight: 1.04,
  },
  {
    id: 'v-arp-1358-4',
    shortLabel: '1-3-5-8 (4/8)',
    name: 'Salita Diretta: 1 – 3 – 5 – 8 (2 accordi/battuta)',
    formulaText: '1 – 3 – 5 – 8',
    slots: ['1', '3', '5', '8'],
    difficultyWeight: 1.05,
  },
  {
    id: 'v-arp-1583-4',
    shortLabel: '1-5-8-3 (4/8)',
    name: 'Spread Rapido: 1 – 5 – 8 – 3 (2 accordi/battuta)',
    formulaText: '1 – 5 – 8 – 3',
    slots: ['1', '5', '8', '3'],
    difficultyWeight: 1.07,
  },
  {
    id: 'v-arp-1853-4',
    shortLabel: '1-8-5-3 (4/8)',
    name: 'Cascata dall’Ottava: 1 – 8 – 5 – 3 (2 accordi/battuta)',
    formulaText: '1 – 8 – 5 – 3',
    slots: ['1', '8', '5', '3'],
    difficultyWeight: 1.08,
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
  sessionLogsCount: number
): ArpeggioProgressionPreset {
  const idx =
    ((sessionLogsCount % ARPEGGIO_PROGRESSIONS.length) +
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
  fretboardNotes: FretNote[];
  demoSequence: DemoStep[];
} {
  const pattern = getArpeggioPattern(variantId);
  const progression = getArpeggioProgression(progressionId);

  const uniqueNotesMap = new Map<string, FretNote>();
  const demoSequence: DemoStep[] = [];

  for (const chordKey of progression.chords) {
    const voicing = CHORD_VOICINGS_BY_DEGREE[chordKey];
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
          sustain: true,
          technique: `${voicing.label} · Tenuta`,
        });
      } else {
        demoSequence.push({
          notes: [voicing.degrees[slot]],
          chordNotes,
          technique: `${voicing.label} · Grado ${slot}`,
        });
      }
    }
  }

  return {
    pattern,
    progression,
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
      'Per imparare pattern di arpeggio universali basati sui gradi (1-3-5-8) da applicare su qualsiasi giro di accordi.',
    expectedOutcome:
      'Costruire una toolbox personale di 10 pattern ritmici trasferibili subito nel tuo songwriting.',
    description:
      '10 pattern universali per gradi (1-3-5-8) applicabili su 7 progressioni diverse.',
    scientificRationale:
      'Allenare la formula del pattern per gradi su forme mobili rende l’arpeggio indipendente dagli accordi specifici.',
    coachingCues: [
      'Segui la formula dei gradi (1, 3, 5, 8) anziché memorizzare i singoli tasti.',
      'Mantieni ferma la forma dell’accordo per tutta la battuta lasciando risuonare le corde.',
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
