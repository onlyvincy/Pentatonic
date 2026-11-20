import { AppState } from '../types/practice';

const STATE_KEY = 'pentatonic_app_state_v7';
const DB_NAME = 'pentatonic_media_db';
const DB_VERSION = 1;
const STORE_NAME = 'recordings_blobs';

/**
 * CloudSyncAdapter interface ready for future Supabase / Firebase / REST backend sync.
 */
export interface CloudSyncAdapter {
  providerName: string;
  isConfigured: () => boolean;
  pushStateSnapshot: (state: AppState) => Promise<{ syncedAt: string }>;
  pullStateSnapshot: () => Promise<AppState | null>;
}

export const localCloudStubAdapter: CloudSyncAdapter = {
  providerName: 'Supabase Cloud Sync (Predisposto)',
  isConfigured: () => false,
  pushStateSnapshot: async () => {
    return { syncedAt: new Date().toISOString() };
  },
  pullStateSnapshot: async () => {
    return null;
  },
};

function openMediaDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB non disponibile in questo browser.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Errore apertura IndexedDB'));
  });
}

export async function saveRecordingBlob(id: string, blob: Blob): Promise<void> {
  try {
    const db = await openMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('saveRecordingBlob fallback warning:', err);
  }
}

export async function getRecordingBlob(id: string): Promise<Blob | null> {
  try {
    const db = await openMediaDb();
    const result = await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => resolve((req.result as Blob) || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch (err) {
    console.warn('getRecordingBlob warning:', err);
    return null;
  }
}

export async function deleteRecordingBlob(id: string): Promise<void> {
  try {
    const db = await openMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('deleteRecordingBlob warning:', err);
  }
}

export async function clearAllRecordingBlobs(): Promise<void> {
  try {
    const db = await openMediaDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn('clearAllRecordingBlobs warning:', err);
  }
}

export function loadPersistedState(): AppState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AppState;
  } catch (err) {
    console.warn('Errore lettura localStorage:', err);
    return null;
  }
}

export function savePersistedState(state: AppState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Errore salvataggio localStorage:', err);
  }
}

export function exportAppStateJson(state: AppState): string {
  return JSON.stringify(
    {
      app: 'PENTATONIC',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: state,
    },
    null,
    2
  );
}

export function parseImportedStateJson(jsonStr: string): AppState | null {
  try {
    const parsed = JSON.parse(jsonStr);
    const candidate = parsed?.data ? parsed.data : parsed;
    if (
      candidate &&
      Array.isArray(candidate.exercises) &&
      Array.isArray(candidate.workouts) &&
      Array.isArray(candidate.programs)
    ) {
      return candidate as AppState;
    }
    return null;
  } catch {
    return null;
  }
}
