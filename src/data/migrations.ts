// Migraciones de datos entre versiones de esquema.
// Trabajan sobre un "dataset" plano ({ nombreDeStore: registros[] }) y son funciones puras:
// la misma cadena se usa al abrir IndexedDB y al importar un respaldo viejo.
// Regla: nunca se pierde información. Lo que cambia de lugar se copia y se marca con `origin`.

import type { AuditEntry, DailyCheckin, Injury, MetaRecord, PainEntry } from "../types";

export const SCHEMA_VERSION = 2;

/** Stores por versión. Una versión nueva solo agrega stores; nunca borra uno existente. */
export const STORES_V1 = [
  "profile",
  "settings",
  "exercises",
  "routines",
  "blocks",
  "sessions",
  "activeSession",
  "bodyMetrics",
  "injuries",
  "goals",
  "cardio",
  "photos",
  "meta",
] as const;
export const STORES_V2 = [...STORES_V1, "painEntries", "dailyCheckins", "auditLog"] as const;

export type Dataset = Record<string, Record<string, unknown>[]>;
type Migration = (data: Dataset, now: number) => Dataset;

function list<T>(data: Dataset, name: string): T[] {
  return (Array.isArray(data[name]) ? data[name] : []) as T[];
}

const READINESS_PREFIX = "readiness-";

const migrateV1toV2: Migration = (input, now) => {
  const data: Dataset = { ...input };
  for (const name of STORES_V2) data[name] = [...list<Record<string, unknown>>(data, name)];
  const notes: string[] = [];

  // 1) El catálogo base vive en el código. Las copias "local" guardadas en v1 congelaban nombres y
  //    textos viejos (sin tildes, sin media). Se descartan: se regeneran siempre desde LOCAL_CATALOG.
  const beforeExercises = data.exercises.length;
  data.exercises = data.exercises.filter((exercise) => exercise.source !== "local");
  if (beforeExercises !== data.exercises.length) {
    notes.push(`${beforeExercises - data.exercises.length} ejercicios base pasan a leerse del código`);
  }

  // 2) Cada lesión/molestia v1 se copia al registro de dolor (append-only). Las lesiones originales
  //    se conservan como "zonas a evitar" del perfil, así que no se pierde nada.
  const existingPain = new Set(data.painEntries.map((entry) => entry.id));
  const profile = list<{ injuries?: Injury[] }>(data, "profile")[0];
  const injuries = new Map<string, Injury>();
  for (const injury of [...(profile?.injuries ?? []), ...list<Injury>(data, "injuries")]) {
    if (injury && typeof injury.id === "string") injuries.set(injury.id, injury);
  }
  for (const injury of injuries.values()) {
    const id = `pain-v1-${injury.id}`;
    if (existingPain.has(id)) continue;
    const at = Number.isFinite(injury.createdAt) ? injury.createdAt : now;
    const pain = Number.isFinite(injury.pain) ? Math.max(0, Math.min(5, injury.pain)) : 1;
    const entry: PainEntry = {
      id,
      at,
      timeZone: "UTC",
      status: "dolor",
      zones: [String(injury.zone)],
      intensity: pain * 2,
      when: "fuera_de_entreno",
      note: [injury.note, "Migrado de la versión anterior (escala 1–5 convertida a 0–10)."].filter(Boolean).join(" "),
      ongoing: true,
      origin: "v1-injury",
      createdAt: at,
      updatedAt: at,
    };
    data.painEntries.push(entry as unknown as Record<string, unknown>);
  }
  if (injuries.size) notes.push(`${injuries.size} molestias copiadas al registro de dolor`);

  // 3) Chequeos de disposición: de meta "readiness-AAAA-MM-DD" (que nadie leía) a dailyCheckins.
  const keptMeta: Record<string, unknown>[] = [];
  let checkins = 0;
  for (const record of data.meta as MetaRecord[]) {
    if (typeof record.id === "string" && record.id.startsWith(READINESS_PREFIX)) {
      const dayKey = record.id.slice(READINESS_PREFIX.length);
      const at = Number(record.at) || Date.parse(`${dayKey}T12:00:00Z`) || now;
      const checkin: DailyCheckin = {
        id: `checkin-v1-${dayKey}`,
        at,
        dayKey,
        sleepQuality: toScale(record.sueno),
        energy: toScale(record.energia),
        soreness: toScale(record.agujetas),
        stress: toScale(record.estres),
        origin: "v1-readiness",
        createdAt: at,
        updatedAt: at,
        revision: 1,
      };
      data.dailyCheckins.push(checkin as unknown as Record<string, unknown>);
      checkins++;
    } else keptMeta.push(record);
  }
  data.meta = keptMeta;
  if (checkins) notes.push(`${checkins} chequeos de disposición recuperados`);

  // 4) Trazabilidad mínima en sesiones terminadas.
  data.sessions = data.sessions.map((session) => {
    const endedAt = Number(session.endedAt) || now;
    return {
      ...session,
      createdAt: session.createdAt ?? endedAt,
      updatedAt: session.updatedAt ?? endedAt,
      revision: session.revision ?? 1,
    };
  });

  const audit: AuditEntry = {
    id: `audit-migrate-v2-${now}`,
    at: now,
    entity: "schema",
    entityId: "schema",
    action: "migrate",
    summary: `Migración de datos v1 → v2${notes.length ? `: ${notes.join("; ")}` : ""}.`,
  };
  data.auditLog.push(audit as unknown as Record<string, unknown>);
  return data;
};

function toScale(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 && number <= 5 ? Math.round(number) : undefined;
}

/** Índice = versión de origen. MIGRATIONS[1] lleva de v1 a v2. */
const MIGRATIONS: Record<number, Migration> = {
  1: migrateV1toV2,
};

/** Lleva un dataset desde `fromVersion` hasta SCHEMA_VERSION. Lanza si la versión es desconocida. */
export function migrateDataset(data: Dataset, fromVersion: number, now = Date.now()): Dataset {
  if (!Number.isInteger(fromVersion) || fromVersion < 1) throw new Error(`Versión de datos desconocida: ${fromVersion}.`);
  if (fromVersion > SCHEMA_VERSION) {
    throw new Error(
      `Estos datos son de una versión más nueva de ManteYym (v${fromVersion}). Actualiza la app antes de importarlos.`,
    );
  }
  let current = data;
  for (let version = fromVersion; version < SCHEMA_VERSION; version++) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`Falta la migración de v${version} a v${version + 1}.`);
    current = step(current, now);
  }
  for (const name of STORES_V2) if (!Array.isArray(current[name])) current[name] = [];
  return current;
}
