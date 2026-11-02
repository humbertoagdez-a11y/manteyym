// Marcas personales y exportaciones derivadas SIEMPRE de las sesiones guardadas (fuente de verdad):
// si se edita una sesión, los PR y el volumen cambian solos. No hay un store aparte que desincronizar.
import { estimatedOneRepMax, sessionVolume } from "../engine/fitness";
import type { BodyMetric, Exercise, LoggedSet, PainEntry, TrainingSession } from "../types";

const isWork = (set: LoggedSet) => set.completed && set.type !== "calentamiento" && set.reps > 0;

export interface ExerciseRecords {
  bestE1rm?: { value: number; weight: number; reps: number; at: number; sessionId: string };
  heaviest?: { weight: number; reps: number; at: number; sessionId: string };
  /** Mejor carga por rango de repeticiones: 1–3, 4–6, 7–10, 11–15, 16+. */
  byRepRange: { range: string; weight: number; reps: number; at: number }[];
  bestSessionVolume?: { value: number; at: number; sessionId: string };
}

const RANGES: [string, number, number][] = [
  ["1–3", 1, 3],
  ["4–6", 4, 6],
  ["7–10", 7, 10],
  ["11–15", 11, 15],
  ["16+", 16, Infinity],
];

export function exerciseRecords(sessions: TrainingSession[], exerciseId: string): ExerciseRecords {
  const result: ExerciseRecords = { byRepRange: [] };
  const ranges = new Map<string, { weight: number; reps: number; at: number }>();
  for (const session of sessions) {
    for (const item of session.exercises) {
      if (item.exerciseId !== exerciseId || item.status === "omitido") continue;
      let volume = 0;
      for (const set of item.sets.filter(isWork)) {
        volume += set.weight * set.reps;
        const e1rm = estimatedOneRepMax(set.weight, set.reps);
        if (e1rm > (result.bestE1rm?.value ?? 0)) {
          result.bestE1rm = {
            value: e1rm,
            weight: set.weight,
            reps: set.reps,
            at: session.endedAt,
            sessionId: session.id,
          };
        }
        if (set.weight > (result.heaviest?.weight ?? 0)) {
          result.heaviest = { weight: set.weight, reps: set.reps, at: session.endedAt, sessionId: session.id };
        }
        const range = RANGES.find(([, min, max]) => set.reps >= min && set.reps <= max)?.[0];
        if (range && set.weight > (ranges.get(range)?.weight ?? 0)) {
          ranges.set(range, { weight: set.weight, reps: set.reps, at: session.endedAt });
        }
      }
      if (volume > (result.bestSessionVolume?.value ?? 0)) {
        result.bestSessionVolume = { value: volume, at: session.endedAt, sessionId: session.id };
      }
    }
  }
  result.byRepRange = RANGES.filter(([range]) => ranges.has(range)).map(([range]) => ({
    range,
    ...ranges.get(range)!,
  }));
  return result;
}

/** Recalcula los campos derivados de una sesión editada (volumen y duración coherente). */
export function normalizeEditedSession(session: TrainingSession): TrainingSession {
  const durationMs = Math.max(0, session.endedAt - session.startedAt);
  return { ...session, durationMs, volume: sessionVolume(session.exercises) };
}

// ---------------- CSV ----------------

function cell(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = String(value);
  return /[",;\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(header: string[], rows: unknown[][]): string {
  // BOM para que Excel abra bien las tildes; separador coma, decimales con punto.
  return "﻿" + [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}

const iso = (at: number) => new Date(at).toISOString();

export function sessionsCsv(sessions: TrainingSession[], catalog: Exercise[], units: string): string {
  const name = (id: string) => catalog.find((exercise) => exercise.id === id)?.name ?? id;
  const rows: unknown[][] = [];
  for (const session of [...sessions].sort((a, b) => a.startedAt - b.startedAt)) {
    session.exercises.forEach((item, exerciseIndex) => {
      const base = [
        iso(session.startedAt),
        session.id,
        session.dayName,
        exerciseIndex + 1,
        name(item.exerciseId),
        item.exerciseId,
        item.status ?? "hecho",
        item.statusReason ?? "",
      ];
      if (!item.sets.length) rows.push([...base, "", "", "", "", "", "", "", "", "", "", "", session.notes]);
      item.sets.forEach((set, setIndex) =>
        rows.push([
          ...base,
          setIndex + 1,
          set.type,
          set.completed ? "si" : "no",
          set.weight,
          units,
          set.reps,
          set.rir ?? "",
          set.rpe ?? "",
          set.side ?? "",
          set.extraLoad ?? "",
          set.note,
          session.notes,
        ]),
      );
    });
  }
  return toCsv(
    [
      "fecha_inicio",
      "sesion_id",
      "rutina_dia",
      "orden",
      "ejercicio",
      "ejercicio_id",
      "estado",
      "motivo",
      "serie",
      "tipo",
      "completada",
      "carga",
      "unidad",
      "reps",
      "rir",
      "rpe",
      "lado",
      "lastre_asistencia",
      "nota_serie",
      "nota_sesion",
    ],
    rows,
  );
}

export function painCsv(entries: PainEntry[]): string {
  return toCsv(
    [
      "fecha",
      "estado",
      "zonas",
      "lado",
      "intensidad",
      "tipo",
      "momento",
      "en_curso",
      "resuelto",
      "sesion_id",
      "ejercicio_id",
      "nota",
    ],
    [...entries]
      .sort((a, b) => a.at - b.at)
      .map((entry) => [
        iso(entry.at),
        entry.status,
        entry.zones.join("|"),
        entry.side ?? "",
        entry.intensity ?? "",
        entry.quality?.join("|") ?? "",
        entry.when,
        entry.ongoing ? "si" : "no",
        entry.resolvedAt ? iso(entry.resolvedAt) : "",
        entry.context?.sessionId ?? "",
        entry.context?.exerciseId ?? "",
        entry.note,
      ]),
  );
}

export function metricsCsv(metrics: BodyMetric[]): string {
  const fields: (keyof BodyMetric)[] = [
    "weight",
    "bodyFat",
    "waist",
    "chest",
    "hip",
    "neck",
    "shoulders",
    "arm",
    "forearm",
    "thigh",
    "calf",
  ];
  return toCsv(
    ["fecha", ...fields.map(String), "nota"],
    [...metrics]
      .sort((a, b) => a.at - b.at)
      .map((metric) => [iso(metric.at), ...fields.map((field) => metric[field] ?? ""), metric.note ?? ""]),
  );
}
