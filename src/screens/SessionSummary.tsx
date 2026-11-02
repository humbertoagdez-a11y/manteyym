import { Icon } from "../components/Icon";
import { Button, DialogFrame } from "../components/ui";
import { estimatedOneRepMax, MUSCLE_LABELS, MUSCLES, volumeByMuscle } from "../engine/fitness";
import { exerciseName, formatClock, formatDate, formatDuration, formatted } from "../lib/format";
import type { Exercise, Profile, TrainingSession } from "../types";

export function SessionSummary({
  session,
  previous,
  profile,
  exercises,
  onClose,
  onProgress,
}: {
  session: TrainingSession;
  previous?: TrainingSession;
  profile: Profile;
  exercises: Exercise[];
  onClose: () => void;
  onProgress: () => void;
}) {
  const completed = session.exercises.reduce((sum, item) => sum + item.sets.filter((set) => set.completed).length, 0);
  const records = session.exercises
    .map((item) => {
      const completedSets = item.sets.filter((set) => set.completed && set.type !== "calentamiento");
      const before =
        previous?.exercises
          .find((entry) => entry.exerciseId === item.exerciseId)
          ?.sets.filter((set) => set.completed) ?? [];
      const best = Math.max(0, ...completedSets.map((set) => estimatedOneRepMax(set.weight, set.reps)));
      const old = Math.max(0, ...before.map((set) => estimatedOneRepMax(set.weight, set.reps)));
      return best > old ? exerciseName(exercises, item.exerciseId) : "";
    })
    .filter(Boolean);
  const effectiveVolume = volumeByMuscle([session], exercises);
  return (
    <DialogFrame title="Sesión guardada" onClose={onClose} wide>
      <div className="summary-screen">
        <div className="summary-greeting">
          <span className="summary-check">
            <Icon name="check" size={24} />
          </span>
          <p className="eyebrow">ENTRENAMIENTO COMPLETADO</p>
          <h2>{session.dayName}</h2>
          <p>
            {formatDate(session.endedAt, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} ·{" "}
            {formatClock(session.startedAt)} a {formatClock(session.endedAt)}
          </p>
        </div>
        <div className="summary-metrics">
          <div>
            <span>DURACIÓN</span>
            <strong>{formatDuration(session.durationMs)}</strong>
          </div>
          <div>
            <span>VOLUMEN REGISTRADO</span>
            <strong>
              {formatted(session.volume, 0)} {profile.units}
            </strong>
          </div>
          <div>
            <span>SERIES COMPLETADAS</span>
            <strong>{completed}</strong>
          </div>
          <div>
            <span>RECORDS ESTIMADOS</span>
            <strong>{records.length}</strong>
          </div>
        </div>
        {records.length > 0 && (
          <div className="summary-records">
            <Icon name="trophy" size={18} />
            <div>
              <strong>Nueva mejor marca estimada</strong>
              <span>{records.join(" · ")}. 1RM estimado mediante Epley, no una medición máxima.</span>
            </div>
          </div>
        )}
        {previous && (
          <p className="notice-copy">
            <Icon name="activity" size={17} /> Comparada con tu sesión anterior de {previous.dayName}, registraste{" "}
            {completed -
              previous.exercises.reduce((sum, item) => sum + item.sets.filter((set) => set.completed).length, 0)}{" "}
            series completadas de diferencia.
          </p>
        )}
        <div className="summary-muscle-list">
          <span className="eyebrow">SERIES EFECTIVAS POR GRUPO</span>
          {MUSCLES.filter((muscle) => effectiveVolume[muscle] > 0).map((muscle) => (
            <div key={muscle}>
              <span>{MUSCLE_LABELS[muscle]}</span>
              <strong>{formatted(effectiveVolume[muscle], 1)}</strong>
            </div>
          ))}
        </div>
        {session.notes && (
          <div className="summary-note">
            <span className="eyebrow">NOTAS</span>
            <p>{session.notes}</p>
          </div>
        )}
        <div className="sheet-actions">
          <Button variant="quiet" onClick={onClose}>
            Cerrar
          </Button>
          <Button variant="primary" icon="progreso" onClick={onProgress}>
            Ver progreso
          </Button>
        </div>
      </div>
    </DialogFrame>
  );
}
