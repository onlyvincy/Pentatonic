import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Cloud,
  Download,
  Monitor,
  MoreVertical,
  PlusSquare,
  Share,
  Smartphone,
  Sparkles,
  Zap,
} from 'lucide-react';
import {
  CloudUserProfile,
  isSupabaseConfigured,
  signInWithGoogle,
} from '../services/supabaseCloud';

export type PostOnboardingStep = 'google' | 'install';

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PostOnboardingGuideProps {
  step: PostOnboardingStep;
  user: CloudUserProfile | null;
  deferredInstallPrompt: BeforeInstallPromptEvent | null;
  onClearInstallPrompt: () => void;
  onSkipGoogle: () => void;
  onOpenCloudSetup: () => void;
  onComplete: () => void;
}

type InstallPlatform = 'ios' | 'android' | 'desktop';

function detectInstallPlatform(): {
  platform: InstallPlatform;
  isStandalone: boolean;
  isIosNonSafari: boolean;
} {
  if (typeof window === 'undefined') {
    return { platform: 'ios', isStandalone: false, isIosNonSafari: false };
  }

  const ua = window.navigator.userAgent || '';
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true;

  const isIos =
    /iphone|ipad|ipod/i.test(ua) ||
    (window.navigator.platform === 'MacIntel' &&
      window.navigator.maxTouchPoints > 1);

  if (isIos) {
    const isOtherIosBrowser = /crios|fxios|edgios|opios|instagram|fban|fbav/i.test(
      ua
    );
    return {
      platform: 'ios',
      isStandalone,
      isIosNonSafari: isOtherIosBrowser,
    };
  }

  if (/android/i.test(ua)) {
    return { platform: 'android', isStandalone, isIosNonSafari: false };
  }

  return { platform: 'desktop', isStandalone, isIosNonSafari: false };
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

export const PostOnboardingGuide: React.FC<PostOnboardingGuideProps> = ({
  step,
  user,
  deferredInstallPrompt,
  onClearInstallPrompt,
  onSkipGoogle,
  onOpenCloudSetup,
  onComplete,
}) => {
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [installingNative, setInstallingNative] = useState(false);

  const envInfo = useMemo(() => detectInstallPlatform(), []);
  const [selectedPlatform, setSelectedPlatform] = useState<InstallPlatform>(
    envInfo.platform
  );

  const supabaseReady = isSupabaseConfigured();

  const handleGoogleLogin = async () => {
    setAuthError(null);
    if (!supabaseReady) {
      onOpenCloudSetup();
      return;
    }
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

  const handleNativeInstall = async () => {
    if (!deferredInstallPrompt) return;
    setInstallingNative(true);
    try {
      await deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        onClearInstallPrompt();
      }
    } finally {
      setInstallingNative(false);
    }
  };

  const activeSegment = step === 'google' ? 1 : 2;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-[#030405] text-white">
      <header className="relative z-10 mx-auto flex w-full max-w-xl flex-col gap-2 px-5 pt-4 pb-2">
        <div className="flex w-full items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <img
              src="/icon.svg"
              alt="The Shredding Lab"
              className="h-8 w-8 rounded-xl shrink-0 ring-1 ring-slate-200/35 shadow-[0_0_14px_rgba(57,255,20,0.22)]"
            />
            <span className="text-[11px] font-bold uppercase tracking-widest text-white/55 tabular-nums">
              The Shredding Lab • {activeSegment}/2
            </span>
          </div>
          {step === 'google' && (
            <button
              type="button"
              onClick={onSkipGoogle}
              className="text-xs font-bold text-white/55 hover:text-white transition"
            >
              Salta
            </button>
          )}
        </div>

        {/* 2-Segment Progress Bar */}
        <div className="flex items-center gap-1.5">
          {[1, 2].map((seg) => (
            <div
              key={seg}
              className={`h-1 flex-1 rounded-full transition-colors ${
                seg <= activeSegment ? 'bg-[#39FF14]' : 'bg-white/15'
              }`}
            />
          ))}
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 pb-10 pt-4">
        {step === 'google' ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#39FF14]/35 bg-[#39FF14]/10 px-3 py-1 text-[11px] font-bold text-[#39FF14]">
                <Cloud className="h-3.5 w-3.5" />
                Passaggio 1 di 2 • Salva i progressi
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Accedi con Google
              </h1>
              <p className="text-sm text-white/65 leading-relaxed">
                Il tuo piano è pronto! Collega il tuo account Google per salvare
                automaticamente BPM, serie e statistiche sul cloud.
              </p>
            </div>

            <div className="space-y-2.5 rounded-3xl border border-white/15 bg-[#0A0B0D] p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#39FF14]/12 text-[#39FF14]">
                  <Cloud className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-bold text-white">
                    Backup automatico nel cloud
                  </div>
                  <p className="text-xs text-white/55">
                    Non perdi i tuoi record di velocità nemmeno se cambi
                    dispositivo o svuoti il browser.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 pt-1">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/8 text-white">
                  <Smartphone className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-bold text-white">
                    Sincronizzazione immediata
                  </div>
                  <p className="text-xs text-white/55">
                    Usa l&apos;app da telefono e computer con lo stesso profilo.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 pt-1">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/8 text-white">
                  <Zap className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-bold text-white">
                    Accesso in un tocco
                  </div>
                  <p className="text-xs text-white/55">
                    Nessuna nuova password da ricordare.
                  </p>
                </div>
              </div>
            </div>

            {authError && (
              <div className="flex items-start gap-2 rounded-2xl border border-red-400/35 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <span>{authError}</span>
              </div>
            )}

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={authLoading}
                onClick={handleGoogleLogin}
                className="flex min-h-[50px] w-full items-center justify-center gap-2.5 rounded-xl bg-white px-5 py-3 text-sm font-black text-black hover:bg-white/90 active:scale-[0.98] disabled:opacity-60 transition shadow-[0_0_24px_rgba(255,255,255,0.16)]"
              >
                <GoogleLogoSvg />
                {authLoading
                  ? 'Reindirizzamento a Google...'
                  : 'Continua con Google'}
              </button>

              <button
                type="button"
                disabled={authLoading}
                onClick={onSkipGoogle}
                className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-white/15 bg-black px-5 py-2.5 text-xs font-bold text-white/70 hover:border-white/35 hover:text-white transition"
              >
                Salta per ora
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {user && (
              <div className="flex items-center gap-2.5 rounded-2xl border border-[#39FF14]/35 bg-[#39FF14]/10 px-3.5 py-2.5 text-xs font-bold text-[#39FF14]">
                <Check className="h-4 w-4 shrink-0 stroke-[3]" />
                <span className="truncate">
                  Account Google connesso:{' '}
                  {user.fullName || user.email || 'Pronto'}
                </span>
              </div>
            )}

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-[#39FF14]/35 bg-[#39FF14]/10 px-3 py-1 text-[11px] font-bold text-[#39FF14]">
                <Smartphone className="h-3.5 w-3.5" />
                Passaggio 2 di 2 • App sul dispositivo
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Aggiungi alla schermata Home
              </h1>
              <p className="text-sm text-white/65 leading-relaxed">
                Installala come vera app: si apre a schermo intero, senza barra
                del browser, con accesso rapido ogni giorno.
              </p>
            </div>

            {envInfo.isStandalone ? (
              <div className="flex items-center gap-3 rounded-2xl border border-[#39FF14]/40 bg-[#39FF14]/12 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#39FF14] text-black">
                  <Check className="h-5 w-5 stroke-[3]" />
                </span>
                <div>
                  <div className="text-sm font-black text-white">
                    App già installata!
                  </div>
                  <p className="text-xs text-white/70">
                    Stai già usando The Shredding Lab dalla tua schermata Home.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {deferredInstallPrompt && (
                  <button
                    type="button"
                    disabled={installingNative}
                    onClick={handleNativeInstall}
                    className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-[#39FF14] bg-[#39FF14]/15 px-5 py-3 text-sm font-black text-[#39FF14] hover:bg-[#39FF14]/25 active:scale-[0.98] transition"
                  >
                    <Download className="h-4 w-4" />
                    {installingNative
                      ? 'Installazione in corso...'
                      : 'Installa App con 1 tap'}
                  </button>
                )}

                {/* Platform Selector Tabs */}
                <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-white/12 bg-black p-1">
                  {(
                    [
                      { id: 'ios', label: 'iPhone / iPad' },
                      { id: 'android', label: 'Android' },
                      { id: 'desktop', label: 'Computer' },
                    ] as const
                  ).map((tab) => {
                    const active = selectedPlatform === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setSelectedPlatform(tab.id)}
                        className={`rounded-xl py-2 text-xs font-bold transition ${
                          active
                            ? 'bg-white text-black'
                            : 'text-white/60 hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Step-by-Step Guide Card */}
                <div className="space-y-3 rounded-3xl border border-white/15 bg-[#0A0B0D] p-4">
                  {selectedPlatform === 'ios' && (
                    <>
                      {envInfo.isIosNonSafari && (
                        <div className="rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-200">
                          Suggerimento iOS: se non trovi l&apos;opzione, apri
                          questo link in <strong>Safari</strong>.
                        </div>
                      )}
                      <div className="flex items-start gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-black text-[#39FF14]">
                          1
                        </span>
                        <div className="text-xs sm:text-sm text-white/85 leading-relaxed">
                          Tocca l&apos;icona{' '}
                          <span className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 text-xs font-bold text-white align-middle">
                            <Share className="h-3.5 w-3.5 text-[#39FF14]" />
                            Condividi
                          </span>{' '}
                          nella barra in basso di Safari (o in alto su iPad).
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-black text-[#39FF14]">
                          2
                        </span>
                        <div className="text-xs sm:text-sm text-white/85 leading-relaxed">
                          Scorri il menu verso il basso e tocca{' '}
                          <span className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 text-xs font-bold text-white align-middle">
                            <PlusSquare className="h-3.5 w-3.5 text-[#39FF14]" />
                            Aggiungi alla schermata Home
                          </span>
                          .
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-black text-[#39FF14]">
                          3
                        </span>
                        <div className="text-xs sm:text-sm text-white/85 leading-relaxed">
                          Tocca <strong>Aggiungi</strong> in alto a destra:
                          troverai l&apos;icona di The Shredding Lab sulla tua
                          Home!
                        </div>
                      </div>
                    </>
                  )}

                  {selectedPlatform === 'android' && (
                    <>
                      <div className="flex items-start gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-black text-[#39FF14]">
                          1
                        </span>
                        <div className="text-xs sm:text-sm text-white/85 leading-relaxed">
                          Tocca il menu{' '}
                          <span className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 text-xs font-bold text-white align-middle">
                            <MoreVertical className="h-3.5 w-3.5 text-[#39FF14]" />
                            Altro
                          </span>{' '}
                          in alto a destra su Chrome.
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-black text-[#39FF14]">
                          2
                        </span>
                        <div className="text-xs sm:text-sm text-white/85 leading-relaxed">
                          Seleziona{' '}
                          <strong>Aggiungi a schermata Home</strong> oppure{' '}
                          <strong>Installa app</strong>.
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-black text-[#39FF14]">
                          3
                        </span>
                        <div className="text-xs sm:text-sm text-white/85 leading-relaxed">
                          Conferma toccando <strong>Installa</strong> o{' '}
                          <strong>Aggiungi</strong>.
                        </div>
                      </div>
                    </>
                  )}

                  {selectedPlatform === 'desktop' && (
                    <>
                      <div className="flex items-start gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-black text-[#39FF14]">
                          1
                        </span>
                        <div className="text-xs sm:text-sm text-white/85 leading-relaxed">
                          Su <strong>Chrome o Edge</strong> clicca l&apos;icona{' '}
                          <span className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 text-xs font-bold text-white align-middle">
                            <Monitor className="h-3.5 w-3.5 text-[#39FF14]" />
                            Installa
                          </span>{' '}
                          a destra nella barra degli indirizzi.
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-black text-[#39FF14]">
                          2
                        </span>
                        <div className="text-xs sm:text-sm text-white/85 leading-relaxed">
                          Su <strong>Safari (Mac)</strong> apri il menu{' '}
                          <strong>File → Aggiungi al Dock</strong>.
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            <button
              type="button"
              onClick={onComplete}
              className="flex min-h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-[#39FF14] px-5 py-3 text-sm font-black text-black hover:bg-[#5EFF3D] active:scale-[0.98] transition shadow-[0_0_24px_rgba(57,255,20,0.22)]"
            >
              <Sparkles className="h-4 w-4" />
              Ho capito, inizia ad allenarti
            </button>
          </div>
        )}
      </main>
    </div>
  );
};
