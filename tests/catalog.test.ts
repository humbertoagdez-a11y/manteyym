// El catálogo base: contenido propio para los 64 ejercicios y media empaquetada que existe en disco.
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOCAL_CATALOG } from "../src/data/catalog";
import mediaMap from "../src/data/media-map.json";

describe("catálogo base", () => {
  it("tiene 64 ejercicios con contenido propio (no el texto genérico por patrón)", () => {
    expect(LOCAL_CATALOG).toHaveLength(64);
    for (const exercise of LOCAL_CATALOG) {
      expect(exercise.content, exercise.id).toBeDefined();
      expect(exercise.content!.setup.length + exercise.content!.execution.length, exercise.id).toBeGreaterThanOrEqual(
        3,
      );
      expect(exercise.contentReviewed, exercise.id).toBe(false);
    }
    // Antes press de banca y flexiones compartían exactamente los mismos pasos.
    const bench = LOCAL_CATALOG.find((exercise) => exercise.id === "bench-barbell")!;
    const pushUp = LOCAL_CATALOG.find((exercise) => exercise.id === "push-up")!;
    expect(bench.steps).not.toEqual(pushUp.steps);
  });

  it("cada frame referenciado existe en public/ y los sin media son los declarados", () => {
    const withoutMedia = LOCAL_CATALOG.filter((exercise) => !exercise.media).map((exercise) => exercise.id);
    expect(withoutMedia.sort()).toEqual(Object.keys(mediaMap.sinMedia).sort());
    for (const exercise of LOCAL_CATALOG.filter((item) => item.media)) {
      for (const frame of exercise.media!.frames) {
        expect(existsSync(path.join(__dirname, "../public", frame)), frame).toBe(true);
      }
    }
  });
});
