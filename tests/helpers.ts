// Constructores de datos para las pruebas.
import type { LoggedSet, Profile, TrainingSession } from "../src/types";

export function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "main",
    onboardingComplete: true,
    goal: "hipertrofia",
    level: "principiante",
    yearsTraining: 1,
    days: 3,
    minutes: 45,
    equipment: ["Gimnasio completo"],
    priorities: [],
    injuries: [],
    exclusions: [],
    units: "kg",
    progression: "doble",
    ...overrides,
  } as Profile;
}

export function trainingSession(
  id: string,
  endedAt: number,
  exerciseId: string,
  sets: Partial<LoggedSet>[],
): TrainingSession {
  return {
    id,
    routineId: "r",
    dayId: "d",
    dayName: "Día A",
    startedAt: endedAt - 45_000,
    endedAt,
    timeZone: "UTC",
    durationMs: 45_000,
    volume: 0,
    notes: "",
    exercises: [
      {
        exerciseId,
        targetSets: sets.length,
        repsMin: 6,
        repsMax: 12,
        restSec: 90,
        note: "",
        sets: sets.map(
          (set, index) =>
            ({ id: `${id}-${index}`, type: "normal", rir: 2, note: "", completed: true, ...set }) as LoggedSet,
        ),
      },
    ],
  } as TrainingSession;
}
