import { Icon } from "../components/Icon";
import { EmptyState, SelectField } from "../components/ui";
import { normalizeText } from "../engine/fitness";
import { cx, exerciseName, formatClock, formatDate, formatDuration, formatted } from "../lib/format";
import { dayKey } from "../lib/pain";
import type { Exercise, Routine, TrainingSession } from "../types";
import { useMemo, useState } from "react";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

export function HistoryScreen({
  sessions,
  routines,
  catalog,
  units,
  onBack,
  onEdit,
}: {
  sessions: TrainingSession[];
  routines: Routine[];
  catalog: Exercise[];
  units: string;
  onBack: () => void;
  onEdit: (session: TrainingSession) => void;
}) {
  const [query, setQuery] = useState("");
  const [routineId, setRoutineId] = useState("");
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [day, setDay] = useState("");

  const filtered = useMemo(() => {
    const search = normalizeText(query);
    return sessions.filter((session) => {
      if (routineId && session.routineId !== routineId) return false;
      if (day && dayKey(session.startedAt) !== day) return false;
      if (!search) return true;
      const text = [
        session.dayName,
        session.notes,
        session.place ?? "",
        ...session.exercises.map((item) => exerciseName(catalog, item.exerciseId)),
      ].join(" ");
      return normalizeText(text).includes(search);
    });
  }, [sessions, routineId, day, query, catalog]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const session of sessions) map.set(dayKey(session.startedAt), (map.get(dayKey(session.startedAt)) ?? 0) + 1);
    return map;
  }, [sessions]);

  const firstWeekday = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  const shiftMonth = (delta: number) => {
    setMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1));
    setDay("");
  };
  const monthSessions = sessions.filter(
    (session) =>
      new Date(session.startedAt).getMonth() === month.getMonth() &&
      new Date(session.startedAt).getFullYear() === month.getFullYear(),
  ).length;

  return (
    <div className="screen history-screen">
      <div className="subscreen-head">
        <button type="button" className="icon-button" onClick={onBack} aria-label="Volver">
          <Icon name="back" />
        </button>
        <div>
          <p className="eyebrow">HISTORIAL COMPLETO</p>
          <h1>{sessions.length} sesiones registradas</h1>
        </div>
      </div>

      <section className="tracking-panel">
        <div className="calendar-head">
          <button type="button" className="icon-button" onClick={() => shiftMonth(-1)} aria-label="Mes anterior">
            <Icon name="back" />
          </button>
          <strong>
            {formatDate(month.getTime(), { month: "long", year: "numeric" })} · {monthSessions} sesiones
          </strong>
          <button type="button" className="icon-button" onClick={() => shiftMonth(1)} aria-label="Mes siguiente">
            <Icon name="next" />
          </button>
        </div>
        <div className="history-calendar" role="grid" aria-label="Calendario de sesiones">
          {WEEKDAYS.map((weekday, index) => (
            <span key={`${weekday}-${index}`} className="calendar-weekday" aria-hidden="true">
              {weekday}
            </span>
          ))}
          {cells.map((value, index) => {
            if (!value) return <span key={`empty-${index}`} />;
            const key = dayKey(new Date(month.getFullYear(), month.getMonth(), value).getTime());
            const count = counts.get(key) ?? 0;
            return (
              <button
                key={key}
                type="button"
                className={cx(
                  "calendar-day",
                  count > 0 && "calendar-day-trained",
                  day === key && "calendar-day-selected",
                )}
                aria-pressed={day === key}
                aria-label={`${value}: ${count} sesiones`}
                disabled={!count}
                onClick={() => setDay(day === key ? "" : key)}
              >
                {value}
              </button>
            );
          })}
        </div>
      </section>

      <div className="history-filters">
        <label className="field">
          <span>Buscar</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Ejercicio, nota o lugar"
            aria-label="Buscar en el historial"
          />
        </label>
        <SelectField
          label="Rutina"
          value={routineId}
          onChange={setRoutineId}
          options={[
            { value: "", label: "Todas" },
            ...routines.map((routine) => ({ value: routine.id, label: routine.name })),
          ]}
        />
      </div>
      {day && (
        <button type="button" className="text-action" onClick={() => setDay("")}>
          Mostrando {formatDate(new Date(`${day}T12:00:00`).getTime(), { day: "numeric", month: "long" })} · ver todas
        </button>
      )}

      <div className="history-list">
        {filtered.length === 0 ? (
          <EmptyState title="Sin sesiones" description="No hay sesiones que coincidan con el filtro." />
        ) : (
          filtered.map((session) => {
            const sets = session.exercises.reduce(
              (sum, item) => sum + item.sets.filter((set) => set.completed).length,
              0,
            );
            return (
              <button type="button" className="history-card" key={session.id} onClick={() => onEdit(session)}>
                <div className="history-date">
                  <strong>{formatDate(session.startedAt, { day: "numeric" })}</strong>
                  <small>{formatDate(session.startedAt, { month: "short" })}</small>
                </div>
                <div className="history-card-body">
                  <strong>{session.dayName}</strong>
                  <small>
                    {formatClock(session.startedAt)} · {formatDuration(session.durationMs)} · {sets} series ·{" "}
                    {formatted(session.volume, 0)} {units}
                    {session.sessionRpe ? ` · RPE ${session.sessionRpe}` : ""}
                  </small>
                  <small className="history-exercises">
                    {session.exercises.map((item) => exerciseName(catalog, item.exerciseId)).join(" · ")}
                  </small>
                  {(session.revision ?? 1) > 1 && <small className="muted-copy">Editada</small>}
                </div>
                <Icon name="edit" size={18} />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
