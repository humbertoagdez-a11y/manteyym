// Pruebas del almacenamiento: migraciones v1 → v2, importación de respaldos y round-trip.
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { LOCAL_CATALOG } from "../src/data/catalog";
import { migrateDataset, SCHEMA_VERSION, STORES_V1, type Dataset } from "../src/data/migrations";
import * as store from "../src/store";

const fixture = JSON.parse(readFileSync(path.join(__dirname, "fixtures/backup-v1.json"), "utf8")) as {
  schemaVersion: number;
  stores: Dataset;
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  store.__resetConnectionForTests();
});

/** Crea una base v1 real, como la dejaba la versión anterior de la app. */
async function seedV1Database(stores: Dataset): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(store.DB_NAME, 1);
    request.onupgradeneeded = () => {
      for (const name of STORES_V1) request.result.createObjectStore(name, { keyPath: "id" });
    };
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction([...STORES_V1], "readwrite");
      for (const name of STORES_V1) {
        for (const record of stores[name] ?? []) {
          const value =
            name === "photos" && typeof record.dataUrl === "string"
              ? {
                  ...record,
                  dataUrl: undefined,
                  blob: new Blob([Buffer.from(record.dataUrl.split(",")[1], "base64")], { type: "image/png" }),
                }
              : record;
          transaction.objectStore(name).put(value);
        }
      }
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
    request.onerror = () => reject(request.error);
  });
}

describe("migración v1 → v2 (función pura)", () => {
  const migrated = migrateDataset(clone(fixture.stores), 1, 1_800_000_000_000);

  it("copia cada lesión v1 al registro de dolor sin borrar las originales", () => {
    expect(migrated.painEntries).toHaveLength(2);
    expect(migrated.injuries).toHaveLength(2);
    const shoulder = migrated.painEntries.find((entry) => entry.id === "pain-v1-injury-2");
    expect(shoulder).toMatchObject({
      status: "dolor",
      zones: ["hombro"],
      intensity: 8,
      ongoing: true,
      origin: "v1-injury",
    });
    expect(String(shoulder?.note)).toContain("Molesta en press");
  });

  it("recupera los chequeos de disposición que estaban en meta", () => {
    expect(migrated.dailyCheckins).toHaveLength(2);
    expect(migrated.dailyCheckins[0]).toMatchObject({
      dayKey: "2026-09-10",
      sleepQuality: 2,
      energy: 3,
      soreness: 4,
      stress: 3,
    });
    expect(migrated.meta.some((record) => String(record.id).startsWith("readiness-"))).toBe(false);
    expect(migrated.meta.find((record) => record.id === "active-routine")).toBeTruthy();
  });

  it("descarta solo las copias del catálogo base y conserva ejercicios personales y descargados", () => {
    expect(migrated.exercises.map((exercise) => exercise.id).sort()).toEqual(["free-Barbell_Curl", "personal-1"]);
  });

  it("conserva sesiones, series y notas, y agrega trazabilidad", () => {
    expect(migrated.sessions).toHaveLength(2);
    const first = migrated.sessions.find((session) => session.id === "session-1") as Record<string, unknown>;
    expect(first).toMatchObject({ revision: 1, createdAt: 1786003600000, notes: "Buena sesion" });
    expect(JSON.stringify(first.exercises)).toBe(JSON.stringify(fixture.stores.sessions[0].exercises));
  });

  it("no toca fotos, medidas, metas ni cardio", () => {
    for (const name of ["photos", "bodyMetrics", "goals", "cardio", "routines", "blocks"]) {
      expect(migrated[name]).toEqual(fixture.stores[name]);
    }
  });

  it("deja constancia en la bitácora", () => {
    expect(migrated.auditLog).toHaveLength(1);
    expect(migrated.auditLog[0]).toMatchObject({ action: "migrate", entity: "schema" });
  });

  it("rechaza versiones desconocidas o futuras", () => {
    expect(() => migrateDataset({}, 0)).toThrow();
    expect(() => migrateDataset({}, SCHEMA_VERSION + 1)).toThrow(/más nueva/);
  });
});

describe("validación de respaldos", () => {
  it("acepta un respaldo v1 y lo devuelve migrado a la versión actual", () => {
    const { backup, summary } = store.validateBackup(clone(fixture));
    expect(backup.schemaVersion).toBe(SCHEMA_VERSION);
    expect(backup.migratedFrom).toBe(1);
    expect((backup.stores as Dataset).painEntries).toHaveLength(2);
    expect(summary).toMatchObject({ sessions: 2, routines: 1, photos: 1 });
  });

  it("rechaza respaldos de otra app, de una versión futura o con stores rotos", () => {
    expect(() => store.validateBackup({ ...clone(fixture), app: "Otra" })).toThrow(/no pertenece/);
    expect(() => store.validateBackup({ ...clone(fixture), schemaVersion: 99 })).toThrow(/más nueva/);
    const broken = clone(fixture);
    (broken.stores as Record<string, unknown>).sessions = "nada";
    expect(() => store.validateBackup(broken)).toThrow(/sessions/);
  });
});

describe("IndexedDB", () => {
  it("una base v1 existente se migra al abrir, sin pérdida", async () => {
    await seedV1Database(clone(fixture.stores));
    const { state } = await store.initializeStore();
    expect(state.sessions.map((session) => session.id)).toEqual(["session-2", "session-1"]);
    expect(state.painEntries).toHaveLength(2);
    expect(state.dailyCheckins).toHaveLength(2);
    expect(state.injuries).toHaveLength(2);
    expect(state.profile.injuries).toHaveLength(1);
    expect(state.photos[0].blob).toBeInstanceOf(Blob);
    expect(state.meta.find((record) => record.id === "schema")).toMatchObject({ version: SCHEMA_VERSION, from: 1 });
    // El catálogo base se lee del código (con los textos corregidos), no de la copia vieja.
    const bench = state.exercises.find((exercise) => exercise.id === "bench-barbell");
    expect(bench?.steps).toEqual(LOCAL_CATALOG.find((exercise) => exercise.id === "bench-barbell")?.steps);
    expect(state.exercises.find((exercise) => exercise.id === "personal-1")).toBeTruthy();
  });

  it("abrir dos veces no vuelve a migrar", async () => {
    await seedV1Database(clone(fixture.stores));
    await store.initializeStore();
    store.__resetConnectionForTests();
    const { state } = await store.initializeStore();
    expect(state.painEntries).toHaveLength(2);
    expect(state.auditLog.filter((entry) => entry.action === "migrate")).toHaveLength(1);
  });

  it("una instalación nueva arranca en v2 sin entradas de migración", async () => {
    const { state } = await store.initializeStore();
    expect(state.meta.find((record) => record.id === "schema")).toMatchObject({ version: SCHEMA_VERSION });
    expect(state.auditLog).toHaveLength(0);
    expect(state.exercises.length).toBe(LOCAL_CATALOG.length);
  });

  it("round-trip: importar v1 → exportar v2 → importar v2 → exportar da los mismos datos", async () => {
    await store.initializeStore();
    await store.importBackup(clone(fixture));
    const first = (await store.exportBackup()) as { schemaVersion: number; stores: Dataset };
    expect(first.schemaVersion).toBe(SCHEMA_VERSION);
    await store.importBackup(clone(first));
    const second = (await store.exportBackup()) as { stores: Dataset };
    const comparable = (stores: Dataset) =>
      Object.fromEntries(
        Object.entries(stores).map(([name, records]) => [
          name,
          [...records].sort((a, b) => String(a.id).localeCompare(String(b.id))),
        ]),
      );
    expect(comparable(second.stores)).toEqual(comparable(first.stores));
    expect(first.stores.photos[0].dataUrl).toBe(fixture.stores.photos[0].dataUrl);
  });

  it("una importación se puede deshacer y vuelve exactamente a los datos previos", async () => {
    await store.initializeStore();
    await store.saveRecord("goals", {
      id: "goal-local",
      exerciseId: "deadlift",
      target: 180,
      units: "kg",
      createdAt: 1,
    });
    const before = store.getSnapshot();
    await store.importBackup(clone(fixture));
    expect(store.rollbackSavedAt()).toBeTypeOf("number");
    expect(store.getSnapshot().goals.map((goal) => goal.id)).toEqual(["goal-1"]);
    await store.restoreRollback();
    expect(store.getSnapshot().goals.map((goal) => goal.id)).toEqual(["goal-local"]);
    expect(store.getSnapshot().sessions).toEqual(before.sessions);
    expect(store.rollbackSavedAt()).toBeNull();
  });

  it("commit guarda el registro y la bitácora juntos", async () => {
    await store.initializeStore();
    await store.importBackup(clone(fixture));
    const session = store.getSnapshot().sessions.find((item) => item.id === "session-1")!;
    await store.commit(
      [{ store: "sessions", put: { ...session, notes: "Editada", revision: 2 } }],
      [{ entity: "sessions", entityId: "session-1", action: "update", summary: "Nota editada" }],
    );
    expect(store.getSnapshot().sessions.find((item) => item.id === "session-1")?.notes).toBe("Editada");
    expect(store.getSnapshot().auditLog[0]).toMatchObject({ entityId: "session-1", action: "update" });
    store.__resetConnectionForTests();
    const { state } = await store.initializeStore();
    expect(state.sessions.find((item) => item.id === "session-1")?.revision).toBe(2);
  });
});
