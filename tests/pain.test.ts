// Pruebas de la lógica del registro de dolor.
import { describe, expect, it } from "vitest";
import { LOCAL_CATALOG } from "../src/data/catalog";
import { isExerciseCompatible } from "../src/engine/fitness";
import {
  activePainZones,
  dailyMaxIntensity,
  exercisesLoadingZones,
  newPainEntry,
  redFlags,
  todaysEntries,
  trainingBefore,
} from "../src/lib/pain";
import { profile, trainingSession } from "./helpers";

const H = 60 * 60 * 1000;

describe("registro de dolor", () => {
  it("'sin dolor' no guarda zonas ni intensidad aunque se pasen", () => {
    const entry = newPainEntry({ status: "sin_dolor", when: "antes", zones: ["rodilla"], intensity: 5 }, 1000);
    expect(entry).toMatchObject({ status: "sin_dolor", zones: [], intensity: undefined, ongoing: false, at: 1000 });
  });

  it("zona activa: el último registro manda y un 'sin dolor' posterior la desactiva", () => {
    const old = newPainEntry({ status: "dolor", when: "durante", zones: ["hombro"], intensity: 6 }, 10 * H);
    const knee = newPainEntry({ status: "dolor", when: "despues", zones: ["rodilla"], intensity: 3 }, 12 * H);
    expect(
      activePainZones([old, knee])
        .map((item) => item.zone)
        .sort(),
    ).toEqual(["hombro", "rodilla"]);
    const resolved = { ...knee, ongoing: false, resolvedAt: 13 * H };
    expect(activePainZones([old, resolved]).map((item) => item.zone)).toEqual(["hombro"]);
    const noPain = newPainEntry({ status: "sin_dolor", when: "antes" }, 20 * H);
    expect(activePainZones([old, knee, noPain])).toEqual([]);
    const later = newPainEntry({ status: "dolor", when: "durante", zones: ["hombro"], intensity: 4 }, 21 * H);
    expect(activePainZones([old, knee, noPain, later]).map((item) => item.zone)).toEqual(["hombro"]);
  });

  it("varios registros de la misma zona se conservan (no se sobrescriben)", () => {
    const entries = [1, 2, 3].map((index) =>
      newPainEntry({ status: "dolor", when: "durante", zones: ["codo"], intensity: index }, index * H),
    );
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(3);
    expect(dailyMaxIntensity(entries, "codo")).toHaveLength(1);
    expect(dailyMaxIntensity(entries, "codo")[0].value).toBe(3);
  });

  it("señales de alerta: pecho, hormigueo, golpe o intensidad alta", () => {
    const base = { status: "dolor" as const, zones: ["rodilla"], intensity: 3 };
    expect(redFlags(base)).toEqual([]);
    expect(redFlags({ ...base, zones: ["pecho"] })).toHaveLength(1);
    expect(redFlags({ ...base, quality: ["hormigueo"] })).toHaveLength(1);
    expect(redFlags({ ...base, afterImpact: true })).toHaveLength(1);
    expect(redFlags({ ...base, intensity: 9 })).toHaveLength(1);
    expect(redFlags({ status: "sin_dolor", zones: [], afterImpact: true })).toEqual([]);
  });

  it("'hoy' usa el día local", () => {
    const now = new Date(2026, 9, 10, 20).getTime();
    const today = newPainEntry({ status: "sin_dolor", when: "antes" }, new Date(2026, 9, 10, 7).getTime());
    const yesterday = newPainEntry({ status: "sin_dolor", when: "antes" }, new Date(2026, 9, 9, 23).getTime());
    expect(todaysEntries([today, yesterday], now).map((entry) => entry.id)).toEqual([today.id]);
  });

  it("qué se entrenó antes: sesión vinculada o las últimas 48 h", () => {
    const s1 = trainingSession("s1", 1 * H, "bench-barbell", [{ weight: 60, reps: 8 }]);
    const s2 = trainingSession("s2", 40 * H, "back-squat", [{ weight: 80, reps: 5 }]);
    const s3 = trainingSession("s3", 100 * H, "deadlift", [{ weight: 100, reps: 5 }]);
    const entry = newPainEntry({ status: "dolor", when: "despues", zones: ["rodilla"], intensity: 4 }, 50 * H);
    expect(trainingBefore(entry, [s1, s2, s3]).map((session) => session.id)).toEqual(["s2"]);
    const linked = { ...entry, context: { sessionId: "s1" } };
    expect(trainingBefore(linked, [s1, s2, s3]).map((session) => session.id)).toEqual(["s1"]);
  });

  it("el dolor activo alimenta la compatibilidad sin tocar el perfil", () => {
    const bench = LOCAL_CATALOG.find((exercise) => exercise.id === "bench-barbell")!;
    const squat = LOCAL_CATALOG.find((exercise) => exercise.id === "back-squat")!;
    const base = profile();
    expect(isExerciseCompatible(bench, base)).toBe(true);
    expect(isExerciseCompatible(bench, base, true, ["hombro"])).toBe(false);
    expect(isExerciseCompatible(squat, base, true, ["hombro"])).toBe(true);
    expect(base.injuries).toEqual([]);
    expect(exercisesLoadingZones([bench, squat], ["rodilla"]).map((exercise) => exercise.id)).toEqual(["back-squat"]);
  });
});
