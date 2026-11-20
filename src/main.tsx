import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  } else {
    // Prevent stale dev-server module caching by unregistering SW and clearing caches in dev mode
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister().catch(() => {}));
    });
    if ('caches' in window) {
      caches.keys().then((keys) => {
        keys.forEach((k) => caches.delete(k).catch(() => {}));
      });
    }
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
