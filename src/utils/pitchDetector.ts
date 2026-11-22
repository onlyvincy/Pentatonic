import { InstrumentType } from '../types/practice';

export const NOTE_NAMES = [
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

export interface PitchDetectionOptions {
  instrument: InstrumentType;
  sampleRate: number;
  minFreq?: number;
  maxFreq?: number;
  minRms?: number;
}

export interface PitchDetectionResult {
  freq: number;
  rms: number;
  confidence: number;
}

export interface StabilizedPitch {
  freq: number;
  midi: number;
  noteName: string;
  octave: number;
  cents: number;
}

function estimateValleyMinimum(
  cmndf: Float32Array,
  lag: number,
  minLag: number,
  maxLag: number
): number {
  if (lag <= minLag || lag >= maxLag) return cmndf[lag];
  const y0 = cmndf[lag - 1];
  const y1 = cmndf[lag];
  const y2 = cmndf[lag + 1];
  const denom = 2 * (y0 - 2 * y1 + y2);
  if (denom <= 1e-6) return y1;
  const shift = (y0 - y2) / denom;
  if (Math.abs(shift) > 1) return y1;
  const interpolated = y1 - ((y0 - y2) * shift) / 4;
  return Math.max(0, Math.min(y1, interpolated));
}

function findLocalMinimumLag(
  cmndf: Float32Array,
  centerLag: number,
  tolerance: number,
  minLag: number,
  maxLag: number
): number {
  const start = Math.max(minLag, centerLag - tolerance);
  const end = Math.min(maxLag, centerLag + tolerance);
  let best = centerLag;
  let bestVal = cmndf[centerLag];
  for (let lag = start; lag <= end; lag++) {
    if (cmndf[lag] < bestVal) {
      bestVal = cmndf[lag];
      best = lag;
    }
  }
  while (best + 1 <= maxLag && cmndf[best + 1] < cmndf[best]) {
    best++;
  }
  while (best - 1 >= minLag && cmndf[best - 1] < cmndf[best]) {
    best--;
  }
  return best;
}

/**
 * YIN + Subharmonic Fundamental Pitch Detector tuned for mobile microphones,
 * guitar (60-750 Hz, protecting low E2 82.4 Hz from harmonic lock) and
 * 4-string bass (34-390 Hz, protecting E1 41.2 Hz).
 */
export function detectPitch(
  rawBuffer: Float32Array,
  options: PitchDetectionOptions
): PitchDetectionResult | null {
  const { instrument, sampleRate } = options;
  if (!rawBuffer || rawBuffer.length < 512 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return null;
  }

  const isBass = instrument === 'bass';
  const minFreq = options.minFreq ?? (isBass ? 34 : 60);
  const maxFreq = options.maxFreq ?? (isBass ? 390 : 750);
  const minRms = options.minRms ?? 0.0018;

  const targetSliceLen = isBass ? 8192 : 4096;
  const slice =
    rawBuffer.length > targetSliceLen
      ? rawBuffer.subarray(rawBuffer.length - targetSliceLen)
      : rawBuffer;
  const sliceLen = slice.length;

  let mean = 0;
  for (let i = 0; i < sliceLen; i++) {
    mean += slice[i];
  }
  mean /= sliceLen;

  let energy = 0;
  for (let i = 0; i < sliceLen; i++) {
    const centered = slice[i] - mean;
    energy += centered * centered;
  }
  const rms = Math.sqrt(energy / sliceLen);
  if (!Number.isFinite(rms) || rms < minRms) {
    return null;
  }

  const decim = isBass
    ? sampleRate >= 40000
      ? 4
      : sampleRate >= 20000
      ? 2
      : 1
    : sampleRate >= 40000
    ? 2
    : 1;

  const effSr = sampleRate / decim;
  const decLen = Math.floor(sliceLen / decim);
  const norm = new Float32Array(decLen);

  // Box-averaged decimation acts as anti-alias filter and normalizes quiet mobile signals
  let decEnergy = 0;
  for (let i = 0; i < decLen; i++) {
    let acc = 0;
    const base = i * decim;
    for (let j = 0; j < decim; j++) {
      acc += slice[base + j] - mean;
    }
    const sampleVal = acc / decim;
    norm[i] = sampleVal;
    decEnergy += sampleVal * sampleVal;
  }
  const decRms = Math.sqrt(decEnergy / Math.max(1, decLen));
  if (!Number.isFinite(decRms) || decRms < 1e-7) {
    return null;
  }
  const invRms = 1 / decRms;
  for (let i = 0; i < decLen; i++) {
    norm[i] *= invRms;
  }

  const minLag = Math.max(8, Math.floor(effSr / maxFreq));
  const maxLag = Math.min(Math.floor(decLen / 2), Math.ceil(effSr / minFreq));
  if (maxLag <= minLag + 2) {
    return null;
  }

  // Fixed integration window W across all lags prevents low-frequency variance distortion
  const windowSize = decLen - maxLag;
  if (windowSize < 64) {
    return null;
  }

  const diff = new Float32Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < windowSize; i++) {
      const d = norm[i] - norm[i + lag];
      sum += d * d;
    }
    diff[lag] = sum;
  }

  const cmndf = new Float32Array(maxLag + 1);
  cmndf[0] = 1;
  let runningSum = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    runningSum += diff[lag];
    cmndf[lag] = runningSum > 0 ? (diff[lag] * lag) / runningSum : 1;
  }

  // Initial YIN valley search
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
    if (minVal > 0.28 || bestLag <= 0) {
      return null;
    }
  }

  // Subharmonic fundamental verification:
  // If smartphone mic attenuated E2 (82.4 Hz) or E1 (41.2 Hz) fundamental, YIN can hit
  // threshold first at T/2 or T/3, whereas the true fundamental at k*T yields a noticeably deeper dip.
  const maxHarmonicCheck = 4;
  let currentValleyVal = estimateValleyMinimum(cmndf, bestLag, minLag, maxLag);
  for (const k of [4, 3, 2]) {
    if (k > maxHarmonicCheck) continue;
    const targetLag = Math.round(bestLag * k);
    if (targetLag > maxLag - 1) continue;
    const tol = Math.max(2, Math.round(targetLag * 0.035));
    const subLag = findLocalMinimumLag(cmndf, targetLag, tol, minLag, maxLag);
    const subValleyVal = estimateValleyMinimum(cmndf, subLag, minLag, maxLag);

    const muchDeeperSub =
      subValleyVal < currentValleyVal * 0.8 &&
      currentValleyVal - subValleyVal > 0.015;
    const strongTrueFundOverWeakHarmonic =
      currentValleyVal > 0.08 && subValleyVal < 0.055;

    if (muchDeeperSub || strongTrueFundOverWeakHarmonic) {
      bestLag = subLag;
      currentValleyVal = subValleyVal;
    }
  }

  let refinedLag = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const y0 = cmndf[bestLag - 1];
    const y1 = cmndf[bestLag];
    const y2 = cmndf[bestLag + 1];
    const denom = 2 * (y0 - 2 * y1 + y2);
    if (Math.abs(denom) > 1e-6) {
      const shift = (y0 - y2) / denom;
      if (Math.abs(shift) <= 1) {
        refinedLag = bestLag + shift;
      }
    }
  }

  const freq = effSr / refinedLag;
  if (!Number.isFinite(freq) || freq < minFreq || freq > maxFreq) {
    return null;
  }

  const confidence = Math.max(0, Math.min(1, 1 - currentValleyVal));
  return { freq, rms, confidence };
}

/**
 * Stateful frame stabilizer:
 * - Uses sliding median frequency over up to 5 frames within 220 ms.
 * - Requires 2 consecutive consistent frames before switching locked MIDI note.
 * - Immediately resets cents smoothing when the locked MIDI note changes.
 */
export class PitchStabilizer {
  private readonly maxHistoryMs: number;
  private readonly maxHistory: number;
  private readonly minFramesToSwitch: number;

  private lockedMidi: number | null = null;
  private smoothedCents: number | null = null;
  private recent: { freq: number; ts: number }[] = [];

  private pendingMidi: number | null = null;
  private pendingFreqs: { freq: number; ts: number }[] = [];

  constructor(options?: {
    maxHistoryMs?: number;
    maxHistory?: number;
    minFramesToSwitch?: number;
  }) {
    this.maxHistoryMs = options?.maxHistoryMs ?? 220;
    this.maxHistory = options?.maxHistory ?? 5;
    this.minFramesToSwitch = options?.minFramesToSwitch ?? 2;
  }

  reset(): void {
    this.lockedMidi = null;
    this.smoothedCents = null;
    this.recent = [];
    this.pendingMidi = null;
    this.pendingFreqs = [];
  }

  push(freq: number, nowMs: number = Date.now()): StabilizedPitch | null {
    if (!Number.isFinite(freq) || freq <= 0) return null;

    const midiFloat = 69 + 12 * Math.log2(freq / 440);
    const nearestMidi = Math.round(midiFloat);

    if (this.lockedMidi === null) {
      if (
        this.pendingMidi !== null &&
        Math.abs(midiFloat - this.pendingMidi) <= 1.2
      ) {
        this.pendingFreqs.push({ freq, ts: nowMs });
        if (this.pendingFreqs.length >= this.minFramesToSwitch) {
          this.lockedMidi = Math.round(
            69 + 12 * Math.log2(this.computeMedian(this.pendingFreqs) / 440)
          );
          this.recent = [...this.pendingFreqs];
          this.pendingMidi = null;
          this.pendingFreqs = [];
          this.smoothedCents = null;
        } else {
          return null;
        }
      } else {
        this.pendingMidi = nearestMidi;
        this.pendingFreqs = [{ freq, ts: nowMs }];
        if (this.minFramesToSwitch <= 1) {
          this.lockedMidi = nearestMidi;
          this.recent = [{ freq, ts: nowMs }];
          this.pendingMidi = null;
          this.pendingFreqs = [];
          this.smoothedCents = null;
        } else {
          return null;
        }
      }
    } else if (Math.abs(midiFloat - this.lockedMidi) > 1.2) {
      if (
        this.pendingMidi !== null &&
        Math.abs(midiFloat - this.pendingMidi) <= 1.2
      ) {
        this.pendingFreqs.push({ freq, ts: nowMs });
        if (this.pendingFreqs.length >= this.minFramesToSwitch) {
          this.lockedMidi = Math.round(
            69 + 12 * Math.log2(this.computeMedian(this.pendingFreqs) / 440)
          );
          this.recent = [...this.pendingFreqs];
          this.pendingMidi = null;
          this.pendingFreqs = [];
          // Reset cents smoothing immediately on string/note change
          this.smoothedCents = null;
        } else {
          return this.buildResult(this.lockedMidi);
        }
      } else {
        this.pendingMidi = nearestMidi;
        this.pendingFreqs = [{ freq, ts: nowMs }];
        return this.buildResult(this.lockedMidi);
      }
    } else {
      // Returned to locked note: discard any transient glitch candidate
      this.pendingMidi = null;
      this.pendingFreqs = [];
      this.recent.push({ freq, ts: nowMs });
    }

    // Prune stale history outside window
    this.recent = this.recent.filter((r) => nowMs - r.ts <= this.maxHistoryMs);
    if (this.recent.length > this.maxHistory) {
      this.recent = this.recent.slice(this.recent.length - this.maxHistory);
    }

    return this.buildResult(this.lockedMidi!);
  }

  private computeMedian(entries: { freq: number }[]): number {
    const sorted = entries.map((e) => e.freq).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) return sorted[mid];
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private buildResult(midi: number): StabilizedPitch | null {
    if (this.recent.length === 0) return null;
    const medFreq = this.computeMedian(this.recent);
    const medMidiFloat = 69 + 12 * Math.log2(medFreq / 440);
    const rawCents = (medMidiFloat - midi) * 100;

    this.smoothedCents =
      this.smoothedCents === null
        ? rawCents
        : this.smoothedCents * 0.65 + rawCents * 0.35;

    const cents = Math.max(-50, Math.min(50, Math.round(this.smoothedCents)));
    const noteIdx = ((midi % 12) + 12) % 12;
    const noteName = NOTE_NAMES[noteIdx];
    const octave = Math.floor(midi / 12) - 1;

    return {
      freq: Number(medFreq.toFixed(1)),
      midi,
      noteName,
      octave,
      cents,
    };
  }
}
