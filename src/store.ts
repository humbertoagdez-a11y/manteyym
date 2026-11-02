import { LOCAL_CATALOG } from "./data/catalog";
import { makeId } from "./engine/fitness";
import type {
  ActiveSession,
  BodyMetric,
  CardioRecord,
  Exercise,
  GoalRecord,
  Injury,
  MetaRecord,
  PhotoRecord,
  Profile,
  Routine,
  Settings,
  StoreMap,
  StoreName,
  TrainingBlock,
  TrainingSession,
} from "./types";

export const DB_NAME = "manteyym-local";
export const SCHEMA_VERSION = 1;
const STORE_NAMES: StoreName[] = [
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
];

export interface AppSnapshot {
  profile: Profile;
  settings: Settings;
  exercises: Exercise[];
  routines: Routine[];
  blocks: TrainingBlock[];
  sessions: TrainingSession[];
  activeSession: ActiveSession | null;
  bodyMetrics: BodyMetric[];
  injuries: Injury[];
  goals: GoalRecord[];
  cardio: CardioRecord[];
  photos: PhotoRecord[];
  meta: MetaRecord[];
}

export const defaultProfile: Profile = {
  id: "main",
  onboardingComplete: false,
  goal: "hipertrofia",
  level: "principiante",
  yearsTraining: 0,
  days: 3,
  minutes: 45,
  equipment: ["Gimnasio completo"],
  priorities: [],
  injuries: [],
  exclusions: [],
  units: "kg",
  progression: "doble",
};

export const defaultSettings: Settings = {
  id: "main",
  theme: "dark",
  defaultRest: 90,
  barWeight: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25],
  sound: true,
  vibration: true,
  notifications: false,
  reminders: false,
  reminderTime: "18:00",
  reminderDays: [1, 3, 5],
};

const blankSnapshot: AppSnapshot = {
  profile: defaultProfile,
  settings: defaultSettings,
  exercises: LOCAL_CATALOG,
  routines: [],
  blocks: [],
  sessions: [],
  activeSession: null,
  bodyMetrics: [],
  injuries: [],
  goals: [],
  cardio: [],
  photos: [],
  meta: [],
};

let snapshot = blankSnapshot;
let databasePromise: Promise<IDBDatabase> | null = null;
const listeners = new Set<() => void>();

export function getSnapshot(): AppSnapshot {
  return snapshot;
}
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function publish(next: AppSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, SCHEMA_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
      // Migracion inicial desde version 0: el esquema se mantiene en una unica rutina versionada.
      if (oldVersion < 1) {
        for (const name of STORE_NAMES)
          if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: "id" });
        const metaStore = request.transaction?.objectStore("meta");
        metaStore?.put({ id: "schema", version: 1, migratedAt: Date.now() });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("No se pudo abrir el almacenamiento local."));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("Cierra otras pestañas de ManteYym para actualizar el almacenamiento."));
    };
  });
  return databasePromise;
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("La escritura local se canceló."));
    transaction.onerror = () => reject(transaction.error ?? new Error("No se pudo guardar en el dispositivo."));
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("No se pudo leer el almacenamiento local."));
  });
}

async function readStore<S extends StoreName>(database: IDBDatabase, name: S): Promise<StoreMap[S][]> {
  const transaction = database.transaction(name, "readonly");
  return requestValue(transaction.objectStore(name).getAll()) as Promise<StoreMap[S][]>;
}

function byRecent<T extends { id: string }>(items: T[]): T[] {
  return [...items];
}

async function hydrateFromDatabase(): Promise<AppSnapshot> {
  const database = await openDatabase();
  const values = await Promise.all(STORE_NAMES.map((name) => readStore(database, name)));
  const records = Object.fromEntries(STORE_NAMES.map((name, index) => [name, values[index]])) as Record<
    StoreName,
    StoreMap[StoreName][]
  >;
  const profile = (records.profile as Profile[]).find((item) => item.id === "main") ?? defaultProfile;
  const settings = (records.settings as Settings[]).find((item) => item.id === "main") ?? defaultSettings;
  const exercises = new Map<string, Exercise>();
  LOCAL_CATALOG.forEach((exercise) => exercises.set(exercise.id, exercise));
  (records.exercises as Exercise[]).forEach((exercise) => exercises.set(exercise.id, exercise));
  return {
    profile,
    settings,
    exercises: [...exercises.values()],
    routines: byRecent(records.routines as Routine[]),
    blocks: records.blocks as TrainingBlock[],
    sessions: [...(records.sessions as TrainingSession[])].sort((a, b) => b.endedAt - a.endedAt),
    activeSession: (records.activeSession as ActiveSession[]).find((item) => item.id === "current") ?? null,
    bodyMetrics: [...(records.bodyMetrics as BodyMetric[])].sort((a, b) => b.at - a.at),
    injuries: records.injuries as Injury[],
    goals: records.goals as GoalRecord[],
    cardio: [...(records.cardio as CardioRecord[])].sort((a, b) => b.at - a.at),
    photos: [...(records.photos as PhotoRecord[])].sort((a, b) => b.at - a.at),
    meta: records.meta as MetaRecord[],
  };
}

export async function initializeStore(): Promise<{ state: AppSnapshot; persistent: boolean | null }> {
  const database = await openDatabase();
  const profiles = await readStore(database, "profile");
  const settings = await readStore(database, "settings");
  const exercises = await readStore(database, "exercises");
  const meta = await readStore(database, "meta");
  const transaction = database.transaction(["profile", "settings", "exercises", "meta"], "readwrite");
  const profileStore = transaction.objectStore("profile");
  const settingsStore = transaction.objectStore("settings");
  if (!profiles.some((record) => record.id === "main")) profileStore.put(defaultProfile);
  if (!settings.some((record) => record.id === "main")) settingsStore.put(defaultSettings);
  if (!exercises.length) LOCAL_CATALOG.forEach((exercise) => transaction.objectStore("exercises").put(exercise));
  const metaStore = transaction.objectStore("meta");
  if (!meta.some((record) => record.id === "firstSeen")) metaStore.put({ id: "firstSeen", at: Date.now() });
  if (!meta.some((record) => record.id === "schema"))
    metaStore.put({ id: "schema", version: SCHEMA_VERSION, migratedAt: Date.now() });
  await transactionDone(transaction);
  let persistent: boolean | null = null;
  try {
    if (navigator.storage?.persisted) persistent = await navigator.storage.persisted();
    if (persistent === false && navigator.storage?.persist) persistent = await navigator.storage.persist();
  } catch {
    persistent = null;
  }
  const state = await hydrateFromDatabase();
  publish(state);
  return { state, persistent };
}

export function storageErrorMessage(error: unknown): string {
  if (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  ) {
    return "El espacio del dispositivo está lleno. Libera espacio o elimina fotos antiguas y vuelve a intentarlo.";
  }
  if (error instanceof Error && /quota|espacio lleno/i.test(error.message))
    return "El espacio del dispositivo está lleno. Libera espacio y vuelve a intentarlo.";
  return error instanceof Error
    ? error.message
    : "No se pudo guardar en el dispositivo. Comprueba el espacio disponible.";
}

export async function saveRecord<S extends StoreName>(store: S, record: StoreMap[S]): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(store, "readwrite");
  transaction.objectStore(store).put(record);
  await transactionDone(transaction);
  const id = (record as { id: string }).id;
  if (store === "profile") publish({ ...snapshot, profile: record as Profile });
  else if (store === "settings") publish({ ...snapshot, settings: record as Settings });
  else if (store === "activeSession") publish({ ...snapshot, activeSession: record as ActiveSession });
  else {
    const key = store as Exclude<StoreName, "profile" | "settings" | "activeSession">;
    const values = (snapshot[key] as { id: string }[]).filter((item) => item.id !== id);
    publish({ ...snapshot, [key]: [record, ...values] } as AppSnapshot);
  }
}

export async function saveMany<S extends StoreName>(store: S, records: StoreMap[S][]): Promise<void> {
  if (!records.length) return;
  const database = await openDatabase();
  const transaction = database.transaction(store, "readwrite");
  records.forEach((record) => transaction.objectStore(store).put(record));
  await transactionDone(transaction);
  publish(await hydrateFromDatabase());
}

export async function deleteRecord(store: StoreName, id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(store, "readwrite");
  transaction.objectStore(store).delete(id);
  await transactionDone(transaction);
  if (store === "activeSession") publish({ ...snapshot, activeSession: null });
  else if (store !== "profile" && store !== "settings") {
    const key = store as Exclude<StoreName, "profile" | "settings" | "activeSession">;
    publish({
      ...snapshot,
      [key]: (snapshot[key] as { id: string }[]).filter((item) => item.id !== id),
    } as AppSnapshot);
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("No se pudo preparar la foto para el respaldo."));
    reader.readAsDataURL(blob);
  });
}

export async function exportBackup(): Promise<Record<string, unknown>> {
  const database = await openDatabase();
  const values = await Promise.all(STORE_NAMES.map((name) => readStore(database, name)));
  const stores: Record<string, unknown[]> = Object.fromEntries(
    STORE_NAMES.map((name, index) => [name, values[index] as unknown[]]),
  );
  stores.meta = (stores.meta as MetaRecord[]).filter((record) => record.id !== "pre-import-backup");
  stores.photos = await Promise.all(
    (stores.photos as PhotoRecord[]).map(async (photo) => {
      if (!photo.blob) return photo;
      return { ...photo, dataUrl: await blobToDataUrl(photo.blob), blob: undefined };
    }),
  );
  return {
    app: "ManteYym",
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    stores,
  };
}

export interface BackupSummary {
  profile: boolean;
  routines: number;
  sessions: number;
  exercises: number;
  photos: number;
  exportedAt: number;
}

export function validateBackup(value: unknown): { backup: Record<string, unknown>; summary: BackupSummary } {
  if (!value || typeof value !== "object") throw new Error("El archivo no contiene un objeto de respaldo válido.");
  const candidate = value as Record<string, unknown>;
  if (candidate.app !== "ManteYym") throw new Error("Este archivo no pertenece a ManteYym.");
  if (candidate.schemaVersion !== SCHEMA_VERSION)
    throw new Error(`Versión de respaldo no compatible. Se esperaba ${SCHEMA_VERSION}.`);
  if (typeof candidate.exportedAt !== "number" || !candidate.stores || typeof candidate.stores !== "object")
    throw new Error("Faltan datos obligatorios del respaldo.");
  const stores = candidate.stores as Record<string, unknown>;
  for (const name of STORE_NAMES) {
    if (!Array.isArray(stores[name])) throw new Error(`La lista local '${name}' falta o está corrupta.`);
    if (
      (stores[name] as unknown[]).some(
        (record) => !record || typeof record !== "object" || typeof (record as { id?: unknown }).id !== "string",
      )
    ) {
      throw new Error(`Hay un registro inválido dentro de '${name}'.`);
    }
  }
  const profile = (stores.profile as Record<string, unknown>[]).find((item) => item.id === "main");
  const settings = (stores.settings as Record<string, unknown>[]).find((item) => item.id === "main");
  const validGoals = ["hipertrofia", "fuerza", "perdida_grasa", "resistencia", "salud"];
  const validLevels = ["principiante", "intermedio", "avanzado"];
  const validProgressions = ["doble", "lineal", "rir"];
  const validThemes = ["dark", "light"];
  if (
    !profile ||
    !validGoals.includes(String(profile.goal)) ||
    !validLevels.includes(String(profile.level)) ||
    !Number.isInteger(profile.days) ||
    Number(profile.days) < 2 ||
    Number(profile.days) > 6 ||
    ![30, 45, 60, 90].includes(Number(profile.minutes)) ||
    !["kg", "lb"].includes(String(profile.units)) ||
    !validProgressions.includes(String(profile.progression)) ||
    !Array.isArray(profile.equipment) ||
    !Array.isArray(profile.priorities) ||
    !Array.isArray(profile.injuries) ||
    !Array.isArray(profile.exclusions) ||
    !settings ||
    !validThemes.includes(String(settings.theme)) ||
    !Number.isFinite(settings.defaultRest) ||
    Number(settings.defaultRest) < 0 ||
    !Number.isFinite(settings.barWeight) ||
    Number(settings.barWeight) < 0 ||
    !Array.isArray(settings.plates) ||
    ![settings.sound, settings.vibration, settings.notifications, settings.reminders].every(
      (value) => typeof value === "boolean",
    ) ||
    typeof settings.reminderTime !== "string" ||
    !Array.isArray(settings.reminderDays)
  ) {
    throw new Error("El perfil o la configuración principal del respaldo no son válidos.");
  }
  if (
    (stores.routines as Record<string, unknown>[]).some(
      (routine) =>
        typeof routine.name !== "string" ||
        !Array.isArray(routine.days) ||
        (routine.days as Record<string, unknown>[]).some((day) => !Array.isArray(day.exercises)),
    )
  ) {
    throw new Error("Una rutina del respaldo tiene un formato incorrecto.");
  }
  if (
    (stores.sessions as Record<string, unknown>[]).some(
      (session) =>
        !Number.isFinite(session.startedAt) ||
        !Number.isFinite(session.endedAt) ||
        Number(session.endedAt) < Number(session.startedAt) ||
        !Array.isArray(session.exercises),
    )
  ) {
    throw new Error("Una sesión del respaldo tiene fechas o series incorrectas.");
  }
  if (
    (stores.exercises as Record<string, unknown>[]).some(
      (exercise) =>
        typeof exercise.name !== "string" || !Array.isArray(exercise.equipment) || !Array.isArray(exercise.steps),
    )
  ) {
    throw new Error("Un ejercicio del respaldo tiene un formato incorrecto.");
  }
  if (
    (stores.photos as Record<string, unknown>[]).some(
      (photo) =>
        photo.dataUrl !== undefined && (typeof photo.dataUrl !== "string" || !photo.dataUrl.startsWith("data:image/")),
    )
  ) {
    throw new Error("Una foto del respaldo tiene un formato no compatible.");
  }
  const summary = {
    profile: Boolean(profile),
    routines: (stores.routines as unknown[]).length,
    sessions: (stores.sessions as unknown[]).length,
    exercises: (stores.exercises as unknown[]).length,
    photos: (stores.photos as unknown[]).length,
    exportedAt: candidate.exportedAt as number,
  };
  return { backup: candidate, summary };
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, content] = dataUrl.split(",", 2);
  if (!header || !content || !header.startsWith("data:")) throw new Error("Una foto del respaldo está corrupta.");
  const mime = header.slice(5, header.indexOf(";")) || "application/octet-stream";
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

export async function importBackup(value: unknown): Promise<BackupSummary> {
  const { backup, summary } = validateBackup(value);
  const automaticCopy = await exportBackup();
  const source = backup.stores as Record<string, unknown[]>;
  const prepared = Object.fromEntries(
    STORE_NAMES.map((name) => [
      name,
      name === "photos"
        ? source[name].map((raw) => {
            const photo = raw as PhotoRecord;
            if (!photo.dataUrl) return photo;
            const { dataUrl, ...rest } = photo;
            return { ...rest, blob: dataUrlToBlob(dataUrl) };
          })
        : name === "meta"
          ? source[name].filter((record) => (record as { id?: string }).id !== "pre-import-backup")
          : source[name],
    ]),
  ) as Record<string, unknown[]>;
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAMES, "readwrite");
  for (const name of STORE_NAMES) {
    const objectStore = transaction.objectStore(name);
    objectStore.clear();
    const records =
      name === "meta"
        ? [
            ...prepared[name].filter((record) => (record as { id?: string }).id !== "pre-import-backup"),
            { id: "pre-import-backup", backup: automaticCopy, savedAt: Date.now() },
          ]
        : prepared[name];
    records.forEach((record) => objectStore.put(record));
  }
  await transactionDone(transaction);
  publish(await hydrateFromDatabase());
  return summary;
}

export async function resetStore(): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAMES, "readwrite");
  STORE_NAMES.forEach((name) => transaction.objectStore(name).clear());
  await transactionDone(transaction);
  database.close();
  databasePromise = null;
  await initializeStore();
}

export function newMetaRecord(id: string, fields: Record<string, unknown> = {}): MetaRecord {
  return { id: `${id}-${makeId("meta")}`, ...fields };
}
