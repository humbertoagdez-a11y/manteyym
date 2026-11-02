// Medición manual (no corre en CI): RUN_PERF=1 npx vitest run tests/perf (se omite sin la variable)
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import * as store from "../../src/store";

describe.runIf(process.env.RUN_PERF)("respaldo con fotos pesadas", () => {
  it("20 fotos de 3 MB", async () => {
    globalThis.indexedDB = new IDBFactory();
    store.__resetConnectionForTests();
    await store.initializeStore();
    const photo = new Uint8Array(3 * 1024 * 1024).map((_, index) => index % 251);
    for (let index = 0; index < 20; index++) {
      await store.saveRecord("photos", {
        id: `p${index}`,
        at: index,
        label: "x",
        blob: new Blob([photo], { type: "image/jpeg" }),
      });
    }
    const heap = () => Math.round(process.memoryUsage().heapUsed / 1048576);
    const t0 = performance.now();
    const backup = await store.exportBackup();
    const json = JSON.stringify(backup);
    const t1 = performance.now();
    console.log(`export: ${Math.round(t1 - t0)} ms · JSON ${Math.round(json.length / 1048576)} MB · heap ${heap()} MB`);
    await store.importBackup(JSON.parse(json));
    console.log(`import: ${Math.round(performance.now() - t1)} ms · heap ${heap()} MB`);
    expect(store.getSnapshot().photos).toHaveLength(20);
  }, 120_000);
});
