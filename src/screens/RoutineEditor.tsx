import { ExerciseDemo } from "../components/ExerciseDemo";
import { Icon } from "../components/Icon";
import { Button, EmptyState, Field } from "../components/ui";
import { EXERCISE_PATTERN_LABELS } from "../constants";
import { MUSCLE_LABELS } from "../engine/fitness";
import { cleanNumber, cx } from "../lib/format";
import type { Exercise, Routine, RoutineDay, WorkoutExercise } from "../types";
import { useEffect, useState } from "react";

export function RoutineEditor({
  routine,
  catalog,
  onSave,
  onClose,
  onPickExercise,
}: {
  routine: Routine;
  catalog: Exercise[];
  onSave: (routine: Routine) => Promise<void>;
  onClose: () => void;
  onPickExercise: (callback: (exercise: Exercise) => void) => void;
}) {
  const [draft, setDraft] = useState<Routine>(routine);
  const [dayIndex, setDayIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setDraft(routine);
    setDayIndex(0);
  }, [routine.id]);
  const day = draft.days[dayIndex];
  const updateDay = (transform: (current: RoutineDay) => RoutineDay) =>
    setDraft((previous) => ({
      ...previous,
      days: previous.days.map((item, index) => (index === dayIndex ? transform(item) : item)),
    }));
  const updatePlan = (index: number, change: Partial<WorkoutExercise>) =>
    updateDay((current) => ({
      ...current,
      exercises: current.exercises.map((item, itemIndex) => (itemIndex === index ? { ...item, ...change } : item)),
    }));
  const moveExercise = (index: number, direction: -1 | 1) =>
    updateDay((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.exercises.length) return current;
      const exercises = [...current.exercises];
      [exercises[index], exercises[target]] = [exercises[target], exercises[index]];
      return { ...current, exercises };
    });
  const removeExercise = (index: number) =>
    updateDay((current) => ({
      ...current,
      exercises: current.exercises.filter((_, itemIndex) => itemIndex !== index),
    }));
  const addExercise = () =>
    onPickExercise((exercise) =>
      updateDay((current) => ({
        ...current,
        exercises: [
          ...current.exercises,
          {
            exerciseId: exercise.id,
            sets: 3,
            repsMin: 8,
            repsMax: 12,
            restSec: 90,
            rir: 2,
            note: "",
          },
        ],
      })),
    );
  const toggleGrouping = (index: number, groupType: "superset" | "circuito") =>
    updateDay((current) => {
      if (index + 1 >= current.exercises.length && !current.exercises[index]?.superset) return current;
      const removing = current.exercises[index]?.groupType === groupType;
      const tag = removing ? undefined : `${groupType === "circuito" ? "C" : "A"}${Math.floor(index / 2) + 1}`;
      return {
        ...current,
        exercises: current.exercises.map((item, itemIndex) =>
          itemIndex === index || itemIndex === index + 1
            ? { ...item, superset: tag, groupType: removing ? undefined : groupType }
            : item,
        ),
      };
    });
  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="routine-editor">
      <div className="editor-top">
        <button type="button" className="text-action" onClick={onClose}>
          <Icon name="back" size={18} /> Volver a rutinas
        </button>
        <Button variant="primary" onClick={() => void save()} disabled={saving}>
          {saving ? "Guardando" : "Guardar cambios"}
        </Button>
      </div>
      <div className="editor-title">
        <Field label="Nombre de rutina" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
        <span className="eyebrow">{draft.split.toUpperCase()}</span>
      </div>
      <div className="day-tabs" role="tablist" aria-label="Días de rutina">
        {draft.days.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={index === dayIndex}
            className={cx(index === dayIndex && "day-tab-active")}
            onClick={() => setDayIndex(index)}
          >
            {item.name}
          </button>
        ))}
      </div>
      {day && (
        <>
          <div className="editor-day-heading">
            <div>
              <p className="eyebrow">SESIÓN {String(dayIndex + 1).padStart(2, "0")}</p>
              <h2>{day.name}</h2>
            </div>
            <span>{day.exercises.length} ejercicios</span>
          </div>
          <Field
            label="Nota de la sesión"
            value={day.note}
            onChange={(note) => updateDay((current) => ({ ...current, note }))}
            placeholder="Ejemplo: ritmo controlado, deja 2 repeticiones en reserva"
          />
          {!day.exercises.length ? (
            <EmptyState
              title="Día sin ejercicios"
              description="Añade movimientos compatibles con tu equipo y tus preferencias."
            />
          ) : (
            <div className="editor-exercise-list">
              {day.exercises.map((plan, index) => {
                const exercise = catalog.find((item) => item.id === plan.exerciseId);
                return (
                  <article className="editor-exercise" key={`${plan.exerciseId}-${index}`}>
                    <div className="editor-exercise-header">
                      <div className="editor-number">{String(index + 1).padStart(2, "0")}</div>
                      {exercise && <ExerciseDemo exercise={exercise} compact />}
                      <div className="editor-exercise-name">
                        <strong>{exercise?.name ?? "Ejercicio eliminado"}</strong>
                        <small>
                          {exercise
                            ? `${MUSCLE_LABELS[exercise.muscle]} · ${EXERCISE_PATTERN_LABELS[exercise.pattern] ?? "Otro"}`
                            : ""}
                        </small>
                      </div>
                      <div className="editor-tools">
                        <button
                          type="button"
                          className="icon-button small"
                          title="Subir"
                          aria-label="Subir ejercicio"
                          onClick={() => moveExercise(index, -1)}
                          disabled={index === 0}
                        >
                          <Icon name="arrowUp" size={16} />
                        </button>
                        <button
                          type="button"
                          className="icon-button small"
                          title="Bajar"
                          aria-label="Bajar ejercicio"
                          onClick={() => moveExercise(index, 1)}
                          disabled={index === day.exercises.length - 1}
                        >
                          <Icon name="arrowDown" size={16} />
                        </button>
                        <button
                          type="button"
                          className="icon-button small"
                          title="Agrupar en superserie"
                          aria-label="Activar o quitar superserie"
                          onClick={() => toggleGrouping(index, "superset")}
                        >
                          <Icon name="swap" size={16} />
                        </button>
                        <button
                          type="button"
                          className="icon-button small"
                          title="Agrupar en circuito"
                          aria-label="Activar o quitar circuito"
                          onClick={() => toggleGrouping(index, "circuito")}
                        >
                          <Icon name="activity" size={16} />
                        </button>
                        <button
                          type="button"
                          className="icon-button small danger-icon"
                          aria-label={`Quitar ${exercise?.name ?? "ejercicio"}`}
                          onClick={() => removeExercise(index)}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </div>
                    {plan.superset && (
                      <span className="superset-tag">
                        {plan.groupType === "circuito" ? "Circuito" : "Superserie"} {plan.superset}
                      </span>
                    )}
                    <div className="plan-fields">
                      <Field
                        label="Series"
                        type="number"
                        min={1}
                        max={12}
                        value={plan.sets}
                        onChange={(value) => updatePlan(index, { sets: Math.min(12, Math.max(1, cleanNumber(value))) })}
                      />
                      <Field
                        label="Reps min"
                        type="number"
                        min={1}
                        max={100}
                        value={plan.repsMin}
                        onChange={(value) => updatePlan(index, { repsMin: Math.max(1, cleanNumber(value)) })}
                      />
                      <Field
                        label="Reps max"
                        type="number"
                        min={1}
                        max={100}
                        value={plan.repsMax}
                        onChange={(value) => updatePlan(index, { repsMax: Math.max(plan.repsMin, cleanNumber(value)) })}
                      />
                      <Field
                        label="Descanso"
                        type="number"
                        min={15}
                        max={600}
                        step={15}
                        value={plan.restSec}
                        suffix="s"
                        onChange={(value) => updatePlan(index, { restSec: Math.max(15, cleanNumber(value)) })}
                      />
                    </div>
                    <Field
                      label="Nota técnica"
                      value={plan.note}
                      onChange={(note) => updatePlan(index, { note })}
                      placeholder="Pista técnica opcional"
                    />
                  </article>
                );
              })}
            </div>
          )}
          <Button variant="secondary" icon="plus" onClick={addExercise}>
            Añadir ejercicio
          </Button>
        </>
      )}
    </div>
  );
}
