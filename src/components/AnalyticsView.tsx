import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Cloud,
  Download,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  AppState,
  Exercise,
  FeedRecording,
  UserSettings,
  WorkoutSessionLog,
} from '../types/practice';
import {
  exportAppStateJson,
  parseImportedStateJson,
} from '../services/storage';
import { computeNerdTelemetry } from '../utils/nerdStats';
import { FeedAndBenchmarks } from './FeedAndBenchmarks';

interface AnalyticsViewProps {
  appState: AppState;
  exercises: Exercise[];
  sessionLogs: WorkoutSessionLog[];
  recordings: FeedRecording[];
  settings: UserSettings;
  onUpdateSettings?: (partial: Partial<UserSettings>) => void;
  onToggleBenchmark: (recordingId: string) => void;
  onDeleteRecording: (recordingId: string) => void;
  onImportState: (imported: AppState) => void;
  onResetDemoData: () => void;
  onOpenCloudModal?: () => void;
  cloudUserEmail?: string | null;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  appState,
  exercises,
  sessionLogs,
  recordings,
  settings,
  onToggleBenchmark,
  onDeleteRecording,
  onImportState,
  onResetDemoData,
  onOpenCloudModal,
  cloudUserEmail,
}) => {
  const [selectedExId, setSelectedExId] = useState<string>('all');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [resetModalStep, setResetModalStep] = useState<0 | 1 | 2 | 3>(0);
  const [confirmCheckDataLoss, setConfirmCheckDataLoss] = useState(false);
  const [confirmCheckBackup, setConfirmCheckBackup] = useState(false);
  const [confirmResetText, setConfirmResetText] = useState('');

  const openResetModal = () => {
    setResetModalStep(1);
    setConfirmCheckDataLoss(false);
    setConfirmCheckBackup(false);
    setConfirmResetText('');
  };

  const closeResetModal = () => {
    setResetModalStep(0);
    setConfirmCheckDataLoss(false);
    setConfirmCheckBackup(false);
    setConfirmResetText('');
  };

  const handleFinalResetConfirm = () => {
    if (confirmResetText.trim().toUpperCase() !== 'AZZERA') return;
    closeResetModal();
    onResetDemoData();
  };

  const nerd = useMemo(
    () =>
      computeNerdTelemetry(
        exercises,
        sessionLogs,
        settings.weeklyGoalDays,
        selectedExId
      ),
    [exercises, sessionLogs, settings.weeklyGoalDays, selectedExId]
  );

  const handleDownloadBackup = () => {
    const json = exportAppStateJson(appState);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pentatonic-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseImportedStateJson(text);
    if (parsed) {
      onImportState(parsed);
      setSyncMessage('Importato');
    } else {
      setSyncMessage('File non valido');
    }
  };

  const svgW = 560;
  const svgH = 190;
  const padL = 36;
  const padR = 16;
  const padT = 20;
  const padB = 28;

  const allYValues = nerd.series.flatMap((p) => [p.avgCleanBpm, p.peakCleanBpm]);
  const minBpm =
    allYValues.length > 0
      ? Math.max(40, Math.floor(Math.min(...allYValues) - 6))
      : 60;
  const maxBpm =
    allYValues.length > 0 ? Math.ceil(Math.max(...allYValues) + 6) : 140;

  const pointsCoords = nerd.series.map((p, idx) => {
    const x =
      nerd.series.length === 1
        ? (padL + svgW - padR) / 2
        : padL + (idx / (nerd.series.length - 1)) * (svgW - padL - padR);
    const yAvg =
      svgH -
      padB -
      ((p.avgCleanBpm - minBpm) / Math.max(1, maxBpm - minBpm)) *
        (svgH - padT - padB);
    return { ...p, x, yAvg };
  });

  const avgPolyline = pointsCoords.map((p) => `${p.x},${p.yAvg}`).join(' ');
  const areaPolygon =
    pointsCoords.length > 1
      ? `${pointsCoords[0].x},${svgH - padB} ${avgPolyline} ${
          pointsCoords[pointsCoords.length - 1].x
        },${svgH - padB}`
      : '';

  return (
    <div className="space-y-3.5">
      {/* Compact 3-Metric Strip */}
      <section className="grid grid-cols-3 gap-2.5">
        <div className="rounded-3xl bg-[#060606] border border-white/15 p-3.5">
          <div className="text-[11px] font-bold text-white/50">BPM Pulito</div>
          <div className="mt-1 text-xl sm:text-2xl font-black text-white tabular-nums">
            {nerd.currentAvgCleanBpm}
          </div>
          <div className="text-[11px] font-bold text-[#39FF14] tabular-nums">
            {nerd.cleanBpmDelta >= 0 ? '+' : ''}
            {nerd.cleanBpmDelta} BPM
          </div>
        </div>

        <div className="rounded-3xl bg-[#060606] border border-white/15 p-3.5">
          <div className="text-[11px] font-bold text-white/50">Sessioni 28g</div>
          <div className="mt-1 text-xl sm:text-2xl font-black text-white tabular-nums">
            {nerd.uniqueDays28d}
          </div>
          <div className="text-[11px] font-bold text-white/70 tabular-nums">
            {nerd.consistency28dPct}%
          </div>
        </div>

        <div className="rounded-3xl bg-[#060606] border border-white/15 p-3.5">
          <div className="text-[11px] font-bold text-white/50">Serie Pulite</div>
          <div className="mt-1 text-xl sm:text-2xl font-black text-white tabular-nums">
            {nerd.cleanExecutionRatio}%
          </div>
          <div className="text-[11px] font-bold text-white/70 tabular-nums">
            {nerd.totalCleanSetsLogged}/{nerd.totalSetsLogged}
          </div>
        </div>
      </section>

      {/* Clean Responsive BPM Evolution Chart */}
      <section className="relative overflow-hidden rounded-3xl chrome-card p-4 space-y-3">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 left-1/2 h-40 w-56 -translate-x-1/2 rounded-full bg-[#39FF14]/12 blur-3xl"
        />
        <div className="relative z-10 flex items-center justify-between gap-2">
          <h2 className="text-sm font-black chrome-text">BPM Pulito</h2>
          <select
            value={selectedExId}
            onChange={(e) => setSelectedExId(e.target.value)}
            aria-label="Filtra grafico per esercizio"
            className="max-w-[200px] rounded-xl chrome-pill px-2.5 py-1.5 text-xs font-bold text-white outline-none focus:border-[#39FF14]/50"
          >
            <option value="all">Tutti</option>
            {exercises.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.title}
              </option>
            ))}
          </select>
        </div>

        {pointsCoords.length > 0 ? (
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="w-full h-auto block"
            role="img"
            aria-label="Grafico BPM pulito nel tempo"
          >
            <defs>
              <linearGradient id="minimalOrangeArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#39FF14" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#39FF14" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {[0, 0.5, 1].map((t) => {
              const y = padT + t * (svgH - padT - padB);
              const val = Math.round(maxBpm - t * (maxBpm - minBpm));
              return (
                <g key={t}>
                  <line
                    x1={padL}
                    y1={y}
                    x2={svgW - padR}
                    y2={y}
                    stroke="rgba(255,255,255,0.1)"
                    strokeDasharray="3 4"
                  />
                  <text
                    x={padL - 6}
                    y={y + 3.5}
                    textAnchor="end"
                    fontSize={10}
                    fill="rgba(255,255,255,0.45)"
                    className="tabular-nums"
                  >
                    {val}
                  </text>
                </g>
              );
            })}

            {areaPolygon && (
              <polygon points={areaPolygon} fill="url(#minimalOrangeArea)" />
            )}

            {pointsCoords.length > 1 && (
              <polyline
                fill="none"
                stroke="#39FF14"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                points={avgPolyline}
              />
            )}

            {pointsCoords.map((pt, i) => (
              <g key={pt.sessionId}>
                <circle
                  cx={pt.x}
                  cy={pt.yAvg}
                  r={4.5}
                  fill="#39FF14"
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                />
                {(pointsCoords.length <= 8 ||
                  i === 0 ||
                  i === pointsCoords.length - 1 ||
                  i % 2 === 0) && (
                  <text
                    x={pt.x}
                    y={pt.yAvg - 9}
                    textAnchor="middle"
                    fontSize={9.5}
                    fontWeight={700}
                    fill="#FFFFFF"
                    className="tabular-nums"
                  >
                    {pt.avgCleanBpm}
                  </text>
                )}
                {(pointsCoords.length <= 6 ||
                  i === 0 ||
                  i === pointsCoords.length - 1) && (
                  <text
                    x={pt.x}
                    y={svgH - 8}
                    textAnchor="middle"
                    fontSize={9}
                    fill="rgba(255,255,255,0.45)"
                    className="tabular-nums"
                  >
                    {pt.dateLabel}
                  </text>
                )}
              </g>
            ))}
          </svg>
        ) : (
          <div className="py-6 text-center text-xs text-white/45">
            Nessun allenamento salvato.
          </div>
        )}
      </section>

      {/* Minimal Per-Exercise BPM Bar List */}
      <section className="rounded-3xl chrome-card p-4 space-y-3">
        {nerd.pillarStats.map((p) => {
          const targetGoal = Math.max(
            p.bestCleanBpm + 10,
            Math.round(p.baselineBpm * 1.4)
          );
          const pct = Math.min(
            100,
            Math.max(8, Math.round((p.bestCleanBpm / targetGoal) * 100))
          );

          return (
            <div key={p.exerciseId} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-bold text-white truncate">{p.title}</span>
                <span className="font-bold text-slate-200/85 tabular-nums shrink-0">
                  {p.baselineBpm} →{' '}
                  <span className="text-[#39FF14]">{p.bestCleanBpm}</span> BPM
                  {p.gainPct > 0 ? ` (+${p.gainPct}%)` : ''}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/15">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-slate-300 via-white to-[#39FF14] transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </section>

      {/* Diario & Registrazioni */}
      <section className="space-y-2.5 pt-2">
        <div className="px-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300/65">
            Diario &amp; Registrazioni
          </span>
        </div>
        <FeedAndBenchmarks
          recordings={recordings}
          exercises={exercises}
          onToggleBenchmark={onToggleBenchmark}
          onDeleteRecording={onDeleteRecording}
        />
      </section>

      {/* Compact Actions Footer */}
      <section className="rounded-2xl chrome-card p-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="flex items-center gap-1.5 rounded-full chrome-pill px-3 py-1.5 text-[11px] font-bold text-white hover:border-white/50 transition"
          >
            <Download className="h-3 w-3 text-[#39FF14]" />
            Esporta
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-full chrome-pill px-3 py-1.5 text-[11px] font-bold text-white hover:border-white/50 transition"
          >
            <Upload className="h-3 w-3" />
            Importa
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportFile}
            className="hidden"
          />
          {onOpenCloudModal && (
            <button
              type="button"
              onClick={onOpenCloudModal}
              className={`flex items-center gap-1.5 rounded-full chrome-pill px-3 py-1.5 text-[11px] font-bold transition ${
                cloudUserEmail
                  ? 'border-[#39FF14]/45 text-[#39FF14] hover:border-[#39FF14]/75'
                  : 'text-white hover:border-white/50'
              }`}
            >
              <Cloud className="h-3 w-3 text-[#39FF14]" />
              {cloudUserEmail ? `Cloud Sync • ${cloudUserEmail}` : 'Cloud Sync'}
            </button>
          )}
        </div>

        {syncMessage && (
          <span className="text-[11px] font-bold text-white/75 ml-auto">
            {syncMessage}
          </span>
        )}
      </section>

      {/* Isolated Danger Zone for Reset */}
      <section className="rounded-2xl border border-red-500/20 bg-red-950/10 p-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold text-red-200/80">
            Zona pericolosa
          </div>
          <p className="text-[10px] text-slate-400">
            Cancella tutti i dati locali e riparte da zero.
          </p>
        </div>
        <button
          type="button"
          onClick={openResetModal}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-red-500/35 bg-red-500/10 px-3 py-1.5 text-[11px] font-bold text-red-300 hover:bg-red-500/20 hover:border-red-400/60 transition"
        >
          <RotateCcw className="h-3 w-3" />
          Azzera tutto...
        </button>
      </section>

      {/* 3-Step Reset Confirmation Modal */}
      {resetModalStep > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={closeResetModal}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-red-500/35 bg-[#090A0D] p-5 text-white shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-400">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-red-400">
                    Conferma {resetModalStep} di 3
                  </div>
                  <h3 className="text-base font-black text-white">
                    {resetModalStep === 1 && 'Vuoi davvero azzerare tutto?'}
                    {resetModalStep === 2 && 'Verifica di sicurezza'}
                    {resetModalStep === 3 && 'Conferma definitiva'}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={closeResetModal}
                aria-label="Annulla azzeramento"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-white/60 hover:text-white transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {resetModalStep === 1 && (
              <div className="space-y-3">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Questa operazione eliminerà in modo{' '}
                  <strong className="text-red-300">irreversibile</strong> tutti i
                  tuoi dati su questo dispositivo:
                </p>
                <ul className="space-y-1.5 rounded-2xl border border-white/10 bg-black/60 p-3 text-xs text-slate-200">
                  <li>
                    • <strong>{sessionLogs.length}</strong> sessioni di
                    allenamento e tutti i record BPM
                  </li>
                  <li>
                    • <strong>{recordings.length}</strong> registrazioni
                    audio/video salvate
                  </li>
                  <li>• Il tuo piano personalizzato e le impostazioni</li>
                </ul>

                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#39FF14]/40 bg-[#39FF14]/10 px-4 py-2.5 text-xs font-bold text-[#39FF14] hover:bg-[#39FF14]/20 transition"
                >
                  <Download className="h-3.5 w-3.5" />
                  Scarica prima un backup (.json)
                </button>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeResetModal}
                    className="flex-1 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-black hover:bg-white/90 transition"
                  >
                    Annulla (tieni i dati)
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetModalStep(2)}
                    className="rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-2.5 text-xs font-bold text-red-300 hover:bg-red-500/20 transition"
                  >
                    Continua
                  </button>
                </div>
              </div>
            )}

            {resetModalStep === 2 && (
              <div className="space-y-3">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Spunta entrambe le caselle per confermare che sai cosa stai
                  facendo:
                </p>

                <label className="flex items-start gap-2.5 rounded-2xl border border-white/12 bg-black/60 p-3 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmCheckDataLoss}
                    onChange={(e) => setConfirmCheckDataLoss(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-red-500 shrink-0"
                  />
                  <span>
                    Ho capito che tutti i progressi e le registrazioni locali
                    verranno cancellati per sempre.
                  </span>
                </label>

                <label className="flex items-start gap-2.5 rounded-2xl border border-white/12 bg-black/60 p-3 text-xs text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmCheckBackup}
                    onChange={(e) => setConfirmCheckBackup(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-red-500 shrink-0"
                  />
                  <span>
                    Ho già salvato un backup oppure non voglio recuperare
                    questi dati.
                  </span>
                </label>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeResetModal}
                    className="flex-1 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-black hover:bg-white/90 transition"
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    disabled={!confirmCheckDataLoss || !confirmCheckBackup}
                    onClick={() => setResetModalStep(3)}
                    className="rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-2.5 text-xs font-bold text-red-200 hover:bg-red-500/25 disabled:opacity-35 disabled:cursor-not-allowed transition"
                  >
                    Ultimo passaggio
                  </button>
                </div>
              </div>
            )}

            {resetModalStep === 3 && (
              <div className="space-y-3">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Per confermare definitivamente, scrivi{' '}
                  <code className="rounded bg-red-500/20 px-1.5 py-0.5 font-mono font-black text-red-300">
                    AZZERA
                  </code>{' '}
                  nel campo qui sotto:
                </p>

                <input
                  type="text"
                  value={confirmResetText}
                  onChange={(e) => setConfirmResetText(e.target.value)}
                  placeholder="Scrivi AZZERA"
                  autoComplete="off"
                  autoCapitalize="characters"
                  className="w-full rounded-xl border border-red-500/35 bg-black px-3.5 py-2.5 text-sm font-bold text-white placeholder:text-slate-500 focus:border-red-400 focus:outline-none"
                />

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeResetModal}
                    className="flex-1 rounded-xl bg-white px-4 py-2.5 text-xs font-black text-black hover:bg-white/90 transition"
                  >
                    Annulla
                  </button>
                  <button
                    type="button"
                    disabled={
                      confirmResetText.trim().toUpperCase() !== 'AZZERA'
                    }
                    onClick={handleFinalResetConfirm}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-black text-white hover:bg-red-500 disabled:opacity-35 disabled:cursor-not-allowed transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Elimina tutto
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
