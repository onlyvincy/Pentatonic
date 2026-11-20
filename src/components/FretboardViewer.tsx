import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DemoStep, FretNote, MetronomeSoundId } from '../types/practice';
import { Play, Square } from 'lucide-react';
import {
  STRING_LABEL_MAP,
  STRING_SHORT_MAP,
  getSharedAudioContext,
  playGuitarFrequency,
  playGuitarPluck,
  playGuitarStep,
  playSoftMetronomeTick,
} from '../utils/guitarSynth';

export type FretboardDemoMode = 'slow-intro' | 'live-loop' | 'manual';

interface FretboardViewerProps {
  notes: FretNote[];
  demoSequence?: DemoStep[];
  coachingCues?: string[];
  interactive?: boolean;
  forceStopDemo?: boolean;
  /** 'stage' = full-screen focused animated demo; 'compact' = clean minimal view */
  variant?: 'stage' | 'compact';
  /** Demo pacing & loop behavior */
  demoMode?: FretboardDemoMode;
  /** External sample-accurate tick index from the Web Audio metronome scheduler */
  externalStepTick?: number | null;
  /** Active quarter beat (1..4) from metronome for visual beat-sync pulse */
  currentBeat?: number;
  /** Active subdivision label (e.g. '1/8') */
  subdivisionLabel?: string;
  /** Metronome click preset used during slow demo */
  metronomeSound?: MetronomeSoundId;
  /** Custom string labels (e.g. ['e','C','G','C','A','F'] for FACGCE tuning) */
  stringLabels?: readonly [string, string, string, string, string, string];
  /** Custom open-string frequencies in Hz for alternate tunings */
  customStringFreqs?: Record<1 | 2 | 3 | 4 | 5 | 6, number>;
  /** Mute synthetic guitar audio (e.g., while mic recording & metronome run in live play) */
  muteAudio?: boolean;
  /** Target BPM used to synchronize slow-intro & live-loop pacing */
  bpm?: number;
  /** Hides the manual Demo button in compact mode when not needed */
  hideDemoButton?: boolean;
  /** Automatically plays the guitar demo sequence on mount (used in full-screen stage) */
  autoPlayDemo?: boolean;
  /** Callback fired once slow-intro demo finishes */
  onDemoComplete?: () => void;
  /** Incrementing key to replay autoPlayDemo from step 0 */
  replayKey?: number;
  onToggleNote?: (stringNum: 1 | 2 | 3 | 4 | 5 | 6, fret: number) => void;
}

type LabelMode = 'fingers' | 'intervals';

const DEFAULT_STRING_NAMES = ['e', 'B', 'G', 'D', 'A', 'E'] as const;
const INLAY_FRETS = [3, 5, 7, 9, 12, 15];
const BAR_8_LABELS = ['1', '&', '2', '&', '3', '&', '4', '&'] as const;

function formatStepMinimal(step: DemoStep): string {
  if (step.muted || step.notes.length === 0) {
    return step.technique || 'Stoppata';
  }
  if (step.sustain) {
    return step.technique
      ? `${step.technique} (Lascia suonare)`
      : 'Tenuta (Lascia suonare)';
  }
  if (step.notes.length > 1) {
    return step.technique || 'Accordo';
  }
  const n = step.notes[0];
  const finger = n.finger ? ` • Dito ${n.finger}` : '';
  const tech = step.technique ? ` • ${step.technique}` : '';
  return `Corda ${STRING_LABEL_MAP[n.string]} • Tasto ${n.fret}${finger}${tech}`;
}

export const FretboardViewer: React.FC<FretboardViewerProps> = ({
  notes,
  demoSequence,
  interactive = false,
  forceStopDemo = false,
  variant = 'compact',
  demoMode = 'manual',
  externalStepTick,
  currentBeat,
  subdivisionLabel,
  metronomeSound = 'woodblock',
  stringLabels = DEFAULT_STRING_NAMES,
  customStringFreqs,
  muteAudio = false,
  bpm = 90,
  hideDemoButton = false,
  autoPlayDemo = false,
  onDemoComplete,
  replayKey = 0,
  onToggleNote,
}) => {
  const [labelMode, setLabelMode] = useState<LabelMode>('fingers');
  const [isPlayingDemo, setIsPlayingDemo] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const [introPass, setIntroPass] = useState<1 | 2>(1);
  const [clickedNoteKey, setClickedNoteKey] = useState<string | null>(null);

  const rafRef = useRef<number | null>(null);
  const endTimeoutRef = useRef<number | null>(null);
  const clickTimeoutRef = useRef<number | null>(null);
  const onDemoCompleteRef = useRef(onDemoComplete);
  onDemoCompleteRef.current = onDemoComplete;

  const effectiveSteps: DemoStep[] = useMemo(() => {
    if (demoSequence && demoSequence.length > 0) return demoSequence;
    return notes.map((n) => ({ notes: [n] }));
  }, [demoSequence, notes]);

  // Steady didactic half-time tempo in 1/8 subdivision (2 notes per metronome beat)
  const slowBpm = 56;

  const clearTimers = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (endTimeoutRef.current !== null) {
      window.clearTimeout(endTimeoutRef.current);
      endTimeoutRef.current = null;
    }
  }, []);

  const stopDemo = useCallback(() => {
    clearTimers();
    setIsPlayingDemo(false);
    setActiveStepIndex(null);
    setIntroPass(1);
  }, [clearTimers]);

  const playNoteForTuning = useCallback(
    (stringNum: 1 | 2 | 3 | 4 | 5 | 6, fret: number) => {
      if (customStringFreqs) {
        const freq = customStringFreqs[stringNum] * Math.pow(2, fret / 12);
        playGuitarFrequency(freq, { durationSec: 1.25, volume: 0.54 });
      } else {
        playGuitarPluck(stringNum, fret, { durationSec: 1.25, volume: 0.54 });
      }
    },
    [customStringFreqs]
  );

  const triggerStepAudio = useCallback(
    (index: number, withSoftMetronome = false) => {
      const step = effectiveSteps[index];
      if (!step || muteAudio) return;
      if (withSoftMetronome && index % 2 === 0) {
        playSoftMetronomeTick(index % 8 === 0, metronomeSound);
      }
      if (customStringFreqs && !step.sustain && !step.muted && step.notes.length > 0) {
        step.notes.forEach((n, idx) => {
          const freq = customStringFreqs[n.string] * Math.pow(2, n.fret / 12);
          playGuitarFrequency(freq, {
            durationSec: 1.25,
            volume: step.notes.length > 1 ? 0.32 : 0.54,
            delaySec: idx * 0.016,
          });
        });
      } else {
        playGuitarStep(step.notes, step.muted, step.sustain);
      }
    },
    [effectiveSteps, muteAudio, metronomeSound, customStringFreqs]
  );

  const startDemo = useCallback(
    (modeOverride?: FretboardDemoMode) => {
      const mode = modeOverride ?? demoMode;
      if (effectiveSteps.length === 0) {
        if (mode === 'slow-intro') onDemoCompleteRef.current?.();
        return;
      }
      clearTimers();
      setIsPlayingDemo(true);

      const getNowSec = () => {
        const ctx = getSharedAudioContext();
        return ctx && ctx.state === 'running'
          ? ctx.currentTime
          : performance.now() / 1000;
      };

      if (mode === 'slow-intro') {
        const stepSec = 60 / slowBpm / 2;
        const totalStepsPerPass = effectiveSteps.length;
        const startAnchor = getNowSec();
        let lastTriggeredTotalIdx = 0;

        setIntroPass(1);
        setActiveStepIndex(0);
        triggerStepAudio(0, true);

        const loopSlow = () => {
          const elapsed = Math.max(0, getNowSec() - startAnchor);
          const totalIdx = Math.floor(elapsed / stepSec);

          if (totalIdx >= totalStepsPerPass * 2) {
            clearTimers();
            endTimeoutRef.current = window.setTimeout(() => {
              setIsPlayingDemo(false);
              setActiveStepIndex(null);
              setIntroPass(1);
              onDemoCompleteRef.current?.();
            }, Math.round(stepSec * 400));
            return;
          }

          if (totalIdx !== lastTriggeredTotalIdx) {
            lastTriggeredTotalIdx = totalIdx;
            const pass: 1 | 2 = totalIdx >= totalStepsPerPass ? 2 : 1;
            const stepIdx = totalIdx % totalStepsPerPass;
            setIntroPass(pass);
            setActiveStepIndex(stepIdx);
            triggerStepAudio(stepIdx, true);
          }

          rafRef.current = window.requestAnimationFrame(loopSlow);
        };

        rafRef.current = window.requestAnimationFrame(loopSlow);
        return;
      }

      if (mode === 'live-loop') {
        const beatSec = 60 / Math.max(40, Math.min(240, bpm));
        const stepSec = Math.max(0.24, Math.min(0.6, beatSec / 2));
        const startAnchor = getNowSec();
        let lastIdx = 0;

        setActiveStepIndex(0);
        triggerStepAudio(0);

        const loopLive = () => {
          const elapsed = Math.max(0, getNowSec() - startAnchor);
          const totalIdx = Math.floor(elapsed / stepSec);
          if (totalIdx !== lastIdx) {
            lastIdx = totalIdx;
            const idx = totalIdx % effectiveSteps.length;
            setActiveStepIndex(idx);
            triggerStepAudio(idx);
          }
          rafRef.current = window.requestAnimationFrame(loopLive);
        };

        rafRef.current = window.requestAnimationFrame(loopLive);
        return;
      }

      // 'manual' mode: 1/8 note pace synced to BPM on audio clock
      const stepSec = Math.max(0.24, Math.min(0.55, 60 / bpm / 2));
      const startAnchor = getNowSec();
      let lastIdx = 0;

      setActiveStepIndex(0);
      triggerStepAudio(0);

      const loopManual = () => {
        const elapsed = Math.max(0, getNowSec() - startAnchor);
        const idx = Math.floor(elapsed / stepSec);

        if (idx >= effectiveSteps.length) {
          clearTimers();
          endTimeoutRef.current = window.setTimeout(() => {
            setIsPlayingDemo(false);
            setActiveStepIndex(null);
          }, 360);
          return;
        }

        if (idx !== lastIdx) {
          lastIdx = idx;
          setActiveStepIndex(idx);
          triggerStepAudio(idx);
        }
        rafRef.current = window.requestAnimationFrame(loopManual);
      };

      rafRef.current = window.requestAnimationFrame(loopManual);
    },
    [effectiveSteps, demoMode, bpm, clearTimers, triggerStepAudio]
  );

  useEffect(() => {
    if (forceStopDemo) {
      stopDemo();
    }
  }, [forceStopDemo, stopDemo]);

  // Synchronous render-time resolution when driven externally by Web Audio clock (0ms React lag)
  const usesExternalClock =
    demoMode === 'live-loop' && externalStepTick !== undefined;

  const effectiveActiveStepIndex: number | null = usesExternalClock
    ? !forceStopDemo && externalStepTick !== null && effectiveSteps.length > 0
      ? externalStepTick % effectiveSteps.length
      : null
    : activeStepIndex;

  // Trigger optional audio only when step changes under external clock
  useEffect(() => {
    if (!usesExternalClock) return;
    clearTimers();
    if (effectiveActiveStepIndex === null || muteAudio) return;
    const step = effectiveSteps[effectiveActiveStepIndex];
    if (step) {
      playGuitarStep(step.notes, step.muted, step.sustain);
    }
  }, [
    usesExternalClock,
    effectiveActiveStepIndex,
    effectiveSteps,
    muteAudio,
    clearTimers,
  ]);

  // Internal auto-start only when not driven by external metronome clock
  useEffect(() => {
    if (usesExternalClock) return;

    const shouldAutoRun = autoPlayDemo || demoMode === 'live-loop';
    if (!shouldAutoRun || forceStopDemo) return;
    const kick = window.setTimeout(() => {
      startDemo(demoMode === 'live-loop' ? 'live-loop' : 'slow-intro');
    }, 30);
    return () => {
      window.clearTimeout(kick);
      stopDemo();
    };
  }, [
    usesExternalClock,
    autoPlayDemo,
    demoMode,
    forceStopDemo,
    replayKey,
    startDemo,
    stopDemo,
  ]);

  useEffect(() => {
    return () => {
      clearTimers();
      if (clickTimeoutRef.current !== null) {
        window.clearTimeout(clickTimeoutRef.current);
      }
    };
  }, [clearTimers]);

  const handlePreviewSingleNote = (note: FretNote) => {
    const key = `${note.string}-${note.fret}`;
    setClickedNoteKey(key);
    playNoteForTuning(note.string, note.fret);
    if (clickTimeoutRef.current !== null) {
      window.clearTimeout(clickTimeoutRef.current);
    }
    clickTimeoutRef.current = window.setTimeout(() => {
      setClickedNoteKey(null);
    }, 420);
  };

  const activeStep =
    effectiveActiveStepIndex !== null
      ? effectiveSteps[effectiveActiveStepIndex] ?? null
      : null;

  const isSustainedStep = Boolean(activeStep?.sustain);

  const activeNoteKeys = useMemo(() => {
    const set = new Set<string>();
    if (activeStep && !activeStep.muted) {
      activeStep.notes.forEach((n) => set.add(`${n.string}-${n.fret}`));
    }
    if (clickedNoteKey) {
      set.add(clickedNoteKey);
    }
    return set;
  }, [activeStep, clickedNoteKey]);

  const activeStringNumbers = useMemo(() => {
    const set = new Set<number>();
    if (activeStep && !activeStep.muted) {
      activeStep.notes.forEach((n) => set.add(n.string));
    }
    if (clickedNoteKey) {
      const s = Number(clickedNoteKey.split('-')[0]);
      if (!Number.isNaN(s)) set.add(s);
    }
    return set;
  }, [activeStep, clickedNoteKey]);

  // Tight targeted auto-zoom around the exercise's active frets so mobile views fit 100% on-screen
  const fretRange = useMemo(() => {
    if (interactive || notes.length === 0) {
      return { start: 1, end: 15 };
    }
    const allFrets = [
      ...notes.map((n) => n.fret),
      ...effectiveSteps.flatMap((s) => s.notes.map((n) => n.fret)),
    ].filter((f) => f > 0);
    if (allFrets.length === 0) {
      return { start: 1, end: 5 };
    }
    const minFret = Math.min(...allFrets);
    const maxFret = Math.max(...allFrets);
    const start = Math.max(1, minFret);
    const end = Math.min(15, Math.max(start + 3, maxFret));
    return { start, end };
  }, [notes, effectiveSteps, interactive]);

  const fretCount = fretRange.end - fretRange.start + 1;
  const leftPad = 28;
  const rightPad = 12;
  const topPad = 22;
  const bottomPad = 28;
  const fretWidth = interactive
    ? 44
    : fretCount <= 4
    ? 86
    : fretCount <= 6
    ? 68
    : 56;
  const stringGap = interactive
    ? 22
    : variant === 'stage'
    ? 30
    : 25;

  const width = leftPad + fretCount * fretWidth + rightPad;
  const height = topPad + 5 * stringGap + bottomPad;

  const noteMap = useMemo(() => {
    const map = new Map<string, FretNote>();
    notes.forEach((n) => {
      map.set(`${n.string}-${n.fret}`, n);
    });
    return map;
  }, [notes]);

  const svgFilterId = variant === 'stage' ? 'fret-glow-stage' : 'fret-glow-compact';
  const effectivePlayingVisual =
    usesExternalClock ? effectiveActiveStepIndex !== null : isPlayingDemo;

  const fretboardSvg = (
    <div className={interactive ? 'w-full max-w-full overflow-x-auto' : 'w-full max-w-full overflow-hidden'}>
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        className={`w-full max-w-full h-auto block select-none ${
          interactive ? 'min-w-[480px] max-h-[210px]' : ''
        }`}
        role="img"
        aria-label="Tastiera chitarra auto-zoom"
      >
        <defs>
          <filter id={svgFilterId} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Minimal hairline outer frame */}
        <rect
          x={leftPad}
          y={topPad - 10}
          width={fretCount * fretWidth}
          height={5 * stringGap + 20}
          rx={10}
          fill="#000000"
          stroke="rgba(255,255,255,0.14)"
          strokeWidth={1}
        />

        {/* Crisp white nut at fret 1 */}
        {fretRange.start === 1 && (
          <rect
            x={leftPad - 2}
            y={topPad - 10}
            width={3.5}
            height={5 * stringGap + 20}
            rx={1.5}
            fill="#FFFFFF"
          />
        )}

        {/* Minimal fret wires & understated inlays */}
        {Array.from({ length: fretCount }, (_, i) => {
          const fretNum = fretRange.start + i;
          const xRight = leftPad + (i + 1) * fretWidth;
          const xCenter = leftPad + i * fretWidth + fretWidth / 2;
          const hasInlay = INLAY_FRETS.includes(fretNum);
          const isDouble = fretNum === 12;

          return (
            <g key={fretNum}>
              {i < fretCount - 1 && (
                <line
                  x1={xRight}
                  y1={topPad - 10}
                  x2={xRight}
                  y2={topPad + 5 * stringGap + 10}
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth={1}
                />
              )}
              {hasInlay && !isDouble && (
                <circle
                  cx={xCenter}
                  cy={topPad + 2.5 * stringGap}
                  r={3.5}
                  fill="rgba(255,255,255,0.12)"
                />
              )}
              {isDouble && (
                <>
                  <circle
                    cx={xCenter}
                    cy={topPad + 1.5 * stringGap}
                    r={3.2}
                    fill="rgba(255,255,255,0.12)"
                  />
                  <circle
                    cx={xCenter}
                    cy={topPad + 3.5 * stringGap}
                    r={3.2}
                    fill="rgba(255,255,255,0.12)"
                  />
                </>
              )}
              <text
                x={xCenter}
                y={height - 6}
                textAnchor="middle"
                fontSize={10.5}
                fontWeight={700}
                fill="rgba(255,255,255,0.48)"
                className="tabular-nums"
              >
                {fretNum}
              </text>
            </g>
          );
        })}

        {/* Strings & Zoomed Interactive Notes */}
        {stringLabels.map((name, idx) => {
          const stringNum = (idx + 1) as 1 | 2 | 3 | 4 | 5 | 6;
          const y = topPad + idx * stringGap;
          const thickness = 0.85 + idx * 0.28;
          const isStringLit = activeStringNumbers.has(stringNum);

          return (
            <g key={`${idx}-${name}`}>
              <text
                x={12}
                y={y + 4}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill={isStringLit ? '#FF6B00' : 'rgba(255,255,255,0.45)'}
              >
                {name}
              </text>
              <line
                x1={leftPad}
                y1={y}
                x2={leftPad + fretCount * fretWidth}
                y2={y}
                stroke={
                  isStringLit ? 'rgba(255,107,0,0.88)' : 'rgba(255,255,255,0.24)'
                }
                strokeWidth={isStringLit ? thickness + 0.8 : thickness}
              />

              {Array.from({ length: fretCount }, (_, fIdx) => {
                const fretNum = fretRange.start + fIdx;
                const cx = leftPad + fIdx * fretWidth + fretWidth / 2;
                const noteKey = `${stringNum}-${fretNum}`;
                const note = noteMap.get(noteKey);
                const isHighlighted = activeNoteKeys.has(noteKey);
                const isDimmed =
                  (effectivePlayingVisual || effectiveActiveStepIndex !== null) &&
                  !isHighlighted;

                const textLabel =
                  labelMode === 'fingers'
                    ? note?.finger || '•'
                    : note?.label || (note?.isRoot ? 'R' : '•');

                const baseRadius = interactive ? 9 : fretCount <= 4 ? 12 : 11;
                const litRadius = interactive ? 12 : fretCount <= 4 ? 16 : 14.5;

                return (
                  <g
                    key={noteKey}
                    className={interactive || note ? 'cursor-pointer' : undefined}
                    onClick={() => {
                      if (interactive && onToggleNote) {
                        onToggleNote(stringNum, fretNum);
                        playNoteForTuning(stringNum, fretNum);
                      } else if (note) {
                        handlePreviewSingleNote(note);
                      }
                    }}
                  >
                    {interactive && (
                      <circle cx={cx} cy={y} r={14} fill="transparent" />
                    )}
                    {note && (
                      <g
                        style={{
                          opacity: isDimmed ? 0.24 : 1,
                        }}
                      >
                        {isHighlighted && (
                          <>
                            <circle
                              cx={cx}
                              cy={y}
                              r={litRadius + 6}
                              fill={
                                isSustainedStep
                                  ? 'rgba(255,255,255,0.14)'
                                  : 'rgba(255,107,0,0.2)'
                              }
                              stroke={isSustainedStep ? '#FFFFFF' : '#FF6B00'}
                              strokeWidth={isSustainedStep ? 2 : 1.5}
                              strokeDasharray={isSustainedStep ? '4 3' : undefined}
                              filter={`url(#${svgFilterId})`}
                            />
                            <circle
                              cx={cx}
                              cy={y}
                              r={litRadius}
                              fill="#FF6B00"
                              stroke="#FFFFFF"
                              strokeWidth={2}
                            />
                          </>
                        )}
                        {!isHighlighted && (
                          <circle
                            cx={cx}
                            cy={y}
                            r={baseRadius}
                            fill="#000000"
                            stroke={
                              note.isRoot
                                ? 'rgba(255,107,0,0.88)'
                                : 'rgba(255,255,255,0.68)'
                            }
                            strokeWidth={note.isRoot ? 2 : 1.4}
                          />
                        )}
                        <text
                          x={cx}
                          y={y + 4.2}
                          textAnchor="middle"
                          fontSize={isHighlighted ? 12.5 : 10.5}
                          fontWeight={800}
                          fill={isHighlighted ? '#000000' : '#FFFFFF'}
                        >
                          {textLabel}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );

  // Instant 0ms highlight 8-slot 4/4 cyclic rhythm grid
  const rhythmGridBar =
    !interactive && effectiveSteps.length > 0 && effectiveSteps.length <= 16 ? (
      <div className="grid grid-cols-8 gap-1 w-full min-w-0">
        {effectiveSteps.slice(0, 8).map((step, idx) => {
          const isActive = effectiveActiveStepIndex === idx;
          const slotLabel = BAR_8_LABELS[idx] ?? String(idx + 1);
          const isDownbeat = idx % 2 === 0;
          const symbol = step.sustain
            ? '—'
            : step.muted || step.notes.length === 0
            ? '×'
            : '●';

          return (
            <div
              key={idx}
              className={`min-w-0 flex flex-col items-center justify-center rounded-lg border py-1 text-[10px] font-bold tabular-nums ${
                isActive
                  ? 'border-[#FF6B00] bg-[#FF6B00] text-black'
                  : isDownbeat
                  ? 'border-white/15 bg-black text-white/75'
                  : 'border-white/10 bg-black text-white/40'
              }`}
            >
              <span className="leading-none">{slotLabel}</span>
              <span className="mt-0.5 text-[9px] leading-none">{symbol}</span>
            </div>
          );
        })}
      </div>
    ) : null;

  // FULL-SCREEN STAGE VARIANT
  if (variant === 'stage') {
    const progressPct =
      effectiveActiveStepIndex !== null && effectiveSteps.length > 0
        ? Math.round(((effectiveActiveStepIndex + 1) / effectiveSteps.length) * 100)
        : 0;
    const stageBeatIdx =
      effectiveActiveStepIndex !== null
        ? Math.floor(effectiveActiveStepIndex / 2) % 4
        : -1;

    return (
      <div className="w-full min-w-0 max-w-full space-y-4">
        {fretboardSvg}

        {rhythmGridBar && <div className="mx-auto max-w-md">{rhythmGridBar}</div>}

        <div className="mx-auto max-w-md space-y-2 text-center">
          <div className="flex items-center justify-center gap-2.5">
            {[0, 1, 2, 3].map((b) => {
              const lit = stageBeatIdx === b;
              return (
                <span
                  key={b}
                  className={`h-2.5 w-2.5 rounded-full ${
                    lit
                      ? b === 0
                        ? 'bg-[#FF6B00] scale-125'
                        : 'bg-white scale-110'
                      : 'bg-white/15'
                  }`}
                />
              );
            })}
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black px-3 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/70 tabular-nums">
            <span className="h-1.5 w-1.5 rounded-full bg-[#FF6B00] animate-pulse-fast" />
            {demoMode === 'slow-intro'
              ? `DEMO 4/4 • ${slowBpm} BPM (1/8) • GIRO ${introPass}/2`
              : `SYNC 4/4 • ${bpm} BPM`}
          </div>

          <div className="min-h-[22px] text-xs sm:text-sm font-bold tracking-wide text-white tabular-nums">
            {activeStep && effectiveActiveStepIndex !== null ? (
              <span>
                <span className="text-[#FF6B00] mr-1.5">
                  {BAR_8_LABELS[effectiveActiveStepIndex % 8] ??
                    effectiveActiveStepIndex + 1}
                </span>
                {formatStepMinimal(activeStep)}
              </span>
            ) : (
              <span className="text-white/40">Pronto...</span>
            )}
          </div>

          <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#FF6B00]"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // COMPACT VARIANT (Obiettivi / Playing / Tuner Scales / Custom Builder)
  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl bg-black border border-white/15 p-3 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {!interactive && !hideDemoButton && effectiveSteps.length > 0 && (
            <button
              type="button"
              onClick={isPlayingDemo ? stopDemo : () => startDemo('manual')}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold transition ${
                isPlayingDemo
                  ? 'bg-white text-black'
                  : 'bg-black border border-white/20 text-white hover:border-white/50'
              }`}
            >
              {isPlayingDemo ? (
                <>
                  <Square className="h-3 w-3 fill-current" />
                  Stop
                </>
              ) : (
                <>
                  <Play className="h-3 w-3 fill-current text-[#FF6B00]" />
                  Demo
                </>
              )}
            </button>
          )}

          {demoMode === 'live-loop' && !forceStopDemo && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/75 tabular-nums">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  currentBeat === 1 ? 'bg-[#FF6B00]' : 'bg-white/60'
                }`}
              />
              4/4 • {bpm} BPM
              {subdivisionLabel ? ` • ${subdivisionLabel}` : ''}
            </span>
          )}

          {activeStep && effectiveActiveStepIndex !== null && (
            <span className="text-[11px] font-bold text-white/85 tabular-nums">
              <span className="text-[#FF6B00] mr-1">
                {BAR_8_LABELS[effectiveActiveStepIndex % 8] ??
                  effectiveActiveStepIndex + 1}
              </span>
              {activeStep.sustain
                ? 'Tenuta'
                : activeStep.muted || activeStep.notes.length === 0
                ? '×'
                : activeStep.notes
                    .map((n) => `${STRING_SHORT_MAP[n.string]}${n.fret}`)
                    .join(' ')}
            </span>
          )}
        </div>

        <div className="flex rounded-full bg-black border border-white/15 p-0.5">
          <button
            type="button"
            onClick={() => setLabelMode('fingers')}
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold transition ${
              labelMode === 'fingers'
                ? 'bg-white text-black'
                : 'text-white/50 hover:text-white'
            }`}
          >
            Dita
          </button>
          <button
            type="button"
            onClick={() => setLabelMode('intervals')}
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold transition ${
              labelMode === 'intervals'
                ? 'bg-white text-black'
                : 'text-white/50 hover:text-white'
            }`}
          >
            Note
          </button>
        </div>
      </div>

      {fretboardSvg}
      {rhythmGridBar}
    </div>
  );
};
