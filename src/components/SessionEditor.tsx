import { makeId } from "../engine/fitness";
import { cleanNumber, exerciseName, formatted } from "../lib/format";
import { normalizeEditedSession } from "../lib/records";
import type { Exercise, LoggedSet, SessionExercise, TrainingSession } from "../types";
import { Icon } from "./Icon";
import { Button, DialogFrame, Field, SelectField } from "./ui";
import { useState } from "react";

const pad = (value: number) => String(value).padStart(2, "0");
const toLocalInput = (at: number) => {
  const date = new Date(at);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const SET_TYPES: { value: LoggedSet["type"]; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "calentamiento", label: "Aproximación" },
  { value: "fallo", label: "Al fallo" },
  { value: "descendente", label: "Drop set" },
];

export const STATUS_REASONS = [
  { value: "dolor", label: "Dolor o molestia" },
  { value: "equipo_ocupado", label: "Equipo ocupado" },
  { value: "tiempo", label: "Falta de tiempo" },
  { value: "otro", label: "Otro" },
] as const;

/** Edición completa de una sesión terminada. El volumen y los PR se recalculan desde lo guardado. */
export function SessionEditor({
  session,
  catalog,
  units,
  onSave,
  onDelete,
  onClose,
}: {
  session: TrainingSession;
  catalog: Exercise[];
  units: string;
  onSave: (session: TrainingSession) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<TrainingSession>(() => structuredClone(session));
  const [start, setStart] = useState(toLocalInput(session.startedAt));
  const [minutes, setMinutes] = useState(String(Math.round(session.durationMs / 60000)));
  const [error, setError] = useState("");

  const patchExercise = (index: number, change: Partial<SessionExercise>) =>
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.map((item, itemIndex) => (itemIndex === index ? { ...item, ...change } : item)),
    }));
  const patchSet = (index: number, setIndex: number, change: Partial<LoggedSet>) =>
    patchExercise(index, {
      sets: draft.exercises[index].sets.map((set, nested) => (nested === setIndex ? { ...set, ...change } : set)),
    });

  const initialStart = toLocalInput(session.startedAt);
  const initialMinutes = String(Math.round(session.durationMs / 60000));
  const save = () => {
    // Si un campo no se tocó se conserva el valor original exacto (el formulario redondea a minutos).
    const startedAt = start === initialStart ? session.startedAt : new Date(start).getTime();
    const durationMs = minutes === initialMinutes ? session.durationMs : cleanNumber(minutes) * 60000;
    if (!Number.isFinite(startedAt)) return setError("La fecha de inicio no es válida.");
    if (!(durationMs >= 0) || durationMs > 24 * 3_600_000)
      return setError("La duración debe estar entre 0 y 24 horas.");
    if (startedAt > Date.now()) return setError("La sesión no puede empezar en el futuro.");
    onSave(normalizeEditedSession({ ...draft, startedAt, endedAt: startedAt + durationMs }));
  };

  return (
    <DialogFrame title="Editar sesión" onClose={onClose} wide>
      <div className="form-stack session-editor">
        <div className="editor-grid">
          <Field label="Nombre" value={draft.dayName} onChange={(dayName) => setDraft({ ...draft, dayName })} />
          <label className="field">
            <span>Inicio</span>
            <input type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} />
          </label>
          <Field
            label="Duración"
            type="number"
            value={minutes}
            onChange={setMinutes}
            suffix="min"
            inputMode="numeric"
          />
          <Field
            label="Lugar"
            value={draft.place ?? ""}
            onChange={(place) => setDraft({ ...draft, place: place || undefined })}
            placeholder="Gimnasio, casa…"
          />
          <SelectField
            label="Esfuerzo de la sesión (RPE)"
            value={String(draft.sessionRpe ?? "")}
            onChange={(value) => setDraft({ ...draft, sessionRpe: value ? Number(value) : undefined })}
            options={[
              { value: "", label: "Sin dato" },
              ...Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
            ]}
          />
          <Field
            label="Peso corporal del día"
            type="number"
            step={0.1}
            value={draft.bodyWeight ?? ""}
            onChange={(value) => setDraft({ ...draft, bodyWeight: value ? cleanNumber(value) : undefined })}
            suffix={units}
          />
        </div>

        {draft.exercises.map((item, index) => (
          <section className="editor-exercise" key={`${item.exerciseId}-${index}`}>
            <header>
              <strong>
                {String(index + 1).padStart(2, "0")} · {exerciseName(catalog, item.exerciseId)}
              </strong>
              {item.replacedExerciseId && <small>Sustituyó a {exerciseName(catalog, item.replacedExerciseId)}</small>}
            </header>
            <div className="editor-grid">
              <SelectField
                label="Estado"
                value={item.status ?? "hecho"}
                onChange={(value) =>
                  patchExercise(index, {
                    status: value === "hecho" ? undefined : (value as SessionExercise["status"]),
                    statusReason: value === "hecho" ? undefined : (item.statusReason ?? "otro"),
                  })
                }
                options={[
                  { value: "hecho", label: "Hecho" },
                  { value: "omitido", label: "Omitido" },
                  { value: "sustituido", label: "Sustituido" },
                ]}
              />
              {item.status && (
                <SelectField
                  label="Motivo"
                  value={item.statusReason ?? "otro"}
                  onChange={(value) => patchExercise(index, { statusReason: value as SessionExercise["statusReason"] })}
                  options={[...STATUS_REASONS]}
                />
              )}
            </div>
            <div className="editor-sets">
              {item.sets.map((set, setIndex) => (
                <div className="editor-set" key={set.id}>
                  <span className="set-number">{String(setIndex + 1).padStart(2, "0")}</span>
                  <Field
                    label="Carga"
                    type="number"
                    step={0.5}
                    value={set.weight}
                    onChange={(value) => patchSet(index, setIndex, { weight: Math.max(0, cleanNumber(value)) })}
                    suffix={units}
                    inputMode="decimal"
                  />
                  <Field
                    label="Reps"
                    type="number"
                    value={set.reps}
                    onChange={(value) =>
                      patchSet(index, setIndex, { reps: Math.max(0, Math.round(cleanNumber(value))) })
                    }
                    inputMode="numeric"
                  />
                  <SelectField
                    label="Tipo"
                    value={set.type}
                    onChange={(value) => patchSet(index, setIndex, { type: value as LoggedSet["type"] })}
                    options={SET_TYPES}
                  />
                  <SelectField
                    label="RIR"
                    value={String(set.rir ?? "")}
                    onChange={(value) => patchSet(index, setIndex, { rir: value === "" ? null : Number(value) })}
                    options={[
                      { value: "", label: "—" },
                      ...[0, 1, 2, 3, 4, 5].map((v) => ({ value: String(v), label: String(v) })),
                    ]}
                  />
                  <label className="editor-check">
                    <input
                      type="checkbox"
                      checked={set.completed}
                      onChange={(event) => patchSet(index, setIndex, { completed: event.target.checked })}
                    />
                    Hecha
                  </label>
                  <button
                    type="button"
                    className="icon-button danger-icon"
                    aria-label={`Quitar serie ${setIndex + 1}`}
                    onClick={() => patchExercise(index, { sets: item.sets.filter((_, nested) => nested !== setIndex) })}
                  >
                    <Icon name="trash" size={17} />
                  </button>
                  <Field
                    label="Nota"
                    value={set.note}
                    onChange={(note) => patchSet(index, setIndex, { note })}
                    placeholder="Opcional"
                  />
                </div>
              ))}
            </div>
            <Button
              variant="quiet"
              icon="plus"
              onClick={() => {
                const last = item.sets.at(-1);
                patchExercise(index, {
                  sets: [
                    ...item.sets,
                    {
                      id: makeId("set"),
                      weight: last?.weight ?? 0,
                      reps: last?.reps ?? item.repsMin,
                      type: "normal",
                      rir: null,
                      rpe: null,
                      note: "",
                      completed: true,
                    },
                  ],
                });
              }}
            >
              Agregar serie olvidada
            </Button>
          </section>
        ))}

        <Field
          label="Notas de la sesión"
          value={draft.notes}
          onChange={(notes) => setDraft({ ...draft, notes })}
          multiline
        />
        <p className="muted-copy">
          Volumen recalculado: {formatted(normalizeEditedSession(draft).volume, 0)} {units}. Cada cambio queda en la
          bitácora con el antes y el después.
        </p>
        {error && (
          <p className="error-copy" role="alert">
            {error}
          </p>
        )}
        <div className="sheet-actions">
          <Button variant="danger" icon="trash" onClick={onDelete}>
            Eliminar sesión
          </Button>
          <Button variant="quiet" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save}>
            Guardar cambios
          </Button>
        </div>
      </div>
    </DialogFrame>
  );
}
