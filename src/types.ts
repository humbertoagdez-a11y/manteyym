export type Goal = "hipertrofia" | "fuerza" | "perdida_grasa" | "resistencia" | "salud";
export type Level = "principiante" | "intermedio" | "avanzado";
export type Progression = "doble" | "lineal" | "rir";
export type Pattern = "empuje-horizontal" | "empuje-vertical" | "tiron-horizontal" | "tiron-vertical" | "bisagra" | "sentadilla" | "zancada" | "core" | "aislamiento" | "otro";
export type Muscle = "pecho" | "espalda" | "hombros" | "cuadriceps" | "isquiotibiales" | "gluteos" | "biceps" | "triceps" | "gemelos" | "abdomen" | "aductores" | "antebrazos" | "otro";
export type Tab = "hoy" | "rutinas" | "ejercicios" | "progreso" | "ajustes";
export type ExerciseSource = "local" | "free-exercise-db" | "personal";

export interface Profile {
  id: "main";
  onboardingComplete: boolean;
  goal: Goal;
  level: Level;
  yearsTraining: number;
  days: number;
  minutes: 30 | 45 | 60 | 90;
  equipment: string[];
  priorities: Muscle[];
  injuries: Injury[];
  exclusions: string[];
  units: "kg" | "lb";
  progression: Progression;
}

export interface Injury {
  id: string;
  zone: string;
  note: string;
  pain: number;
  createdAt: number;
}

export interface Settings {
  id: "main";
  theme: "dark" | "light";
  defaultRest: number;
  barWeight: number;
  plates: number[];
  sound: boolean;
  vibration: boolean;
  notifications: boolean;
  reminders: boolean;
  reminderTime: string;
  reminderDays: number[];
}

export interface Exercise {
  id: string;
  name: string;
  muscle: Muscle;
  secondary: Muscle[];
  equipment: string[];
  pattern: Pattern;
  category: "compuesto" | "aislamiento";
  steps: string[];
  mistakes: string[];
  source: ExerciseSource;
  originalName?: boolean;
  originalMuscle?: string;
  images?: string[];
  instructionsOriginal?: boolean;
}

export interface WorkoutExercise {
  exerciseId: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  restSec: number;
  rir: number;
  note: string;
  superset?: string;
  groupType?: "superset" | "circuito";
}

export interface RoutineDay {
  id: string;
  name: string;
  note: string;
  exercises: WorkoutExercise[];
}

export interface Routine {
  id: string;
  name: string;
  split: string;
  template: string;
  createdAt: number;
  days: RoutineDay[];
}

export interface TrainingBlock {
  id: string;
  routineId: string;
  name: string;
  startAt: number;
  weeks: number;
  deloadWeek: number;
}

export type SetType = "normal" | "calentamiento" | "fallo" | "descendente";

export interface LoggedSet {
  id: string;
  weight: number;
  reps: number;
  type: SetType;
  rir: number | null;
  rpe?: number | null;
  note: string;
  completed: boolean;
  completedAt?: number;
}

export interface SessionExercise {
  exerciseId: string;
  targetSets: number;
  repsMin: number;
  repsMax: number;
  restSec: number;
  note: string;
  superset?: string;
  groupType?: "superset" | "circuito";
  sets: LoggedSet[];
}

export interface ActiveSession {
  id: "current";
  routineId: string;
  dayId: string;
  dayName: string;
  startedAt: number;
  timeZone: string;
  segmentStartedAt: number | null;
  elapsedBeforePause: number;
  status: "running" | "paused";
  restEndsAt: number | null;
  restDurationSec: number;
  currentExercise: number;
  exercises: SessionExercise[];
  notes: string;
}

export interface TrainingSession {
  id: string;
  routineId: string;
  dayId: string;
  dayName: string;
  startedAt: number;
  endedAt: number;
  timeZone: string;
  durationMs: number;
  volume: number;
  notes: string;
  exercises: SessionExercise[];
}

export interface BodyMetric {
  id: string;
  at: number;
  weight?: number;
  waist?: number;
  chest?: number;
  hip?: number;
}

export interface GoalRecord {
  id: string;
  exerciseId: string;
  target: number;
  units: "kg" | "lb";
  createdAt: number;
  deadline?: number;
}

export interface CardioRecord {
  id: string;
  type: string;
  minutes: number;
  intensity: number;
  at: number;
}

export interface PhotoRecord {
  id: string;
  at: number;
  label: string;
  blob?: Blob;
  dataUrl?: string;
}

export interface MetaRecord {
  id: string;
  [key: string]: unknown;
}

export interface StoreMap {
  profile: Profile;
  settings: Settings;
  exercises: Exercise;
  routines: Routine;
  blocks: TrainingBlock;
  sessions: TrainingSession;
  activeSession: ActiveSession;
  bodyMetrics: BodyMetric;
  injuries: Injury;
  goals: GoalRecord;
  cardio: CardioRecord;
  photos: PhotoRecord;
  meta: MetaRecord;
}

export type StoreName = keyof StoreMap;