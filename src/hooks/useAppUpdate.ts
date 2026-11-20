import { useCallback, useEffect, useRef, useState } from 'react';

const CHECK_INTERVAL_MS = 60_000;

export function useAppUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const reloadingRef = useRef(false);

  const checkForUpdate = useCallback(async () => {
    if (!import.meta.env.PROD) return;

    // 1) Check /version.json directly (works reliably on iOS Home Screen PWA + Vercel)
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.ok) {
        const data = (await res.json()) as { buildId?: string };
        if (data?.buildId && data.buildId !== __APP_BUILD_ID__) {
          setUpdateAvailable(true);
        }
      }
    } catch {
      // Offline or transient network error
    }

    // 2) Also trigger Service Worker update check
    try {
      await registrationRef.current?.update();
      if (registrationRef.current?.waiting) {
        setUpdateAvailable(true);
      }
    } catch {
      // Ignore SW check errors
    }
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD) return;

    let mounted = true;

    const handleControllerChange = () => {
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      window.location.reload();
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener(
        'controllerchange',
        handleControllerChange
      );

      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then((reg) => {
          if (!mounted) return;
          registrationRef.current = reg;

          if (reg.waiting) {
            setUpdateAvailable(true);
          }

          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
              if (
                newWorker.state === 'installed' &&
                navigator.serviceWorker.controller
              ) {
                setUpdateAvailable(true);
              }
            });
          });
        })
        .catch(() => {});
    }

    checkForUpdate();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
      }
    };
    const onFocus = () => {
      checkForUpdate();
    };
    const onOnline = () => {
      checkForUpdate();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    const interval = window.setInterval(checkForUpdate, CHECK_INTERVAL_MS);

    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      window.clearInterval(interval);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener(
          'controllerchange',
          handleControllerChange
        );
      }
    };
  }, [checkForUpdate]);

  const applyUpdate = useCallback(async () => {
    if (isUpdating) return;
    setIsUpdating(true);

    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // Ignore cache clear failures
    }

    const waiting = registrationRef.current?.waiting;
    if (waiting) {
      waiting.postMessage({ type: 'SKIP_WAITING' });
      // Fallback reload in case controllerchange doesn't fire on iOS Safari
      window.setTimeout(() => {
        if (!reloadingRef.current) {
          reloadingRef.current = true;
          window.location.reload();
        }
      }, 600);
      return;
    }

    reloadingRef.current = true;
    window.location.reload();
  }, [isUpdating]);

  const dismissUpdate = useCallback(() => {
    setUpdateAvailable(false);
  }, []);

  return {
    updateAvailable,
    isUpdating,
    applyUpdate,
    dismissUpdate,
  };
}
