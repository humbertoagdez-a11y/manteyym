import { Icon } from "../components/Icon";
import { Button, EmptyState, Field, SelectField } from "../components/ui";
import {
  calculatePlates,
  detectStagnation,
  elapsedSessionMs,
  estimatedOneRepMax,
  makeId,
  MUSCLE_LABELS,
  suggestProgression,
} from "../engine/fitness";
import {
  allTargetSets,
  cleanNumber,
  completedSets,
  cx,
  exerciseName,
  formatClock,
  formatDate,
  formatDuration,
  formatted,
} from "../lib/format";
import type { ActiveSession, Exercise, LoggedSet, Profile, SessionExercise, Settings, TrainingSession } from "../types";
import { useEffect, useRef, useState } from "react";

export function WorkoutSession({
  active,
  profile,
  settings,
  catalog,
  history,
  onChange,
  onFinish,
  onDiscard,
  onPause,
  onOpenExercise,
  onOpenPicker,
  onAdapt,
  onPain,
  onKeypad,
  onToast,
  onRestFinished,
}: {
  active: ActiveSession;
  profile: Profile;
  settings: Settings;
  catalog: Exercise[];
  history: TrainingSession[];
  onChange: (update: (current: ActiveSession) => ActiveSession) => void;
  onFinish: () => void;
  onDiscard: () => void;
  onPause: () => void;
  onOpenExercise: (exercise: Exercise) => void;
  onOpenPicker: (index: number) => void;
  onAdapt: () => void;
  onPain: (context: { exerciseId?: string; setId?: string }) => void;
  onKeypad: (config: {
    title: string;
    value: number;
    unit: string;
    step: number;
    onSave: (value: number) => void;
  }) => void;
  onToast: (message: string) => void;
  onRestFinished: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [showDiscs, setShowDiscs] = useState(false);
  const [barWeight, setBarWeight] = useState(settings.barWeight);
  const [plateTarget, setPlateTarget] = useState(60);
  const notifiedRest = useRef<number | null>(null);
  const pendingCompletions = useRef(new Set<string>());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!active.restEndsAt) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, active.restEndsAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [active.restEndsAt]);
  const elapsed = elapsedSessionMs(active.startedAt, active.elapsedBeforePause, active.segmentStartedAt, now);
  const targetSets = allTargetSets(active.exercises);
  const doneSets = completedSets(active.exercises);
  const progress = targetSets ? Math.min(100, (doneSets / targetSets) * 100) : 0;
  const restSeconds = active.restEndsAt ? Math.max(0, Math.ceil((active.restEndsAt - now) / 1000)) : 0;
  const currentExercise = active.exercises[active.currentExercise];
  const discResult = calculatePlates(plateTarget, barWeight, settings.plates);
  const mutateSet = (exerciseIndex: number, setIndex: number, change: Partial<LoggedSet>) => {
    onChange((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, index) =>
        index === exerciseIndex
          ? {
              ...exercise,
              sets: exercise.sets.map((set, nested) => (nested === setIndex ? { ...set, ...change } : set)),
            }
          : exercise,
      ),
    }));
  };
  const completeSet = (exerciseIndex: number, setIndex: number) => {
    const item = active.exercises[exerciseIndex];
    const set = item.sets[setIndex];
    if (!set || set.completed || set.weight < 0 || set.reps < 0) return;
    if (!set.reps) {
      onToast("Registra al menos una repetición antes de completar la serie.");
      return;
    }
    if (pendingCompletions.current.has(set.id)) return;
    pendingCompletions.current.add(set.id);
    window.setTimeout(() => pendingCompletions.current.delete(set.id), 4000);
    const previous = history.flatMap((session) =>
      session.exercises
        .filter((entry) => entry.exerciseId === item.exerciseId)
        .flatMap((entry) => entry.sets.filter((log) => log.completed && log.type !== "calentamiento")),
    );
    const highestWeight = Math.max(0, ...previous.map((entry) => entry.weight));
    const highestReps = Math.max(0, ...previous.map((entry) => entry.reps));
    const highestE1rm = Math.max(0, ...previous.map((entry) => estimatedOneRepMax(entry.weight, entry.reps)));
    const e1rm = estimatedOneRepMax(set.weight, set.reps);
    const completedAt = Date.now();
    const lastCompletion = Math.max(
      0,
      ...active.exercises.flatMap((entry) => entry.sets.map((log) => (log.completed ? (log.completedAt ?? 0) : 0))),
    );
    const restTakenSec = lastCompletion ? Math.round((completedAt - lastCompletion) / 1000) : undefined;
    const recordParts: string[] = [];
    if (set.type !== "calentamiento" && set.weight > highestWeight) recordParts.push("mejor carga");
    if (set.type !== "calentamiento" && set.reps > highestReps) recordParts.push("más repeticiones");
    if (set.type !== "calentamiento" && e1rm > highestE1rm) recordParts.push("1RM estimado");
    if (recordParts.length) onToast(`Nuevo record personal: ${recordParts.join(" y ")}.`);
    if (settings.vibration && "vibrate" in navigator) navigator.vibrate(18);
    onChange((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, index) =>
        index === exerciseIndex
          ? {
              ...exercise,
              sets: exercise.sets.map((itemSet, nested) =>
                nested === setIndex ? { ...itemSet, completed: true, completedAt, restTakenSec } : itemSet,
              ),
            }
          : exercise,
      ),
      ...(set.type !== "calentamiento"
        ? { restEndsAt: completedAt + item.restSec * 1000, restDurationSec: item.restSec }
        : {}),
    }));
  };
  const updateSessionNote = (notes: string) => onChange((current) => ({ ...current, notes }));
  const scrollToExercise = (index: number) => {
    onChange((current) => ({ ...current, currentExercise: index }));
    document.getElementById(`active-exercise-${index}`)?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  };
  const finishRest = () => {
    if (notifiedRest.current === active.restEndsAt) return;
    notifiedRest.current = active.restEndsAt;
    if (settings.vibration && "vibrate" in navigator) navigator.vibrate([30, 40, 30]);
    if (settings.sound) {
      try {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 880;
        gain.gain.value = 0.035;
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.16);
      } catch {
        /* Audio puede no estar disponible en el navegador. */
      }
    }
    if (settings.notifications && "Notification" in window && Notification.permission === "granted") {
      if (navigator.serviceWorker?.controller)
        void navigator.serviceWorker.ready.then((registration) =>
          registration.showNotification("Descanso terminado", {
            body: "Cuando estés listo, continúa con tu siguiente serie.",
            tag: "manteyym-descanso",
          }),
        );
      else new Notification("Descanso terminado", { body: "Cuando estés listo, continúa con tu siguiente serie." });
    }
    onToast("Descanso terminado.");
    onRestFinished();
  };
  useEffect(() => {
    if (active.restEndsAt && now >= active.restEndsAt) finishRest();
  }, [now, active.restEndsAt]);

  return (
    <div className="workout-screen">
      <div className="workout-topbar">
        <button type="button" className="brand-lockup" onClick={() => onPause()} aria-label="Pausar entrenamiento">
          <span className="brand-mark">
            <Icon name="ejercicios" size={19} />
          </span>
          <strong>ManteYym</strong>
        </button>
        <span className="live-indicator">
          <i /> ENTRENAMIENTO ACTIVO
        </span>
        <button type="button" className="icon-button" aria-label="Terminar sesión" onClick={onFinish}>
          <Icon name="close" />
        </button>
      </div>
      <div className="workout-layout">
        <main className="workout-main">
          <div className="workout-heading">
            <div>
              <p className="eyebrow">{active.status === "paused" ? "SESIÓN EN PAUSA" : "SESIÓN EN CURSO"}</p>
              <h1>{active.dayName}</h1>
              <p>
                Iniciada {formatClock(active.startedAt)} ·{" "}
                {formatDate(active.startedAt, { day: "numeric", month: "short" })}
              </p>
            </div>
            <div className="workout-clock">
              <span>TIEMPO</span>
              <strong>{formatDuration(elapsed)}</strong>
            </div>
          </div>
          <div className="session-progress">
            <div>
              <span>
                {doneSets} de {targetSets} series
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="progress-track">
              <i style={{ width: `${progress}%` }} />
            </div>
          </div>
          {active.status === "paused" && (
            <div className="paused-banner">
              <Icon name="pause" size={18} />
              <span>La sesión está pausada. El cronómetro se reanuda desde donde quedó.</span>
              <Button variant="secondary" onClick={onPause}>
                Reanudar
              </Button>
            </div>
          )}
          <div className="workout-tools">
            <Button variant="quiet" icon="swap" onClick={onAdapt}>
              Adaptar mi sesión
            </Button>
            <Button variant="quiet" icon="weight" onClick={() => setShowDiscs(!showDiscs)}>
              Calculadora de discos
            </Button>
            <Button variant="quiet" icon={active.status === "running" ? "pause" : "play"} onClick={onPause}>
              {active.status === "running" ? "Pausar" : "Reanudar"}
            </Button>
          </div>
          {showDiscs && (
            <section className="plate-panel">
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">CALCULADORA DE BARRA</p>
                  <h3>Discos por lado</h3>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setShowDiscs(false)}
                  aria-label="Cerrar calculadora"
                >
                  <Icon name="close" />
                </button>
              </div>
              <div className="plate-inputs">
                <Field
                  label="Peso objetivo"
                  type="number"
                  step={0.5}
                  value={plateTarget}
                  onChange={(value) => setPlateTarget(Math.max(0, cleanNumber(value)))}
                  suffix={profile.units}
                />
                <Field
                  label="Peso de la barra"
                  type="number"
                  step={0.5}
                  value={barWeight}
                  onChange={(value) => setBarWeight(Math.max(0, cleanNumber(value)))}
                  suffix={profile.units}
                />
              </div>
              <div className="plate-result">
                <span>CADA LADO</span>
                <strong>
                  {discResult.eachSide.length
                    ? discResult.eachSide.map((plate) => formatted(plate)).join(" + ")
                    : "Sin discos"}
                </strong>
                <small>
                  Carga real: {formatted(discResult.actual)} {profile.units}
                  {discResult.remainder > 0 ? ` · faltan ${formatted(discResult.remainder)} ${profile.units}` : ""}
                </small>
              </div>
            </section>
          )}
          <div className="workout-exercises">
            {active.exercises.length ? (
              active.exercises.map((item, exerciseIndex) => {
                const exercise = catalog.find((entry) => entry.id === item.exerciseId);
                const range = [item.repsMin, item.repsMax] as [number, number];
                const suggestion = suggestProgression(
                  history,
                  item.exerciseId,
                  profile.progression,
                  range,
                  profile.units,
                );
                const stalled = detectStagnation(history, item.exerciseId);
                return (
                  <article
                    key={`${item.exerciseId}-${exerciseIndex}`}
                    id={`active-exercise-${exerciseIndex}`}
                    className={cx(
                      "session-exercise",
                      active.currentExercise === exerciseIndex && "session-exercise-current",
                    )}
                  >
                    <div className="session-exercise-head">
                      <div className="exercise-order">{String(exerciseIndex + 1).padStart(2, "0")}</div>
                      <button
                        type="button"
                        className="session-exercise-title"
                        onClick={() => exercise && onOpenExercise(exercise)}
                      >
                        <strong>{exercise?.name ?? "Ejercicio eliminado"}</strong>
                        <small>
                          {exercise
                            ? `${MUSCLE_LABELS[exercise.muscle]} · ${item.sets.length} / ${item.targetSets} series`
                            : ""}
                        </small>
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Cambiar ejercicio"
                        onClick={() => onOpenPicker(exerciseIndex)}
                      >
                        <Icon name="swap" />
                      </button>
                      <button
                        type="button"
                        className="icon-button pain-icon-button"
                        aria-label={`Registrar molestia en ${exercise?.name ?? "este ejercicio"}`}
                        title="Molestia"
                        onClick={() => onPain({ exerciseId: item.exerciseId })}
                      >
                        <Icon name="pain" />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Ver detalles del ejercicio"
                        onClick={() => exercise && onOpenExercise(exercise)}
                      >
                        <Icon name="info" />
                      </button>
                    </div>
                    {item.superset && (
                      <span className="superset-tag">
                        {item.groupType === "circuito" ? "Circuito" : "Superserie"} {item.superset}
                      </span>
                    )}
                    <div className="suggestion-line">
                      <Icon name="target" size={16} />
                      <span>
                        Sugerencia: {suggestion.weight ? `${formatted(suggestion.weight)} ${profile.units} · ` : ""}
                        {suggestion.reps} reps. {suggestion.reason}
                      </span>
                    </div>
                    {stalled && (
                      <div className="stall-notice">
                        <Icon name="info" size={16} />
                        <span>Tres sesiones sin progreso. Prueba un deload, otra variante o más descanso.</span>
                      </div>
                    )}
                    {item.note && <p className="exercise-note">{item.note}</p>}
                    <div className="set-table-head">
                      <span>SERIE</span>
                      <span>CARGA</span>
                      <span>REPS</span>
                      <span>TIPO</span>
                      <span>LISTO</span>
                    </div>
                    {item.sets.map((set, setIndex) => (
                      <div key={set.id} className={cx("set-row", set.completed && "set-row-complete")}>
                        <span className="set-number">{String(setIndex + 1).padStart(2, "0")}</span>
                        <button
                          type="button"
                          className="number-control"
                          onClick={() =>
                            onKeypad({
                              title: "Carga de la serie",
                              value: set.weight,
                              unit: profile.units,
                              step: profile.units === "kg" ? 2.5 : 5,
                              onSave: (weight) => mutateSet(exerciseIndex, setIndex, { weight }),
                            })
                          }
                        >
                          <strong>{formatted(set.weight)}</strong>
                          <small>{profile.units}</small>
                        </button>
                        <button
                          type="button"
                          className="number-control"
                          onClick={() =>
                            onKeypad({
                              title: "Repeticiones",
                              value: set.reps,
                              unit: "reps",
                              step: 1,
                              onSave: (reps) =>
                                mutateSet(exerciseIndex, setIndex, { reps: Math.max(0, Math.round(reps)) }),
                            })
                          }
                        >
                          <strong>{set.reps}</strong>
                          <small>reps</small>
                        </button>
                        <select
                          className="set-type-select"
                          aria-label="Tipo de serie"
                          value={set.type}
                          onChange={(event) =>
                            mutateSet(exerciseIndex, setIndex, { type: event.target.value as LoggedSet["type"] })
                          }
                        >
                          <option value="normal">Normal</option>
                          <option value="calentamiento">Aproximación</option>
                          <option value="fallo">Al fallo</option>
                          <option value="descendente">Drop set</option>
                        </select>
                        <button
                          type="button"
                          className={cx("set-check", set.completed && "set-check-complete")}
                          aria-label={set.completed ? "Serie completada" : "Completar serie"}
                          disabled={set.completed}
                          onClick={() => completeSet(exerciseIndex, setIndex)}
                        >
                          <Icon name="check" size={18} />
                        </button>
                        {setIndex > 0 &&
                          !set.completed &&
                          (set.weight !== item.sets[setIndex - 1].weight ||
                            set.reps !== item.sets[setIndex - 1].reps) && (
                            <button
                              type="button"
                              className="repeat-previous"
                              onClick={() =>
                                mutateSet(exerciseIndex, setIndex, {
                                  weight: item.sets[setIndex - 1].weight,
                                  reps: item.sets[setIndex - 1].reps,
                                })
                              }
                            >
                              <Icon name="copy" size={15} /> Igual que la anterior (
                              {formatted(item.sets[setIndex - 1].weight)} {profile.units} ×{" "}
                              {item.sets[setIndex - 1].reps})
                            </button>
                          )}
                        <details className="set-extra">
                          <summary>
                            RIR, RPE, lado y nota
                            {set.restTakenSec
                              ? ` · descanso ${Math.round(set.restTakenSec / 60)}:${String(set.restTakenSec % 60).padStart(2, "0")}`
                              : ""}
                          </summary>
                          <div className="set-extra-fields">
                            <SelectField
                              label="RIR"
                              value={String(set.rir ?? "")}
                              onChange={(value) =>
                                mutateSet(exerciseIndex, setIndex, { rir: value === "" ? null : Number(value) })
                              }
                              options={[
                                { value: "", label: "Sin dato" },
                                ...[0, 1, 2, 3, 4, 5].map((value) => ({
                                  value: String(value),
                                  label: `${value} en reserva`,
                                })),
                              ]}
                            />
                            <SelectField
                              label="RPE"
                              value={String(set.rpe ?? "")}
                              onChange={(value) =>
                                mutateSet(exerciseIndex, setIndex, { rpe: value === "" ? null : Number(value) })
                              }
                              options={[
                                { value: "", label: "Sin dato" },
                                ...[6, 7, 8, 9, 10].map((value) => ({ value: String(value), label: String(value) })),
                              ]}
                            />
                            <Field
                              label="Nota de serie"
                              value={set.note}
                              onChange={(note) => mutateSet(exerciseIndex, setIndex, { note })}
                              placeholder="Nota opcional"
                            />
                            <SelectField
                              label="Lado"
                              value={set.side ?? ""}
                              onChange={(value) =>
                                mutateSet(exerciseIndex, setIndex, { side: (value || undefined) as LoggedSet["side"] })
                              }
                              options={[
                                { value: "", label: "No aplica" },
                                { value: "izq", label: "Izquierdo" },
                                { value: "der", label: "Derecho" },
                                { value: "ambos", label: "Ambos" },
                              ]}
                            />
                            <Field
                              label="Lastre (+) o asistencia (−)"
                              type="number"
                              step={0.5}
                              value={set.extraLoad ?? ""}
                              onChange={(value) =>
                                mutateSet(exerciseIndex, setIndex, {
                                  extraLoad: value === "" ? undefined : cleanNumber(value),
                                })
                              }
                              suffix={profile.units}
                            />
                            <Field
                              label="Variante (agarre, equipo)"
                              value={set.variant ?? ""}
                              onChange={(variant) =>
                                mutateSet(exerciseIndex, setIndex, { variant: variant || undefined })
                              }
                              placeholder="Ej.: agarre neutro"
                            />
                            <Button
                              variant="quiet"
                              icon="pain"
                              onClick={() => onPain({ exerciseId: item.exerciseId, setId: set.id })}
                            >
                              Molestia en esta serie
                            </Button>
                          </div>
                        </details>
                      </div>
                    ))}
                    <Button
                      variant="quiet"
                      icon="plus"
                      onClick={() =>
                        onChange((current) => ({
                          ...current,
                          exercises: current.exercises.map((entry, index) =>
                            index === exerciseIndex
                              ? {
                                  ...entry,
                                  targetSets: entry.targetSets + 1,
                                  sets: [
                                    ...entry.sets,
                                    {
                                      id: makeId("set"),
                                      weight: entry.sets.at(-1)?.weight ?? 0,
                                      reps: entry.sets.at(-1)?.reps ?? entry.repsMin,
                                      type: "normal",
                                      rir: null,
                                      rpe: null,
                                      note: "",
                                      completed: false,
                                    },
                                  ],
                                }
                              : entry,
                          ),
                        }))
                      }
                    >
                      Añadir serie
                    </Button>
                    <SelectField
                      label="Estado del ejercicio"
                      value={
                        item.status === "omitido" ? `omitido:${item.statusReason ?? "otro"}` : (item.status ?? "hecho")
                      }
                      onChange={(value) =>
                        onChange((current) => ({
                          ...current,
                          exercises: current.exercises.map((entry, index) => {
                            if (index !== exerciseIndex) return entry;
                            if (value.startsWith("omitido:"))
                              return {
                                ...entry,
                                status: "omitido",
                                statusReason: value.slice(8) as SessionExercise["statusReason"],
                              };
                            return entry.replacedExerciseId
                              ? { ...entry, status: "sustituido" }
                              : { ...entry, status: undefined, statusReason: undefined };
                          }),
                        }))
                      }
                      options={[
                        {
                          value: item.replacedExerciseId ? "sustituido" : "hecho",
                          label: item.replacedExerciseId ? "Sustituido" : "Hacer / hecho",
                        },
                        { value: "omitido:dolor", label: "Omitir: dolor o molestia" },
                        { value: "omitido:equipo_ocupado", label: "Omitir: equipo ocupado" },
                        { value: "omitido:tiempo", label: "Omitir: falta de tiempo" },
                        { value: "omitido:otro", label: "Omitir: otro motivo" },
                      ]}
                    />
                  </article>
                );
              })
            ) : (
              <EmptyState
                title="La sesión está vacía"
                description="Puedes adaptar la sesión o volver a la rutina para añadir ejercicios."
              />
            )}
          </div>
          <div className="session-notes">
            <Field
              label="Notas de la sesión"
              value={active.notes}
              onChange={updateSessionNote}
              multiline
              placeholder="Cómo te sentiste, técnica o cualquier observación"
            />
          </div>
          <div className="session-bottom-actions">
            <Button variant="quiet" onClick={onDiscard}>
              Descartar sesión
            </Button>
            <Button variant="primary" icon="check" onClick={onFinish}>
              Finalizar entrenamiento
            </Button>
          </div>
        </main>
        <aside className="workout-rail">
          <div className="rail-clock">
            <span>TIEMPO TRANSCURRIDO</span>
            <strong>{formatDuration(elapsed)}</strong>
            <small>
              Inicio {formatClock(active.startedAt)} · {active.timeZone}
            </small>
          </div>
          <div className="rail-progress">
            <div className="rail-progress-copy">
              <span>PROGRESO</span>
              <strong>
                {doneSets}
                <small> / {targetSets}</small>
              </strong>
            </div>
            <div className="progress-track">
              <i style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div className="rail-exercise-list">
            <span className="eyebrow">EJERCICIOS</span>
            {active.exercises.map((item, index) => (
              <button
                type="button"
                key={`${item.exerciseId}-rail`}
                onClick={() => scrollToExercise(index)}
                className={cx(active.currentExercise === index && "rail-exercise-active")}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{exerciseName(catalog, item.exerciseId)}</strong>
                <small>
                  {item.sets.filter((set) => set.completed).length}/{item.targetSets}
                </small>
              </button>
            ))}
          </div>
        </aside>
      </div>
      {active.restEndsAt && (
        <div className="rest-bar" aria-live="polite">
          <div
            className="rest-ring"
            style={{
              background: `conic-gradient(var(--accent) ${Math.max(0, 1 - restSeconds / Math.max(1, active.restDurationSec)) * 360}deg, var(--surface-3) 0deg)`,
            }}
          >
            <span>{formatDuration(restSeconds * 1000).slice(3)}</span>
          </div>
          <div>
            <span className="eyebrow">
              DESCANSO · {currentExercise ? exerciseName(catalog, currentExercise.exerciseId) : "SERIE"}
            </span>
            <strong>{restSeconds ? `Quedan ${restSeconds} s` : "Listo para continuar"}</strong>
          </div>
          <button
            type="button"
            className="rest-skip"
            onClick={() => onChange((current) => ({ ...current, restEndsAt: null }))}
          >
            Omitir descanso
          </button>
        </div>
      )}
    </div>
  );
}
