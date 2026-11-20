import React, { useMemo, useRef, useState } from 'react';
import { Download, RotateCcw, Upload, UserPlus } from 'lucide-react';
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
  onCreateCleanProfile: () => void;
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
  onCreateCleanProfile,
}) => {
  const [selectedExId, setSelectedExId] = useState<string>('all');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
        <div className="rounded-2xl bg-black border border-white/15 p-3.5">
          <div className="text-[11px] font-bold text-white/50">BPM Pulito</div>
          <div className="mt-1 text-xl sm:text-2xl font-black text-white tabular-nums">
            {nerd.currentAvgCleanBpm}
          </div>
          <div className="text-[11px] font-bold text-[#FF6B00] tabular-nums">
            {nerd.cleanBpmDelta >= 0 ? '+' : ''}
            {nerd.cleanBpmDelta} BPM
          </div>
        </div>

        <div className="rounded-2xl bg-black border border-white/15 p-3.5">
          <div className="text-[11px] font-bold text-white/50">Sessioni 28g</div>
          <div className="mt-1 text-xl sm:text-2xl font-black text-white tabular-nums">
            {nerd.uniqueDays28d}
          </div>
          <div className="text-[11px] font-bold text-white/70 tabular-nums">
            {nerd.consistency28dPct}%
          </div>
        </div>

        <div className="rounded-2xl bg-black border border-white/15 p-3.5">
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
      <section className="rounded-2xl bg-black border border-white/15 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-white">BPM Pulito</h2>
          <select
            value={selectedExId}
            onChange={(e) => setSelectedExId(e.target.value)}
            aria-label="Filtra grafico per esercizio"
            className="max-w-[200px] rounded-xl bg-black border border-white/15 px-2.5 py-1.5 text-xs font-bold text-white outline-none focus:border-white/40"
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
                <stop offset="0%" stopColor="#FF6B00" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#FF6B00" stopOpacity="0.0" />
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
                stroke="#FF6B00"
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
                  fill="#FF6B00"
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
      <section className="rounded-2xl bg-black border border-white/15 p-4 space-y-3">
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
                <span className="font-bold text-white/80 tabular-nums shrink-0">
                  {p.baselineBpm} →{' '}
                  <span className="text-[#FF6B00]">{p.bestCleanBpm}</span> BPM
                  {p.gainPct > 0 ? ` (+${p.gainPct}%)` : ''}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                <div
                  className="h-full rounded-full bg-white transition-all duration-300"
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
          <span className="text-[11px] font-bold uppercase tracking-wider text-white/55">
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
      <section className="rounded-2xl bg-black border border-white/15 p-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="flex items-center gap-1.5 rounded-full bg-black border border-white/15 px-3 py-1.5 text-[11px] font-bold text-white hover:border-white/40 transition"
          >
            <Download className="h-3 w-3 text-[#FF6B00]" />
            Esporta
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-full bg-black border border-white/15 px-3 py-1.5 text-[11px] font-bold text-white hover:border-white/40 transition"
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
          <button
            type="button"
            onClick={onResetDemoData}
            className="flex items-center gap-1.5 rounded-full bg-black border border-white/15 px-3 py-1.5 text-[11px] font-bold text-white/60 hover:text-white transition"
          >
            <RotateCcw className="h-3 w-3" />
            Ripristina
          </button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          {syncMessage && (
            <span className="text-[11px] font-bold text-white/75">
              {syncMessage}
            </span>
          )}
          <button
            type="button"
            onClick={onCreateCleanProfile}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#FF6B00] px-3.5 py-1.5 text-[11px] font-black text-black hover:bg-[#ff7d1f] transition"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Nuovo Profilo
          </button>
        </div>
      </section>
    </div>
  );
};
