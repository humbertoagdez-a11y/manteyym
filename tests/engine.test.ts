// Pruebas del motor de entrenamiento (antes en tests/console-tests.js, mismos 8 casos).
import { describe, expect, it } from "vitest";
import { LOCAL_CATALOG } from "../src/data/catalog";
import {
  buildRoutine,
  calculatePlates,
  detectStagnation,
  estimatedOneRepMax,
  isExerciseCompatible,
  suggestProgression,
  volumeByMuscle,
  warmupSets,
} from "../src/engine/fitness";
import type { Exercise } from "../src/types";
import { profile, trainingSession } from "./helpers";

describe("motor de entrenamiento", () => {
  it("1RM estimado de Epley", () => {
    expect(estimatedOneRepMax(100, 10)).toBeCloseTo(133.333, 2);
    expect(estimatedOneRepMax(0, 10)).toBe(0);
    expect(estimatedOneRepMax(100, 1)).toBe(100);
  });

  it("calculadora de discos por lado", () => {
    const result = calculatePlates(62.5, 20, [20, 15, 10, 5, 2.5, 1.25]);
    expect(result.actual).toBe(62.5);
    expect(result.eachSide).toEqual([20, 1.25]);
    expect(calculatePlates(100, 20, [20, 10]).actual).toBeLessThanOrEqual(100);
  });

  it("series de aproximación", () => {
    const warmups = warmupSets(100);
    expect(warmups.map((set) => set.percent)).toEqual([40, 60, 80]);
    expect(warmups.map((set) => set.reps)).toEqual([8, 5, 3]);
  });

  it("doble progresión", () => {
    const previous = trainingSession("old", 20, "bench-barbell", [{ weight: 80, reps: 12 }]);
    const suggestion = suggestProgression([previous], "bench-barbell", "doble", [6, 12], "kg");
    expect(suggestion.weight).toBe(82.5);
    expect(suggestion.reps).toBe(6);
    expect(suggestProgression([], "bench-barbell", "doble", [6, 12], "kg").reps).toBe(6);
  });

  it("detección de estancamiento en tres sesiones", () => {
    const history = [30, 20, 10].map((date, index) =>
      trainingSession(`stall-${index}`, date, "bench-barbell", [{ weight: 80, reps: 8 }]),
    );
    expect(detectStagnation(history, "bench-barbell")).toBe(true);
    expect(detectStagnation(history.slice(0, 2), "bench-barbell")).toBe(false);
  });

  it("generación para semanas de 2 a 6 días", () => {
    const plans = [2, 3, 4, 5, 6].map((days) => buildRoutine(profile({ days }), LOCAL_CATALOG));
    expect(plans.map((plan) => plan.days.length)).toEqual([2, 3, 4, 5, 6]);
    expect(plans[0].split).toBe("full body");
    expect(plans[2].split).toBe("torso / pierna");
    expect(plans[4].split).toBe("PPL");
    const strength = buildRoutine(profile({ goal: "fuerza" }), LOCAL_CATALOG);
    expect(strength.days[0].exercises.every((item) => item.repsMin >= 3 && item.repsMax <= 6)).toBe(true);
  });

  it("la rutina respeta lesión, equipo y exclusiones", () => {
    const bodyOnly = profile({
      days: 3,
      equipment: ["peso corporal"],
      injuries: [{ id: "i", zone: "rodilla", note: "", pain: 2, createdAt: 1 }],
      exclusions: ["dominada"],
    });
    const plan = buildRoutine(bodyOnly, LOCAL_CATALOG);
    const used = plan.days
      .flatMap((day) => day.exercises.map((item) => LOCAL_CATALOG.find((exercise) => exercise.id === item.exerciseId)))
      .filter((exercise): exercise is Exercise => Boolean(exercise));
    expect(used.length).toBeGreaterThan(0);
    expect(used.every((exercise) => isExerciseCompatible(exercise, bodyOnly))).toBe(true);
    expect(used.some((exercise) => exercise.name.toLowerCase().includes("dominada"))).toBe(false);
  });

  it("volumen semanal por músculo", () => {
    const session = trainingSession("volume", 100, "bench-barbell", [
      { weight: 60, reps: 10 },
      { weight: 60, reps: 8 },
    ]);
    const volume = volumeByMuscle([session], LOCAL_CATALOG, 50);
    expect(volume.pecho).toBe(2);
    expect(volume.triceps).toBe(1);
    expect(volume.hombros).toBe(1);
  });
});
