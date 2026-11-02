import { exerciseRecords } from "../lib/records";
import { label } from "../i18n/es";
import { ExerciseVisual } from "../components/ExerciseVisual";
import { Icon } from "../components/Icon";
import { DialogFrame } from "../components/ui";
import { EXERCISE_PATTERN_LABELS } from "../constants";
import { estimatedOneRepMax, getExerciseHistory, MUSCLE_LABELS } from "../engine/fitness";
import { formatDate, formatted } from "../lib/format";
import type { Exercise, TrainingSession } from "../types";

export function ExerciseDetail({
  exercise,
  catalog,
  sessions,
  units,
  onClose,
}: {
  exercise: Exercise;
  catalog: Exercise[];
  sessions: TrainingSession[];
  units: "kg" | "lb";
  onClose: () => void;
}) {
  const history = getExerciseHistory(sessions, exercise.id);
  const records = exerciseRecords(sessions, exercise.id);
  const completed = history.flatMap((entry) =>
    entry.item.sets.filter((set) => set.completed && set.type !== "calentamiento"),
  );
  const bestWeight = Math.max(0, ...completed.map((set) => set.weight));
  const bestEstimated = Math.max(0, ...completed.map((set) => estimatedOneRepMax(set.weight, set.reps)));
  const alternatives = catalog
    .filter(
      (item) =>
        item.id !== exercise.id &&
        item.pattern === exercise.pattern &&
        (item.muscle === exercise.muscle || item.secondary.includes(exercise.muscle)),
    )
    .slice(0, 4);
  return (
    <DialogFrame title={exercise.name} onClose={onClose} wide>
      <div className="exercise-detail">
        <ExerciseVisual exercise={exercise} />
        <div className="exercise-detail-content">
          <div className="exercise-tags">
            <span>{MUSCLE_LABELS[exercise.muscle] ?? exercise.muscle}</span>
            <span>{EXERCISE_PATTERN_LABELS[exercise.pattern] ?? "Otro"}</span>
            <span>
              {exercise.source === "free-exercise-db"
                ? "Free Exercise DB"
                : exercise.source === "personal"
                  ? "Personalizado"
                  : "Catálogo local"}
            </span>
          </div>
          {exercise.originalName && (
            <p className="notice-copy">
              <Icon name="info" size={16} /> Nombre original en inglés: no hay traducción confirmada.
            </p>
          )}
          {exercise.originalMuscle && (
            <p className="muted-copy">Grupo muscular original sin traducción confirmada: {exercise.originalMuscle}.</p>
          )}
          <div className="detail-metrics">
            <div>
              <span>MEJOR CARGA</span>
              <strong>{bestWeight ? `${formatted(bestWeight)} ${units}` : "Sin datos"}</strong>
            </div>
            <div>
              <span>1RM ESTIMADO</span>
              <strong>{bestEstimated ? `${formatted(bestEstimated)} ${units}` : "Sin datos"}</strong>
            </div>
            <div>
              <span>SESIONES</span>
              <strong>{history.length}</strong>
            </div>
          </div>
          {records.byRepRange.length > 0 && (
            <div className="records-table" aria-label="Mejores marcas por rango de repeticiones">
              <span className="eyebrow">MEJOR CARGA POR RANGO DE REPETICIONES</span>
              {records.byRepRange.map((item) => (
                <div key={item.range}>
                  <span>{item.range} reps</span>
                  <strong>
                    {formatted(item.weight)} {units} × {item.reps}
                  </strong>
                  <small>{formatDate(item.at, { day: "numeric", month: "short", year: "2-digit" })}</small>
                </div>
              ))}
              {records.bestSessionVolume && (
                <div>
                  <span>Volumen en una sesión</span>
                  <strong>
                    {formatted(records.bestSessionVolume.value, 0)} {units}
                  </strong>
                  <small>
                    {formatDate(records.bestSessionVolume.at, { day: "numeric", month: "short", year: "2-digit" })}
                  </small>
                </div>
              )}
            </div>
          )}
          {bestEstimated > 0 && (
            <p className="muted-copy">
              El 1RM estimado usa la fórmula de Epley. Es una aproximación, no una prueba de fuerza máxima.
            </p>
          )}
          <div className="detail-section">
            <h3>Equipo</h3>
            <p>{exercise.equipment.map(label).join(" · ")}</p>
          </div>
          <div className="detail-section">
            <h3>Músculos secundarios</h3>
            <p>
              {exercise.secondary.length
                ? exercise.secondary.map((muscle) => MUSCLE_LABELS[muscle] ?? muscle).join(" · ")
                : "No especificados"}
            </p>
          </div>
          <div className="detail-section">
            <h3>Pasos</h3>
            {exercise.instructionsOriginal && (
              <p className="muted-copy">Instrucciones originales del catálogo en inglés, sin traducir.</p>
            )}
            <ol className="instruction-list">
              {exercise.steps.map((step, index) => (
                <li key={`${index}-${step}`}>{step}</li>
              ))}
            </ol>
          </div>
          <div className="detail-section">
            <h3>Errores frecuentes</h3>
            <ul className="mistake-list">
              {exercise.mistakes.map((mistake) => (
                <li key={mistake}>{mistake}</li>
              ))}
            </ul>
          </div>
          <div className="detail-section">
            <h3>Alternativas del mismo patrón</h3>
            {alternatives.length ? (
              alternatives.map((item) => (
                <div className="alternative-row" key={item.id}>
                  <span>{item.name}</span>
                  <small>{MUSCLE_LABELS[item.muscle] ?? item.muscle}</small>
                </div>
              ))
            ) : (
              <p>No hay alternativas compatibles en esta selección.</p>
            )}
          </div>
          <div className="detail-section">
            <h3>Últimas sesiones</h3>
            {history.slice(0, 4).map(({ session, item }) => (
              <div key={session.id} className="history-row">
                <span>{formatDate(session.endedAt, { day: "numeric", month: "short", year: "numeric" })}</span>
                <span>{item.sets.filter((set) => set.completed).length} series</span>
                <strong>
                  {Math.max(0, ...item.sets.filter((set) => set.completed).map((set) => set.weight))} {units}
                </strong>
              </div>
            ))}
            {!history.length && <p>Aún no hay registros. Tus series aparecerán aquí.</p>}
          </div>
        </div>
      </div>
    </DialogFrame>
  );
}
