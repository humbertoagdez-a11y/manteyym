// PR derivados de las sesiones y exportación CSV.
import { describe, expect, it } from "vitest";
import { LOCAL_CATALOG } from "../src/data/catalog";
import { exerciseRecords, normalizeEditedSession, painCsv, sessionsCsv } from "../src/lib/records";
import { newPainEntry } from "../src/lib/pain";
import { trainingSession } from "./helpers";

describe("marcas personales", () => {
  const a = trainingSession("a", 1000, "bench-barbell", [
    { weight: 80, reps: 8 },
    { weight: 90, reps: 3 },
    { weight: 40, reps: 10, type: "calentamiento" },
  ]);
  const b = trainingSession("b", 2000, "bench-barbell", [{ weight: 85, reps: 8 }]);

  it("se derivan de las sesiones e ignoran calentamientos", () => {
    const records = exerciseRecords([a, b], "bench-barbell");
    expect(records.heaviest).toMatchObject({ weight: 90, reps: 3, sessionId: "a" });
    expect(records.bestE1rm?.sessionId).toBe("b");
    expect(records.byRepRange.map((item) => [item.range, item.weight])).toEqual([
      ["1–3", 90],
      ["7–10", 85],
    ]);
    expect(records.bestSessionVolume).toMatchObject({ value: 80 * 8 + 90 * 3, sessionId: "a" });
  });

  it("al editar una sesión, los PR cambian sin tocar otra tabla", () => {
    const fixed = { ...b, exercises: [{ ...b.exercises[0], sets: [{ ...b.exercises[0].sets[0], weight: 58 }] }] };
    expect(exerciseRecords([a, fixed], "bench-barbell").bestE1rm?.sessionId).toBe("a");
  });

  it("normalizeEditedSession recalcula volumen y duración", () => {
    const edited = normalizeEditedSession({ ...a, startedAt: 0, endedAt: 3_600_000 });
    expect(edited.durationMs).toBe(3_600_000);
    expect(edited.volume).toBe(80 * 8 + 90 * 3);
  });
});

describe("CSV", () => {
  it("aplana una fila por serie y escapa comas, comillas y saltos", () => {
    const session = trainingSession("s", 1000, "bench-barbell", [{ weight: 60, reps: 8, note: 'dijo "ok", bien' }]);
    const csv = sessionsCsv([session], LOCAL_CATALOG, "kg");
    const lines = csv.replace("﻿", "").trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0].startsWith("fecha_inicio,sesion_id")).toBe(true);
    expect(lines[1]).toContain("Press de banca con barra");
    expect(lines[1]).toContain('"dijo ""ok"", bien"');
  });

  it("exporta el registro de dolor", () => {
    const csv = painCsv([
      newPainEntry({ status: "dolor", when: "durante", zones: ["hombro", "codo"], intensity: 5 }, 0),
    ]);
    expect(csv).toContain("hombro|codo");
  });
});
