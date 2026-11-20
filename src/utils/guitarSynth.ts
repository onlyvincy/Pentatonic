/**
 * Hybrid Web Audio Guitar & Studio Metronome Engine:
 * 1) Real studio-recorded electric guitar multisamples (A2, A3, C4 — CC BY 3.0 via nbrosowsky/tonejs-instruments)
 *    with peak-relative attack transient trimming for <2ms rhythmic lock.
 * 2) Multi-harmonic Karplus-Strong physical string model + 2-band body resonance fallback.
 * 3) Arbitrary frequency plucking for alternative tunings (EADGBE, FACGCE, DAEAC#E, DADF#AD).
 * 4) 4 selectable studio metronome sounds (Woodblock, Pendolo, Rimshot & Hat, Studio Klopfgeist).
 */
import { MetronomeSoundId } from '../types/practice';

const OPEN_STRING_HZ: Record<1 | 2 | 3 | 4 | 5 | 6, number> = {
  1: 329.6276, // high e (E4)
  2: 246.9417, // B3
  3: 195.9977, // G3
  4: 146.8324, // D3
  5: 110.0, // A2
  6: 82.4069, // low E (E2)
};

export const STRING_LABEL_MAP: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: 'e (1ª)',
  2: 'B (2ª)',
  3: 'G (3ª)',
  4: 'D (4ª)',
  5: 'A (5ª)',
  6: 'E (6ª)',
};

export const STRING_SHORT_MAP: Record<1 | 2 | 3 | 4 | 5 | 6, string> = {
  1: 'e',
  2: 'B',
  3: 'G',
  4: 'D',
  5: 'A',
  6: 'E',
};

export const METRONOME_SOUNDS: { id: MetronomeSoundId; label: string }[] = [
  { id: 'woodblock', label: 'Legno' },
  { id: 'mechanical', label: 'Pendolo' },
  { id: 'rimshot', label: 'Rimshot' },
  { id: 'digital', label: 'Digital' },
];

interface SampleAnchor {
  id: 'a2' | 'a3' | 'c4';
  url: string;
  baseFreq: number;
  buffer: AudioBuffer | null;
}

const SAMPLE_ANCHORS: SampleAnchor[] = [
  { id: 'a2', url: '/samples/guitar-a2.mp3', baseFreq: 110.0, buffer: null },
  { id: 'a3', url: '/samples/guitar-a3.mp3', baseFreq: 220.0, buffer: null },
  { id: 'c4', url: '/samples/guitar-c4.mp3', baseFreq: 261.6256, buffer: null },
];

let sharedCtx: AudioContext | null = null;
let cachedNoiseBuffer: AudioBuffer | null = null;
let unlockListenersAttached = false;
let samplePreloadPromise: Promise<void> | null = null;
let iosKeepAliveAudio: HTMLAudioElement | null = null;
let iosKeepAliveUrl: string | null = null;

/**
 * Forces iOS Safari / standalone PWAs into the 'playback' audio session category
 * so metronome clicks, guitar demos, and tuner reference tones play audibly
 * even when the iPhone hardware Ring/Silent switch is muted.
 */
function configureIosPlaybackSession(): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & {
    audioSession?: { type: string };
  };
  if (nav.audioSession && nav.audioSession.type !== 'playback') {
    try {
      nav.audioSession.type = 'playback';
    } catch {
      // Unsupported browser or read-only audioSession
    }
  }
}

function createSilentWavUrl(): string {
  // 0.5s of 8kHz 8-bit unsigned mono PCM silence (128 = exact zero amplitude)
  const sampleRate = 8000;
  const numSamples = 4000;
  const buffer = new ArrayBuffer(44 + numSamples);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); // ByteRate (8-bit mono)
  view.setUint16(32, 1, true); // BlockAlign
  view.setUint16(34, 8, true); // BitsPerSample
  writeStr(36, 'data');
  view.setUint32(40, numSamples, true);
  new Uint8Array(buffer, 44).fill(128);
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

/**
 * Plays a looping digital-silence HTML5 <audio> element synchronously during a user
 * gesture. On iOS (all versions, Safari & Home Screen PWA), active HTMLMediaElement
 * playback elevates the CoreAudio session from 'ambient' (muted by silent switch)
 * to 'playback' (audible even with Silent Mode enabled).
 */
function ensureIosSilentAudioChannel(): void {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return;
  configureIosPlaybackSession();

  try {
    if (!iosKeepAliveAudio) {
      iosKeepAliveUrl = createSilentWavUrl();
      const audio = new Audio(iosKeepAliveUrl);
      audio.loop = true;
      audio.preload = 'auto';
      audio.volume = 1;
      audio.muted = false; // Must remain unmuted so iOS engages 'playback' channel
      audio.setAttribute('playsinline', '');
      audio.setAttribute('webkit-playsinline', '');
      iosKeepAliveAudio = audio;
    }

    if (iosKeepAliveAudio.paused) {
      const p = iosKeepAliveAudio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          // Will retry synchronously on next user gesture
        });
      }
    }
  } catch {
    // Ignore if blocked before user gesture
  }
}

function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (cachedNoiseBuffer && cachedNoiseBuffer.sampleRate === ctx.sampleRate) {
    return cachedNoiseBuffer;
  }
  const length = Math.floor(ctx.sampleRate * 0.08);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  cachedNoiseBuffer = buffer;
  return buffer;
}

/**
 * Strips MP3 encoder padding and pre-attack swell relative to peak amplitude
 * so every plucked sample aligns tightly to the beat.
 */
function trimLeadingSilence(ctx: AudioContext, raw: AudioBuffer): AudioBuffer {
  const ch0 = raw.getChannelData(0);
  const maxScan = Math.min(raw.length, Math.floor(raw.sampleRate * 1.0));

  let maxAmp = 0;
  for (let i = 0; i < maxScan; i++) {
    const abs = Math.abs(ch0[i]);
    if (abs > maxAmp) maxAmp = abs;
  }

  const threshold = Math.max(0.015, maxAmp * 0.25);
  let startSample = 0;
  for (let i = 0; i < maxScan; i++) {
    if (Math.abs(ch0[i]) >= threshold) {
      startSample = Math.max(0, i - Math.floor(raw.sampleRate * 0.0015));
      break;
    }
  }

  const remaining = raw.length - startSample;
  if (remaining <= 0 || startSample === 0) {
    return raw;
  }

  const trimmed = ctx.createBuffer(raw.numberOfChannels, remaining, raw.sampleRate);
  const rampSamples = Math.min(48, remaining);

  for (let ch = 0; ch < raw.numberOfChannels; ch++) {
    const src = raw.getChannelData(ch);
    const dst = trimmed.getChannelData(ch);
    dst.set(src.subarray(startSample));
    for (let i = 0; i < rampSamples; i++) {
      dst[i] *= i / rampSamples;
    }
  }

  return trimmed;
}

export function preloadRealGuitarSample(): Promise<void> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return Promise.resolve();
  }
  const ctx = sharedCtx;
  if (!ctx) return Promise.resolve();
  if (samplePreloadPromise) return samplePreloadPromise;

  samplePreloadPromise = Promise.all(
    SAMPLE_ANCHORS.map(async (anchor) => {
      if (anchor.buffer) return;
      try {
        const res = await fetch(anchor.url);
        if (!res.ok) return;
        const arr = await res.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arr);
        anchor.buffer = trimLeadingSilence(ctx, decoded);
      } catch {
        // Offline or decoding unavailable: keep physical model fallback
      }
    })
  )
    .then(() => undefined)
    .catch(() => undefined);

  return samplePreloadPromise;
}

function selectNearestSampleAnchor(targetFreq: number): SampleAnchor | null {
  let best: SampleAnchor | null = null;
  let bestRatio = Infinity;
  for (const anchor of SAMPLE_ANCHORS) {
    if (!anchor.buffer) continue;
    const ratio = Math.abs(Math.log2(targetFreq / anchor.baseFreq));
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = anchor;
    }
  }
  return best;
}

function playSilentUnlockSample(ctx: AudioContext): void {
  try {
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // Ignore if blocked before gesture
  }
}

function attachGlobalAudioUnlockListeners(): void {
  if (typeof window === 'undefined' || unlockListenersAttached) return;
  unlockListenersAttached = true;

  const handleUserGesture = () => {
    // Must run synchronously inside the user gesture stack so iOS Safari
    // switches AVAudioSession to 'playback' (audible even with Silent switch ON).
    ensureIosSilentAudioChannel();
    unlockSharedAudioContext().catch(() => {});
  };

  window.addEventListener('pointerdown', handleUserGesture, { passive: true });
  window.addEventListener('touchstart', handleUserGesture, { passive: true });
  window.addEventListener('touchend', handleUserGesture, { passive: true });
  window.addEventListener('keydown', handleUserGesture, { passive: true });
  window.addEventListener('click', handleUserGesture, { passive: true });

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        configureIosPlaybackSession();
        if (sharedCtx) {
          const st = sharedCtx.state as string;
          if (st === 'suspended' || st === 'interrupted') {
            sharedCtx.resume().catch(() => {});
          }
        }
      }
    });
  }
}

// Attach listeners immediately on module load so the very first tap unlocks iOS playback audio
if (typeof window !== 'undefined') {
  configureIosPlaybackSession();
  attachGlobalAudioUnlockListeners();
}

export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  configureIosPlaybackSession();
  attachGlobalAudioUnlockListeners();

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;

  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new AudioCtx();
    sharedCtx.addEventListener('statechange', () => {
      const state = sharedCtx?.state as string | undefined;
      if (sharedCtx && (state === 'suspended' || state === 'interrupted')) {
        configureIosPlaybackSession();
        sharedCtx.resume().catch(() => {});
      }
    });
  }

  const state = sharedCtx.state as string;
  if (state === 'suspended' || state === 'interrupted') {
    sharedCtx.resume().catch(() => {});
  }

  preloadRealGuitarSample().catch(() => {});

  return sharedCtx;
}

export async function unlockSharedAudioContext(): Promise<AudioContext | null> {
  // Synchronously engage iOS 'playback' channel before any await
  ensureIosSilentAudioChannel();

  const ctx = getSharedAudioContext();
  if (!ctx) return null;

  const state = ctx.state as string;
  if (state === 'suspended' || state === 'interrupted') {
    try {
      await ctx.resume();
    } catch {
      // Ignore; next gesture will retry
    }
  }

  if (ctx.state === 'running') {
    playSilentUnlockSample(ctx);
    preloadRealGuitarSample().catch(() => {});
  }

  return ctx;
}

const getAudioContext = getSharedAudioContext;

export function getGuitarFrequency(
  stringNum: 1 | 2 | 3 | 4 | 5 | 6,
  fret: number
): number {
  return OPEN_STRING_HZ[stringNum] * Math.pow(2, fret / 12);
}

/**
 * Populates a Float32Array with a realistic Karplus-Strong plucked string sample.
 * Shared across live Web Audio synthesis and offline WAV rendering.
 */
export function fillKarplusStrongPluck(
  data: Float32Array,
  sampleRate: number,
  freq: number
): void {
  const totalSamples = data.length;
  const period = Math.max(2, Math.round(sampleRate / Math.max(40, freq)));
  const pickSamples = Math.min(period, Math.floor(sampleRate * 0.0025));

  let b0 = 0;
  for (let i = 0; i < period && i < totalSamples; i++) {
    const phase = (2 * Math.PI * i) / period;
    const harmonics =
      0.55 * Math.sin(phase) +
      0.28 * Math.sin(2 * phase + 0.3) +
      0.16 * Math.sin(3 * phase + 0.7) +
      0.09 * Math.sin(4 * phase + 1.1) +
      0.05 * Math.sin(5 * phase);
    const white = Math.random() * 2 - 1;
    b0 = 0.62 * b0 + 0.38 * white;
    const pickNoise = i < pickSamples ? b0 * 0.75 : b0 * 0.25;
    data[i] = Math.max(-1, Math.min(1, harmonics * 0.72 + pickNoise));
  }

  const decay = freq > 260 ? 0.9945 : freq > 150 ? 0.9958 : 0.9968;
  for (let i = period; i < totalSamples; i++) {
    const prev = data[i - period];
    const prev2 = data[i - period - 1] ?? prev;
    const prev3 = data[i - period + 1] ?? prev;
    data[i] = decay * (0.25 * prev3 + 0.5 * prev + 0.25 * prev2);
  }

  const fadeSamples = Math.min(Math.floor(sampleRate * 0.05), totalSamples);
  for (let i = 0; i < fadeSamples; i++) {
    const idx = totalSamples - 1 - i;
    data[idx] *= i / fadeSamples;
  }
}

function createPluckBuffer(
  ctx: AudioContext,
  freq: number,
  durationSec: number
): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const totalSamples = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = ctx.createBuffer(1, totalSamples, sampleRate);
  fillKarplusStrongPluck(buffer.getChannelData(0), sampleRate, freq);
  return buffer;
}

/**
 * Plays a plucked guitar note at an arbitrary frequency (for alternate tunings & chords).
 */
export function playGuitarFrequency(
  freq: number,
  options?: { durationSec?: number; volume?: number; delaySec?: number }
): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const durationSec = options?.durationSec ?? 1.25;
    const volume = options?.volume ?? 0.52;
    const startTime = ctx.currentTime + (options?.delaySec ?? 0);

    const anchor = selectNearestSampleAnchor(freq);
    const source = ctx.createBufferSource();

    if (anchor && anchor.buffer) {
      source.buffer = anchor.buffer;
      source.playbackRate.setValueAtTime(freq / anchor.baseFreq, startTime);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume * 1.15, startTime);
      gain.gain.setValueAtTime(
        volume * 1.15,
        startTime + Math.max(0.15, durationSec * 0.65)
      );
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + durationSec);

      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(startTime);
      source.stop(startTime + durationSec + 0.04);
      return;
    }

    source.buffer = createPluckBuffer(ctx, freq, durationSec);

    const bodyResonance = ctx.createBiquadFilter();
    bodyResonance.type = 'peaking';
    bodyResonance.frequency.setValueAtTime(195, startTime);
    bodyResonance.Q.setValueAtTime(2.2, startTime);
    bodyResonance.gain.setValueAtTime(4.5, startTime);

    const clarityPeak = ctx.createBiquadFilter();
    clarityPeak.type = 'peaking';
    clarityPeak.frequency.setValueAtTime(2400, startTime);
    clarityPeak.Q.setValueAtTime(1.4, startTime);
    clarityPeak.gain.setValueAtTime(2.5, startTime);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(Math.min(5800, freq * 10), startTime);
    lowpass.frequency.exponentialRampToValueAtTime(
      Math.max(1100, freq * 3),
      startTime + durationSec
    );

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + durationSec);

    source.connect(bodyResonance);
    bodyResonance.connect(clarityPeak);
    clarityPeak.connect(lowpass);
    lowpass.connect(gain);
    gain.connect(ctx.destination);

    source.start(startTime);
    source.stop(startTime + durationSec + 0.03);
  } catch {
    // Gracefully ignore audio errors in restricted environments
  }
}

/**
 * Plays a single plucked guitar note for standard (stringNum, fret).
 */
export function playGuitarPluck(
  stringNum: 1 | 2 | 3 | 4 | 5 | 6,
  fret: number,
  options?: { durationSec?: number; volume?: number; delaySec?: number }
): void {
  const freq = getGuitarFrequency(stringNum, fret);
  playGuitarFrequency(freq, options);
}

/**
 * Plays a percussive muted guitar strum ("chug" / stoppata).
 */
export function playMutedStrum(volume = 0.28): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const durationSec = 0.075;
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
      const env = Math.pow(1 - i / length, 2.4);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(950, ctx.currentTime);
    bandpass.Q.setValueAtTime(1.4, ctx.currentTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);

    source.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(ctx.destination);

    source.start();
  } catch {
    // Ignore in restricted environments
  }
}

/**
 * Plays a single note, strummed chord, muted chop, or skips re-attack on sustain holds.
 */
export function playGuitarStep(
  notes: { string: 1 | 2 | 3 | 4 | 5 | 6; fret: number }[],
  muted = false,
  sustain = false
): void {
  if (sustain) {
    return;
  }

  if (muted || notes.length === 0) {
    playMutedStrum();
    return;
  }

  if (notes.length === 1) {
    playGuitarPluck(notes[0].string, notes[0].fret, {
      durationSec: 1.25,
      volume: 0.54,
    });
    return;
  }

  const ordered = [...notes].sort((a, b) => b.string - a.string);
  const perNoteVol = Math.min(0.36, 0.78 / ordered.length);
  ordered.forEach((n, idx) => {
    playGuitarPluck(n.string, n.fret, {
      durationSec: 1.35,
      volume: perNoteVol,
      delaySec: idx * 0.016,
    });
  });
}

export type MetronomeClickKind = 'accent' | 'beat' | 'sub' | 'precount' | 'go';

/**
 * Synthesizes 4 musical studio metronome presets scheduled at exact Web Audio time.
 */
export function playMetronomeClick(
  ctx: AudioContext,
  time: number,
  kind: MetronomeClickKind,
  soundId: MetronomeSoundId = 'woodblock'
): void {
  try {
    const safeTime = Math.max(ctx.currentTime + 0.002, time);
    const isStrong = kind === 'accent' || kind === 'go';
    const isSub = kind === 'sub';

    if (soundId === 'woodblock') {
      const startFreq = isStrong ? 920 : isSub ? 520 : 700;
      const endFreq = isStrong ? 520 : isSub ? 330 : 410;
      const amp = isStrong ? 0.52 : isSub ? 0.16 : 0.36;
      const decay = isSub ? 0.032 : 0.055;

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(startFreq, safeTime);
      osc.frequency.exponentialRampToValueAtTime(endFreq, safeTime + 0.025);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(amp, safeTime);
      gain.gain.exponentialRampToValueAtTime(0.001, safeTime + decay);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(safeTime);
      osc.stop(safeTime + decay + 0.006);

      // Subtle wood mallet click transient
      const noise = ctx.createBufferSource();
      noise.buffer = getNoiseBuffer(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(1800, safeTime);
      bp.Q.setValueAtTime(2.6, safeTime);

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(isSub ? 0.05 : 0.14, safeTime);
      nGain.gain.exponentialRampToValueAtTime(0.001, safeTime + 0.008);

      noise.connect(bp);
      bp.connect(nGain);
      nGain.connect(ctx.destination);
      noise.start(safeTime);
      noise.stop(safeTime + 0.01);
      return;
    }

    if (soundId === 'mechanical') {
      const primaryFreq = isStrong ? 2250 : isSub ? 1150 : 1750;
      const bodyFreq = isStrong ? 1150 : isSub ? 760 : 940;
      const amp = isStrong ? 0.52 : isSub ? 0.15 : 0.38;

      const noise = ctx.createBufferSource();
      noise.buffer = getNoiseBuffer(ctx);

      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(primaryFreq, safeTime);
      bp.Q.setValueAtTime(5.2, safeTime);

      const nGain = ctx.createGain();
      nGain.gain.setValueAtTime(amp, safeTime);
      nGain.gain.exponentialRampToValueAtTime(0.001, safeTime + 0.014);

      noise.connect(bp);
      bp.connect(nGain);
      nGain.connect(ctx.destination);
      noise.start(safeTime);
      noise.stop(safeTime + 0.016);

      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(bodyFreq, safeTime);
      const oGain = ctx.createGain();
      oGain.gain.setValueAtTime(amp * 0.42, safeTime);
      oGain.gain.exponentialRampToValueAtTime(0.001, safeTime + 0.016);
      osc.connect(oGain);
      oGain.connect(ctx.destination);
      osc.start(safeTime);
      osc.stop(safeTime + 0.02);
      return;
    }

    if (soundId === 'rimshot') {
      if (isSub) {
        // Soft crisp closed hi-hat on '&' subdivisions
        const hat = ctx.createBufferSource();
        hat.buffer = getNoiseBuffer(ctx);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(6500, safeTime);
        const hGain = ctx.createGain();
        hGain.gain.setValueAtTime(0.14, safeTime);
        hGain.gain.exponentialRampToValueAtTime(0.001, safeTime + 0.018);

        hat.connect(hp);
        hp.connect(hGain);
        hGain.connect(ctx.destination);
        hat.start(safeTime);
        hat.stop(safeTime + 0.02);
        return;
      }

      // Tight cross-stick body + snare stick snap
      const bodyOsc = ctx.createOscillator();
      bodyOsc.type = 'triangle';
      bodyOsc.frequency.setValueAtTime(isStrong ? 520 : 440, safeTime);
      bodyOsc.frequency.exponentialRampToValueAtTime(220, safeTime + 0.022);

      const bGain = ctx.createGain();
      bGain.gain.setValueAtTime(isStrong ? 0.52 : 0.36, safeTime);
      bGain.gain.exponentialRampToValueAtTime(0.001, safeTime + 0.036);
      bodyOsc.connect(bGain);
      bGain.connect(ctx.destination);
      bodyOsc.start(safeTime);
      bodyOsc.stop(safeTime + 0.04);

      const snap = ctx.createBufferSource();
      snap.buffer = getNoiseBuffer(ctx);
      const sBp = ctx.createBiquadFilter();
      sBp.type = 'bandpass';
      sBp.frequency.setValueAtTime(isStrong ? 2800 : 2400, safeTime);
      sBp.Q.setValueAtTime(2.2, safeTime);
      const sGain = ctx.createGain();
      sGain.gain.setValueAtTime(isStrong ? 0.42 : 0.28, safeTime);
      sGain.gain.exponentialRampToValueAtTime(0.001, safeTime + 0.022);

      snap.connect(sBp);
      sBp.connect(sGain);
      sGain.connect(ctx.destination);
      snap.start(safeTime);
      snap.stop(safeTime + 0.025);
      return;
    }

    // 'digital': Clean DAW Klopfgeist marimba-bell click
    const freq = isStrong ? 1567.98 : isSub ? 783.99 : 1046.5;
    const amp = isStrong ? 0.38 : isSub ? 0.12 : 0.28;
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, safeTime);

    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 2, safeTime);

    const gain1 = ctx.createGain();
    gain1.gain.setValueAtTime(amp, safeTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, safeTime + 0.042);

    const gain2 = ctx.createGain();
    gain2.gain.setValueAtTime(amp * 0.22, safeTime);
    gain2.gain.exponentialRampToValueAtTime(0.001, safeTime + 0.015);

    osc1.connect(gain1);
    osc2.connect(gain2);
    gain1.connect(ctx.destination);
    gain2.connect(ctx.destination);
    osc1.start(safeTime);
    osc2.start(safeTime);
    osc1.stop(safeTime + 0.048);
    osc2.stop(safeTime + 0.02);
  } catch {
    // Ignore in restricted environments
  }
}

/**
 * Plays a soft metronome tick synchronized with demo steps or live preview.
 */
export function playSoftMetronomeTick(
  isDownbeat = false,
  soundId: MetronomeSoundId = 'woodblock',
  scheduledTime?: number
): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const targetTime = scheduledTime ?? ctx.currentTime + 0.004;
    playMetronomeClick(ctx, targetTime, isDownbeat ? 'accent' : 'beat', soundId);
  } catch {
    // Ignore in restricted environments
  }
}
