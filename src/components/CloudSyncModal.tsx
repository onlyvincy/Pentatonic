import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  Cloud,
  Copy,
  Database,
  LogOut,
  Mail,
  RefreshCw,
  Settings2,
  X,
} from 'lucide-react';
import {
  CloudUserProfile,
  SUPABASE_SETUP_SQL,
  clearRuntimeSupabaseConfig,
  getSupabaseConfig,
  isSupabaseConfigured,
  saveRuntimeSupabaseConfig,
  signInWithGoogle,
  signInWithMagicLink,
  signOutCloud,
} from '../services/supabaseCloud';

export type CloudSyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface CloudSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: CloudUserProfile | null;
  syncStatus: CloudSyncStatus;
  syncError: string | null;
  lastSyncedAt?: string;
  onForceSync: () => Promise<void>;
  onAuthConfigured: () => void;
}

const GoogleLogoSvg: React.FC = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
    />
  </svg>
);

function formatSyncTimestamp(iso?: string): string {
  if (!iso) return 'Mai';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Mai';
  return d.toLocaleString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const CloudSyncModal: React.FC<CloudSyncModalProps> = ({
  isOpen,
  onClose,
  user,
  syncStatus,
  syncError,
  lastSyncedAt,
  onForceSync,
  onAuthConfigured,
}) => {
  const initialCfg = getSupabaseConfig();
  const [configured, setConfigured] = useState<boolean>(isSupabaseConfigured());
  const [configSource, setConfigSource] = useState(initialCfg.source);
  const [urlInput, setUrlInput] = useState(initialCfg.url);
  const [keyInput, setKeyInput] = useState(initialCfg.anonKey);
  const [showSetupGuide, setShowSetupGuide] = useState<boolean>(
    !isSupabaseConfigured()
  );

  const [showMagicLink, setShowMagicLink] = useState(false);
  const [magicEmail, setMagicEmail] = useState('');
  const [magicSentMessage, setMagicSentMessage] = useState<string | null>(null);

  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const [configFeedback, setConfigFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const cfg = getSupabaseConfig();
    const isCfg = isSupabaseConfigured();
    setConfigured(isCfg);
    setConfigSource(cfg.source);
    setUrlInput(cfg.url);
    setKeyInput(cfg.anonKey);
    if (!isCfg || syncError?.toLowerCase().includes('user_progress')) {
      setShowSetupGuide(true);
    }
    setAuthError(null);
    setMagicSentMessage(null);
    setConfigFeedback(null);
  }, [isOpen, syncError]);

  if (!isOpen) return null;

  const originUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://your-app.vercel.app';

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setAuthError(
        err instanceof Error
          ? err.message
          : 'Errore durante accesso con Google.'
      );
      setAuthLoading(false);
    }
  };

  const handleMagicLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setMagicSentMessage(null);
    setAuthLoading(true);
    try {
      await signInWithMagicLink(magicEmail);
      setMagicSentMessage(
        'Link di accesso inviato! Controlla la tua email su questo dispositivo.'
      );
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Errore invio Magic Link.'
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signOutCloud();
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : 'Errore durante la disconnessione.'
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSaveRuntimeConfig = (e: React.FormEvent) => {
    e.preventDefault();
    setConfigFeedback(null);
    if (!urlInput.trim() || !keyInput.trim()) {
      setConfigFeedback('Inserisci sia Project URL che Anon/Publishable Key.');
      return;
    }
    saveRuntimeSupabaseConfig(urlInput, keyInput);
    const updated = getSupabaseConfig();
    setConfigured(isSupabaseConfigured());
    setConfigSource(updated.source);
    setConfigFeedback('Configurazione Cloud salvata su questo browser.');
    onAuthConfigured();
  };

  const handleClearRuntimeConfig = () => {
    clearRuntimeSupabaseConfig();
    const updated = getSupabaseConfig();
    setConfigured(isSupabaseConfigured());
    setConfigSource(updated.source);
    setUrlInput(updated.url);
    setKeyInput(updated.anonKey);
    setConfigFeedback('Configurazione locale rimossa.');
    onAuthConfigured();
  };

  const handleCopySql = async () => {
    try {
      await navigator.clipboard.writeText(SUPABASE_SETUP_SQL);
      setCopiedSql(true);
      window.setTimeout(() => setCopiedSql(false), 2200);
    } catch {
      setConfigFeedback('Copia manuale dallo script SQL non riuscita.');
    }
  };

  const handleCopyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(originUrl);
      setCopiedRedirect(true);
      window.setTimeout(() => setCopiedRedirect(false), 2200);
    } catch {
      // ignore clipboard errors
    }
  };

  const statusBadge = (() => {
    if (syncStatus === 'syncing') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#39FF14]/40 bg-[#39FF14]/10 px-2.5 py-1 text-[11px] font-bold text-[#39FF14]">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Sincronizzazione in corso...
        </span>
      );
    }
    if (syncStatus === 'error') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/40 bg-red-500/10 px-2.5 py-1 text-[11px] font-bold text-red-300">
          <AlertCircle className="h-3 w-3" />
          Errore sync
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#39FF14]/45 bg-[#39FF14]/12 px-2.5 py-1 text-[11px] font-bold text-[#39FF14]">
        <Check className="h-3 w-3" />
        Sincronizzato
      </span>
    );
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Cloud Sync e Accesso Google"
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl chrome-panel p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[#39FF14]/40 bg-[#39FF14]/10 text-[#39FF14]">
              <Cloud className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-base font-black chrome-text">
                Cloud Sync Multi-Device
              </h2>
              <p className="text-xs text-slate-300/70">
                Sincronizza BPM, sessioni e piano tra Mobile e Desktop.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Chiudi finestra Cloud"
            className="flex h-8 w-8 items-center justify-center rounded-full chrome-pill text-slate-300/70 hover:text-white transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Authenticated Profile Card */}
        {user ? (
          <div className="rounded-2xl chrome-card p-4 space-y-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.fullName ?? user.email ?? 'Utente'}
                    className="h-10 w-10 rounded-full object-cover ring-1 ring-[#39FF14]/50 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#39FF14]/15 border border-[#39FF14]/40 text-sm font-black text-[#39FF14] shrink-0">
                    {(user.fullName || user.email || 'U')[0].toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-white">
                    {user.fullName || 'Account Connesso'}
                  </div>
                  <div className="truncate text-xs text-slate-300/70">
                    {user.email}
                  </div>
                </div>
              </div>
              {statusBadge}
            </div>

            <div className="flex items-center justify-between text-xs text-slate-300/70 border-t border-white/10 pt-2.5">
              <span>Ultimo aggiornamento cloud</span>
              <span className="font-bold text-white tabular-nums">
                {formatSyncTimestamp(lastSyncedAt)}
              </span>
            </div>

            {syncStatus === 'error' && syncError && (
              <div className="rounded-xl border border-red-400/35 bg-red-500/10 p-3 text-xs text-red-200 leading-relaxed">
                {syncError}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={syncStatus === 'syncing'}
                onClick={() => void onForceSync()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl neon-cta px-4 py-2.5 text-xs font-black disabled:opacity-60 transition"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${
                    syncStatus === 'syncing' ? 'animate-spin' : ''
                  }`}
                />
                Sincronizza Ora
              </button>
              <button
                type="button"
                disabled={authLoading}
                onClick={() => void handleSignOut()}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl chrome-pill px-3.5 py-2.5 text-xs font-bold text-slate-200 hover:border-white/40 transition"
              >
                <LogOut className="h-3.5 w-3.5" />
                Esci dall'account
              </button>
            </div>
          </div>
        ) : configured ? (
          /* Unauthenticated Sign-In View */
          <div className="rounded-2xl chrome-card p-4 space-y-3">
            <button
              type="button"
              disabled={authLoading}
              onClick={() => void handleGoogleLogin()}
              className="flex min-h-[46px] w-full items-center justify-center gap-2.5 rounded-xl chrome-active px-4 py-2.5 text-sm font-black shadow-lg active:scale-[0.98] disabled:opacity-60 transition"
            >
              <GoogleLogoSvg />
              Accedi con Google
            </button>

            <button
              type="button"
              onClick={() => setShowMagicLink((prev) => !prev)}
              className="flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-slate-300/75 hover:text-white transition"
            >
              <Mail className="h-3.5 w-3.5" />
              Oppure accedi con Email Magic Link
              {showMagicLink ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>

            {showMagicLink && (
              <form onSubmit={handleMagicLogin} className="space-y-2 pt-1">
                <div className="flex gap-2">
                  <input
                    type="email"
                    required
                    value={magicEmail}
                    onChange={(e) => setMagicEmail(e.target.value)}
                    placeholder="tua@email.com"
                    className="flex-1 rounded-xl border border-white/15 bg-black px-3 py-2 text-xs text-white placeholder:text-white/35 outline-none focus:border-[#39FF14]/60"
                  />
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="rounded-xl neon-cta px-3.5 py-2 text-xs font-black disabled:opacity-60 transition"
                  >
                    Invia Link
                  </button>
                </div>
              </form>
            )}

            {magicSentMessage && (
              <div className="rounded-xl border border-[#39FF14]/40 bg-[#39FF14]/10 p-2.5 text-xs text-[#39FF14]">
                {magicSentMessage}
              </div>
            )}

            {authError && (
              <div className="rounded-xl border border-red-400/35 bg-red-500/10 p-2.5 text-xs text-red-200">
                {authError}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3.5 text-xs text-amber-100 leading-relaxed">
            Collega il tuo progetto <strong>Supabase</strong> qui sotto (oppure
            dal Marketplace <strong>Storage → Supabase</strong> su Vercel) per
            attivare subito l'accesso con Google.
          </div>
        )}

        {/* Setup & Runtime Configuration Collapsible (only when not configured via Vercel env or on DB table error) */}
        {(!configured ||
          configSource === 'runtime' ||
          Boolean(syncError?.toLowerCase().includes('user_progress'))) && (
        <div className="rounded-2xl chrome-card overflow-hidden">
          <button
            type="button"
            onClick={() => setShowSetupGuide((prev) => !prev)}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-xs font-bold text-slate-200 hover:text-white transition"
          >
            <span className="flex items-center gap-2">
              <Settings2 className="h-3.5 w-3.5 text-[#39FF14]" />
              Configurazione Cloud &amp; Guida Rapida Vercel/Supabase
            </span>
            {showSetupGuide ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {showSetupGuide && (
            <div className="border-t border-white/10 p-4 space-y-4 text-xs">
              {/* Quick 3-step guide */}
              <ol className="space-y-2 text-slate-300/85 leading-relaxed list-decimal list-inside">
                <li>
                  Su <strong>Vercel</strong> apri{' '}
                  <span className="text-white font-semibold">
                    Storage → Create Database → Supabase
                  </span>{' '}
                  (oppure incolla qui sotto URL e Anon Key del tuo progetto
                  Supabase).
                </li>
                <li>
                  Nel <strong>SQL Editor</strong> di Supabase incolla ed esegui
                  lo script qui sotto per creare la tabella{' '}
                  <code className="text-[#39FF14]">public.user_progress</code>.
                </li>
                <li>
                  In Supabase vai su{' '}
                  <span className="text-white font-semibold">
                    Authentication → Providers → Google
                  </span>{' '}
                  e aggiungi come Redirect URL:{' '}
                  <button
                    type="button"
                    onClick={() => void handleCopyRedirect()}
                    className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/5 px-1.5 py-0.5 text-[11px] font-mono text-[#39FF14] hover:border-[#39FF14]/60"
                  >
                    {originUrl}
                    {copiedRedirect ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </li>
              </ol>

              {/* Copy SQL Button */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/70 p-3">
                <div className="flex items-center gap-2 text-slate-200">
                  <Database className="h-4 w-4 text-[#39FF14] shrink-0" />
                  <span className="font-semibold">
                    Script Tabella + RLS (user_progress)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopySql()}
                  className="inline-flex items-center gap-1.5 rounded-full chrome-pill px-3 py-1.5 text-[11px] font-bold text-white hover:border-[#39FF14]/60 transition"
                >
                  {copiedSql ? (
                    <>
                      <Check className="h-3 w-3 text-[#39FF14]" />
                      SQL Copiato!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3 text-[#39FF14]" />
                      Copia SQL Tabella
                    </>
                  )}
                </button>
              </div>

              {/* Runtime Config Form */}
              <form onSubmit={handleSaveRuntimeConfig} className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">
                    Connessione Rapida Supabase
                  </span>
                  {configSource === 'env' && (
                    <span className="text-[10px] font-bold text-[#39FF14]">
                      Attiva da env Vercel
                    </span>
                  )}
                  {configSource === 'runtime' && (
                    <span className="text-[10px] font-bold text-sky-300">
                      Attiva da browser
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] text-slate-300/70">
                    Supabase Project URL
                  </label>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://xyzcompany.supabase.co"
                    className="w-full rounded-xl border border-white/15 bg-black px-3 py-2 text-xs text-white placeholder:text-white/30 outline-none focus:border-[#39FF14]/60"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[11px] text-slate-300/70">
                    Supabase Anon / Publishable Key
                  </label>
                  <input
                    type="text"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                    className="w-full rounded-xl border border-white/15 bg-black px-3 py-2 text-xs font-mono text-white placeholder:text-white/30 outline-none focus:border-[#39FF14]/60"
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="submit"
                    className="rounded-xl neon-cta px-4 py-2 text-xs font-black transition"
                  >
                    Salva &amp; Collega
                  </button>
                  {configSource === 'runtime' && (
                    <button
                      type="button"
                      onClick={handleClearRuntimeConfig}
                      className="rounded-xl chrome-pill px-3 py-2 text-xs font-bold text-slate-300 hover:text-white transition"
                    >
                      Rimuovi chiavi locali
                    </button>
                  )}
                </div>

                {configFeedback && (
                  <p className="text-[11px] font-semibold text-[#39FF14]">
                    {configFeedback}
                  </p>
                )}
              </form>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
};
