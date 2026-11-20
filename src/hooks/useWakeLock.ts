import { useEffect, useRef, useState } from 'react';
import { unlockSharedAudioContext } from '../utils/guitarSynth';

interface WakeLockSentinelLike {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: 'release', listener: () => void) => void;
  removeEventListener?: (type: 'release', listener: () => void) => void;
}

/**
 * Bulletproof screen anti-sleep hook combining:
 * 1. Screen Wake Lock API (auto-reacquired on visibilitychange / focus / pointerdown)
 * 2. Silent keep-alive oscillator attached to the single shared AudioContext
 */
export function useWakeLock(enabled = true): { isLocked: boolean } {
  const [isLocked, setIsLocked] = useState(false);
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setIsLocked(false);
      return;
    }

    let cancelled = false;

    const startAudioKeepAlive = async () => {
      try {
        const ctx = await unlockSharedAudioContext();
        if (!ctx || cancelled) return;

        if (!oscRef.current) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.frequency.value = 1;
          gain.gain.value = 0.00001; // Sub-audible keep-alive pulse
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          oscRef.current = osc;
          gainRef.current = gain;
        }
      } catch {
        // Ignore if blocked in restricted environment
      }
    };

    const requestLock = async () => {
      if (cancelled) return;
      startAudioKeepAlive();

      try {
        const nav = navigator as unknown as {
          wakeLock?: {
            request: (type: 'screen') => Promise<WakeLockSentinelLike>;
          };
        };
        if (!nav.wakeLock) return;
        if (sentinelRef.current && !sentinelRef.current.released) {
          setIsLocked(true);
          return;
        }

        const sentinel = await nav.wakeLock.request('screen');
        if (cancelled) {
          sentinel.release().catch(() => {});
          return;
        }

        sentinelRef.current = sentinel;
        setIsLocked(true);

        const handleRelease = () => {
          sentinelRef.current = null;
          if (!cancelled) setIsLocked(false);
        };
        sentinel.addEventListener?.('release', handleRelease);
      } catch {
        // Fallback audio keep-alive still remains active
      }
    };

    requestLock();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        requestLock();
      }
    };

    const handleInteractOrFocus = () => {
      requestLock();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleInteractOrFocus);
    window.addEventListener('pointerdown', handleInteractOrFocus, {
      passive: true,
    });

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleInteractOrFocus);
      window.removeEventListener('pointerdown', handleInteractOrFocus);

      if (sentinelRef.current) {
        sentinelRef.current.release().catch(() => {});
        sentinelRef.current = null;
      }

      if (oscRef.current) {
        try {
          oscRef.current.stop();
          oscRef.current.disconnect();
        } catch {
          // Ignore
        }
        oscRef.current = null;
      }

      if (gainRef.current) {
        try {
          gainRef.current.disconnect();
        } catch {
          // Ignore
        }
        gainRef.current = null;
      }

      setIsLocked(false);
    };
  }, [enabled]);

  return { isLocked };
}
