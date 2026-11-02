import { exerciseNameTranslations, FREE_DB, muscleTranslations } from "../data/exerciseSource";
import type { Exercise, Goal, Muscle, Pattern, Profile, Progression, Routine, RoutineDay, SessionExercise, TrainingSession, WorkoutExercise } from "../types";

export const MUSCLES: Muscle[] = ["pecho", "espalda", "hombros", "cuadriceps", "isquiotibiales", "gluteos", "biceps", "triceps", "gemelos", "abdomen", "aductores", "antebrazos"];
export const MUSCLE_LABELS: Record<Muscle, string> = {
  pecho: "Pecho", espalda: "Espalda", hombros: "Hombros", cuadriceps: "Cuadriceps",
  isquiotibiales: "Isquiotibiales", gluteos: "Gluteos", biceps: "Biceps", triceps: "Triceps",
  gemelos: "Gemelos", abdomen: "Abdomen", aductores: "Aductores", antebrazos: "Antebrazos", otro: "No especificado",
};

export function makeId(prefix = "id"): string {
  const randomId = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${randomId ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`}`;
}

export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function estimatedOneRepMax(weight: number, reps: number): number {
  if (!(weight > 0) || !(reps > 0)) return 0;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

export function warmupSets(workWeight: number): { weight: number; reps: number; percent: number }[] {
  if (!(workWeight > 0)) return [];
  const round = (value: number) => Math.round(value * 2) / 2;
  return [
    { weight: round(workWeight * 0.4), reps: 8, percent: 40 },
    { weight: round(workWeight * 0.6), reps: 5, percent: 60 },
    { weight: round(workWeight * 0.8), reps: 3, percent: 80 },
  ];
}

export function calculatePlates(total: number, bar: number, available: number[]): { eachSide: number[]; actual: number; remainder: number } {
  const targetPerSide = Math.max(0, (total - bar) / 2);
  const plates = available.filter((plate) => plate > 0).sort((a, b) => b - a);
  let remaining = targetPerSide;
  const eachSide: number[] = [];
  for (const plate of plates) {
    if (remaining + 1e-8 >= plate) {
      eachSide.push(plate);
      remaining = Math.round((remaining - plate) * 1000) / 1000;
    }
  }
  const sideLoad = eachSide.reduce((sum, plate) => sum + plate, 0);
  return { eachSide, actual: bar + sideLoad * 2, remainder: Math.max(0, total - (bar + sideLoad * 2)) };
}

export function goalRepRange(goal: Goal, category: Exercise["category"]): [number, number] {
  if (goal === "fuerza") return category === "compuesto" ? [3, 6] : [6, 10];
  if (goal === "resistencia") return [15, 20];
  return category === "compuesto" ? [6, 12] : [10, 20];
}

export function suggestProgression(
  history: TrainingSession[], exerciseId: string, model: Progression, range: [number, number], units: "kg" | "lb",
): { weight: number; reps: number; reason: string } {
  const logs = history
    .flatMap((session) => session.exercises.filter((item) => item.exerciseId === exerciseId).flatMap((item) => item.sets.filter((set) => set.completed && set.type !== "calentamiento").map((set) => ({ ...set, at: session.endedAt }))))
    .sort((a, b) => b.at - a.at);
  const latest = logs[0];
  const increment = units === "kg" ? 2.5 : 5;
  if (!latest) return { weight: 0, reps: range[0], reason: "Sin historial: empieza con una carga comoda y deja 2-3 repeticiones en reserva." };
  const round = (value: number) => Math.round(value * 2) / 2;
  const allRecentAt = [...new Set(logs.map((log) => log.at))].slice(0, 1)[0];
  const lastWorkoutSets = logs.filter((log) => log.at === allRecentAt);
  const topReps = Math.max(...lastWorkoutSets.map((set) => set.reps));
  if (model === "lineal") {
    return { weight: round(latest.weight + increment), reps: range[0], reason: "Progresion lineal: suma un incremento pequeno si la tecnica sigue estable." };
  }
  if (model === "rir" && (latest.rir ?? 2) >= 3) {
    return { weight: round(latest.weight + increment), reps: Math.max(range[0], latest.reps), reason: "La ultima serie dejo margen; prueba un incremento pequeno y conserva el RIR objetivo." };
  }
  if (topReps >= range[1] && (latest.rir === null || latest.rir >= 1)) {
    return { weight: round(latest.weight + increment), reps: range[0], reason: "Completaste el extremo alto del rango; sube poco el peso y vuelve al inicio del rango." };
  }
  return { weight: latest.weight, reps: Math.min(range[1], Math.max(range[0], latest.reps + 1)), reason: "Mantiene el peso y suma una repeticion antes de aumentar la carga." };
}

export function detectStagnation(history: TrainingSession[], exerciseId: string): boolean {
  const recent = history.filter((session) => session.exercises.some((item) => item.exerciseId === exerciseId && item.sets.some((set) => set.completed && set.type !== "calentamiento"))).slice(0, 3);
  if (recent.length < 3) return false;
  const top = recent.map((session) => Math.max(0, ...session.exercises.filter((item) => item.exerciseId === exerciseId).flatMap((item) => item.sets.filter((set) => set.completed && set.type !== "calentamiento").map((set) => estimatedOneRepMax(set.weight, set.reps)))));
  return top[0] <= top[1] && top[1] <= top[2];
}

const affectedPatterns: Record<string, Pattern[]> = {
  hombro: ["empuje-vertical", "empuje-horizontal", "tiron-vertical"], hombros: ["empuje-vertical", "empuje-horizontal", "tiron-vertical"],
  rodilla: ["sentadilla", "zancada"], rodillas: ["sentadilla", "zancada"],
  lumbar: ["bisagra", "sentadilla"], espalda: ["bisagra"],
  codo: ["empuje-horizontal", "empuje-vertical", "tiron-horizontal", "tiron-vertical"],
  muneca: ["empuje-horizontal", "empuje-vertical", "tiron-horizontal"], muñeca: ["empuje-horizontal", "empuje-vertical", "tiron-horizontal"],
  tobillo: ["sentadilla", "zancada"], cadera: ["bisagra", "sentadilla", "zancada"],
};

export function isExerciseCompatible(exercise: Exercise, profile: Profile, respectExclusions = true): boolean {
  const chosen = profile.equipment.map(normalizeText);
  const hasGym = chosen.some((item) => item.includes("gimnasio completo"));
  const hasBodyweight = chosen.includes("peso corporal");
  const equipmentOk = hasGym || exercise.equipment.includes("peso corporal") && (hasBodyweight || chosen.length === 0)
    || exercise.equipment.every((item) => chosen.some((choice) => choice === normalizeText(item) || choice.includes(normalizeText(item)) || normalizeText(item).includes(choice)));
  if (!equipmentOk) return false;
  if (respectExclusions && profile.exclusions.some((term) => term.trim() && normalizeText(exercise.name).includes(normalizeText(term)))) return false;
  const injuries = profile.injuries.map((injury) => normalizeText(injury.zone));
  if (injuries.some((zone) => Object.entries(affectedPatterns).some(([key, patterns]) => zone.includes(key) && patterns.includes(exercise.pattern)))) return false;
  return true;
}

interface Slot { pattern: Pattern; muscle?: Muscle; optional?: boolean }

function slotsForDay(split: string, index: number): Slot[] {
  const fullA: Slot[] = [
    { pattern: "sentadilla", muscle: "cuadriceps" }, { pattern: "empuje-horizontal", muscle: "pecho" },
    { pattern: "tiron-horizontal", muscle: "espalda" }, { pattern: "bisagra", muscle: "isquiotibiales" },
    { pattern: "empuje-vertical", muscle: "hombros", optional: true }, { pattern: "core", muscle: "abdomen", optional: true },
  ];
  const fullB: Slot[] = [
    { pattern: "bisagra", muscle: "gluteos" }, { pattern: "tiron-vertical", muscle: "espalda" },
    { pattern: "empuje-horizontal", muscle: "pecho" }, { pattern: "zancada", muscle: "cuadriceps" },
    { pattern: "tiron-horizontal", muscle: "espalda", optional: true }, { pattern: "core", muscle: "abdomen", optional: true },
  ];
  const upper: Slot[] = [
    { pattern: "empuje-horizontal", muscle: "pecho" }, { pattern: "tiron-horizontal", muscle: "espalda" },
    { pattern: "empuje-vertical", muscle: "hombros" }, { pattern: "tiron-vertical", muscle: "espalda" },
    { pattern: "aislamiento", muscle: "biceps", optional: true }, { pattern: "aislamiento", muscle: "triceps", optional: true },
  ];
  const lower: Slot[] = [
    { pattern: "sentadilla", muscle: "cuadriceps" }, { pattern: "bisagra", muscle: "isquiotibiales" },
    { pattern: "zancada", muscle: "gluteos", optional: true }, { pattern: "aislamiento", muscle: "isquiotibiales", optional: true },
    { pattern: "aislamiento", muscle: "gemelos", optional: true }, { pattern: "core", muscle: "abdomen", optional: true },
  ];
  const push: Slot[] = [
    { pattern: "empuje-horizontal", muscle: "pecho" }, { pattern: "empuje-vertical", muscle: "hombros" },
    { pattern: "empuje-horizontal", muscle: "pecho", optional: true }, { pattern: "aislamiento", muscle: "hombros", optional: true },
    { pattern: "aislamiento", muscle: "triceps", optional: true },
  ];
  const pull: Slot[] = [
    { pattern: "tiron-vertical", muscle: "espalda" }, { pattern: "tiron-horizontal", muscle: "espalda" },
    { pattern: "tiron-horizontal", muscle: "hombros", optional: true }, { pattern: "aislamiento", muscle: "biceps", optional: true },
    { pattern: "bisagra", muscle: "isquiotibiales", optional: true },
  ];
  const legs: Slot[] = [
    { pattern: "sentadilla", muscle: "cuadriceps" }, { pattern: "bisagra", muscle: "isquiotibiales" },
    { pattern: "zancada", muscle: "gluteos", optional: true }, { pattern: "aislamiento", muscle: "cuadriceps", optional: true },
    { pattern: "aislamiento", muscle: "isquiotibiales", optional: true }, { pattern: "aislamiento", muscle: "gemelos", optional: true },
  ];
  if (split === "full body") return index % 2 ? fullB : fullA;
  if (split === "torso / pierna") return index % 2 ? lower : upper;
  if (split === "upper / lower") return index % 2 ? lower : upper;
  if (split === "PPL") return [push, pull, legs][index % 3];
  if (split === "5x5") return ([
    [{ pattern: "sentadilla", muscle: "cuadriceps" }, { pattern: "empuje-horizontal", muscle: "pecho" }, { pattern: "tiron-horizontal", muscle: "espalda" }],
    [{ pattern: "sentadilla", muscle: "cuadriceps" }, { pattern: "empuje-vertical", muscle: "hombros" }, { pattern: "bisagra", muscle: "isquiotibiales" }],
    [{ pattern: "sentadilla", muscle: "cuadriceps" }, { pattern: "empuje-horizontal", muscle: "pecho" }, { pattern: "tiron-horizontal", muscle: "espalda" }],
  ] as Slot[][])[index % 3];
  if (split === "30 minutos") return ([
    [{ pattern: "sentadilla", muscle: "cuadriceps" }, { pattern: "empuje-horizontal", muscle: "pecho" }, { pattern: "tiron-horizontal", muscle: "espalda" }, { pattern: "bisagra", muscle: "gluteos" }],
    [{ pattern: "bisagra", muscle: "isquiotibiales" }, { pattern: "empuje-vertical", muscle: "hombros" }, { pattern: "tiron-vertical", muscle: "espalda" }, { pattern: "zancada", muscle: "cuadriceps" }],
  ] as Slot[][])[index % 2];
  if (split === "5 dias") return [upper, lower, push, pull, legs][index % 5];
  return index % 2 ? fullB : fullA;
}

function planForExercise(exercise: Exercise, profile: Profile, template: string): WorkoutExercise {
  const range = goalRepRange(template === "5x5" ? "fuerza" : profile.goal, exercise.category);
  const baseSets = profile.level === "principiante" ? 3 : profile.level === "intermedio" ? 4 : 4;
  const sets = template === "5x5" && exercise.category === "compuesto" ? 5 : template === "30 minutos" ? 2 : baseSets;
  return {
    exerciseId: exercise.id, sets, repsMin: template === "5x5" && exercise.category === "compuesto" ? 5 : range[0],
    repsMax: template === "5x5" && exercise.category === "compuesto" ? 5 : range[1],
    restSec: template === "5x5" ? 180 : exercise.category === "compuesto" ? (profile.goal === "fuerza" ? 180 : 120) : 75,
    rir: profile.goal === "fuerza" ? 2 : 2, note: "",
  };
}

export function buildRoutine(profile: Profile, catalog: Exercise[], routineName?: string, template = "auto", existingId?: string): Routine {
  const split = template === "auto"
    ? profile.days <= 3 ? "full body" : profile.days === 4 ? "torso / pierna" : profile.days === 5 ? "5 dias" : "PPL"
    : template;
  const dayCount = template === "5x5" ? Math.min(3, Math.max(2, profile.days))
    : template === "30 minutos" ? Math.min(3, Math.max(2, profile.days))
      : Math.max(2, Math.min(6, profile.days));
  const slotsPerDay = profile.minutes <= 30 || template === "30 minutos" ? 4 : profile.minutes <= 45 ? 5 : profile.minutes <= 60 ? 6 : 7;
  const days: RoutineDay[] = [];
  for (let dayIndex = 0; dayIndex < dayCount; dayIndex++) {
    const slots = slotsForDay(split, dayIndex);
    const exercises: WorkoutExercise[] = [];
    const used = new Set<string>();
    for (const slot of slots) {
      if (exercises.length >= slotsPerDay) break;
      const candidates = catalog.filter((exercise) => exercise.pattern === slot.pattern && !used.has(exercise.id) && isExerciseCompatible(exercise, profile));
      const best = candidates.sort((a, b) => {
        const score = (exercise: Exercise) => (exercise.muscle === slot.muscle ? 10 : exercise.secondary.includes(slot.muscle ?? "abdomen") ? 2 : 0)
          + (profile.priorities.includes(exercise.muscle) ? 5 : 0) + (exercise.category === "compuesto" ? 2 : 0);
        return score(b) - score(a);
      })[0];
      if (!best) continue;
      used.add(best.id);
      exercises.push(planForExercise(best, profile, template));
    }
    const dayNames = split === "full body" ? [`Cuerpo completo A`, `Cuerpo completo B`, `Cuerpo completo C`]
      : split === "torso / pierna" ? ["Torso A", "Pierna A", "Torso B", "Pierna B"]
        : split === "upper / lower" ? ["Tren superior", "Tren inferior"]
          : split === "PPL" ? ["Empuje", "Tiron", "Pierna"]
            : split === "5 dias" ? ["Torso", "Pierna", "Empuje", "Tiron", "Pierna B"]
              : split === "5x5" ? ["Fuerza A", "Fuerza B", "Fuerza C"]
                : ["Sesion A", "Sesion B"];
    days.push({ id: makeId("day"), name: dayNames[dayIndex] ?? `Sesion ${dayIndex + 1}`, note: "", exercises });
  }
  return {
    id: existingId ?? makeId("routine"), name: routineName ?? `Plan ${split} · ${profile.days} dias`, split,
    template, createdAt: Date.now(), days,
  };
}

export function volumeTargets(profile: Profile): Record<Muscle, number> {
  const base = profile.level === "principiante" ? 8 : profile.level === "intermedio" ? 12 : 16;
  const target = profile.goal === "resistencia" ? Math.max(8, base - 2) : profile.goal === "fuerza" ? Math.max(8, base - 1) : base;
  return Object.fromEntries(MUSCLES.map((muscle) => [muscle, Math.max(8, Math.min(20, target + (profile.priorities.includes(muscle) ? 2 : 0)))])) as Record<Muscle, number>;
}

export function volumeByMuscle(sessions: TrainingSession[], catalog: Exercise[], since = 0): Record<Muscle, number> {
  const exercises = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const volume = Object.fromEntries(MUSCLES.map((muscle) => [muscle, 0])) as Record<Muscle, number>;
  for (const session of sessions) {
    if (session.endedAt < since) continue;
    for (const item of session.exercises) {
      const exercise = exercises.get(item.exerciseId);
      if (!exercise) continue;
      const effective = item.sets.filter((set) => set.completed && set.type !== "calentamiento").length;
      if (exercise.muscle in volume) volume[exercise.muscle] = (volume[exercise.muscle] ?? 0) + effective;
      for (const secondary of exercise.secondary) if (secondary in volume) volume[secondary] += effective * 0.5;
    }
  }
  return volume;
}

export interface RemoteExercise {
  id?: string; name?: string; force?: string | null; mechanic?: string | null; equipment?: string | null;
  primaryMuscles?: string[]; secondaryMuscles?: string[]; instructions?: string[]; images?: string[];
}

function translatedMuscle(name?: string): Muscle {
  const translation = muscleTranslations[name ?? ""] ?? "";
  const allowed = MUSCLES.find((muscle) => muscle === translation);
  return allowed ?? "otro";
}

function remoteEquipment(value: string | null | undefined): string[] {
  if (!value) return ["equipo no especificado"];
  const key = normalizeText(value);
  const map: Record<string, string> = {
    "body only": "peso corporal", dumbbell: "mancuernas", dumbbells: "mancuernas", barbell: "barra",
    cable: "poleas", machine: "maquinas", "e-z curl bar": "barra Z", "medicine ball": "balon medicinal",
    kettlebells: "pesas rusas", "foam roll": "rodillo", bands: "bandas", bench: "banco", other: "otros",
  };
  return [map[key] ?? value];
}

function inferPattern(name: string, muscle: Muscle, force: string | null | undefined): Pattern {
  const normalized = normalizeText(name);
  if (/squat|lunge|prensa|sentadilla/.test(normalized)) return /lunge/.test(normalized) ? "zancada" : "sentadilla";
  if (/deadlift|romanian|hip thrust|good morning/.test(normalized)) return "bisagra";
  if (/pull up|chin up|pulldown/.test(normalized)) return "tiron-vertical";
  if (/row|remo/.test(normalized)) return "tiron-horizontal";
  if (/crunch|plank|abdominal|sit-up/.test(normalized)) return "core";
  if (/press|push up|pushup|bench/.test(normalized)) return muscle === "hombros" ? "empuje-vertical" : "empuje-horizontal";
  if (force === "pull") return muscle === "espalda" ? "tiron-horizontal" : "aislamiento";
  return "otro";
}

export function normalizeRemoteExercise(raw: RemoteExercise): Exercise | null {
  if (!raw.id || !raw.name) return null;
  const primary = translatedMuscle(raw.primaryMuscles?.[0]);
  const nameTranslation = exerciseNameTranslations[raw.name];
  const equipment = remoteEquipment(raw.equipment);
  const imagePaths = (raw.images ?? []).filter((path) => typeof path === "string" && /^[\w\-/]+\.jpg$/i.test(path));
  const pattern = inferPattern(raw.name, primary, raw.force);
  return {
    id: `free-${raw.id}`, name: nameTranslation ?? raw.name, muscle: primary,
    secondary: (raw.secondaryMuscles ?? []).map(translatedMuscle), equipment, pattern,
    category: raw.mechanic === "isolation" ? "aislamiento" : "compuesto",
    steps: raw.instructions?.filter((step) => typeof step === "string").slice(0, 8) ?? ["El catalogo original no incluye instrucciones para este movimiento."],
    mistakes: ["El catalogo original no incluye errores comunes traducidos; prioriza un rango comodo y controlado."],
    source: "free-exercise-db", originalName: !nameTranslation,
    originalMuscle: muscleTranslations[raw.primaryMuscles?.[0] ?? ""] ? undefined : raw.primaryMuscles?.[0],
    images: imagePaths.map((path) => `${FREE_DB.imageBaseUrl}${path}`),
    instructionsOriginal: true,
  };
}

export function getExerciseHistory(history: TrainingSession[], exerciseId: string): { session: TrainingSession; item: SessionExercise }[] {
  return history.map((session) => ({ session, item: session.exercises.find((exercise) => exercise.exerciseId === exerciseId) }))
    .filter((entry): entry is { session: TrainingSession; item: SessionExercise } => Boolean(entry.item))
    .sort((a, b) => b.session.endedAt - a.session.endedAt);
}

export function sessionVolume(exercises: SessionExercise[]): number {
  return exercises.reduce((total, item) => total + item.sets.filter((set) => set.completed && set.type !== "calentamiento").reduce((setsTotal, set) => setsTotal + set.weight * set.reps, 0), 0);
}

export function workoutTemplateLabels(): { id: string; label: string }[] {
  return [
    { id: "auto", label: "Segun mi semana" }, { id: "full body", label: "Cuerpo completo" },
    { id: "torso / pierna", label: "Torso / pierna" }, { id: "PPL", label: "Empuje / tiron / pierna" },
    { id: "upper / lower", label: "Upper / lower" }, { id: "5x5", label: "Fuerza 5x5" },
    { id: "30 minutos", label: "Minimo efectivo · 30 min" },
  ];
}

export function elapsedSessionMs(_startedAt: number, elapsedBeforePause: number, segmentStartedAt: number | null, now = Date.now()): number {
  return Math.max(0, elapsedBeforePause + (segmentStartedAt === null ? 0 : now - segmentStartedAt));
}

export function weekStart(now = Date.now()): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date.getTime();
}
