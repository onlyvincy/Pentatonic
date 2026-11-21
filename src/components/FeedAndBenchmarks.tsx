import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Bookmark, Film, Mic, Trash2 } from 'lucide-react';
import { Exercise, FeedRecording } from '../types/practice';
import { getRecordingBlob } from '../services/storage';

interface FeedAndBenchmarksProps {
  recordings: FeedRecording[];
  exercises: Exercise[];
  onToggleBenchmark: (recordingId: string) => void;
  onDeleteRecording: (recordingId: string) => void;
}

const MediaClipPlayer: React.FC<{
  recording: FeedRecording;
  compact?: boolean;
}> = ({ recording, compact = false }) => {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;
    setLoading(true);

    getRecordingBlob(recording.id).then((blob) => {
      if (!active) return;
      if (blob) {
        createdUrl = URL.createObjectURL(blob);
        setMediaUrl(createdUrl);
      } else {
        setMediaUrl(null);
      }
      setLoading(false);
    });

    return () => {
      active = false;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [recording.id]);

  if (loading) {
    return <div className="h-9 w-full animate-pulse rounded-xl bg-white/10" />;
  }

  if (!mediaUrl) {
    return (
      <div className="rounded-xl bg-black border border-white/10 px-3 py-2 text-[11px] text-white/45">
        Audio non disponibile.
      </div>
    );
  }

  if (recording.mediaType === 'video') {
    return (
      <video
        src={mediaUrl}
        controls
        playsInline
        className={`w-full rounded-xl bg-black ${compact ? 'max-h-40' : 'max-h-56'}`}
      />
    );
  }

  return <audio src={mediaUrl} controls className="w-full h-9" />;
};

export const FeedAndBenchmarks: React.FC<FeedAndBenchmarksProps> = ({
  recordings,
  exercises,
  onToggleBenchmark,
  onDeleteRecording,
}) => {
  const [filterMode, setFilterMode] = useState<'all' | 'benchmarks'>('all');
  const [filterExerciseId, setFilterExerciseId] = useState<string>('all');

  const exercisesWithMultipleTakes = useMemo(() => {
    const counts = new Map<string, number>();
    recordings.forEach((r) => {
      counts.set(r.exerciseId, (counts.get(r.exerciseId) || 0) + 1);
    });
    return exercises.filter((ex) => (counts.get(ex.id) || 0) >= 2);
  }, [recordings, exercises]);

  const [compareExerciseId, setCompareExerciseId] = useState<string>(() => {
    return (
      exercisesWithMultipleTakes[0]?.id ||
      recordings[0]?.exerciseId ||
      exercises[0]?.id ||
      ''
    );
  });

  const exerciseTakesSorted = useMemo(() => {
    return recordings
      .filter((r) => r.exerciseId === compareExerciseId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [recordings, compareExerciseId]);

  const [leftTakeId, setLeftTakeId] = useState<string>('');
  const [rightTakeId, setRightTakeId] = useState<string>('');

  useEffect(() => {
    if (exerciseTakesSorted.length >= 2) {
      setLeftTakeId(exerciseTakesSorted[0].id);
      setRightTakeId(exerciseTakesSorted[exerciseTakesSorted.length - 1].id);
    } else if (exerciseTakesSorted.length === 1) {
      setLeftTakeId(exerciseTakesSorted[0].id);
      setRightTakeId(exerciseTakesSorted[0].id);
    } else {
      setLeftTakeId('');
      setRightTakeId('');
    }
  }, [exerciseTakesSorted]);

  const leftTake = exerciseTakesSorted.find((t) => t.id === leftTakeId);
  const rightTake = exerciseTakesSorted.find((t) => t.id === rightTakeId);

  const filteredRecordings = useMemo(() => {
    return recordings
      .filter((r) => {
        if (filterMode === 'benchmarks' && !r.isBenchmarkCheckpoint) return false;
        if (filterExerciseId !== 'all' && r.exerciseId !== filterExerciseId)
          return false;
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [recordings, filterMode, filterExerciseId]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: 'short',
    });

  const bpmDelta = leftTake && rightTake ? rightTake.bpm - leftTake.bpm : 0;

  return (
    <div className="space-y-4">
      {/* Confronto Prima vs Dopo */}
      <section className="rounded-2xl chrome-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-white">Prima vs Dopo</h2>

          <select
            value={compareExerciseId}
            onChange={(e) => setCompareExerciseId(e.target.value)}
            aria-label="Seleziona esercizio da confrontare"
            className="max-w-[200px] rounded-xl bg-black border border-white/15 px-2.5 py-1.5 text-xs font-bold text-white outline-none focus:border-white/40"
          >
            {exercises.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.title}
              </option>
            ))}
          </select>
        </div>

        {exerciseTakesSorted.length >= 2 && leftTake && rightTake ? (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 rounded-full border border-white/15 bg-black px-3 py-1 text-xs font-bold tabular-nums">
              <span className="text-white/60">{leftTake.bpm}</span>
              <ArrowRight className="h-3.5 w-3.5 text-[#39FF14]" />
              <span className="text-[#39FF14]">{rightTake.bpm} BPM</span>
              <span className="text-white/30">•</span>
              <span className="text-white">
                {bpmDelta >= 0 ? '+' : ''}
                {bpmDelta} BPM
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-black border border-white/15 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                    PRIMA
                  </span>
                  <select
                    value={leftTakeId}
                    onChange={(e) => setLeftTakeId(e.target.value)}
                    aria-label="Seleziona registrazione prima"
                    className="rounded-lg bg-black border border-white/15 px-2 py-0.5 text-[10px] font-bold text-white outline-none"
                  >
                    {exerciseTakesSorted.map((t) => (
                      <option key={t.id} value={t.id}>
                        {formatDate(t.date)} • {t.bpm} BPM
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-baseline justify-between tabular-nums">
                  <span className="text-base font-black text-white">
                    {leftTake.bpm} BPM
                  </span>
                  <span className="text-[11px] font-bold text-white/60">
                    {leftTake.cleanliness}/5
                  </span>
                </div>

                <MediaClipPlayer recording={leftTake} compact />
              </div>

              <div className="rounded-xl bg-black border border-[#39FF14]/60 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#39FF14]">
                    DOPO
                  </span>
                  <select
                    value={rightTakeId}
                    onChange={(e) => setRightTakeId(e.target.value)}
                    aria-label="Seleziona registrazione dopo"
                    className="rounded-lg bg-black border border-white/15 px-2 py-0.5 text-[10px] font-bold text-white outline-none"
                  >
                    {exerciseTakesSorted.map((t) => (
                      <option key={t.id} value={t.id}>
                        {formatDate(t.date)} • {t.bpm} BPM
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-baseline justify-between tabular-nums">
                  <span className="text-base font-black text-[#39FF14]">
                    {rightTake.bpm} BPM
                  </span>
                  <span className="text-[11px] font-bold text-white">
                    {rightTake.cleanliness}/5
                  </span>
                </div>

                <MediaClipPlayer recording={rightTake} compact />
              </div>
            </div>
          </div>
        ) : (
          <div className="py-5 text-center text-xs text-white/45">
            Salva almeno 2 clip per confrontare.
          </div>
        )}
      </section>

      {/* Saved Clips List */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-white">
            Registrazioni ({filteredRecordings.length})
          </h2>

          <div className="flex items-center gap-2">
            <div className="flex rounded-full bg-black border border-white/15 p-0.5">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                  filterMode === 'all'
                    ? 'bg-white text-black'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                Tutte
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('benchmarks')}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                  filterMode === 'benchmarks'
                    ? 'bg-[#39FF14] text-black'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                Confronto
              </button>
            </div>

            <select
              value={filterExerciseId}
              onChange={(e) => setFilterExerciseId(e.target.value)}
              aria-label="Filtra registrazioni per esercizio"
              className="max-w-[160px] rounded-xl bg-black border border-white/15 px-2.5 py-1.5 text-[11px] font-bold text-white outline-none"
            >
              <option value="all">Tutti</option>
              {exercises.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredRecordings.length > 0 ? (
          <div className="space-y-2.5">
            {filteredRecordings.map((rec) => (
              <article
                key={rec.id}
                className="rounded-2xl chrome-card p-3.5 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {rec.mediaType === 'video' ? (
                      <Film className="h-3.5 w-3.5 text-white shrink-0" />
                    ) : (
                      <Mic className="h-3.5 w-3.5 text-[#39FF14] shrink-0" />
                    )}
                    <h3 className="text-xs sm:text-sm font-bold text-white truncate">
                      {rec.exerciseTitle}
                    </h3>
                    <span className="text-[11px] text-white/45 shrink-0 tabular-nums">
                      {formatDate(rec.date)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 tabular-nums">
                    <span className="text-xs sm:text-sm font-black text-[#39FF14]">
                      {rec.bpm} BPM
                    </span>
                    <span className="text-[11px] font-bold text-white/75">
                      {rec.cleanliness}/5
                    </span>
                  </div>
                </div>

                <MediaClipPlayer recording={rec} />

                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => onToggleBenchmark(rec.id)}
                    aria-label={
                      rec.isBenchmarkCheckpoint
                        ? 'Rimuovi dal confronto'
                        : 'Usa per confronto'
                    }
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition ${
                      rec.isBenchmarkCheckpoint
                        ? 'border-[#39FF14]/60 bg-black text-[#39FF14]'
                        : 'border-white/15 bg-black text-white/55 hover:text-white'
                    }`}
                  >
                    <Bookmark className="h-3 w-3" />
                    Confronto
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteRecording(rec.id)}
                    className="rounded-full border border-white/15 bg-black p-1.5 text-white/45 hover:text-[#39FF14] transition"
                    aria-label="Elimina clip"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl chrome-card p-5 text-center text-xs text-slate-300/55">
            Nessuna registrazione salvata.
          </div>
        )}
      </section>
    </div>
  );
};
