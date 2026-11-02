import { LOCAL_CATALOG } from "./data/catalog";
import { migrateDataset, SCHEMA_VERSION, STORES_V1, STORES_V2, type Dataset } from "./data/migrations";
import { makeId } from "./engine/fitness";
import type {
  ActiveSession,
  AuditEntry,
  BodyMetric,
  CardioRecord,
  DailyCheckin,
  Exercise,
  GoalRecord,
  Injury,
  MetaRecord,
  PainEntry,
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
export { SCHEMA_VERSION };
const STORE_NAMES: StoreName[] = [...STORES_V2];

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
  painEntries: PainEntry[];
  dailyCheckins: DailyCheckin[];
  auditLog: AuditEntry[];
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
  painEntries: [],
  dailyCheckins: [],
  auditLog: [],
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

let upgradedFromVersion: number | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, SCHEMA_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      upgradedFromVersion = (event as IDBVersionChangeEvent).oldVersion;
      // La estructura (stores) se crea acá; la migración de datos corre después en migrateStoredData.
      for (const name of STORE_NAMES)
        if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: "id" });
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

function sameRecords(a: unknown[], b: unknown[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/** Lleva los datos guardados a SCHEMA_VERSION en una única transacción (todo o nada). */
async function migrateStoredData(database: IDBDatabase): Promise<void> {
  const meta = await readStore(database, "meta");
  const schema = meta.find((record) => record.id === "schema");
  const fresh = !schema && (upgradedFromVersion === 0 || upgradedFromVersion === null);
  const storedVersion = schema ? Number(schema.version) || 1 : fresh ? SCHEMA_VERSION : 1;
  if (storedVersion >= SCHEMA_VERSION) return;
  const before: Dataset = {};
  for (const name of STORE_NAMES)
    before[name] = (await readStore(database, name)) as unknown as Record<string, unknown>[];
  const after = migrateDataset(before, storedVersion);
  after.meta = [
    ...after.meta.filter((record) => record.id !== "schema"),
    { id: "schema", version: SCHEMA_VERSION, migratedAt: Date.now(), from: storedVersion },
  ];
  const transaction = database.transaction(STORE_NAMES, "readwrite");
  for (const name of STORE_NAMES) {
    if (sameRecords(before[name] ?? [], after[name] ?? [])) continue;
    const store = transaction.objectStore(name);
    store.clear();
    after[name].forEach((record) => store.put(record));
  }
  await transactionDone(transaction);
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
  // El catálogo base vive en el código: una copia "local" en la base nunca pisa a la del código.
  const exercises = new Map<string, Exercise>();
  (records.exercises as Exercise[])
    .filter((exercise) => exercise.source !== "local")
    .forEach((exercise) => exercises.set(exercise.id, exercise));
  LOCAL_CATALOG.forEach((exercise) => exercises.set(exercise.id, exercise));
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
    painEntries: [...(records.painEntries as PainEntry[])].sort((a, b) => b.at - a.at),
    dailyCheckins: [...(records.dailyCheckins as DailyCheckin[])].sort((a, b) => b.at - a.at),
    auditLog: [...(records.auditLog as AuditEntry[])].sort((a, b) => b.at - a.at),
  };
}

export async function initializeStore(): Promise<{ state: AppSnapshot; persistent: boolean | null }> {
  const database = await openDatabase();
  await migrateStoredData(database);
  const profiles = await readStore(database, "profile");
  const settings = await readStore(database, "settings");
  const meta = await readStore(database, "meta");
  const transaction = database.transaction(["profile", "settings", "meta"], "readwrite");
  const profileStore = transaction.objectStore("profile");
  const settingsStore = transaction.objectStore("settings");
  if (!profiles.some((record) => record.id === "main")) profileStore.put(defaultProfile);
  if (!settings.some((record) => record.id === "main")) settingsStore.put(defaultSettings);
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

type ListStore = Exclude<StoreName, "profile" | "settings" | "activeSession">;

// Orden de presentación de cada lista en el snapshot (más reciente primero).
const SORT_KEYS: Partial<Record<ListStore, string>> = {
  sessions: "endedAt",
  bodyMetrics: "at",
  cardio: "at",
  photos: "at",
  painEntries: "at",
  dailyCheckins: "at",
  auditLog: "at",
};

function withChange(current: AppSnapshot, store: StoreName, put?: { id: string }, deleteId?: string): AppSnapshot {
  if (store === "profile") return put ? { ...current, profile: put as Profile } : current;
  if (store === "settings") return put ? { ...current, settings: put as Settings } : current;
  if (store === "activeSession") return { ...current, activeSession: put ? (put as ActiveSession) : null };
  const key = store as ListStore;
  const removeId = put?.id ?? deleteId;
  const values = (current[key] as { id: string }[]).filter((item) => item.id !== removeId);
  const next = put ? [put, ...values] : values;
  const sortKey = SORT_KEYS[key];
  if (sortKey) {
    next.sort(
      (a, b) =>
        Number((b as Record<string, unknown>)[sortKey] ?? 0) - Number((a as Record<string, unknown>)[sortKey] ?? 0),
    );
  }
  return { ...current, [key]: next } as AppSnapshot;
}

export type Write = { store: StoreName; put: { id: string } } | { store: StoreName; delete: string };

/**
 * Aplica varias escrituras y entradas de bitácora en UNA transacción: o se guarda todo o nada.
 * Es la base de la edición de historial (registro + auditLog juntos).
 */
export async function commit(writes: Write[], audit: Omit<AuditEntry, "id" | "at">[] = []): Promise<void> {
  if (!writes.length && !audit.length) return;
  const database = await openDatabase();
  const at = Date.now();
  const auditRecords: AuditEntry[] = audit.map((entry) => ({ ...entry, id: makeId("audit"), at }));
  const stores = [
    ...new Set([...writes.map((write) => write.store), ...(auditRecords.length ? ["auditLog" as const] : [])]),
  ];
  const transaction = database.transaction(stores, "readwrite");
  for (const write of writes) {
    if ("put" in write) transaction.objectStore(write.store).put(write.put);
    else transaction.objectStore(write.store).delete(write.delete);
  }
  auditRecords.forEach((record) => transaction.objectStore("auditLog").put(record));
  await transactionDone(transaction);
  let next = snapshot;
  for (const write of writes)
    next =
      "put" in write
        ? withChange(next, write.store, write.put)
        : withChange(next, write.store, undefined, write.delete);
  for (const record of auditRecords) next = withChange(next, "auditLog", record);
  publish(next);
}

export async function saveRecord<S extends StoreName>(store: S, record: StoreMap[S]): Promise<void> {
  await commit([{ store, put: record as { id: string } }]);
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
  if (store === "profile" || store === "settings")
    throw new Error("El perfil y los ajustes no se borran por separado.");
  await commit([{ store, delete: id }]);
}

// Sin FileReader: funciona igual en el navegador y en las pruebas (Node).
async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

export async function exportBackup(): Promise<Record<string, unknown>> {
  const database = await openDatabase();
  const values = await Promise.all(STORE_NAMES.map((name) => readStore(database, name)));
  const stores: Record<string, unknown[]> = Object.fromEntries(
    STORE_NAMES.map((name, index) => [name, values[index] as unknown[]]),
  );
  stores.meta = (stores.meta as MetaRecord[]).filter((record) => record.id !== ROLLBACK_ID);
  stores.photos = await Promise.all(
    (stores.photos as PhotoRecord[]).map(async (photo) => {
      if (!photo.blob) return photo;
      return { ...photo, dataUrl: await blobToDataUrl(photo.blob), blob: undefined };
    }),
  );
  return {
    app: "ManteYym",
    appVersion: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev",
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
  const version = Number(candidate.schemaVersion);
  if (!Number.isInteger(version) || version < 1) throw new Error("El respaldo no indica una versión de datos válida.");
  if (version > SCHEMA_VERSION)
    throw new Error(`El respaldo es de una versión más nueva (v${version}). Actualiza ManteYym antes de restaurarlo.`);
  if (typeof candidate.exportedAt !== "number" || !candidate.stores || typeof candidate.stores !== "object")
    throw new Error("Faltan datos obligatorios del respaldo.");
  const rawStores = candidate.stores as Record<string, unknown>;
  const required: readonly string[] = version === 1 ? STORES_V1 : STORE_NAMES;
  for (const name of required) {
    if (!Array.isArray(rawStores[name])) throw new Error(`La lista local '${name}' falta o está corrupta.`);
  }
  // Los stores agregados en versiones nuevas pueden faltar en respaldos viejos: se completan vacíos.
  const stores = migrateDataset(
    Object.fromEntries(STORE_NAMES.map((name) => [name, (rawStores[name] as Record<string, unknown>[]) ?? []])),
    version,
  ) as Record<string, unknown>;
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
  return { backup: { ...candidate, schemaVersion: SCHEMA_VERSION, stores, migratedFrom: version }, summary };
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

const ROLLBACK_ID = "pre-import-backup";

/** Lee todos los stores tal cual (fotos como Blob, sin base64) para poder deshacer una importación. */
async function readAllRaw(database: IDBDatabase): Promise<Record<string, unknown[]>> {
  const values = await Promise.all(STORE_NAMES.map((name) => readStore(database, name)));
  const stores = Object.fromEntries(STORE_NAMES.map((name, index) => [name, values[index] as unknown[]]));
  stores.meta = (stores.meta as MetaRecord[]).filter((record) => record.id !== ROLLBACK_ID);
  return stores;
}

/** Reemplaza todos los stores en una única transacción: si algo falla (p. ej. cuota), no cambia nada. */
async function replaceAllStores(data: Record<string, unknown[]>, rollback: Record<string, unknown[]> | null) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAMES, "readwrite");
  for (const name of STORE_NAMES) {
    const objectStore = transaction.objectStore(name);
    objectStore.clear();
    const records = (data[name] ?? []).filter((record) => (record as { id?: string }).id !== ROLLBACK_ID);
    if (name === "meta" && rollback) records.push({ id: ROLLBACK_ID, stores: rollback, savedAt: Date.now() });
    records.forEach((record) => objectStore.put(record));
  }
  await transactionDone(transaction);
  publish(await hydrateFromDatabase());
}

export async function importBackup(value: unknown): Promise<BackupSummary> {
  const { backup, summary } = validateBackup(value);
  const rollback = await readAllRaw(await openDatabase());
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
        : source[name],
    ]),
  ) as Record<string, unknown[]>;
  await replaceAllStores(prepared, rollback);
  return summary;
}

/** Fecha de la copia automática previa a la última importación, si existe. */
export function rollbackSavedAt(): number | null {
  const record = snapshot.meta.find((item) => item.id === ROLLBACK_ID);
  return record && record.stores ? Number(record.savedAt) : null;
}

/** Deshace la última importación restaurando la copia automática. */
export async function restoreRollback(): Promise<void> {
  const record = snapshot.meta.find((item) => item.id === ROLLBACK_ID);
  if (!record?.stores) throw new Error("No hay una copia previa a la importación en este dispositivo.");
  await replaceAllStores(record.stores as Record<string, unknown[]>, null);
}

export async function resetStore(): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAMES, "readwrite");
  STORE_NAMES.forEach((name) => transaction.objectStore(name).clear());
  await transactionDone(transaction);
  database.close();
  databasePromise = null;
  upgradedFromVersion = 0;
  await initializeStore();
}

export function newMetaRecord(id: string, fields: Record<string, unknown> = {}): MetaRecord {
  return { id: `${id}-${makeId("meta")}`, ...fields };
}

/** Solo para pruebas: olvida la conexión abierta para simular un arranque nuevo. */
export function __resetConnectionForTests(): void {
  databasePromise = null;
  upgradedFromVersion = null;
  snapshot = blankSnapshot;
}
