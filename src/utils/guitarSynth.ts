/**
 * Hybrid Web Audio Guitar & Studio Metronome Engine:
 * 1) Real studio-recorded electric guitar multisamples (A2, A3, C4 — CC BY 3.0 via nbrosowsky/tonejs-instruments)
 *    with peak-relative attack transient trimming for <2ms rhythmic lock.
 * 2) Multi-harmonic Karplus-Strong physical string model + 2-band body resonance fallback.
 * 3) Arbitrary frequency plucking for alternative tunings (EADGBE, FACGCE, DAEAC#E, DADF#AD).
 * 4) 4 selectable studio metronome sounds (Woodblock, Pendolo, Rimshot & Hat, Studio Klopfgeist).
 */
import { InstrumentType, MetronomeSoundId } from '../types/practice';

const OPEN_STRING_HZ: Record<1 | 2 | 3 | 4 | 5 | 6, number> = {
  1: 329.6276, // high e (E4)
  2: 246.9417, // B3
  3: 195.9977, // G3
  4: 146.8324, // D3
  5: 110.0, // A2
  6: 82.4069, // low E (E2)
};

export const BASS_OPEN_STRING_HZ: Record<1 | 2 | 3 | 4, number> = {
  1: 97.9989, // G2 (1st string)
  2: 73.4162, // D2 (2nd string)
  3: 55.0, // A1 (3rd string)
  4: 41.2034, // E1 (4th string)
};

export const BASS_STRING_LABELS = ['G', 'D', 'A', 'E'] as const;

export const BASS_STRING_SHORT_MAP: Record<1 | 2 | 3 | 4, string> = {
  1: 'G',
  2: 'D',
  3: 'A',
  4: 'E',
};

export type BassArticulation =
  | 'finger'
  | 'slap'
  | 'pop'
  | 'palmMute'
  | 'hammer'
  | 'slide';

interface BassSampleAnchor {
  id: string;
  url: string;
  baseFreq: number;
  buffer: AudioBuffer | null;
}

// Prepared anchor array for future studio electric-bass MP3 multisamples
const BASS_SAMPLE_ANCHORS: BassSampleAnchor[] = [];

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
let iosMicSessionActive = false;
let metronomeBusCtx: AudioContext | null = null;
let metronomeBusGain: GainNode | null = null;

function getMetronomeOutputNode(ctx: AudioContext): AudioNode {
  if (metronomeBusCtx !== ctx || !metronomeBusGain) {
    const gain = ctx.createGain();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -4;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.05;
    gain.connect(limiter);
    limiter.connect(ctx.destination);
    metronomeBusCtx = ctx;
    metronomeBusGain = gain;
  }
  // Compensate iOS Safari PlayAndRecord volume ducking when mic is active
  metronomeBusGain.gain.value = iosMicSessionActive ? 2.6 : 1.2;
  return metronomeBusGain;
}

/**
 * Forces iOS Safari / standalone PWAs into the right audio session category:
 * - 'play-and-record' while microphone capture/tuner is active (so CoreAudio
 *   allows BOTH mic input and speaker playback, ignoring the silent switch).
 * - 'playback' when only playing metronome/guitar demos.
 */
function configureIosPlaybackSession(): void {
  if (typeof navigator === 'undefined') return;
  const nav = navigator as Navigator & {
    audioSession?: { type: string };
  };
  const desiredType = iosMicSessionActive ? 'play-and-record' : 'playback';
  if (nav.audioSession && nav.audioSession.type !== desiredType) {
    try {
      nav.audioSession.type = desiredType;
    } catch {
      // Unsupported browser or read-only audioSession
    }
  }
}

export function setIosMicSessionActive(active: boolean): void {
  iosMicSessionActive = active;
  configureIosPlaybackSession();
  if (metronomeBusGain) {
    metronomeBusGain.gain.value = active ? 2.6 : 1.2;
  }
  if (active && iosKeepAliveAudio && !iosKeepAliveAudio.paused) {
    try {
      iosKeepAliveAudio.pause();
    } catch {
      // Ignore
    }
  }
}

export function isIosMicSessionActive(): boolean {
  return iosMicSessionActive;
}

/**
 * Tears down any AudioContext/audio-session tainted by microphone capture on iOS Safari
 * so subsequent metronome/demo playback opens a clean 'playback' context routed to main speakers.
 */
export function recoverPlaybackAfterMic(): void {
  stopBackingDrone();
  iosMicSessionActive = false;
  configureIosPlaybackSession();

  if (sharedCtx) {
    const oldCtx = sharedCtx;
    sharedCtx = null;
    oldCtx.close().catch(() => {});
  }
  metronomeBusCtx = null;
  metronomeBusGain = null;
  cachedNoiseBuffer = null;
  samplePreloadPromise = null;
  SAMPLE_ANCHORS.forEach((a) => {
    a.buffer = null;
  });

  if (iosKeepAliveAudio) {
    try {
      iosKeepAliveAudio.pause();
    } catch {
      // Ignore
    }
    iosKeepAliveAudio = null;
  }
  if (iosKeepAliveUrl) {
    try {
      URL.revokeObjectURL(iosKeepAliveUrl);
    } catch {
      // Ignore
    }
    iosKeepAliveUrl = null;
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
  if (iosMicSessionActive) return;

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
  options?: {
    durationSec?: number;
    volume?: number;
    delaySec?: number;
    bendSemitones?: number;
    palmMute?: boolean;
    harmonic?: boolean;
  }
): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const palmMute = Boolean(options?.palmMute);
    const harmonic = Boolean(options?.harmonic);
    const bendSemitones = options?.bendSemitones ?? 0;
    const effectiveFreq = harmonic ? freq * 2 : freq;
    const durationSec = palmMute
      ? Math.min(options?.durationSec ?? 0.2, 0.2)
      : options?.durationSec ?? 1.25;
    const volume = options?.volume ?? 0.52;
    const startTime = ctx.currentTime + (options?.delaySec ?? 0);

    const anchor = selectNearestSampleAnchor(effectiveFreq);
    const source = ctx.createBufferSource();

    if (anchor && anchor.buffer) {
      source.buffer = anchor.buffer;
      const baseRate = effectiveFreq / anchor.baseFreq;
      source.playbackRate.setValueAtTime(baseRate, startTime);
      if (bendSemitones > 0) {
        const targetRate = baseRate * Math.pow(2, bendSemitones / 12);
        source.playbackRate.setValueAtTime(baseRate, startTime + 0.025);
        source.playbackRate.exponentialRampToValueAtTime(
          targetRate,
          startTime + 0.2
        );
      }

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume * (palmMute ? 1.05 : 1.15), startTime);
      if (!palmMute) {
        gain.gain.setValueAtTime(
          volume * 1.15,
          startTime + Math.max(0.15, durationSec * 0.65)
        );
      }
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + durationSec);

      if (palmMute) {
        const thump = ctx.createBiquadFilter();
        thump.type = 'peaking';
        thump.frequency.setValueAtTime(165, startTime);
        thump.Q.setValueAtTime(1.6, startTime);
        thump.gain.setValueAtTime(5.0, startTime);

        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(680, startTime);

        source.connect(thump);
        thump.connect(lp);
        lp.connect(gain);
      } else if (harmonic) {
        const pinchPeak = ctx.createBiquadFilter();
        pinchPeak.type = 'peaking';
        pinchPeak.frequency.setValueAtTime(Math.min(4200, effectiveFreq * 2.5), startTime);
        pinchPeak.Q.setValueAtTime(3.0, startTime);
        pinchPeak.gain.setValueAtTime(7.0, startTime);
        source.connect(pinchPeak);
        pinchPeak.connect(gain);
      } else {
        source.connect(gain);
      }
      gain.connect(ctx.destination);
      source.start(startTime);
      source.stop(startTime + durationSec + 0.04);
      return;
    }

    source.buffer = createPluckBuffer(ctx, effectiveFreq, durationSec);
    if (bendSemitones > 0) {
      source.playbackRate.setValueAtTime(1, startTime + 0.025);
      source.playbackRate.exponentialRampToValueAtTime(
        Math.pow(2, bendSemitones / 12),
        startTime + 0.2
      );
    }

    const bodyResonance = ctx.createBiquadFilter();
    bodyResonance.type = 'peaking';
    bodyResonance.frequency.setValueAtTime(palmMute ? 165 : 195, startTime);
    bodyResonance.Q.setValueAtTime(palmMute ? 1.6 : 2.2, startTime);
    bodyResonance.gain.setValueAtTime(palmMute ? 5.5 : 4.5, startTime);

    const clarityPeak = ctx.createBiquadFilter();
    clarityPeak.type = 'peaking';
    clarityPeak.frequency.setValueAtTime(harmonic ? 3100 : 2400, startTime);
    clarityPeak.Q.setValueAtTime(harmonic ? 2.8 : 1.4, startTime);
    clarityPeak.gain.setValueAtTime(palmMute ? -4.0 : harmonic ? 6.5 : 2.5, startTime);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(
      palmMute ? 680 : Math.min(5800, effectiveFreq * 10),
      startTime
    );
    lowpass.frequency.exponentialRampToValueAtTime(
      palmMute ? 340 : Math.max(1100, effectiveFreq * 3),
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
  options?: {
    durationSec?: number;
    volume?: number;
    delaySec?: number;
    bendSemitones?: number;
    palmMute?: boolean;
    harmonic?: boolean;
  }
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
  sustain = false,
  technique?: string,
  accent?: boolean,
  dynamic?: 'p' | 'mf' | 'f'
): void {
  if (sustain) {
    return;
  }

  if (muted || notes.length === 0) {
    playMutedStrum(dynamic === 'p' ? 0.16 : accent || dynamic === 'f' ? 0.34 : 0.28);
    return;
  }

  const tech = (technique || '').toLowerCase();
  const palmMute = tech.includes('palm') || tech.includes('p.m.');
  const harmonic =
    tech.includes('pinch') || tech.includes('armonic') || tech.includes('p.h.');
  const bendSemitones = tech.includes('bend')
    ? tech.includes('1/2') || tech.includes('½')
      ? 1
      : 2
    : 0;

  const dynScale =
    dynamic === 'p' ? 0.5 : accent || dynamic === 'f' ? 1.22 : 1.0;

  if (notes.length === 1) {
    const baseVol = palmMute ? 0.48 : 0.54;
    playGuitarPluck(notes[0].string, notes[0].fret, {
      durationSec: palmMute ? 0.2 : 1.25,
      volume: Math.min(0.72, baseVol * dynScale),
      bendSemitones,
      palmMute,
      harmonic,
    });
    return;
  }

  const ordered = [...notes].sort((a, b) => b.string - a.string);
  const perNoteVol = Math.min(0.42, (0.78 / ordered.length) * dynScale);
  ordered.forEach((n, idx) => {
    playGuitarPluck(n.string, n.fret, {
      durationSec: palmMute ? 0.2 : 1.35,
      volume: perNoteVol,
      delaySec: idx * 0.016,
      palmMute,
      harmonic,
    });
  });
}

export function getBassFrequency(
  stringNum: 1 | 2 | 3 | 4,
  fret: number
): number {
  return BASS_OPEN_STRING_HZ[stringNum] * Math.pow(2, fret / 12);
}

function selectNearestBassSampleAnchor(
  targetFreq: number
): BassSampleAnchor | null {
  let best: BassSampleAnchor | null = null;
  let bestRatio = Infinity;
  for (const anchor of BASS_SAMPLE_ANCHORS) {
    if (!anchor.buffer) continue;
    const ratio = Math.abs(Math.log2(targetFreq / anchor.baseFreq));
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = anchor;
    }
  }
  return best;
}

/**
 * Plays a warm, phone-speaker-audible electric bass note using multi-oscillator
 * fundamental + 2nd-harmonic support, resonant lowpass envelope, and articulation
 * shaping (fingerstyle, thumb slap, index pop, palm mute, hammer/slide).
 */
export function playBassFrequency(
  freq: number,
  options?: {
    durationSec?: number;
    volume?: number;
    delaySec?: number;
    articulation?: BassArticulation;
  }
): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const articulation: BassArticulation = options?.articulation ?? 'finger';
    const isPalmMute = articulation === 'palmMute';
    const isSlap = articulation === 'slap';
    const isPop = articulation === 'pop';
    const isLegato = articulation === 'hammer' || articulation === 'slide';

    const rawDuration = isPalmMute
      ? Math.min(options?.durationSec ?? 0.22, 0.22)
      : options?.durationSec ?? (isSlap || isPop ? 0.95 : 1.25);
    const durationSec = Math.max(0.14, rawDuration);
    const volume = options?.volume ?? 0.56;
    const startTime = Math.max(
      ctx.currentTime + 0.002,
      ctx.currentTime + (options?.delaySec ?? 0)
    );

    const anchor = selectNearestBassSampleAnchor(freq);
    if (anchor && anchor.buffer) {
      const src = ctx.createBufferSource();
      src.buffer = anchor.buffer;
      src.playbackRate.setValueAtTime(freq / anchor.baseFreq, startTime);
      const g = ctx.createGain();
      g.gain.setValueAtTime(volume, startTime);
      g.gain.exponentialRampToValueAtTime(0.001, startTime + durationSec);
      src.connect(g);
      g.connect(ctx.destination);
      src.start(startTime);
      src.stop(startTime + durationSec + 0.04);
      return;
    }

    const attackSec = isLegato ? 0.01 : isSlap || isPop ? 0.002 : 0.004;

    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(freq, startTime);

    const bodyOsc = ctx.createOscillator();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(freq, startTime);

    const harmonicOsc = ctx.createOscillator();
    harmonicOsc.type = 'sawtooth';
    harmonicOsc.frequency.setValueAtTime(freq, startTime);

    // 2nd harmonic warmth so E1 (41.2 Hz) & A1 (55 Hz) cut through small mobile speakers
    const overtoneOsc = ctx.createOscillator();
    overtoneOsc.type = 'sine';
    overtoneOsc.frequency.setValueAtTime(freq * 2, startTime);

    const subGain = ctx.createGain();
    subGain.gain.setValueAtTime(0.54, startTime);

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.32, startTime);

    const harmGain = ctx.createGain();
    harmGain.gain.setValueAtTime(
      isSlap ? 0.34 : isPop ? 0.38 : isPalmMute ? 0.16 : 0.24,
      startTime
    );

    const overtoneGain = ctx.createGain();
    overtoneGain.gain.setValueAtTime(freq < 75 ? 0.24 : 0.12, startTime);

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.Q.setValueAtTime(isSlap || isPop ? 3.2 : 1.4, startTime);

    const startCutoff = isPalmMute
      ? 380
      : isSlap || isPop
      ? Math.min(4200, Math.max(950, freq * 18))
      : isLegato
      ? Math.min(1800, Math.max(480, freq * 7))
      : Math.min(2400, Math.max(620, freq * 10));
    const sustainCutoff = isPalmMute
      ? 180
      : isSlap || isPop
      ? Math.max(420, freq * 4.5)
      : Math.max(260, freq * 2.8);

    lowpass.frequency.setValueAtTime(startCutoff, startTime);
    lowpass.frequency.exponentialRampToValueAtTime(
      sustainCutoff,
      startTime + Math.min(0.24, durationSec * 0.45)
    );

    const bodyPeak = ctx.createBiquadFilter();
    bodyPeak.type = 'peaking';
    bodyPeak.frequency.setValueAtTime(125, startTime);
    bodyPeak.Q.setValueAtTime(1.2, startTime);
    bodyPeak.gain.setValueAtTime(isPalmMute ? 4.5 : 3.5, startTime);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, startTime);
    masterGain.gain.linearRampToValueAtTime(volume, startTime + attackSec);
    masterGain.gain.setValueAtTime(
      volume * (isPalmMute ? 0.85 : 0.92),
      startTime + Math.min(0.12, durationSec * 0.28)
    );
    masterGain.gain.exponentialRampToValueAtTime(0.001, startTime + durationSec);

    subOsc.connect(subGain);
    bodyOsc.connect(bodyGain);
    harmonicOsc.connect(harmGain);
    overtoneOsc.connect(overtoneGain);

    subGain.connect(lowpass);
    bodyGain.connect(lowpass);
    harmGain.connect(lowpass);
    overtoneGain.connect(lowpass);

    lowpass.connect(bodyPeak);
    bodyPeak.connect(masterGain);
    masterGain.connect(ctx.destination);

    const stopAt = startTime + durationSec + 0.04;
    subOsc.start(startTime);
    bodyOsc.start(startTime);
    harmonicOsc.start(startTime);
    overtoneOsc.start(startTime);
    subOsc.stop(stopAt);
    bodyOsc.stop(stopAt);
    harmonicOsc.stop(stopAt);
    overtoneOsc.stop(stopAt);

    // Metallic fret-clank noise burst for Slap Thumb & Index Pop
    if (isSlap || isPop) {
      const click = ctx.createBufferSource();
      click.buffer = getNoiseBuffer(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(isPop ? 2900 : 1850, startTime);
      bp.Q.setValueAtTime(2.0, startTime);

      const cGain = ctx.createGain();
      cGain.gain.setValueAtTime(volume * (isPop ? 0.55 : 0.48), startTime);
      cGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.024);

      click.connect(bp);
      bp.connect(cGain);
      cGain.connect(ctx.destination);
      click.start(startTime);
      click.stop(startTime + 0.028);
    }
  } catch {
    // Gracefully ignore audio errors in restricted environments
  }
}

/**
 * Plays a percussive muted electric-bass dead note / ghost note thump.
 */
export function playBassMutedThump(volume = 0.36, slapDead = false): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime + 0.002;
    const dur = 0.075;

    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(slapDead ? 170 : 135, now);
    thump.frequency.exponentialRampToValueAtTime(slapDead ? 65 : 55, now + dur);

    const tGain = ctx.createGain();
    tGain.gain.setValueAtTime(volume * 0.85, now);
    tGain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    thump.connect(tGain);
    tGain.connect(ctx.destination);
    thump.start(now);
    thump.stop(now + dur + 0.01);

    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(slapDead ? 950 : 340, now);
    bp.Q.setValueAtTime(1.6, now);

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(volume * (slapDead ? 0.52 : 0.36), now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    noise.connect(bp);
    bp.connect(nGain);
    nGain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.055);
  } catch {
    // Ignore in restricted environments
  }
}

export function playBassPluck(
  stringNum: 1 | 2 | 3 | 4,
  fret: number,
  options?: {
    durationSec?: number;
    volume?: number;
    delaySec?: number;
    articulation?: BassArticulation;
  }
): void {
  const freq = getBassFrequency(stringNum, fret);
  playBassFrequency(freq, options);
}

export function playInstrumentStep(
  instrument: InstrumentType,
  notes: { string: 1 | 2 | 3 | 4 | 5 | 6; fret: number }[],
  muted = false,
  sustain = false,
  technique?: string,
  accent?: boolean,
  dynamic?: 'p' | 'mf' | 'f'
): void {
  if (instrument === 'guitar') {
    playGuitarStep(notes, muted, sustain, technique, accent, dynamic);
    return;
  }

  if (sustain) return;

  const tech = (technique || '').toLowerCase();
  if (muted || notes.length === 0) {
    const isSlapDead = tech.includes('slap') || tech.includes('dead');
    playBassMutedThump(0.38, isSlapDead);
    return;
  }

  let articulation: BassArticulation = 'finger';
  if (tech.includes('slap') || tech.includes('thumb')) {
    articulation = 'slap';
  } else if (tech.includes('pop') || tech.includes('strappo')) {
    articulation = 'pop';
  } else if (tech.includes('palm') || tech.includes('staccato') || tech.includes('p.m.')) {
    articulation = 'palmMute';
  } else if (tech.includes('hammer') || tech.includes('pull')) {
    articulation = 'hammer';
  } else if (tech.includes('slide')) {
    articulation = 'slide';
  }

  const ordered = [...notes].sort((a, b) => b.string - a.string);
  const perNoteVol = ordered.length > 1 ? 0.38 : 0.56;
  ordered.forEach((n, idx) => {
    const bassStr = Math.max(1, Math.min(4, n.string)) as 1 | 2 | 3 | 4;
    playBassPluck(bassStr, n.fret, {
      durationSec: articulation === 'palmMute' ? 0.22 : 1.15,
      volume: perNoteVol,
      delaySec: idx * 0.012,
      articulation,
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
    const out = getMetronomeOutputNode(ctx);
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
      gain.connect(out);
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
      nGain.connect(out);
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
      nGain.connect(out);
      noise.start(safeTime);
      noise.stop(safeTime + 0.016);

      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(bodyFreq, safeTime);
      const oGain = ctx.createGain();
      oGain.gain.setValueAtTime(amp * 0.42, safeTime);
      oGain.gain.exponentialRampToValueAtTime(0.001, safeTime + 0.016);
      osc.connect(oGain);
      oGain.connect(out);
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
        hGain.connect(out);
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
      bGain.connect(out);
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
      sGain.connect(out);
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
    gain1.connect(out);
    gain2.connect(out);
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

export type DroneQuality = 'minor' | 'major' | 'power';

interface ActiveDroneState {
  ctx: AudioContext;
  rootOsc: OscillatorNode;
  fifthOsc: OscillatorNode;
  colorOsc: OscillatorNode;
  colorGain: GainNode;
  masterGain: GainNode;
  stopTimer: number | null;
}

let activeDrone: ActiveDroneState | null = null;

const NOTE_BASE_HZ_MAP: Record<string, number> = {
  E: 82.4069,
  F: 87.3071,
  'F#': 92.4986,
  Gb: 92.4986,
  G: 97.9989,
  'G#': 103.8262,
  Ab: 103.8262,
  A: 110.0,
  'A#': 116.5409,
  Bb: 116.5409,
  B: 123.4708,
  C: 130.8128,
  'C#': 138.5913,
  Db: 138.5913,
  D: 146.8324,
  'D#': 155.5635,
  Eb: 155.5635,
};

export function resolveChordDroneParams(
  chordLabel?: string,
  transposeSemitones = 0
): { rootHz: number; quality: DroneQuality } {
  const defaultRoot = 110.0 * Math.pow(2, transposeSemitones / 12);
  if (!chordLabel) {
    return { rootHz: defaultRoot, quality: 'minor' };
  }

  // Extract chord token e.g. "i (Am)" -> "Am", "VI (Fmaj7)" -> "Fmaj7", "Am" -> "Am"
  const parenMatch = chordLabel.match(/\(([^)]+)\)/);
  const rawToken = (parenMatch ? parenMatch[1] : chordLabel).trim();
  const rootMatch = rawToken.match(/^([A-G][#b]?)/);
  const baseHz = rootMatch
    ? NOTE_BASE_HZ_MAP[rootMatch[1]] ?? 110.0
    : 110.0;

  let quality: DroneQuality = 'major';
  if (
    rawToken.includes('5') ||
    rawToken.includes('°') ||
    rawToken.toLowerCase().includes('dim')
  ) {
    quality = 'power';
  } else if (/^[A-G][#b]?m(?!aj)/i.test(rawToken)) {
    quality = 'minor';
  }

  return {
    rootHz: baseHz * Math.pow(2, transposeSemitones / 12),
    quality,
  };
}

function getDroneColorFreq(rootHz: number, quality: DroneQuality): number {
  if (quality === 'minor') return rootHz * 2 * Math.pow(2, 3 / 12);
  if (quality === 'major') return rootHz * 2 * Math.pow(2, 4 / 12);
  return rootHz * 2;
}

export function stopBackingDrone(): void {
  const d = activeDrone;
  if (!d) return;
  activeDrone = null;
  if (d.stopTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(d.stopTimer);
  }
  try {
    const now = d.ctx.currentTime;
    d.masterGain.gain.cancelScheduledValues(now);
    d.masterGain.gain.setValueAtTime(
      Math.max(0.0001, d.masterGain.gain.value),
      now
    );
    d.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
    const cleanup = () => {
      try {
        d.rootOsc.stop();
        d.fifthOsc.stop();
        d.colorOsc.stop();
        d.rootOsc.disconnect();
        d.fifthOsc.disconnect();
        d.colorOsc.disconnect();
        d.masterGain.disconnect();
      } catch {
        // ignore
      }
    };
    if (typeof window !== 'undefined') {
      window.setTimeout(cleanup, 170);
    } else {
      cleanup();
    }
  } catch {
    // ignore
  }
}

export function updateBackingDrone(
  rootHz: number,
  quality: DroneQuality = 'minor'
): void {
  const ctx = getAudioContext();
  if (!ctx || (ctx.state as string) === 'closed') return;
  if (!activeDrone || activeDrone.ctx !== ctx) {
    startBackingDrone(rootHz, quality);
    return;
  }
  try {
    const now = ctx.currentTime;
    activeDrone.rootOsc.frequency.setTargetAtTime(rootHz, now, 0.045);
    activeDrone.fifthOsc.frequency.setTargetAtTime(rootHz * 1.4983, now, 0.045);
    activeDrone.colorOsc.frequency.setTargetAtTime(
      getDroneColorFreq(rootHz, quality),
      now,
      0.045
    );
    activeDrone.colorGain.gain.setTargetAtTime(
      quality === 'power' ? 0.12 : 0.18,
      now,
      0.045
    );
  } catch {
    // ignore
  }
}

export function startBackingDrone(
  rootHz: number,
  quality: DroneQuality = 'minor'
): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (activeDrone && activeDrone.ctx === ctx) {
      updateBackingDrone(rootHz, quality);
      return;
    }
    stopBackingDrone();

    const now = ctx.currentTime;
    const rootOsc = ctx.createOscillator();
    rootOsc.type = 'triangle';
    rootOsc.frequency.setValueAtTime(rootHz, now);

    const fifthOsc = ctx.createOscillator();
    fifthOsc.type = 'sine';
    fifthOsc.frequency.setValueAtTime(rootHz * 1.4983, now);

    const colorOsc = ctx.createOscillator();
    colorOsc.type = 'sine';
    colorOsc.frequency.setValueAtTime(getDroneColorFreq(rootHz, quality), now);

    const rootGain = ctx.createGain();
    rootGain.gain.setValueAtTime(0.46, now);

    const fifthGain = ctx.createGain();
    fifthGain.gain.setValueAtTime(0.28, now);

    const colorGain = ctx.createGain();
    colorGain.gain.setValueAtTime(quality === 'power' ? 0.12 : 0.18, now);

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(420, now);
    lp.Q.setValueAtTime(0.7, now);

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.exponentialRampToValueAtTime(0.068, now + 0.28);

    rootOsc.connect(rootGain);
    fifthOsc.connect(fifthGain);
    colorOsc.connect(colorGain);
    rootGain.connect(lp);
    fifthGain.connect(lp);
    colorGain.connect(lp);
    lp.connect(masterGain);
    masterGain.connect(ctx.destination);

    rootOsc.start(now);
    fifthOsc.start(now);
    colorOsc.start(now);

    activeDrone = {
      ctx,
      rootOsc,
      fifthOsc,
      colorOsc,
      colorGain,
      masterGain,
      stopTimer: null,
    };
  } catch {
    // ignore in restricted environments
  }
}
