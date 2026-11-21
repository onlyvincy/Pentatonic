import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import {
  AppState,
  Exercise,
  FeedRecording,
  ProgramPercorso,
  ScientificPlanPrescription,
  WorkoutSessionLog,
  WorkoutTemplate,
} from '../types/practice';

const RUNTIME_CONFIG_KEY = 'pentatonic_supabase_runtime_cfg';

export const SUPABASE_SETUP_SQL = `-- The Shredding Lab — Tabella Sync Cloud + RLS
create table if not exists public.user_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_progress enable row level security;

drop policy if exists "Users can read own progress" on public.user_progress;
create policy "Users can read own progress"
  on public.user_progress
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own progress" on public.user_progress;
create policy "Users can insert own progress"
  on public.user_progress
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own progress" on public.user_progress;
create policy "Users can update own progress"
  on public.user_progress
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);`;

export interface SupabaseRuntimeConfig {
  url: string;
  anonKey: string;
}

export interface SupabaseConfigInfo {
  url: string;
  anonKey: string;
  source: 'env' | 'runtime' | 'none';
}

export interface CloudUserProfile {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
}

let cachedClient: SupabaseClient | null = null;
let cachedClientSignature = '';

function readEnvConfig(): SupabaseRuntimeConfig {
  const url =
    (typeof __SUPABASE_URL__ !== 'undefined' ? __SUPABASE_URL__ : '') ||
    import.meta.env.VITE_SUPABASE_URL ||
    '';
  const anonKey =
    (typeof __SUPABASE_ANON_KEY__ !== 'undefined' ? __SUPABASE_ANON_KEY__ : '') ||
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    '';
  return { url: url.trim(), anonKey: anonKey.trim() };
}

function readRuntimeConfig(): SupabaseRuntimeConfig | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(RUNTIME_CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SupabaseRuntimeConfig>;
    const url = (parsed.url ?? '').trim();
    const anonKey = (parsed.anonKey ?? '').trim();
    if (!url || !anonKey) return null;
    return { url, anonKey };
  } catch {
    return null;
  }
}

export function getSupabaseConfig(): SupabaseConfigInfo {
  const envCfg = readEnvConfig();
  if (envCfg.url && envCfg.anonKey) {
    return { ...envCfg, source: 'env' };
  }
  const runtimeCfg = readRuntimeConfig();
  if (runtimeCfg) {
    return { ...runtimeCfg, source: 'runtime' };
  }
  return { url: '', anonKey: '', source: 'none' };
}

export function isSupabaseConfigured(): boolean {
  const cfg = getSupabaseConfig();
  return Boolean(cfg.url && cfg.anonKey);
}

export function saveRuntimeSupabaseConfig(url: string, anonKey: string): void {
  const cleanUrl = url.trim().replace(/\/+$/, '');
  const cleanKey = anonKey.trim();
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(
      RUNTIME_CONFIG_KEY,
      JSON.stringify({ url: cleanUrl, anonKey: cleanKey })
    );
  }
  cachedClient = null;
  cachedClientSignature = '';
}

export function clearRuntimeSupabaseConfig(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(RUNTIME_CONFIG_KEY);
  }
  cachedClient = null;
  cachedClientSignature = '';
}

export function getSupabaseClient(): SupabaseClient | null {
  const cfg = getSupabaseConfig();
  if (!cfg.url || !cfg.anonKey) {
    return null;
  }
  const signature = `${cfg.url}::${cfg.anonKey}`;
  if (cachedClient && cachedClientSignature === signature) {
    return cachedClient;
  }
  cachedClient = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  cachedClientSignature = signature;
  return cachedClient;
}

export function mapSupabaseUser(user: User | null): CloudUserProfile | null {
  if (!user) return null;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    null;
  const avatarUrl =
    (typeof meta.avatar_url === 'string' && meta.avatar_url) ||
    (typeof meta.picture === 'string' && meta.picture) ||
    null;

  return {
    id: user.id,
    email: user.email ?? null,
    fullName,
    avatarUrl,
  };
}

export async function getCurrentCloudUser(): Promise<CloudUserProfile | null> {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw new Error(error.message);
  }
  return mapSupabaseUser(data.session?.user ?? null);
}

export function onCloudAuthStateChange(
  callback: (user: CloudUserProfile | null) => void
): () => void {
  const client = getSupabaseClient();
  if (!client) {
    return () => {};
  }
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    callback(mapSupabaseUser(session?.user ?? null));
  });
  return () => {
    data.subscription.unsubscribe();
  };
}

export async function signInWithGoogle(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Configura prima Supabase URL e Anon Key.');
  }
  const redirectTo =
    typeof window !== 'undefined' ? window.location.origin : undefined;
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: {
        prompt: 'select_account',
      },
    },
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function signInWithMagicLink(email: string): Promise<void> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Configura prima Supabase URL e Anon Key.');
  }
  const cleanEmail = email.trim();
  if (!cleanEmail) {
    throw new Error('Inserisci un indirizzo email valido.');
  }
  const emailRedirectTo =
    typeof window !== 'undefined' ? window.location.origin : undefined;
  const { error } = await client.auth.signInWithOtp({
    email: cleanEmail,
    options: {
      emailRedirectTo,
    },
  });
  if (error) {
    throw new Error(error.message);
  }
}

export async function signOutCloud(): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) {
    throw new Error(error.message);
  }
}

function formatSupabaseDbError(error: { code?: string; message: string }): string {
  if (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    error.message.toLowerCase().includes('user_progress')
  ) {
    return 'Tabella user_progress mancante su Supabase: copia ed esegui lo SQL nel tuo SQL Editor.';
  }
  return error.message;
}

export async function pullCloudProgress(
  userId: string
): Promise<{ state: AppState | null; updatedAt: string | null }> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase non configurato.');
  }
  const { data, error } = await client
    .from('user_progress')
    .select('state, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(formatSupabaseDbError(error));
  }
  if (!data || !data.state) {
    return { state: null, updatedAt: null };
  }
  return {
    state: data.state as AppState,
    updatedAt: typeof data.updated_at === 'string' ? data.updated_at : null,
  };
}

export async function pushCloudProgress(
  userId: string,
  state: AppState
): Promise<{ syncedAt: string }> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase non configurato.');
  }
  const syncedAt = new Date().toISOString();
  const snapshot: AppState = {
    ...state,
    settings: {
      ...state.settings,
      cloudSyncEnabled: true,
      lastSyncedAt: syncedAt,
    },
  };

  const { error } = await client.from('user_progress').upsert(
    {
      user_id: userId,
      state: snapshot,
      updated_at: syncedAt,
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    throw new Error(formatSupabaseDbError(error));
  }
  return { syncedAt };
}

function parseIsoMs(iso?: string | null): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

function getLatestExerciseLogMs(
  logs: WorkoutSessionLog[],
  exerciseId: string
): number {
  let latest = 0;
  for (const log of logs) {
    if (log.sets.some((st) => st.exerciseId === exerciseId)) {
      const ms = parseIsoMs(log.date);
      if (ms > latest) latest = ms;
    }
  }
  return latest;
}

function getLatestStateActivityMs(state: AppState): number {
  let latest = 0;
  for (const log of state.sessionLogs ?? []) {
    const ms = parseIsoMs(log.date);
    if (ms > latest) latest = ms;
  }
  const planMs = parseIsoMs(state.settings?.scientificPlan?.createdAt);
  if (planMs > latest) latest = planMs;
  const syncMs = parseIsoMs(state.settings?.lastSyncedAt);
  if (syncMs > latest) latest = syncMs;
  return latest;
}

function mergeById<T extends { id: string }>(
  primary: T[],
  secondary: T[],
  combine?: (a: T, b: T) => T
): T[] {
  const map = new Map<string, T>();
  for (const item of secondary) {
    map.set(item.id, item);
  }
  for (const item of primary) {
    const existing = map.get(item.id);
    map.set(item.id, existing && combine ? combine(item, existing) : item);
  }
  return Array.from(map.values());
}

function mergeScientificPlans(
  primaryPlan: ScientificPlanPrescription | undefined,
  secondaryPlan: ScientificPlanPrescription | undefined
): ScientificPlanPrescription | undefined {
  if (!primaryPlan) return secondaryPlan;
  if (!secondaryPlan) return primaryPlan;

  const doseMap = new Map(primaryPlan.doses.map((d) => [d.exerciseId, d]));
  const extraDoses = secondaryPlan.doses.filter(
    (d) => !doseMap.has(d.exerciseId)
  );
  return {
    ...primaryPlan,
    doses: [...primaryPlan.doses, ...extraDoses],
  };
}

/**
 * Smart multi-device merge between local state and remote cloud snapshot.
 * Never loses session logs, recordings, custom exercises or peak BPM progress.
 */
export function mergeAppStates(local: AppState, remote: AppState): AppState {
  const localLogs = local.sessionLogs ?? [];
  const remoteLogs = remote.sessionLogs ?? [];

  const mergedSessionLogs = mergeById<WorkoutSessionLog>(
    localLogs,
    remoteLogs,
    (a, b) => (a.sets.length >= b.sets.length ? a : b)
  ).sort((a, b) => parseIsoMs(b.date) - parseIsoMs(a.date));

  const mergedFeedRecordings = mergeById<FeedRecording>(
    local.feedRecordings ?? [],
    remote.feedRecordings ?? [],
    (a, b) => ({
      ...a,
      isBenchmarkCheckpoint:
        a.isBenchmarkCheckpoint || b.isBenchmarkCheckpoint,
    })
  ).sort((a, b) => parseIsoMs(b.date) - parseIsoMs(a.date));

  const localHasPractice =
    localLogs.length > 0 || Boolean(local.settings?.hasCompletedOnboarding);
  const remoteHasPractice =
    remoteLogs.length > 0 || Boolean(remote.settings?.hasCompletedOnboarding);

  const localActivityMs = getLatestStateActivityMs(local);
  const remoteActivityMs = getLatestStateActivityMs(remote);

  const preferRemoteGlobally =
    (remoteHasPractice && !localHasPractice) ||
    (remoteHasPractice === localHasPractice &&
      remoteActivityMs > localActivityMs);

  const localExMap = new Map(
    (local.exercises ?? []).map((ex) => [ex.id, ex])
  );
  const remoteExMap = new Map(
    (remote.exercises ?? []).map((ex) => [ex.id, ex])
  );

  const orderedIds: string[] = [];
  const seenIds = new Set<string>();
  for (const ex of local.exercises ?? []) {
    if (!seenIds.has(ex.id)) {
      seenIds.add(ex.id);
      orderedIds.push(ex.id);
    }
  }
  for (const ex of remote.exercises ?? []) {
    if (!seenIds.has(ex.id)) {
      seenIds.add(ex.id);
      orderedIds.push(ex.id);
    }
  }

  const mergedExercises: Exercise[] = orderedIds.map((id) => {
    const localEx = localExMap.get(id);
    const remoteEx = remoteExMap.get(id);
    if (!localEx) return remoteEx as Exercise;
    if (!remoteEx) return localEx;

    const localExLogMs = getLatestExerciseLogMs(localLogs, id);
    const remoteExLogMs = getLatestExerciseLogMs(remoteLogs, id);

    let preferRemoteEx = preferRemoteGlobally;
    if (remoteExLogMs !== localExLogMs) {
      preferRemoteEx = remoteExLogMs > localExLogMs;
    } else if (
      remoteEx.bestCleanBpm !== localEx.bestCleanBpm &&
      remoteExLogMs === 0 &&
      localExLogMs === 0
    ) {
      preferRemoteEx = remoteEx.bestCleanBpm > localEx.bestCleanBpm;
    }

    const primaryEx = preferRemoteEx ? remoteEx : localEx;
    const secondaryEx = preferRemoteEx ? localEx : remoteEx;

    const mergedVariantBpms: Record<string, number> = {};
    const allVariantKeys = new Set([
      ...Object.keys(secondaryEx.variantBpms ?? {}),
      ...Object.keys(primaryEx.variantBpms ?? {}),
    ]);
    for (const vKey of allVariantKeys) {
      const pVal = primaryEx.variantBpms?.[vKey];
      const sVal = secondaryEx.variantBpms?.[vKey];
      if (typeof pVal === 'number' && typeof sVal === 'number') {
        mergedVariantBpms[vKey] =
          localExLogMs === 0 && remoteExLogMs === 0
            ? Math.max(pVal, sVal)
            : pVal;
      } else if (typeof pVal === 'number') {
        mergedVariantBpms[vKey] = pVal;
      } else if (typeof sVal === 'number') {
        mergedVariantBpms[vKey] = sVal;
      }
    }

    return {
      ...primaryEx,
      bestCleanBpm: Math.max(localEx.bestCleanBpm, remoteEx.bestCleanBpm),
      variantBpms:
        Object.keys(mergedVariantBpms).length > 0
          ? mergedVariantBpms
          : primaryEx.variantBpms,
      activeVariantId: primaryEx.activeVariantId ?? secondaryEx.activeVariantId,
    };
  });

  const mergedWorkouts = mergeById<WorkoutTemplate>(
    preferRemoteGlobally ? remote.workouts ?? [] : local.workouts ?? [],
    preferRemoteGlobally ? local.workouts ?? [] : remote.workouts ?? []
  );

  const mergedPrograms = mergeById<ProgramPercorso>(
    preferRemoteGlobally ? remote.programs ?? [] : local.programs ?? [],
    preferRemoteGlobally ? local.programs ?? [] : remote.programs ?? []
  );

  const localPlanMs = parseIsoMs(local.settings?.scientificPlan?.createdAt);
  const remotePlanMs = parseIsoMs(remote.settings?.scientificPlan?.createdAt);

  const preferRemotePlan =
    (Boolean(remote.settings?.hasCompletedOnboarding) &&
      !local.settings?.hasCompletedOnboarding) ||
    (Boolean(remote.settings?.hasCompletedOnboarding) ===
      Boolean(local.settings?.hasCompletedOnboarding) &&
      (remotePlanMs !== localPlanMs
        ? remotePlanMs > localPlanMs
        : preferRemoteGlobally));

  const primarySettings = preferRemoteGlobally
    ? remote.settings
    : local.settings;

  const mergedPlan = mergeScientificPlans(
    preferRemotePlan
      ? remote.settings?.scientificPlan
      : local.settings?.scientificPlan,
    preferRemotePlan
      ? local.settings?.scientificPlan
      : remote.settings?.scientificPlan
  );

  return {
    exercises: mergedExercises,
    workouts: mergedWorkouts,
    programs: mergedPrograms,
    sessionLogs: mergedSessionLogs,
    feedRecordings: mergedFeedRecordings,
    settings: {
      ...primarySettings,
      cloudSyncEnabled: true,
      lastSyncedAt: new Date().toISOString(),
      hasCompletedOnboarding: Boolean(
        local.settings?.hasCompletedOnboarding ||
          remote.settings?.hasCompletedOnboarding
      ),
      scientificPlan: mergedPlan,
    },
  };
}

/**
 * Deterministic fingerprint of user progress excluding volatile sync metadata,
 * used to avoid redundant background cloud writes.
 */
export function computeSyncFingerprint(state: AppState): string {
  const { lastSyncedAt: _ignoredSyncAt, cloudSyncEnabled: _ignoredFlag, ...restSettings } =
    state.settings;
  return JSON.stringify({
    exercises: state.exercises.map((ex) => ({
      id: ex.id,
      currentTargetBpm: ex.currentTargetBpm,
      bestCleanBpm: ex.bestCleanBpm,
      activeVariantId: ex.activeVariantId,
      variantBpms: ex.variantBpms,
      isCustom: ex.isCustom,
      title: ex.title,
    })),
    sessionLogIds: state.sessionLogs.map((l) => `${l.id}:${l.sets.length}`),
    recordingIds: state.feedRecordings.map(
      (r) => `${r.id}:${r.isBenchmarkCheckpoint ? 1 : 0}`
    ),
    workoutsCount: state.workouts.length,
    programsCount: state.programs.length,
    settings: restSettings,
  });
}
