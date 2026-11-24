import {
  DemoStep,
  Exercise,
  ExerciseVariant,
  FretNote,
  WorkoutSessionLog,
} from '../types/practice';
import {
  ARPEGGIO_PROGRESSIONS,
  ArpeggioChordKey,
  ArpeggioProgressionPreset,
} from './arpeggioEngine';

export const BASS_ARPEGGIO_EXERCISE_ID = 'ex-bass-arpeggios';

export type BassArpeggioDegree = '1' | '3' | '5' | '7' | '8';
export type BassArpeggioSlot = BassArpeggioDegree | 'hold';

export interface BassChordVoicing {
  key: ArpeggioChordKey;
  label: string;
  degrees: Record<BassArpeggioDegree, FretNote>;
}

export interface BassArpeggioPatternDef {
  id: string;
  shortLabel: string;
  name: string;
  formulaText: string;
  slots: BassArpeggioSlot[];
  difficultyWeight: number;
  minLevel?: 'foundation' | 'intermediate' | 'advanced';
  maxLevel?: 'foundation' | 'intermediate' | 'advanced';
  masteryBpm?: number;
  fixedChords?: ArpeggioChordKey[];
  fixedLabel?: string;
}

export const BASS_ARPEGGIO_PROGRESSIONS: ArpeggioProgressionPreset[] =
  ARPEGGIO_PROGRESSIONS;

/**
 * Harmonically verified 4-string electric bass chord-tone voicings (1=G, 2=D, 3=A, 4=E).
 */
export const BASS_VOICINGS_BY_DEGREE: Record<ArpeggioChordKey, BassChordVoicing> = {
  Am: {
    key: 'Am',
    label: 'i (Am)',
    degrees: {
      '1': { string: 4, fret: 5, label: '1', isRoot: true, finger: '1' }, // A1
      '3': { string: 3, fret: 3, label: 'b3', finger: '1' }, // C2
      '5': { string: 3, fret: 7, label: '5', finger: '4' }, // E2
      '7': { string: 2, fret: 5, label: 'b7', finger: '1' }, // G2
      '8': { string: 2, fret: 7, label: '8', isRoot: true, finger: '3' }, // A2
    },
  },
  F: {
    key: 'F',
    label: 'VI (F)',
    degrees: {
      '1': { string: 4, fret: 1, label: '1', isRoot: true, finger: '1' }, // F1
      '3': { string: 3, fret: 0, label: '3', finger: '0' }, // A1
      '5': { string: 3, fret: 3, label: '5', finger: '3' }, // C2
      '7': { string: 2, fret: 2, label: '7', finger: '2' }, // E2
      '8': { string: 2, fret: 3, label: '8', isRoot: true, finger: '3' }, // F2
    },
  },
  C: {
    key: 'C',
    label: 'III (C)',
    degrees: {
      '1': { string: 3, fret: 3, label: '1', isRoot: true, finger: '2' }, // C2
      '3': { string: 2, fret: 2, label: '3', finger: '1' }, // E2
      '5': { string: 2, fret: 5, label: '5', finger: '4' }, // G2
      '7': { string: 1, fret: 4, label: '7', finger: '3' }, // B2
      '8': { string: 1, fret: 5, label: '8', isRoot: true, finger: '4' }, // C3
    },
  },
  G: {
    key: 'G',
    label: 'VII (G)',
    degrees: {
      '1': { string: 4, fret: 3, label: '1', isRoot: true, finger: '2' }, // G1
      '3': { string: 3, fret: 2, label: '3', finger: '1' }, // B1
      '5': { string: 3, fret: 5, label: '5', finger: '4' }, // D2
      '7': { string: 2, fret: 3, label: 'b7', finger: '1' }, // F2
      '8': { string: 2, fret: 5, label: '8', isRoot: true, finger: '4' }, // G2
    },
  },
  Dm: {
    key: 'Dm',
    label: 'iv (Dm)',
    degrees: {
      '1': { string: 3, fret: 5, label: '1', isRoot: true, finger: '2' }, // D2
      '3': { string: 2, fret: 3, label: 'b3', finger: '1' }, // F2
      '5': { string: 2, fret: 7, label: '5', finger: '4' }, // A2
      '7': { string: 1, fret: 5, label: 'b7', finger: '2' }, // C3
      '8': { string: 1, fret: 7, label: '8', isRoot: true, finger: '4' }, // D3
    },
  },
  Em: {
    key: 'Em',
    label: 'v (Em)',
    degrees: {
      '1': { string: 4, fret: 0, label: '1', isRoot: true, finger: '0' }, // E1
      '3': { string: 4, fret: 3, label: 'b3', finger: '3' }, // G1
      '5': { string: 3, fret: 2, label: '5', finger: '2' }, // B1
      '7': { string: 2, fret: 0, label: 'b7', finger: '0' }, // D2
      '8': { string: 2, fret: 2, label: '8', isRoot: true, finger: '2' }, // E2
    },
  },
  D: {
    key: 'D',
    label: 'IV (D)',
    degrees: {
      '1': { string: 3, fret: 5, label: '1', isRoot: true, finger: '2' }, // D2
      '3': { string: 2, fret: 4, label: '3', finger: '1' }, // F#2
      '5': { string: 2, fret: 7, label: '5', finger: '4' }, // A2
      '7': { string: 1, fret: 5, label: 'b7', finger: '2' }, // C3
      '8': { string: 1, fret: 7, label: '8', isRoot: true, finger: '4' }, // D3
    },
  },
  Bdim: {
    key: 'Bdim',
    label: 'ii° (B°)',
    degrees: {
      '1': { string: 3, fret: 2, label: '1', isRoot: true, finger: '1' }, // B1
      '3': { string: 3, fret: 5, label: 'b3', finger: '4' }, // D2
      '5': { string: 2, fret: 3, label: 'b5', finger: '2' }, // F2
      '7': { string: 1, fret: 2, label: 'b7', finger: '1' }, // A2
      '8': { string: 1, fret: 4, label: '8', isRoot: true, finger: '3' }, // B2
    },
  },
};

export const BASS_ARPEGGIO_PATTERNS: BassArpeggioPatternDef[] = [
  {
    id: 'v-barp-step1-am-static',
    shortLabel: 'Step 1 · 1 Accordo (Am)',
    name: '1) Singolo Accordo Fermo: Tonica & Quinta su Am',
    formulaText: '1 · – · 1 · – · 5 · – · 5 · –',
    slots: ['1', 'hold', '1', 'hold', '5', 'hold', '5', 'hold'],
    fixedChords: ['Am'],
    fixedLabel: '1 Accordo Statico: i (Am)',
    difficultyWeight: 0.78,
    masteryBpm: 68,
  },
  {
    id: 'v-barp-step2-am-c',
    shortLabel: 'Step 2 · 2 Accordi (Am↔C)',
    name: '2) Cambio Guidato 2 Accordi: Am ↔ C (Tonica & Quinta)',
    formulaText: '1 · – · 5 · – · 1 · – · [Cambio]',
    slots: ['1', 'hold', '5', 'hold', '1', 'hold', 'hold', 'hold'],
    fixedChords: ['Am', 'C'],
    fixedLabel: '2 Accordi Base: Am ↔ C',
    difficultyWeight: 0.86,
    masteryBpm: 72,
  },
  {
    id: 'v-barp-root-5',
    shortLabel: 'Tonica & 5ª (Giro)',
    name: '3) Tonica & Quinta sul Giro (1 – – 5 – – 1 –)',
    formulaText: '1 · – · 5 · – · 1 · – · 5 · –',
    slots: ['1', 'hold', '5', 'hold', '1', 'hold', '5', 'hold'],
    difficultyWeight: 0.94,
    masteryBpm: 75,
  },
  {
    id: 'v-barp-disco-oct',
    shortLabel: 'Ottave Groove',
    name: '4) Ottave Groove (1 – 8 – 1 – 8 – 1 – 8 – 5 – 8)',
    formulaText: '1 – 8 – 1 – 8 – 1 – 8 – 5 – 8',
    slots: ['1', '8', '1', '8', '1', '8', '5', '8'],
    difficultyWeight: 1.0,
    masteryBpm: 76,
  },
  {
    id: 'v-barp-triad-up',
    shortLabel: 'Triade 1-3-5-8',
    name: '5) Triade Completa (1 – 3 – 5 – 8 – 5 – 3 – 5 – 3)',
    formulaText: '1 – 3 – 5 – 8 – 5 – 3 – 5 – 3',
    slots: ['1', '3', '5', '8', '5', '3', '5', '3'],
    difficultyWeight: 1.06,
    minLevel: 'intermediate',
    masteryBpm: 78,
  },
  {
    id: 'v-barp-walking',
    shortLabel: 'Walking 4/4',
    name: '6) Walking Bass 4/4 (1 · – · 3 · – · 5 · – · 8 · –)',
    formulaText: '1 · – · 3 · – · 5 · – · 8 · –',
    slots: ['1', 'hold', '3', 'hold', '5', 'hold', '8', 'hold'],
    difficultyWeight: 1.09,
    minLevel: 'intermediate',
    masteryBpm: 80,
  },
  {
    id: 'v-barp-1585',
    shortLabel: 'Groove 1-5-8-5',
    name: '7) Groove Rock/Soul (1 – 5 – 8 – 5 – 1 – 5 – 3 – 5)',
    formulaText: '1 – 5 – 8 – 5 – 1 – 5 – 3 – 5',
    slots: ['1', '5', '8', '5', '1', '5', '3', '5'],
    difficultyWeight: 1.12,
    minLevel: 'intermediate',
    masteryBpm: 82,
  },
  {
    id: 'v-barp-seventh',
    shortLabel: 'Settima 1-3-5-7',
    name: '8) Arpeggio di Settima (1 – 3 – 5 – 7 – 8 – 7 – 5 – 3)',
    formulaText: '1 – 3 – 5 – 7 – 8 – 7 – 5 – 3',
    slots: ['1', '3', '5', '7', '8', '7', '5', '3'],
    difficultyWeight: 1.15,
    minLevel: 'intermediate',
    masteryBpm: 82,
  },
  {
    id: 'v-barp-quick-2',
    shortLabel: 'Cambio Rapido 4/8',
    name: '9) Cambio Rapido 2 accordi/battuta (1 – 5 – 3 – 5)',
    formulaText: '1 – 5 – 3 – 5',
    slots: ['1', '5', '3', '5'],
    difficultyWeight: 1.2,
    minLevel: 'advanced',
    masteryBpm: 86,
  },
  {
    id: 'v-barp-sync-oct',
    shortLabel: 'Sincope 1-8-5-3',
    name: '10) Bassline Sincopata (1 – 8 – — – 5 – 3 – 5 – 8 – 5)',
    formulaText: '1 – 8 – — – 5 – 3 – 5 – 8 – 5',
    slots: ['1', '8', 'hold', '5', '3', '5', '8', '5'],
    difficultyWeight: 1.25,
    minLevel: 'advanced',
    masteryBpm: 88,
  },
];

export function getBassArpeggioPattern(
  patternId?: string
): BassArpeggioPatternDef {
  return (
    BASS_ARPEGGIO_PATTERNS.find((p) => p.id === patternId) ??
    BASS_ARPEGGIO_PATTERNS[0]
  );
}

export function getBassArpeggioProgression(
  progressionId?: string
): ArpeggioProgressionPreset {
  return (
    BASS_ARPEGGIO_PROGRESSIONS.find((p) => p.id === progressionId) ??
    BASS_ARPEGGIO_PROGRESSIONS[0]
  );
}

export function pickRecommendedBassProgression(
  sessionLogsCount: number,
  sessionLogs?: WorkoutSessionLog[]
): ArpeggioProgressionPreset {
  if (sessionLogs && sessionLogs.length > 0) {
    const fixedIds = new Set(
      BASS_ARPEGGIO_PATTERNS.filter((p) => p.fixedChords).map((p) => p.id)
    );
    const movableCleanSets = sessionLogs
      .flatMap((s) => s.sets)
      .filter(
        (st) =>
          st.exerciseId === BASS_ARPEGGIO_EXERCISE_ID &&
          st.cleanliness >= 4 &&
          (!st.variantId || !fixedIds.has(st.variantId))
      ).length;
    if (movableCleanSets < 6) {
      return BASS_ARPEGGIO_PROGRESSIONS[0];
    }
    const idx =
      Math.floor(movableCleanSets / 6) % BASS_ARPEGGIO_PROGRESSIONS.length;
    return BASS_ARPEGGIO_PROGRESSIONS[idx];
  }
  if (sessionLogsCount < 3) {
    return BASS_ARPEGGIO_PROGRESSIONS[0];
  }
  const idx =
    ((Math.floor(sessionLogsCount / 3) % BASS_ARPEGGIO_PROGRESSIONS.length) +
      BASS_ARPEGGIO_PROGRESSIONS.length) %
    BASS_ARPEGGIO_PROGRESSIONS.length;
  return BASS_ARPEGGIO_PROGRESSIONS[idx];
}

export function buildBassArpeggioExerciseData(
  variantId?: string,
  progressionId?: string
): {
  pattern: BassArpeggioPatternDef;
  progression: ArpeggioProgressionPreset;
  isFixedChordStep: boolean;
  fretboardNotes: FretNote[];
  demoSequence: DemoStep[];
} {
  const pattern = getBassArpeggioPattern(variantId);
  const isFixedChordStep = Boolean(
    pattern.fixedChords && pattern.fixedChords.length > 0
  );
  const progression: ArpeggioProgressionPreset = isFixedChordStep
    ? {
        id: 'fixed-bass',
        shortLabel: pattern.shortLabel,
        name: pattern.fixedLabel ?? pattern.shortLabel,
        chords: ['Am', 'F', 'C', 'G'],
      }
    : getBassArpeggioProgression(progressionId);

  const uniqueNotesMap = new Map<string, FretNote>();
  const demoSequence: DemoStep[] = [];
  const activeChordKeys: ArpeggioChordKey[] = isFixedChordStep
    ? pattern.fixedChords!
    : progression.chords;

  for (const chordKey of activeChordKeys) {
    const voicing = BASS_VOICINGS_BY_DEGREE[chordKey];
    const chordNotes: FretNote[] = [
      voicing.degrees['1'],
      voicing.degrees['3'],
      voicing.degrees['5'],
      voicing.degrees['7'],
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
          technique: voicing.label,
        });
      } else {
        const degreeNote = voicing.degrees[slot];
        const techSuffix = slot === '8' ? '8ª' : slot;
        demoSequence.push({
          notes: [degreeNote],
          chordNotes,
          chordLabel: voicing.label,
          technique: `${voicing.label} · ${techSuffix}`,
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

export const buildBassArpeggioWorkoutData = buildBassArpeggioExerciseData;

export function createBassArpeggioVariants(): ExerciseVariant[] {
  return BASS_ARPEGGIO_PATTERNS.map((pat) => {
    const data = buildBassArpeggioExerciseData(
      pat.id,
      BASS_ARPEGGIO_PROGRESSIONS[0].id
    );
    return {
      id: pat.id,
      shortLabel: pat.shortLabel,
      name: pat.name,
      difficultyWeight: pat.difficultyWeight,
      minLevel: pat.minLevel,
      maxLevel: pat.maxLevel,
      masteryBpm: pat.masteryBpm,
      fretboardNotes: data.fretboardNotes,
      demoSequence: data.demoSequence,
    };
  });
}

export function buildSeedBassArpeggioExercise(): Exercise {
  const variants = createBassArpeggioVariants();
  const defaultData = buildBassArpeggioExerciseData(
    BASS_ARPEGGIO_PATTERNS[0].id,
    BASS_ARPEGGIO_PROGRESSIONS[0].id
  );

  return {
    id: BASS_ARPEGGIO_EXERCISE_ID,
    instrument: 'bass',
    pillarName: 'Visione & Basslines',
    coachInspiration: 'James Jamerson & Pino Palladino',
    category: 'pentatonic',
    title: 'Arpeggi & Ottave',
    forWho:
      'Per costruire basslines musicali che seguono qualsiasi giro armonico usando tonica, terza, quinta, settima e ottava.',
    expectedOutcome:
      'Trovare subito i gradi forti su ogni cambio armonico invece di suonare solo la tonica ferma.',
    description:
      '8 pattern di bassline per gradi (1-3-5-7-8) su 7 giri armonici classici, senza accordi chitarristici.',
    scientificRationale:
      'Visualizzare i gradi mobili (1–3–5–7–8) sulle 4 corde del basso ti permette di suonare qualsiasi brano in qualsiasi tonalità.',
    coachingCues: [
      'Suona sempre la Tonica (1) sull’uno della battuta per ancorare l’armonia insieme alla cassa.',
      'Visualizza la forma 1–5–8 sotto l’indice e l’anulare/mignolo per spostarti tra i giri senza guardare le dita.',
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
    activeVariantId: BASS_ARPEGGIO_PATTERNS[0].id,
    fretboardNotes: defaultData.fretboardNotes,
    demoSequence: defaultData.demoSequence,
    variants,
  };
}
