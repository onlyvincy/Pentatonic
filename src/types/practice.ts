export type CleanlinessScore = 1 | 2 | 3 | 4 | 5;

export type ShadowplayMode = 'off' | 'audio' | 'video';

export type MetronomeSoundId = 'woodblock' | 'mechanical' | 'rimshot' | 'digital';

export type SessionDurationPreset = 5 | 15 | 30 | 45;

export type ExerciseCategory = 'pentatonic' | 'picking' | 'rhythm' | 'legato' | 'fretboard';

export type FondamentaId =
  | 'velocita'
  | 'precisione'
  | 'espressivita'
  | 'visione'
  | 'groove';

export type PainPointId =
  | 'speed_wall'
  | 'left_hand_fatigue'
  | 'timing_drift'
  | 'neck_trapped';

export type SecondaryBottleneckId =
  | 'string_crossing'
  | 'finger_tension'
  | 'rhythm_stiffness'
  | 'box_isolation';

export type PlayerLevelId = 'foundation' | 'intermediate' | 'advanced';

export type PathId = 'solista' | 'rhythm';

export interface DiagnosticQuizAnswers {
  pathId?: PathId;
  primaryPainPoint: PainPointId;
  secondaryBottleneck: SecondaryBottleneckId;
  level: PlayerLevelId;
  weeklyDays: 3 | 5 | 7;
  sessionPreset: SessionDurationPreset;
}

export interface ExerciseWeeklyDose {
  exerciseId: string;
  role: 'primario' | 'secondario' | 'fondamentale';
  roleLabel: string;
  weeklyMinSets: number;
  weeklyOptimalSets: number;
  setsPerSession: number;
  setDurationSec: number;
  restSec: number;
  coachMethod: string;
  scientificRationale: string;
}

export interface ScientificPlanPrescription {
  id: string;
  createdAt: string;
  answers: DiagnosticQuizAnswers;
  profileTitle: string;
  diagnosisSummary: string;
  scientificBasis: string;
  doses: ExerciseWeeklyDose[];
}

export type Subdivision = '1/4' | '1/8' | '1/8T' | '1/16';

export type GapClickMode = 'off' | '1-in-4' | 'random-25';

export interface FretNote {
  /** Guitar string number: 1 = high e (top visual line), 6 = low E (bottom visual line) */
  string: 1 | 2 | 3 | 4 | 5 | 6;
  fret: number;
  label?: string;
  isRoot?: boolean;
  finger?: string;
}

export interface DemoStep {
  /** One note for single-note patterns, or multiple notes for a chord strum */
  notes: FretNote[];
  /** True for percussive muted hit ("stoppata") */
  muted?: boolean;
  /** True when the note from the previous step sustains through this 1/8 slot without re-plucking (creates 1/4 holds & rhythmic variety) */
  sustain?: boolean;
  /** Optional technique hint shown during animated playback (e.g. 'Hammer-On', 'Slide', 'Tenuta 1/4') */
  technique?: string;
}

export interface ExerciseVariant {
  id: string;
  name: string;
  shortLabel: string;
  /** Difficulty multiplier (1.00 = standard, >1.00 = harder biomechanical permutation) used in weighted BPM normalization */
  difficultyWeight: number;
  minLevel?: PlayerLevelId;
  maxLevel?: PlayerLevelId;
  fretboardNotes: FretNote[];
  demoSequence: DemoStep[];
}

export interface Exercise {
  id: string;
  title: string;
  pillarName?: string;
  coachInspiration?: string;
  category: ExerciseCategory;
  forWho?: string;
  expectedOutcome?: string;
  description: string;
  scientificRationale: string;
  coachingCues: string[];
  defaultBpm: number;
  currentTargetBpm: number;
  baselineBpm: number;
  bestCleanBpm: number;
  defaultSets: number;
  defaultSetDurationSec: number;
  defaultRestSec: number;
  subdivision: Subdivision;
  gapClickMode: GapClickMode;
  fretboardNotes: FretNote[];
  demoSequence?: DemoStep[];
  variants?: ExerciseVariant[];
  activeVariantId?: string;
  /** Maps variantId -> latest target/clean BPM for that specific variant */
  variantBpms?: Record<string, number>;
  tabSnippet?: string;
  isBenchmark?: boolean;
  isCustom?: boolean;
}

export interface WorkoutItem {
  exerciseId: string;
  sets: number;
  durationSec: number;
  restSec: number;
  notes?: string;
}

export interface WorkoutTemplate {
  id: string;
  title: string;
  subtitle: string;
  programId: string;
  dayNumber: number;
  estimatedMinutes: number;
  items: WorkoutItem[];
  isCustom?: boolean;
}

export interface ProgramCheckpoint {
  id: string;
  title: string;
  exerciseId: string;
  targetBpm: number;
  targetCleanliness: CleanlinessScore;
}

export interface ProgramPercorso {
  id: string;
  title: string;
  coachInspiration?: string;
  category: ExerciseCategory;
  level: 'Fondamenta' | 'Intermedio' | 'Avanzato';
  forWho?: string;
  expectedOutcome?: string;
  description: string;
  scientificFocus: string;
  weeks: number;
  workoutIds: string[];
  checkpoints: ProgramCheckpoint[];
}

export interface SetLog {
  id: string;
  exerciseId: string;
  variantId?: string;
  variantLabel?: string;
  setNumber: number;
  bpm: number;
  durationSec: number;
  cleanliness: CleanlinessScore;
  nextRecommendedBpm: number;
  timestamp: string;
  savedRecordingId?: string;
  note?: string;
}

export interface WorkoutSessionLog {
  id: string;
  workoutId: string;
  workoutTitle: string;
  date: string;
  durationPreset: SessionDurationPreset;
  totalMinutes: number;
  sets: SetLog[];
  averageCleanliness: number;
}

export interface FeedRecording {
  id: string;
  exerciseId: string;
  exerciseTitle: string;
  workoutTitle: string;
  date: string;
  bpm: number;
  baselineBpmAtTime: number;
  cleanliness: CleanlinessScore;
  mediaType: 'audio' | 'video';
  durationSec: number;
  note: string;
  isBenchmarkCheckpoint: boolean;
  programName?: string;
  isSyntheticDemo?: boolean;
}

export interface UserSettings {
  shadowplayMode: ShadowplayMode;
  metronomeSound?: MetronomeSoundId;
  visualMetronomeOnly: boolean;
  autoRampPerSet: boolean;
  weeklyGoalDays: number;
  activeProgramId: string;
  selectedPreset: SessionDurationPreset;
  cloudSyncEnabled: boolean;
  lastSyncedAt?: string;
  hasCompletedOnboarding?: boolean;
  scientificPlan?: ScientificPlanPrescription;
}

export interface AppState {
  exercises: Exercise[];
  workouts: WorkoutTemplate[];
  programs: ProgramPercorso[];
  sessionLogs: WorkoutSessionLog[];
  feedRecordings: FeedRecording[];
  settings: UserSettings;
}

export interface ScaledWorkoutItem extends WorkoutItem {
  exercise: Exercise;
  targetBpm: number;
  preferredVariantId?: string;
  pillarNumber?: number;
  pillarLabel?: string;
  selectionReason?: string;
}

export interface ScaledWorkoutPlan {
  workout: WorkoutTemplate;
  preset: SessionDurationPreset;
  modeLabel: string;
  modeDescription: string;
  isStandardized: boolean;
  estimatedMinutes: number;
  playerLevel?: PlayerLevelId;
  items: ScaledWorkoutItem[];
}
