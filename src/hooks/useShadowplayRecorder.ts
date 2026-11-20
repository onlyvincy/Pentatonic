import { useCallback, useEffect, useRef, useState } from 'react';
import { ShadowplayMode } from '../types/practice';
import {
  fillKarplusStrongPluck,
  getSharedAudioContext,
  unlockSharedAudioContext,
} from '../utils/guitarSynth';

export interface CapturedTake {
  blob: Blob;
  url: string;
  mediaType: 'audio' | 'video';
  durationSec: number;
  isFallback: boolean;
}

function encodePcm16WavBlob(samples: Float32Array, sampleRate: number): Blob {
  const totalSamples = samples.length;
  const buffer = new ArrayBuffer(44 + totalSamples * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(off + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + totalSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, totalSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < totalSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function mergePcmChunks(chunks: Float32Array[]): Float32Array {
  const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
  const out = new Float32Array(totalLen);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}

function generateGuitarFallbackWavBlob(durationSec: number, bpm = 100): Blob {
  const safeDuration = Math.max(2, Math.min(12, Math.round(durationSec)));
  const sampleRate = 22050;
  const totalSamples = sampleRate * safeDuration;
  const samples = new Float32Array(totalSamples);
  const scaleFreqs = [220, 261.63, 293.66, 329.63, 392.0, 440.0];
  const noteInterval = 60 / Math.max(60, bpm) / 2;

  let idx = 0;
  for (let t = 0.05; t < safeDuration - 0.15; t += noteInterval) {
    const freq = scaleFreqs[idx % scaleFreqs.length];
    const start = Math.floor(t * sampleRate);
    const len = Math.min(totalSamples - start, Math.floor(sampleRate * 0.9));
    if (len > 32) {
      const noteBuf = new Float32Array(len);
      fillKarplusStrongPluck(noteBuf, sampleRate, freq);
      for (let i = 0; i < len; i++) {
        samples[start + i] += noteBuf[i] * 0.48;
      }
    }
    idx++;
  }

  return encodePcm16WavBlob(samples, sampleRate);
}

export function useShadowplayRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [isFallbackStream, setIsFallbackStream] = useState(false);
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [lastCapturedTake, setLastCapturedTake] = useState<CapturedTake | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<BlobPart[]>([]);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const pcmSampleRateRef = useRef<number>(44100);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const zeroGainNodeRef = useRef<GainNode | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);
  const activeModeRef = useRef<ShadowplayMode>('off');
  const fallbackModeRef = useRef<boolean>(false);

  const cleanupPipeline = useCallback(() => {
    try {
      processorNodeRef.current?.disconnect();
    } catch {
      // Ignore already disconnected node
    }
    try {
      sourceNodeRef.current?.disconnect();
    } catch {
      // Ignore already disconnected node
    }
    try {
      zeroGainNodeRef.current?.disconnect();
    } catch {
      // Ignore already disconnected node
    }
    processorNodeRef.current = null;
    sourceNodeRef.current = null;
    zeroGainNodeRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setLiveStream(null);
  }, []);

  const discardPreview = useCallback(() => {
    setLastCapturedTake((prev) => {
      if (prev?.url) {
        URL.revokeObjectURL(prev.url);
      }
      return null;
    });
  }, []);

  const startCapture = useCallback(
    async (mode: ShadowplayMode) => {
      discardPreview();
      cleanupPipeline();
      activeModeRef.current = mode;

      if (mode === 'off') {
        setIsRecording(false);
        setIsFallbackStream(false);
        setStatusMessage(null);
        return;
      }

      startTimeRef.current = performance.now();
      mediaChunksRef.current = [];
      pcmChunksRef.current = [];

      let stream: MediaStream | null = null;
      let usingFallback = false;

      // Critical for guitar: disable WebRTC speech echoCancellation/noiseSuppression/AGC
      // which cause severe robotic/metallic artifacts on sustained strings.
      const rawAudioConstraints: MediaTrackConstraints = {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      };

      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          try {
            stream = await navigator.mediaDevices.getUserMedia(
              mode === 'video'
                ? {
                    audio: rawAudioConstraints,
                    video: {
                      facingMode: 'user',
                      width: { ideal: 640 },
                      height: { ideal: 360 },
                    },
                  }
                : { audio: rawAudioConstraints }
            );
          } catch {
            // Fallback to default constraints if strict raw flags are rejected
            stream = await navigator.mediaDevices.getUserMedia(
              mode === 'video' ? { audio: true, video: true } : { audio: true }
            );
          }
        } else {
          throw new Error('MediaDevices unavailable');
        }
      } catch {
        usingFallback = true;
        setStatusMessage(
          'Microfono non disponibile o bloccato: usa i permessi browser per registrare la chitarra.'
        );
        stream = null;
      }

      fallbackModeRef.current = usingFallback;
      setIsFallbackStream(usingFallback);
      streamRef.current = stream;

      if (!usingFallback && mode === 'video' && stream) {
        setLiveStream(stream);
      } else {
        setLiveStream(null);
      }

      // Preferred uncompressed 16-bit PCM WAV capture for guitar audio
      if (stream && mode === 'audio') {
        try {
          await unlockSharedAudioContext();
          const ctx = getSharedAudioContext();
          if (ctx) {
            pcmSampleRateRef.current = ctx.sampleRate;
            const source = ctx.createMediaStreamSource(stream);
            const processor = ctx.createScriptProcessor(4096, 1, 1);
            const zeroGain = ctx.createGain();
            zeroGain.gain.value = 0;

            processor.onaudioprocess = (ev) => {
              const input = ev.inputBuffer.getChannelData(0);
              pcmChunksRef.current.push(new Float32Array(input));
            };

            source.connect(processor);
            processor.connect(zeroGain);
            zeroGain.connect(ctx.destination);

            sourceNodeRef.current = source;
            processorNodeRef.current = processor;
            zeroGainNodeRef.current = zeroGain;
            mediaRecorderRef.current = null;
            setIsRecording(true);
            setStatusMessage('Registrazione WAV PCM raw attiva');
            return;
          }
        } catch {
          // Fall through to MediaRecorder if Web Audio capture fails
        }
      }

      if (stream && typeof MediaRecorder !== 'undefined') {
        try {
          const preferredMime =
            mode === 'video' && !usingFallback
              ? MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
                ? 'video/webm;codecs=vp8,opus'
                : 'video/webm'
              : MediaRecorder.isTypeSupported('audio/mp4')
              ? 'audio/mp4'
              : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
              ? 'audio/webm;codecs=opus'
              : '';

          const recorder = preferredMime
            ? new MediaRecorder(stream, {
                mimeType: preferredMime,
                audioBitsPerSecond: 192000,
              })
            : new MediaRecorder(stream);

          recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) {
              mediaChunksRef.current.push(ev.data);
            }
          };

          recorder.start(500);
          mediaRecorderRef.current = recorder;
          setIsRecording(true);
          if (!usingFallback) {
            setStatusMessage(
              mode === 'video'
                ? 'Video+Audio attivo in background'
                : 'Registrazione Audio attiva'
            );
          }
          return;
        } catch {
          // Fall through to simulated fallback
        }
      }

      mediaRecorderRef.current = null;
      setIsRecording(true);
    },
    [cleanupPipeline, discardPreview]
  );

  const stopCapture = useCallback(
    async (bpmHint = 100): Promise<CapturedTake | null> => {
      const mode = activeModeRef.current;
      if (mode === 'off') {
        setIsRecording(false);
        cleanupPipeline();
        return null;
      }

      const elapsedSec = Math.max(
        1,
        Math.round((performance.now() - startTimeRef.current) / 1000)
      );
      const isFallback = fallbackModeRef.current;
      const effectiveMediaType: 'audio' | 'video' =
        mode === 'video' && !isFallback ? 'video' : 'audio';

      let finalBlob: Blob | null = null;

      if (!isFallback && pcmChunksRef.current.length > 0 && mode === 'audio') {
        const merged = mergePcmChunks(pcmChunksRef.current);
        finalBlob = encodePcm16WavBlob(merged, pcmSampleRateRef.current);
      } else {
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
          finalBlob = await new Promise<Blob | null>((resolve) => {
            recorder.onstop = () => {
              if (mediaChunksRef.current.length > 0 && !isFallback) {
                const mimeType =
                  recorder.mimeType ||
                  (effectiveMediaType === 'video' ? 'video/webm' : 'audio/webm');
                resolve(new Blob(mediaChunksRef.current, { type: mimeType }));
              } else {
                resolve(generateGuitarFallbackWavBlob(elapsedSec, bpmHint));
              }
            };
            try {
              recorder.stop();
            } catch {
              resolve(generateGuitarFallbackWavBlob(elapsedSec, bpmHint));
            }
          });
        } else {
          finalBlob = generateGuitarFallbackWavBlob(elapsedSec, bpmHint);
        }
      }

      mediaRecorderRef.current = null;
      pcmChunksRef.current = [];
      setIsRecording(false);
      cleanupPipeline();

      if (!finalBlob) return null;

      const url = URL.createObjectURL(finalBlob);
      const take: CapturedTake = {
        blob: finalBlob,
        url,
        mediaType: effectiveMediaType,
        durationSec: elapsedSec,
        isFallback,
      };
      setLastCapturedTake(take);
      return take;
    },
    [cleanupPipeline]
  );

  useEffect(() => {
    return () => {
      cleanupPipeline();
    };
  }, [cleanupPipeline]);

  return {
    isRecording,
    isFallbackStream,
    liveStream,
    lastCapturedTake,
    statusMessage,
    startCapture,
    stopCapture,
    discardPreview,
  };
}
