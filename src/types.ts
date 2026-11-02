export type Goal = "hipertrofia" | "fuerza" | "perdida_grasa" | "resistencia" | "salud";
export type Level = "principiante" | "intermedio" | "avanzado";
export type Progression = "doble" | "lineal" | "rir";
export type Pattern =
  | "empuje-horizontal"
  | "empuje-vertical"
  | "tiron-horizontal"
  | "tiron-vertical"
  | "bisagra"
  | "sentadilla"
  | "zancada"
  | "core"
  | "aislamiento"
  | "otro";
export type Muscle =
  | "pecho"
  | "espalda"
  | "hombros"
  | "cuadriceps"
  | "isquiotibiales"
  | "gluteos"
  | "biceps"
  | "triceps"
  | "gemelos"
  | "abdomen"
  | "aductores"
  | "antebrazos"
  | "otro";
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
  /** v2: lado en ejercicios unilaterales. */
  side?: "izq" | "der" | "ambos";
  /** v2: tempo libre, p. ej. "3-1-1-0". */
  tempo?: string;
  /** v2: segundos reales de descanso antes de esta serie (calculado). */
  restTakenSec?: number;
  /** v2: lastre (+) o asistencia (−) en kg/lb, aparte de weight. */
  extraLoad?: number;
  /** v2: variante de agarre o equipo (texto corto). */
  variant?: string;
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
  /** v2: undefined equivale a "hecho". */
  status?: "hecho" | "omitido" | "sustituido";
  statusReason?: "dolor" | "equipo_ocupado" | "tiempo" | "otro";
  /** v2: ejercicio planificado originalmente cuando status es "sustituido". */
  replacedExerciseId?: string;
}

export interface ActiveSession {
  id: "current";
  /** v2: id definitivo que tendrá la sesión al terminar (vincula dolor y chequeo durante la sesión). */
  sessionId?: string;
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

export interface TrainingSession extends Revisioned {
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
  /** v2: chequeo previo ligado a esta sesión. */
  checkinId?: string;
  /** v2: RPE global de la sesión (1–10). */
  sessionRpe?: number;
  /** v2: ánimo al terminar (1–5). */
  mood?: number;
  bodyWeight?: number;
  place?: string;
  /** v2: cómo terminó la sesión respecto al dolor. */
  endPain?: "sin_dolor" | "con_molestia";
}

export interface BodyMetric {
  id: string;
  at: number;
  weight?: number;
  waist?: number;
  chest?: number;
  hip?: number;
  /** v2 */
  bodyFat?: number;
  neck?: number;
  shoulders?: number;
  arm?: number;
  forearm?: number;
  thigh?: number;
  calf?: number;
  note?: string;
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
  /** v2: pose para comparar lado a lado (frente, perfil, espalda). */
  pose?: "frente" | "perfil" | "espalda" | "otra";
}

export interface MetaRecord {
  id: string;
  [key: string]: unknown;
}

// ---- Esquema v2 ----

/** Campos de trazabilidad para registros editables (opcionales: los registros v1 no los tienen). */
export interface Revisioned {
  createdAt?: number;
  updatedAt?: number;
  revision?: number;
}

export type PainSide = "izq" | "der" | "ambos" | "centro";
export type PainQuality = "punzante" | "sordo" | "ardor" | "hormigueo" | "tension" | "rigidez" | "otro";
export type PainWhen = "antes" | "durante" | "despues" | "fuera_de_entreno" | "al_despertar";

/** Registro de dolor append-only. "sin_dolor" es un check-in explícito de que no hay dolor. */
export interface PainEntry extends Revisioned {
  id: string;
  at: number;
  timeZone: string;
  status: "dolor" | "sin_dolor";
  /** Ids de PAIN_ZONES; vacío si status es "sin_dolor". */
  zones: string[];
  side?: PainSide;
  /** 0–10; undefined si status es "sin_dolor". */
  intensity?: number;
  quality?: PainQuality[];
  when: PainWhen;
  context?: { sessionId?: string; exerciseId?: string; setId?: string };
  note: string;
  /** Apareció tras un golpe, caída o torsión fuerte (señal de alerta). */
  afterImpact?: boolean;
  ongoing: boolean;
  resolvedAt?: number;
  /** Marca registros creados por una migración (p. ej. "v1-injury"). */
  origin?: string;
  createdAt: number;
  updatedAt: number;
}

/** Chequeo previo (disposición). Escala 1–5 salvo horas de sueño. */
export interface DailyCheckin extends Revisioned {
  id: string;
  at: number;
  dayKey: string;
  sessionId?: string;
  sleepHours?: number;
  sleepQuality?: number;
  energy?: number;
  stress?: number;
  soreness?: number;
  sorenessZones?: string[];
  mood?: number;
  origin?: string;
}

export type AuditAction = "create" | "update" | "delete" | "restore" | "migrate";

/** Bitácora append-only de cambios sobre registros editables. */
export interface AuditEntry {
  id: string;
  at: number;
  entity: string;
  entityId: string;
  action: AuditAction;
  summary: string;
  before?: unknown;
  after?: unknown;
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
  painEntries: PainEntry;
  dailyCheckins: DailyCheckin;
  auditLog: AuditEntry;
}

export type StoreName = keyof StoreMap;
