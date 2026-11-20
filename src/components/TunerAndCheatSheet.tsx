import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Mic, Volume2 } from 'lucide-react';
import { DemoStep, FretNote } from '../types/practice';
import {
  getSharedAudioContext,
  playGuitarFrequency,
  setIosMicSessionActive,
  unlockSharedAudioContext,
} from '../utils/guitarSynth';
import { FretboardViewer } from './FretboardViewer';

type TuningId = 'eadgbe' | 'facgce' | 'daeac#e' | 'dadf#ad';
type ScaleId =
  | 'minor-pent'
  | 'major-pent'
  | 'natural-minor'
  | 'natural-major'
  | 'extended-minor-pent';

interface TuningStringDef {
  stringNum: 1 | 2 | 3 | 4 | 5 | 6;
  noteLabel: string;
  shortName: string;
  freq: number;
  midi: number;
}

interface ChordCheat {
  id: string;
  name: string;
  /** Frets order from 6th string (low) -> 1st string (high), -1 = muted '×' */
  frets: [number, number, number, number, number, number];
}

interface TuningPreset {
  id: TuningId;
  label: string;
  /** Primary root pitch class (0=C .. 11=B) for scales in this tuning */
  minorRootPc: number;
  majorRootPc: number;
  /** Ordered 6th string -> 1st string */
  strings6To1: TuningStringDef[];
  chords: ChordCheat[];
}

const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;

const SCALE_DEFS: {
  id: ScaleId;
  name: string;
  intervals: number[];
  intervalLabels: Record<number, string>;
  isMajor: boolean;
  extended?: boolean;
}[] = [
  {
    id: 'minor-pent',
    name: 'Minore Pentatonica',
    intervals: [0, 3, 5, 7, 10],
    intervalLabels: { 0: 'R', 3: 'b3', 5: '4', 7: '5', 10: 'b7' },
    isMajor: false,
  },
  {
    id: 'major-pent',
    name: 'Maggiore Pentatonica',
    intervals: [0, 2, 4, 7, 9],
    intervalLabels: { 0: 'R', 2: '2', 4: '3', 7: '5', 9: '6' },
    isMajor: true,
  },
  {
    id: 'natural-minor',
    name: 'Minore Naturale',
    intervals: [0, 2, 3, 5, 7, 8, 10],
    intervalLabels: { 0: 'R', 2: '2', 3: 'b3', 5: '4', 7: '5', 8: 'b6', 10: 'b7' },
    isMajor: false,
  },
  {
    id: 'natural-major',
    name: 'Maggiore Naturale',
    intervals: [0, 2, 4, 5, 7, 9, 11],
    intervalLabels: { 0: 'R', 2: '2', 4: '3', 5: '4', 7: '5', 9: '6', 11: '7' },
    isMajor: true,
  },
  {
    id: 'extended-minor-pent',
    name: 'Minore Pentatonica Estesa',
    intervals: [0, 3, 5, 7, 10],
    intervalLabels: { 0: 'R', 3: 'b3', 5: '4', 7: '5', 10: 'b7' },
    isMajor: false,
    extended: true,
  },
];

const TUNING_PRESETS: TuningPreset[] = [
  {
    id: 'eadgbe',
    label: 'EADGBE',
    minorRootPc: 9, // A minor
    majorRootPc: 9, // A major (same root area frets 4-7)
    strings6To1: [
      { stringNum: 6, noteLabel: 'E2', shortName: 'E', freq: 82.4069, midi: 40 },
      { stringNum: 5, noteLabel: 'A2', shortName: 'A', freq: 110.0, midi: 45 },
      { stringNum: 4, noteLabel: 'D3', shortName: 'D', freq: 146.8324, midi: 50 },
      { stringNum: 3, noteLabel: 'G3', shortName: 'G', freq: 195.9977, midi: 55 },
      { stringNum: 2, noteLabel: 'B3', shortName: 'B', freq: 246.9417, midi: 59 },
      { stringNum: 1, noteLabel: 'E4', shortName: 'e', freq: 329.6276, midi: 64 },
    ],
    chords: [
      { id: 'std-c9', name: 'Cmaj9', frets: [-1, 3, 2, 0, 3, 0] },
      { id: 'std-am7', name: 'Am7', frets: [-1, 0, 2, 0, 1, 0] },
      { id: 'std-fmaj7', name: 'Fmaj7', frets: [-1, -1, 3, 2, 1, 0] },
      { id: 'std-em9', name: 'Em9', frets: [0, 2, 4, 0, 3, 0] },
      { id: 'std-g6', name: 'G6', frets: [3, 2, 0, 0, 0, 0] },
      { id: 'std-dm9', name: 'Dm9', frets: [-1, -1, 0, 2, 1, 0] },
    ],
  },
  {
    id: 'facgce',
    label: 'FACGCE',
    minorRootPc: 2, // D minor (relative of F major)
    majorRootPc: 5, // F major
    strings6To1: [
      { stringNum: 6, noteLabel: 'F2', shortName: 'F', freq: 87.3071, midi: 41 },
      { stringNum: 5, noteLabel: 'A2', shortName: 'A', freq: 110.0, midi: 45 },
      { stringNum: 4, noteLabel: 'C3', shortName: 'C', freq: 130.8128, midi: 48 },
      { stringNum: 3, noteLabel: 'G3', shortName: 'G', freq: 195.9977, midi: 55 },
      { stringNum: 2, noteLabel: 'C4', shortName: 'C', freq: 261.6256, midi: 60 },
      { stringNum: 1, noteLabel: 'E4', shortName: 'e', freq: 329.6276, midi: 64 },
    ],
    chords: [
      { id: 'fac-fmaj9', name: 'Fmaj9', frets: [0, 0, 0, 0, 0, 0] },
      { id: 'fac-cmaj7', name: 'Cmaj7', frets: [-1, 3, 0, 0, 0, 0] },
      { id: 'fac-am9', name: 'Am9', frets: [4, 0, 2, 0, 0, 0] },
      { id: 'fac-flyd', name: 'Fmaj7#11', frets: [0, 0, 2, 0, 0, 0] },
      { id: 'fac-dm9', name: 'Dm9', frets: [-1, 5, 2, 0, 0, 0] },
      { id: 'fac-g6', name: 'G6sus4', frets: [2, 0, 0, 0, 2, 0] },
    ],
  },
  {
    id: 'daeac#e',
    label: 'DAEAC#E',
    minorRootPc: 11, // B minor (relative of D major)
    majorRootPc: 2, // D major
    strings6To1: [
      { stringNum: 6, noteLabel: 'D2', shortName: 'D', freq: 73.4162, midi: 38 },
      { stringNum: 5, noteLabel: 'A2', shortName: 'A', freq: 110.0, midi: 45 },
      { stringNum: 4, noteLabel: 'E3', shortName: 'E', freq: 164.8138, midi: 52 },
      { stringNum: 3, noteLabel: 'A3', shortName: 'A', freq: 220.0, midi: 57 },
      { stringNum: 2, noteLabel: 'C#4', shortName: 'C#', freq: 277.1826, midi: 61 },
      { stringNum: 1, noteLabel: 'E4', shortName: 'e', freq: 329.6276, midi: 64 },
    ],
    chords: [
      { id: 'dae-dmaj9', name: 'Dmaj9', frets: [0, 0, 0, 0, 0, 0] },
      { id: 'dae-bm11', name: 'Bm11', frets: [9, 0, 7, 0, 0, 0] },
      { id: 'dae-gmaj7', name: 'Gmaj7', frets: [5, 0, 4, 0, 0, 0] },
      { id: 'dae-aadd9', name: 'Aadd9', frets: [7, 0, 6, 0, 0, 0] },
      { id: 'dae-f#m7', name: 'F#m7', frets: [4, 0, 2, 0, 0, 0] },
      { id: 'dae-em9', name: 'Em9', frets: [2, 0, 0, 0, 0, 0] },
    ],
  },
  {
    id: 'dadf#ad',
    label: 'DADF#AD',
    minorRootPc: 11, // B minor
    majorRootPc: 2, // D major
    strings6To1: [
      { stringNum: 6, noteLabel: 'D2', shortName: 'D', freq: 73.4162, midi: 38 },
      { stringNum: 5, noteLabel: 'A2', shortName: 'A', freq: 110.0, midi: 45 },
      { stringNum: 4, noteLabel: 'D3', shortName: 'D', freq: 146.8324, midi: 50 },
      { stringNum: 3, noteLabel: 'F#3', shortName: 'F#', freq: 184.9972, midi: 54 },
      { stringNum: 2, noteLabel: 'A3', shortName: 'A', freq: 220.0, midi: 57 },
      { stringNum: 1, noteLabel: 'D4', shortName: 'd', freq: 293.6648, midi: 62 },
    ],
    chords: [
      { id: 'opd-d', name: 'D Open', frets: [0, 0, 0, 0, 0, 0] },
      { id: 'opd-g6', name: 'G6/9', frets: [5, 5, 5, 5, 0, 0] },
      { id: 'opd-a11', name: 'A11', frets: [7, 7, 7, 6, 0, 0] },
      { id: 'opd-bm7', name: 'Bm7', frets: [9, 9, 9, 8, 0, 0] },
      { id: 'opd-em7', name: 'Em7', frets: [2, 2, 2, 1, 0, 0] },
      { id: 'opd-dmaj7', name: 'Dmaj7', frets: [0, 0, 0, 0, 4, 0] },
    ],
  },
];

/**
 * Generates harmonically exact fretboard notes + an 8-step 4/4 cyclic demo sequence
 * for any of the 5 scales across any tuning (EADGBE, FACGCE, DAEAC#E, DADF#AD).
 */
function buildScaleForTuning(
  preset: TuningPreset,
  scaleId: ScaleId
): { notes: FretNote[]; demoSequence: DemoStep[] } {
  const def = SCALE_DEFS.find((s) => s.id === scaleId) ?? SCALE_DEFS[0];
  const rootPc = def.isMajor ? preset.majorRootPc : preset.minorRootPc;

  // Classic EADGBE Extended Minor Pentatonic (Am diagonal from fret 3 up to fret 12)
  if (preset.id === 'eadgbe' && def.extended) {
    const extNotes: FretNote[] = [
      { string: 6, fret: 3, label: 'b7', finger: '1' },
      { string: 6, fret: 5, label: 'R', isRoot: true, finger: '3' },
      { string: 5, fret: 3, label: 'b3', finger: '1' },
      { string: 5, fret: 5, label: '4', finger: '3' },
      { string: 5, fret: 7, label: '5', finger: '3' },
      { string: 4, fret: 5, label: 'b7', finger: '1' },
      { string: 4, fret: 7, label: 'R', isRoot: true, finger: '3' },
      { string: 3, fret: 5, label: 'b3', finger: '1' },
      { string: 3, fret: 7, label: '4', finger: '3' },
      { string: 3, fret: 9, label: '5', finger: '3' },
      { string: 2, fret: 8, label: 'b7', finger: '1' },
      { string: 2, fret: 10, label: 'R', isRoot: true, finger: '3' },
      { string: 1, fret: 8, label: 'b3', finger: '1' },
      { string: 1, fret: 10, label: '4', finger: '3' },
      { string: 1, fret: 12, label: '5', finger: '4' },
    ];
    const demoSteps: DemoStep[] = [
      { notes: [extNotes[0]] },
      { notes: [extNotes[1]] },
      { notes: [extNotes[3]] },
      { notes: [extNotes[4]] },
      { notes: [extNotes[6]] },
      { notes: [extNotes[9]] },
      { notes: [extNotes[11]] },
      { notes: [extNotes[14]] },
    ];
    return { notes: extNotes, demoSequence: demoSteps };
  }

  const notes: FretNote[] = [];

  if (def.extended) {
    // Diagonal extended Minor Pentatonic sweeping upward from low frets to fret 12 across all 6 strings
    const stringWindows: Record<number, [number, number]> = {
      6: [2, 5],
      5: [3, 7],
      4: [4, 8],
      3: [5, 9],
      2: [7, 11],
      1: [8, 12],
    };

    for (const s of preset.strings6To1) {
      const [minF, maxF] = stringWindows[s.stringNum];
      for (let fret = minF; fret <= maxF; fret++) {
        const interval = (((s.midi + fret - rootPc) % 12) + 12) % 12;
        if (def.intervals.includes(interval)) {
          const fingerNum = Math.max(1, Math.min(4, fret - minF + 1));
          notes.push({
            string: s.stringNum,
            fret,
            label: def.intervalLabels[interval] ?? '',
            isRoot: interval === 0,
            finger: String(fingerNum),
          });
        }
      }
    }
  } else {
    // Compact 4-fret playable box anchored around frets 4-8 (5-8 for minor, 4-7 for major)
    const minFret = def.isMajor ? 4 : 5;
    const maxFret = minFret + 3;

    for (const s of preset.strings6To1) {
      for (let fret = minFret; fret <= maxFret; fret++) {
        const interval = (((s.midi + fret - rootPc) % 12) + 12) % 12;
        if (def.intervals.includes(interval)) {
          const fingerNum = Math.max(1, Math.min(4, fret - minFret + 1));
          notes.push({
            string: s.stringNum,
            fret,
            label: def.intervalLabels[interval] ?? '',
            isRoot: interval === 0,
            finger: String(fingerNum),
          });
        }
      }
    }
  }

  // Pick 8 ascending notes evenly across the scale for the cyclic 4/4 demo
  const demoSequence: DemoStep[] = [];
  if (notes.length > 0) {
    for (let i = 0; i < 8; i++) {
      const idx = Math.min(
        notes.length - 1,
        Math.floor((i * notes.length) / 8)
      );
      demoSequence.push({ notes: [notes[idx]] });
    }
  }

  return { notes, demoSequence };
}

/**
 * YIN-inspired normalized autocorrelation pitch detector optimized for guitar range (65 Hz - 1100 Hz).
 */
function detectPitchHz(
  buffer: Float32Array,
  sampleRate: number
): { freq: number; rms: number } | null {
  const n = buffer.length;
  let rms = 0;
  for (let i = 0; i < n; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / n);
  if (rms < 0.01) return null;

  const minLag = Math.max(16, Math.floor(sampleRate / 1100));
  const maxLag = Math.min(Math.floor(n / 2), Math.floor(sampleRate / 65));
  if (maxLag <= minLag) return null;

  const diff = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const limit = n - lag;
    for (let i = 0; i < limit; i++) {
      const d = buffer[i] - buffer[i + lag];
      sum += d * d;
    }
    diff[lag] = sum;
  }

  const cmndf = new Float32Array(maxLag + 1);
  cmndf[0] = 1;
  let runningSum = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    runningSum += diff[lag];
    cmndf[lag] =
      lag < minLag
        ? 1
        : runningSum > 0
        ? (diff[lag] * (lag - minLag + 1)) / runningSum
        : 1;
  }

  const threshold = 0.16;
  let bestLag = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (cmndf[lag] < threshold) {
      while (lag + 1 <= maxLag && cmndf[lag + 1] < cmndf[lag]) {
        lag++;
      }
      bestLag = lag;
      break;
    }
  }

  if (bestLag === -1) {
    let minVal = Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      if (cmndf[lag] < minVal) {
        minVal = cmndf[lag];
        bestLag = lag;
      }
    }
    if (minVal > 0.28 || bestLag <= 0) return null;
  }

  let refinedLag = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const y0 = cmndf[bestLag - 1];
    const y1 = cmndf[bestLag];
    const y2 = cmndf[bestLag + 1];
    const denom = 2 * (y0 - 2 * y1 + y2);
    if (Math.abs(denom) > 1e-6) {
      refinedLag = bestLag + (y0 - y2) / denom;
    }
  }

  const freq = sampleRate / refinedLag;
  if (!Number.isFinite(freq) || freq < 65 || freq > 1100) return null;
  return { freq, rms };
}

interface DetectedPitch {
  freq: number;
  noteName: string;
  octave: number;
  cents: number;
}

export const TunerAndCheatSheet: React.FC = () => {
  const [tuningId, setTuningId] = useState<TuningId>('eadgbe');
  const [showTuningPicker, setShowTuningPicker] = useState(false);
  const [cheatMode, setCheatMode] = useState<'scales' | 'chords'>('scales');
  const [selectedScaleId, setSelectedScaleId] = useState<ScaleId>('minor-pent');

  const [isListening, setIsListening] = useState(false);
  const [micBlocked, setMicBlocked] = useState(false);
  const [detected, setDetected] = useState<DetectedPitch | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const smoothCentsRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const startingRef = useRef(false);

  const activeTuning = useMemo(
    () => TUNING_PRESETS.find((t) => t.id === tuningId) ?? TUNING_PRESETS[0],
    [tuningId]
  );

  const stopTuner = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try {
      sourceRef.current?.disconnect();
    } catch {
      // ignore
    }
    sourceRef.current = null;
    analyserRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    startingRef.current = false;
    setIosMicSessionActive(false);
    setIsListening(false);
  }, []);

  const analyzePitchFrame = useCallback(() => {
    const analyser = analyserRef.current;
    const ctx = getSharedAudioContext();
    if (!analyser || !ctx) return;

    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    const res = detectPitchHz(buf, ctx.sampleRate);

    if (res) {
      const midiFloat = 69 + 12 * Math.log2(res.freq / 440);
      const nearestMidi = Math.round(midiFloat);
      const rawCents = Math.round((midiFloat - nearestMidi) * 100);
      smoothCentsRef.current = smoothCentsRef.current * 0.55 + rawCents * 0.45;
      const cents = Math.max(-50, Math.min(50, Math.round(smoothCentsRef.current)));

      const noteIdx = ((nearestMidi % 12) + 12) % 12;
      const noteName = NOTE_NAMES[noteIdx];
      const octave = Math.floor(nearestMidi / 12) - 1;

      setDetected({
        freq: Number(res.freq.toFixed(1)),
        noteName,
        octave,
        cents,
      });
    }

    rafRef.current = window.requestAnimationFrame(analyzePitchFrame);
  }, []);

  const startTuner = useCallback(async () => {
    if (streamRef.current || startingRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      if (mountedRef.current) setMicBlocked(true);
      return;
    }

    startingRef.current = true;
    setMicBlocked(false);
    // CRITICAL for iOS Safari:
    // 1) Switch audioSession to 'play-and-record' synchronously before getUserMedia.
    // 2) Call getUserMedia synchronously BEFORE any `await` so iOS preserves the
    //    user-gesture token and displays the native microphone permission prompt.
    setIosMicSessionActive(true);

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        setIosMicSessionActive(false);
        return;
      }

      await unlockSharedAudioContext();
      const ctx = getSharedAudioContext();
      if (!ctx) {
        stream.getTracks().forEach((t) => t.stop());
        setIosMicSessionActive(false);
        if (mountedRef.current) setMicBlocked(true);
        return;
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      source.connect(analyser);

      streamRef.current = stream;
      sourceRef.current = source;
      analyserRef.current = analyser;
      setIsListening(true);
      rafRef.current = window.requestAnimationFrame(analyzePitchFrame);
    } catch {
      setIosMicSessionActive(false);
      if (mountedRef.current) setMicBlocked(true);
    } finally {
      startingRef.current = false;
    }
  }, [analyzePitchFrame]);

  // Immediately activate tuner on mount
  useEffect(() => {
    mountedRef.current = true;
    startTuner();
    return () => {
      mountedRef.current = false;
      stopTuner();
    };
  }, [startTuner, stopTuner]);

  const handleStrumChord = (chord: ChordCheat) => {
    unlockSharedAudioContext().catch(() => {});
    let strumIdx = 0;
    chord.frets.forEach((fret, idx) => {
      if (fret < 0) return;
      const openDef = activeTuning.strings6To1[idx];
      const freq = openDef.freq * Math.pow(2, fret / 12);
      playGuitarFrequency(freq, {
        durationSec: 1.65,
        volume: 0.28,
        delaySec: strumIdx * 0.022,
      });
      strumIdx += 1;
    });
  };

  const stringLabelsHighToLow = useMemo(() => {
    const rev = [...activeTuning.strings6To1].reverse();
    return [
      rev[0].shortName,
      rev[1].shortName,
      rev[2].shortName,
      rev[3].shortName,
      rev[4].shortName,
      rev[5].shortName,
    ] as const;
  }, [activeTuning]);

  const customStringFreqs = useMemo(() => {
    const map = {} as Record<1 | 2 | 3 | 4 | 5 | 6, number>;
    activeTuning.strings6To1.forEach((s) => {
      map[s.stringNum] = s.freq;
    });
    return map;
  }, [activeTuning]);

  const currentScaleData = useMemo(
    () => buildScaleForTuning(activeTuning, selectedScaleId),
    [activeTuning, selectedScaleId]
  );

  // 31-segment minimal strobe bar (-50..+50 cents)
  const LED_COUNT = 31;
  const centerIdx = 15;
  const displayCents = detected ? detected.cents : 0;
  const inTune = Boolean(detected && Math.abs(displayCents) <= 5);
  const activeLedIdx = detected
    ? Math.max(
        0,
        Math.min(LED_COUNT - 1, Math.round(((displayCents + 50) / 100) * (LED_COUNT - 1)))
      )
    : -1;

  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden space-y-4">
      {/* ULTRA-MINIMAL LIVE TUNER (AUTO-ACTIVE) */}
      <section className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl bg-black border border-white/15 p-4 sm:p-5 space-y-5">
        {/* Top Row: Single Active Tuning Pill + Live Dot */}
        <div className="flex items-center justify-between gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowTuningPicker((v) => !v)}
              aria-expanded={showTuningPicker}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black px-3.5 py-1 text-xs font-black tracking-wider text-white hover:border-white/60 transition tabular-nums"
            >
              {activeTuning.label}
              <ChevronDown
                className={`h-3.5 w-3.5 text-white/60 transition-transform ${
                  showTuningPicker ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!isListening) startTuner();
            }}
            className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/50 hover:text-white transition"
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isListening
                  ? inTune
                    ? 'bg-[#A4FF00]'
                    : 'bg-[#FF6B00] animate-pulse-fast'
                  : 'bg-white/25'
              }`}
            />
            {isListening ? 'LIVE' : 'MIC'}
          </button>
        </div>

        {/* Collapsible Tuning Picker (Hidden until active tuning pill is clicked) */}
        {showTuningPicker && (
          <div className="flex flex-wrap gap-1.5">
            {TUNING_PRESETS.map((preset) => {
              const active = preset.id === tuningId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setTuningId(preset.id);
                    setShowTuningPicker(false);
                  }}
                  className={`rounded-full border px-3 py-1 text-xs font-black tracking-wide transition tabular-nums ${
                    active
                      ? 'border-white bg-white text-black'
                      : 'border-white/15 bg-black text-white/65 hover:border-white/40 hover:text-white'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        )}

        {/* 31-Segment Horizontal Strobe Meter */}
        <div className="flex w-full min-w-0 overflow-hidden gap-[1.5px] sm:gap-1 items-center h-9 px-1">
          {Array.from({ length: LED_COUNT }, (_, idx) => {
            const distFromCenter = Math.abs(idx - centerIdx);
            const isCenterZone = distFromCenter <= 1;
            const isLit =
              detected &&
              (idx === activeLedIdx ||
                (inTune && isCenterZone) ||
                (!inTune &&
                  ((activeLedIdx < centerIdx &&
                    idx >= activeLedIdx &&
                    idx < centerIdx) ||
                    (activeLedIdx > centerIdx &&
                      idx <= activeLedIdx &&
                      idx > centerIdx))));

            const baseHeight = isCenterZone
              ? 'h-7'
              : distFromCenter % 5 === 0
              ? 'h-5'
              : 'h-3';

            let ledColor = 'bg-white/15';
            if (isLit) {
              ledColor = inTune
                ? 'bg-[#A4FF00] shadow-[0_0_10px_rgba(164,255,0,0.85)]'
                : isCenterZone
                ? 'bg-white/60'
                : 'bg-[#FF6B00] shadow-[0_0_8px_rgba(255,107,0,0.75)]';
            }

            return (
              <div
                key={idx}
                className={`flex-1 min-w-0 rounded-sm ${baseHeight} ${ledColor}`}
              />
            );
          })}
        </div>

        {/* Center Giant Note + Minimal Tuning Direction */}
        <div className="flex flex-col items-center justify-center text-center py-2 space-y-2">
          <div className="flex items-baseline justify-center gap-1.5">
            <span
              className={`text-7xl sm:text-8xl font-black tracking-tight tabular-nums leading-none ${
                inTune
                  ? 'text-[#A4FF00]'
                  : detected
                  ? 'text-white'
                  : 'text-white/20'
              }`}
            >
              {detected ? detected.noteName : '—'}
            </span>
            {detected && (
              <span className="text-xl font-black text-white/40 tabular-nums">
                {detected.octave}
              </span>
            )}
          </div>

          <div className="min-h-[24px] flex items-center justify-center gap-2 text-xs font-bold tabular-nums">
            {detected ? (
              <>
                <span
                  className={`rounded-full border px-3 py-0.5 text-[11px] font-black tracking-wider ${
                    inTune
                      ? 'border-[#A4FF00]/60 bg-[#A4FF00]/10 text-[#A4FF00]'
                      : 'border-[#FF6B00]/60 bg-[#FF6B00]/10 text-[#FF6B00]'
                  }`}
                >
                  {inTune
                    ? 'IN TUNE'
                    : detected.cents < 0
                    ? `↑ ${detected.cents}`
                    : `↓ +${detected.cents}`}
                </span>
                <span className="text-white/45">{detected.freq} Hz</span>
              </>
            ) : !isListening ? (
              <button
                type="button"
                onClick={() => startTuner()}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#FF6B00]/60 bg-[#FF6B00]/10 px-3.5 py-1.5 text-[11px] font-black text-[#FF6B00] hover:bg-[#FF6B00]/20 transition"
              >
                <Mic className="h-3.5 w-3.5" />
                {micBlocked ? 'Consenti Microfono' : 'Attiva Microfono'}
              </button>
            ) : (
              <span className="text-white/30">440 Hz</span>
            )}
          </div>
        </div>
      </section>

      {/* MINIMAL SCALE & ACCORDI */}
      <section className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl bg-black border border-white/15 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex rounded-full bg-black border border-white/15 p-0.5">
            <button
              type="button"
              onClick={() => setCheatMode('scales')}
              className={`rounded-full px-3.5 py-1 text-xs font-bold transition ${
                cheatMode === 'scales'
                  ? 'bg-white text-black'
                  : 'text-white/55 hover:text-white'
              }`}
            >
              Scale
            </button>
            <button
              type="button"
              onClick={() => setCheatMode('chords')}
              className={`rounded-full px-3.5 py-1 text-xs font-bold transition ${
                cheatMode === 'chords'
                  ? 'bg-white text-black'
                  : 'text-white/55 hover:text-white'
              }`}
            >
              Accordi
            </button>
          </div>
        </div>

        {cheatMode === 'scales' && (
          <div className="w-full min-w-0 max-w-full space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {SCALE_DEFS.map((sc) => {
                const active = sc.id === selectedScaleId;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => setSelectedScaleId(sc.id)}
                    className={`rounded-full border px-3 py-1 text-[11px] font-bold transition ${
                      active
                        ? 'border-white bg-white text-black'
                        : 'border-white/15 bg-black text-white/65 hover:border-white/40 hover:text-white'
                    }`}
                  >
                    {sc.name}
                  </button>
                );
              })}
            </div>

            <FretboardViewer
              notes={currentScaleData.notes}
              demoSequence={currentScaleData.demoSequence}
              stringLabels={stringLabelsHighToLow}
              customStringFreqs={customStringFreqs}
              bpm={80}
              variant="compact"
            />
          </div>
        )}

        {cheatMode === 'chords' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 w-full min-w-0">
            {activeTuning.chords.map((chord) => (
              <div
                key={chord.id}
                className="min-w-0 max-w-full overflow-hidden rounded-xl bg-black border border-white/15 p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-white">
                    {chord.name}
                  </h3>
                  <button
                    type="button"
                    onClick={() => handleStrumChord(chord)}
                    aria-label={`Ascolta ${chord.name}`}
                    className="inline-flex items-center gap-1 rounded-full border border-[#FF6B00]/60 bg-black px-2.5 py-1 text-[10px] font-black text-[#FF6B00] hover:bg-[#FF6B00] hover:text-black transition"
                  >
                    <Volume2 className="h-3 w-3" />
                  </button>
                </div>

                <div className="grid grid-cols-6 gap-1 rounded-lg border border-white/10 bg-black p-1.5 text-center tabular-nums">
                  {chord.frets.map((fretVal, idx) => (
                    <div key={idx} className="flex flex-col items-center">
                      <span className="text-[9px] font-bold text-white/40">
                        {activeTuning.strings6To1[idx].shortName}
                      </span>
                      <span
                        className={`text-xs font-black ${
                          fretVal === 0
                            ? 'text-[#FF6B00]'
                            : fretVal < 0
                            ? 'text-white/25'
                            : 'text-white'
                        }`}
                      >
                        {fretVal < 0 ? '×' : fretVal}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
