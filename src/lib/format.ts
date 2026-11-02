import { DAY_MS } from "../constants";
import type { Exercise, Routine, RoutineDay, SessionExercise, TrainingBlock } from "../types";

export function cx(...values: (string | false | null | undefined)[]) {
  return values.filter(Boolean).join(" ");
}
export function formatDuration(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(total / 3600)).padStart(2, "0")}:${String(Math.floor((total % 3600) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
export function formatDate(
  timestamp: number,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
): string {
  return new Intl.DateTimeFormat("es-ES", options).format(new Date(timestamp));
}
export function formatClock(timestamp: number) {
  return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
}
export function cleanNumber(value: string | number) {
  const number = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : 0;
}
export function formatted(value: number, digits = 1) {
  return value.toLocaleString("es-ES", { maximumFractionDigits: digits });
}
export function exerciseName(exercises: Exercise[], id: string) {
  return exercises.find((exercise) => exercise.id === id)?.name ?? "Ejercicio guardado";
}
export function allTargetSets(exercises: SessionExercise[]) {
  return exercises.reduce((sum, exercise) => sum + exercise.targetSets, 0);
}
export function completedSets(exercises: SessionExercise[]) {
  return exercises.reduce((sum, exercise) => sum + exercise.sets.filter((set) => set.completed).length, 0);
}
export function weekIndex(block: TrainingBlock | undefined, now = Date.now()) {
  if (!block) return 1;
  const elapsedWeeks = Math.max(0, Math.floor((now - block.startAt) / (7 * DAY_MS)));
  return (elapsedWeeks % Math.max(4, block.weeks)) + 1;
}
export function currentDay(routine: Routine | undefined, sessionCount: number): RoutineDay | undefined {
  if (!routine?.days.length) return undefined;
  return routine.days[sessionCount % routine.days.length];
}
