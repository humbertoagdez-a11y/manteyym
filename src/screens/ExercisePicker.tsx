import { labelList } from "../i18n/es";
import { Icon } from "../components/Icon";
import { DialogFrame } from "../components/ui";
import { EXERCISE_PATTERN_LABELS } from "../constants";
import { MUSCLE_LABELS, normalizeText } from "../engine/fitness";
import type { Exercise } from "../types";
import { useState } from "react";

export function ExercisePicker({
  title,
  catalog,
  onChoose,
  onClose,
  preferred,
}: {
  title: string;
  catalog: Exercise[];
  onChoose: (exercise: Exercise) => void;
  onClose: () => void;
  preferred?: Exercise;
}) {
  const [query, setQuery] = useState("");
  const alternatives = preferred
    ? catalog.filter(
        (exercise) =>
          exercise.id !== preferred.id &&
          exercise.pattern === preferred.pattern &&
          (exercise.muscle === preferred.muscle || exercise.secondary.includes(preferred.muscle)),
      )
    : catalog;
  const source = preferred && alternatives.length ? alternatives : catalog;
  const results = source
    .filter((exercise) =>
      normalizeText(
        `${exercise.name} ${MUSCLE_LABELS[exercise.muscle] ?? exercise.muscle} ${exercise.equipment.join(" ")}`,
      ).includes(normalizeText(query)),
    )
    .slice(0, 80);
  return (
    <DialogFrame title={title} onClose={onClose}>
      <div className="picker-content">
        <label className="search-field">
          <Icon name="search" size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar ejercicio"
            aria-label="Buscar ejercicio para la rutina"
          />
        </label>
        {preferred && (
          <p className="muted-copy">
            Alternativas del mismo patrón y grupo muscular: {EXERCISE_PATTERN_LABELS[preferred.pattern] ?? "movimiento"}
            .
          </p>
        )}
        <div className="picker-list">
          {results.map((exercise) => (
            <button type="button" className="picker-row" key={exercise.id} onClick={() => onChoose(exercise)}>
              <span>
                <strong>{exercise.name}</strong>
                <small>
                  {MUSCLE_LABELS[exercise.muscle] ?? exercise.muscle} · {labelList(exercise.equipment)}
                </small>
              </span>
              <Icon name="plus" size={17} />
            </button>
          ))}
          {!results.length && <p className="muted-copy">No hay coincidencias en la biblioteca guardada.</p>}
        </div>
      </div>
    </DialogFrame>
  );
}
