// Lógica pura del registro de dolor. Solo describe lo registrado: no diagnostica ni decide por el usuario.
import { makeId, patternsForZone } from "../engine/fitness";
import type { Exercise, PainEntry, PainQuality, PainWhen, TrainingSession } from "../types";

/** Ids persistidos (sin tildes, compatibles con v1). Las etiquetas visibles salen de src/i18n/es.ts. */
export const PAIN_ZONES = [
  "cuello",
  "hombro",
  "codo",
  "muneca",
  "mano",
  "espalda alta",
  "espalda baja",
  "pecho",
  "abdomen",
  "cadera",
  "rodilla",
  "tobillo",
  "pie",
  "otra",
] as const;

export const PAIN_QUALITIES: { value: PainQuality; label: string }[] = [
  { value: "punzante", label: "Punzante" },
  { value: "sordo", label: "Sordo" },
  { value: "ardor", label: "Ardor" },
  { value: "hormigueo", label: "Hormigueo o entumecimiento" },
  { value: "tension", label: "Tensión" },
  { value: "rigidez", label: "Rigidez" },
  { value: "otro", label: "Otro" },
];

export const PAIN_WHEN: { value: PainWhen; label: string }[] = [
  { value: "antes", label: "Antes de entrenar" },
  { value: "durante", label: "Durante el entrenamiento" },
  { value: "despues", label: "Después de entrenar" },
  { value: "fuera_de_entreno", label: "Fuera del entrenamiento" },
  { value: "al_despertar", label: "Al despertar" },
];

export const PAIN_SIDES = [
  { value: "izq", label: "Izquierda" },
  { value: "der", label: "Derecha" },
  { value: "ambos", label: "Ambos lados" },
  { value: "centro", label: "Centro" },
] as const;

export const SAFETY_MESSAGE =
  "Deja de entrenar y consulta a un profesional de la salud. ManteYym no diagnostica: solo registra lo que indicas.";

export function dayKey(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function newPainEntry(
  fields: Partial<PainEntry> & Pick<PainEntry, "status" | "when">,
  now = Date.now(),
): PainEntry {
  return {
    id: makeId("pain"),
    at: now,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    zones: [],
    note: "",
    ongoing: fields.status === "dolor",
    createdAt: now,
    updatedAt: now,
    revision: 1,
    ...fields,
    ...(fields.status === "sin_dolor" ? { zones: [], intensity: undefined, quality: undefined, ongoing: false } : {}),
  };
}

/**
 * Señales de alerta: dolor en el pecho, hormigueo/entumecimiento o dolor tras un golpe fuerte,
 * o intensidad muy alta. Disparan el mensaje fijo de seguridad.
 */
export function redFlags(
  entry: Pick<PainEntry, "status" | "zones" | "quality" | "afterImpact" | "intensity">,
): string[] {
  if (entry.status !== "dolor") return [];
  const flags: string[] = [];
  if (entry.zones.includes("pecho")) flags.push("Dolor en el pecho");
  if (entry.quality?.includes("hormigueo")) flags.push("Hormigueo o entumecimiento");
  if (entry.afterImpact) flags.push("Dolor después de un golpe, caída o torsión");
  if ((entry.intensity ?? 0) >= 8) flags.push("Dolor muy intenso (8 o más)");
  return flags;
}

/**
 * Zonas con dolor activo: la entrada más reciente que menciona la zona es un dolor "en curso" sin resolver
 * y no hay un "sin dolor" explícito posterior. Las entradas no se modifican; esto es solo una lectura.
 */
export function activePainZones(entries: PainEntry[]): { zone: string; entry: PainEntry }[] {
  const sorted = [...entries].sort((a, b) => b.at - a.at);
  const lastNoPain = sorted.find((entry) => entry.status === "sin_dolor")?.at ?? -Infinity;
  const result = new Map<string, PainEntry>();
  const seen = new Set<string>();
  for (const entry of sorted) {
    if (entry.status !== "dolor") continue;
    for (const zone of entry.zones) {
      if (seen.has(zone)) continue;
      seen.add(zone);
      if (entry.ongoing && !entry.resolvedAt && entry.at > lastNoPain) result.set(zone, entry);
    }
  }
  return [...result].map(([zone, entry]) => ({ zone, entry }));
}

export function todaysEntries(entries: PainEntry[], now = Date.now()): PainEntry[] {
  const key = dayKey(now);
  return entries.filter((entry) => dayKey(entry.at) === key).sort((a, b) => b.at - a.at);
}

/** Ejercicios del plan que cargan alguna de las zonas indicadas (para sugerir, no para quitar). */
export function exercisesLoadingZones(exercises: Exercise[], zones: string[]): Exercise[] {
  const patterns = new Set(zones.flatMap(patternsForZone));
  return exercises.filter((exercise) => patterns.has(exercise.pattern));
}

/**
 * Qué se hizo antes de un registro: la sesión vinculada, o las sesiones terminadas en las 48 h previas.
 * Es descriptivo: no implica causa.
 */
export function trainingBefore(
  entry: PainEntry,
  sessions: TrainingSession[],
  windowMs = 48 * 60 * 60 * 1000,
): TrainingSession[] {
  if (entry.context?.sessionId) {
    const linked = sessions.find((session) => session.id === entry.context?.sessionId);
    if (linked) return [linked];
  }
  return sessions
    .filter((session) => session.endedAt <= entry.at && entry.at - session.endedAt <= windowMs)
    .sort((a, b) => b.endedAt - a.endedAt);
}

/** Serie diaria de intensidad máxima (para el gráfico). Los "sin dolor" cuentan como 0. */
export function dailyMaxIntensity(entries: PainEntry[], zone?: string): { day: string; value: number }[] {
  const days = new Map<string, number>();
  for (const entry of [...entries].sort((a, b) => a.at - b.at)) {
    if (zone && entry.status === "dolor" && !entry.zones.includes(zone)) continue;
    const value = entry.status === "dolor" ? (entry.intensity ?? 0) : 0;
    const key = dayKey(entry.at);
    days.set(key, Math.max(days.get(key) ?? 0, value));
  }
  return [...days].map(([day, value]) => ({ day, value }));
}

/** Resumen corto para la bitácora (antes/después). */
export function painSummary(entry: PainEntry): string {
  if (entry.status === "sin_dolor") return "Sin dolor";
  return `${entry.zones.join(", ")} · ${entry.intensity ?? "?"}/10${entry.resolvedAt ? " · resuelto" : ""}`;
}
