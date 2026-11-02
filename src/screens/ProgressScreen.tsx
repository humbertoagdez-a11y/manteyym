import { label, labelTitle } from "../i18n/es";
import { BarChart, BodyMap, LineChart } from "../components/Charts";
import { Icon } from "../components/Icon";
import { Button, Field, PhotoTile, SelectField } from "../components/ui";
import { DAY_MS } from "../constants";
import { activePainZones } from "../lib/pain";
import {
  detectStagnation,
  estimatedOneRepMax,
  makeId,
  MUSCLE_LABELS,
  MUSCLES,
  volumeByMuscle,
  volumeTargets,
  weekStart,
} from "../engine/fitness";
import { cleanNumber, cx, exerciseName, formatClock, formatDate, formatDuration, formatted } from "../lib/format";
import type { BodyMetric, Exercise, GoalRecord, Muscle, PainEntry, Profile, TrainingSession } from "../types";
import { type ChangeEvent, type FormEvent, useState } from "react";

type MetricKey =
  "weight" | "bodyFat" | "waist" | "chest" | "hip" | "neck" | "shoulders" | "arm" | "forearm" | "thigh" | "calf";
const METRIC_FIELDS: { key: MetricKey; label: string; kind: "mass" | "length" | "percent" }[] = [
  { key: "weight", label: "Peso corporal", kind: "mass" },
  { key: "bodyFat", label: "% de grasa", kind: "percent" },
  { key: "waist", label: "Cintura", kind: "length" },
  { key: "chest", label: "Pecho", kind: "length" },
  { key: "hip", label: "Cadera", kind: "length" },
  { key: "neck", label: "Cuello", kind: "length" },
  { key: "shoulders", label: "Hombros", kind: "length" },
  { key: "arm", label: "Brazo", kind: "length" },
  { key: "forearm", label: "Antebrazo", kind: "length" },
  { key: "thigh", label: "Muslo", kind: "length" },
  { key: "calf", label: "Pantorrilla", kind: "length" },
];

export function ProgressScreen({
  profile,
  sessions,
  catalog,
  metrics,
  painEntries,
  onOpenPain,
  onOpenHistory,
  goals,
  cardio,
  photos,
  onOpenExercise,
  onAddMetric,
  onAddGoal,
  onDeleteGoal,
  onAddCardio,
  onAddPhoto,
  onDeletePhoto,
}: {
  profile: Profile;
  sessions: TrainingSession[];
  catalog: Exercise[];
  metrics: BodyMetric[];
  painEntries: PainEntry[];
  onOpenPain: () => void;
  onOpenHistory: () => void;
  goals: GoalRecord[];
  cardio: { id: string; type: string; minutes: number; intensity: number; at: number }[];
  photos: { id: string; at: number; label: string; blob?: Blob }[];
  onOpenExercise: (exercise: Exercise) => void;
  onAddMetric: (metric: BodyMetric) => Promise<void>;
  onAddGoal: (goal: GoalRecord) => Promise<void>;
  onDeleteGoal: (goal: GoalRecord) => Promise<void>;
  onAddCardio: (record: { id: string; type: string; minutes: number; intensity: number; at: number }) => Promise<void>;
  onAddPhoto: (file: File, label: string) => Promise<void>;
  onDeletePhoto: (id: string) => Promise<void>;
}) {
  const [rangeWeeks, setRangeWeeks] = useState(12);
  const [selectedExercise, setSelectedExercise] = useState(catalog[0]?.id ?? "");
  const [metricType, setMetricType] = useState("peso");
  const [bodyValues, setBodyValues] = useState<Partial<Record<MetricKey, string>>>({});
  const lengthUnit = profile.units === "kg" ? "cm" : "in";
  const [goalExercise, setGoalExercise] = useState(catalog[0]?.id ?? "");
  const [goalTarget, setGoalTarget] = useState("");
  const [cardioType, setCardioType] = useState("Caminata");
  const [cardioMinutes, setCardioMinutes] = useState("20");
  const [cardioIntensity, setCardioIntensity] = useState(3);
  const [photoLabel, setPhotoLabel] = useState("");
  const [compare, setCompare] = useState<{ before?: string; after?: string }>({});
  // Por defecto: la foto más vieja contra la más nueva (photos viene ordenado de más reciente a más vieja).
  const compareBefore = photos.find((photo) => photo.id === compare.before) ?? photos.at(-1);
  const compareAfter = photos.find((photo) => photo.id === compare.after) ?? photos[0];
  const [activeArea, setActiveArea] = useState("Cadera");
  const weeklyVolume = volumeByMuscle(sessions, catalog, Date.now() - 7 * DAY_MS);
  const targets = volumeTargets(profile);
  const selected = catalog.find((exercise) => exercise.id === selectedExercise);
  const recentSessions = [...sessions]
    .filter((session) => session.endedAt >= Date.now() - rangeWeeks * 7 * DAY_MS)
    .sort((a, b) => a.endedAt - b.endedAt);
  const chartEntries = recentSessions
    .map((session) => {
      const found = session.exercises.find((item) => item.exerciseId === selectedExercise);
      const sets = found?.sets.filter((set) => set.completed && set.type !== "calentamiento") ?? [];
      const values =
        metricType === "peso"
          ? sets.map((set) => set.weight)
          : metricType === "e1rm"
            ? sets.map((set) => estimatedOneRepMax(set.weight, set.reps))
            : metricType === "volumen"
              ? [sets.reduce((sum, set) => sum + set.weight * set.reps, 0)]
              : [sets.length ? 1 : 0];
      return { session, value: values.length ? (metricType === "volumen" ? values[0] : Math.max(...values)) : 0 };
    })
    .filter((item) => item.value > 0);
  const lastSessions = sessions.filter((session) => session.endedAt >= weekStart());
  const belowTargets = MUSCLES.filter(
    (muscle) => weeklyVolume[muscle] > 0 && weeklyVolume[muscle] < targets[muscle] * 0.6,
  );
  const exerciseStalls = catalog.filter((exercise) => detectStagnation(sessions, exercise.id)).slice(0, 3);
  const lastMetrics = [...metrics].sort((a, b) => b.at - a.at);
  const activePain = activePainZones(painEntries);
  const lastPain = painEntries[0];
  const currentMonth = new Date();
  const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const dayOffset = (monthStart.getDay() + 6) % 7;
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const dateKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const sessionCountByDate = new Map<string, number>();
  sessions.forEach((session) => {
    const date = new Date(session.startedAt);
    const key = dateKey(date);
    sessionCountByDate.set(key, (sessionCountByDate.get(key) ?? 0) + 1);
  });
  const calendarDays = [
    ...Array(dayOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ];
  const mobility = {
    Cadera: "Movilidad suave de cadera: 2 rondas de 6 rotaciones controladas por lado.",
    Hombros: "Deslizamientos de brazos en pared y rotaciones suaves, 2 rondas de 8 repeticiones.",
    Tobillos: "Moviliza el tobillo hacia delante con el talón apoyado, 2 rondas de 8 por lado.",
    Torax: "Rotación torácica en cuadrupedia, 2 rondas de 6 por lado sin forzar.",
  };
  const submitMetric = async (event: FormEvent) => {
    event.preventDefault();
    const values = Object.fromEntries(
      METRIC_FIELDS.filter((field) => bodyValues[field.key]?.trim()).map((field) => [
        field.key,
        cleanNumber(bodyValues[field.key] ?? ""),
      ]),
    );
    if (!Object.keys(values).length) return;
    await onAddMetric({ id: makeId("metric"), at: Date.now(), ...values });
    setBodyValues({});
  };
  const submitGoal = async (event: FormEvent) => {
    event.preventDefault();
    if (!goalExercise || cleanNumber(goalTarget) <= 0) return;
    await onAddGoal({
      id: makeId("goal"),
      exerciseId: goalExercise,
      target: cleanNumber(goalTarget),
      units: profile.units,
      createdAt: Date.now(),
    });
    setGoalTarget("");
  };
  const submitCardio = async (event: FormEvent) => {
    event.preventDefault();
    if (cleanNumber(cardioMinutes) <= 0) return;
    await onAddCardio({
      id: makeId("cardio"),
      type: cardioType,
      minutes: cleanNumber(cardioMinutes),
      intensity: cardioIntensity,
      at: Date.now(),
    });
    setCardioMinutes("20");
  };
  const handlePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      event.target.value = "";
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      event.target.value = "";
      return;
    }
    await onAddPhoto(file, photoLabel.trim());
    setPhotoLabel("");
    event.target.value = "";
  };
  const weeklyCoachNote =
    lastSessions.length < Math.max(1, Math.round(profile.days * 0.5))
      ? "El cumplimiento de esta semana está por debajo de la mitad de las sesiones previstas. Prioriza una frecuencia que puedas sostener."
      : belowTargets.length
        ? `Volumen reciente bajo en ${belowTargets.map((muscle) => MUSCLE_LABELS[muscle]).join(", ")}. Revisa si quieres añadir una serie en la próxima semana.`
        : exerciseStalls.length
          ? `Sin progreso en ${exerciseStalls.map((exercise) => exercise.name).join(", ")}. Considera una descarga o cambiar la variante.`
          : "Semana consistente. Mantén el plan si recuperas bien y las repeticiones conservan buena técnica.";
  const goalProgress = (goal: GoalRecord) => {
    const best = Math.max(
      0,
      ...sessions.flatMap((session) =>
        session.exercises
          .filter((item) => item.exerciseId === goal.exerciseId)
          .flatMap((item) => item.sets.filter((set) => set.completed).map((set) => set.weight)),
      ),
    );
    const ratio = Math.min(100, goal.target ? (best / goal.target) * 100 : 0);
    const first = [...sessions]
      .reverse()
      .find((session) => session.exercises.some((item) => item.exerciseId === goal.exerciseId));
    const mostRecent = sessions.find((session) =>
      session.exercises.some((item) => item.exerciseId === goal.exerciseId),
    );
    const firstBest = first
      ? Math.max(
          0,
          ...first.exercises
            .filter((item) => item.exerciseId === goal.exerciseId)
            .flatMap((item) => item.sets.filter((set) => set.completed).map((set) => set.weight)),
        )
      : 0;
    const slope =
      first && mostRecent && mostRecent.endedAt > first.endedAt
        ? (best - firstBest) / Math.max(1, (mostRecent.endedAt - first.endedAt) / (7 * DAY_MS))
        : 0;
    const eta =
      slope > 0 && goal.target > best ? new Date(Date.now() + ((goal.target - best) / slope) * 7 * DAY_MS) : null;
    return { best, ratio, eta };
  };
  return (
    <div className="screen">
      <div className="page-intro">
        <p className="eyebrow">CONSTANCIA, NO PERFECCIÓN</p>
        <h1>Progreso</h1>
        <p>Una lectura de tu entrenamiento. Las estimaciones se basan solo en los registros que guardas aquí.</p>
      </div>
      <section className="coach-review">
        <div className="coach-review-icon">
          <Icon name="activity" size={20} />
        </div>
        <div>
          <p className="eyebrow">REVISIÓN SEMANAL</p>
          <h2>{lastSessions.length} sesiones esta semana</h2>
          <p>{weeklyCoachNote}</p>
        </div>
        <span className="review-status">REGLAS LOCALES</span>
      </section>
      <div className="progress-columns">
        <section className="progress-volume">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ÚLTIMOS 7 DÍAS</p>
              <h2>Volumen por grupo muscular</h2>
            </div>
            <span className="subtle-count">Series efectivas</span>
          </div>
          <div className="volume-display">
            <div className="volume-bars">
              <BarChart values={weeklyVolume} targets={targets} />
            </div>
            <div className="body-map-column">
              <BodyMap values={weeklyVolume} />
              <small>Volumen orientativo. Las series secundarias cuentan parcialmente.</small>
            </div>
          </div>
          <p className="note-inline">
            <Icon name="info" size={17} /> Como referencia general, el plan usa rangos orientativos de 8 a 20 series
            efectivas por semana en músculos grandes; no son una prescripción universal.
          </p>
        </section>
        <aside className="recovery-panel">
          <p className="eyebrow">LECTURA ESTIMADA</p>
          <h2>Fatiga y recuperación</h2>
          <p>Estimación por el volumen reciente, no una medición fisiológica.</p>
          {["pecho", "espalda", "cuadriceps", "isquiotibiales", "hombros"].map((key) => {
            const muscle = key as Muscle;
            const sets = weeklyVolume[muscle];
            const target = targets[muscle];
            const label =
              sets === 0
                ? "Sin carga reciente"
                : sets >= target * 1.25
                  ? "Carga alta"
                  : sets >= target * 0.55
                    ? "En rango orientativo"
                    : "Carga baja";
            const width = Math.min(100, (sets / Math.max(target, 1)) * 100);
            return (
              <div className="recovery-row" key={key}>
                <div>
                  <span>{MUSCLE_LABELS[muscle]}</span>
                  <small>{label}</small>
                </div>
                <div className="recovery-track">
                  <i style={{ width: `${width}%` }} />
                </div>
                <strong>{sets}</strong>
              </div>
            );
          })}
        </aside>
      </div>

      <section className="progress-chart-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">TENDENCIA DE EJERCICIO</p>
            <h2>{selected?.name ?? "Elige un ejercicio"}</h2>
          </div>
          <button type="button" className="text-action" onClick={() => selected && onOpenExercise(selected)}>
            Abrir ficha <Icon name="next" size={16} />
          </button>
        </div>
        <div className="chart-controls">
          <SelectField
            label="Ejercicio"
            value={selectedExercise}
            onChange={setSelectedExercise}
            options={catalog.slice(0, 160).map((exercise) => ({ value: exercise.id, label: exercise.name }))}
          />
          <SelectField
            label="Dato"
            value={metricType}
            onChange={setMetricType}
            options={[
              { value: "peso", label: "Peso máximo" },
              { value: "e1rm", label: "1RM estimado" },
              { value: "volumen", label: "Volumen" },
              { value: "frecuencia", label: "Frecuencia" },
            ]}
          />
          <div className="range-control" aria-label="Rango de tiempo">
            {[4, 12, 52].map((weeks) => (
              <button
                type="button"
                key={weeks}
                className={rangeWeeks === weeks ? "active-range" : ""}
                aria-pressed={rangeWeeks === weeks}
                onClick={() => setRangeWeeks(weeks)}
              >
                {weeks} sem.
              </button>
            ))}
          </div>
        </div>
        <LineChart
          values={chartEntries.map((entry) => entry.value)}
          labels={chartEntries.map((entry) => formatDate(entry.session.endedAt))}
          unit={
            metricType === "frecuencia"
              ? " sesión"
              : metricType === "volumen"
                ? ` ${profile.units}`
                : ` ${profile.units}`
          }
        />
        {metricType === "e1rm" && (
          <p className="muted-copy">
            Estimación de Epley basada en series registradas. No representa un intento de máximo real.
          </p>
        )}
      </section>

      <section className="calendar-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">REGISTRO</p>
            <h2>Calendario de entrenamiento</h2>
          </div>
          <span>{new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(currentMonth)}</span>
        </div>
        <div className="calendar-grid">
          {["L", "M", "X", "J", "V", "S", "D"].map((day) => (
            <span className="calendar-weekday" key={day}>
              {day}
            </span>
          ))}
          {calendarDays.map((day, index) => {
            if (!day) return <span className="calendar-empty" key={`blank-${index}`} />;
            const key = dateKey(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day));
            const count = sessionCountByDate.get(key) ?? 0;
            return (
              <div
                key={day}
                className={cx(
                  "calendar-day",
                  count > 0 && "calendar-day-trained",
                  day === currentMonth.getDate() && "calendar-day-today",
                )}
                title={count ? `${count} sesiones registradas` : undefined}
              >
                <span>{day}</span>
                {count > 0 && <i />}
              </div>
            );
          })}
        </div>
        <div className="session-history-list">
          {sessions.slice(0, 8).map((session) => (
            <article className="history-session" key={session.id}>
              <div className="history-date">
                <strong>{formatDate(session.startedAt, { day: "numeric" })}</strong>
                <small>{formatDate(session.startedAt, { month: "short" })}</small>
              </div>
              <div>
                <strong>{session.dayName}</strong>
                <small>
                  {formatClock(session.startedAt)} - {formatClock(session.endedAt)} ·{" "}
                  {formatDuration(session.durationMs)}
                </small>
              </div>
              <span>
                {formatted(session.volume, 0)} {profile.units}
              </span>
            </article>
          ))}
          {!sessions.length && <p className="muted-copy">Tu calendario se llenará con tus sesiones finalizadas.</p>}
        </div>
        {sessions.length > 0 && (
          <Button variant="secondary" icon="history" onClick={onOpenHistory}>
            Ver y editar todo el historial ({sessions.length})
          </Button>
        )}
      </section>

      <div className="tracking-grid">
        <section className="tracking-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">MEDICIONES CORPORALES</p>
              <h2>Seguimiento, sin dieta</h2>
            </div>
            <Icon name="user" />
          </div>
          <p className="muted-copy">Opcional. Solo se guarda en tu dispositivo.</p>
          <form className="tracking-form metric-form" onSubmit={(event) => void submitMetric(event)}>
            {METRIC_FIELDS.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                type="number"
                step={0.1}
                value={bodyValues[field.key] ?? ""}
                onChange={(value) => setBodyValues({ ...bodyValues, [field.key]: value })}
                suffix={field.kind === "mass" ? profile.units : field.kind === "percent" ? "%" : lengthUnit}
                inputMode="decimal"
              />
            ))}
            <Button variant="secondary" type="submit">
              Guardar medición
            </Button>
          </form>
          {lastMetrics.slice(0, 5).map((metric) => (
            <div className="metric-history-row" key={metric.id}>
              <span>{formatDate(metric.at, { day: "numeric", month: "short" })}</span>
              <span>{metric.weight ? `${formatted(metric.weight)} ${profile.units}` : ""}</span>
              <small>
                {METRIC_FIELDS.filter((field) => field.key !== "weight" && metric[field.key] !== undefined)
                  .map(
                    (field) =>
                      `${field.label} ${formatted(metric[field.key] as number)}${field.kind === "percent" ? "%" : ` ${lengthUnit}`}`,
                  )
                  .join(" · ")}
              </small>
            </div>
          ))}
        </section>
        <section className="tracking-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">DOLOR Y MOLESTIAS</p>
              <h2>Registro de dolor</h2>
            </div>
            <Icon name="pain" />
          </div>
          <p className="muted-copy">
            Cada registro se guarda aparte, con fecha y contexto. Las zonas a evitar de forma permanente se editan en tu
            perfil. No es una herramienta de diagnóstico.
          </p>
          {activePain.length ? (
            <ul className="active-pain-summary">
              {activePain.map(({ zone, entry }) => (
                <li key={zone}>
                  <strong>{labelTitle(zone)}</strong> · {entry.intensity ?? "?"}/10 · desde{" "}
                  {formatDate(entry.at, { day: "numeric", month: "short" })}
                </li>
              ))}
            </ul>
          ) : (
            <p>
              {lastPain
                ? `Sin dolor activo. Último registro: ${formatDate(lastPain.at, { day: "numeric", month: "short" })}.`
                : "Todavía no hay registros."}
            </p>
          )}
          {profile.injuries.length > 0 && (
            <small className="muted-copy">
              Zonas a evitar en tu perfil: {profile.injuries.map((injury) => label(injury.zone)).join(", ")}.
            </small>
          )}
          <Button variant="secondary" icon="pain" onClick={onOpenPain}>
            Abrir registro de dolor
          </Button>
        </section>
      </div>

      <div className="tracking-grid">
        <section className="tracking-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">OBJETIVOS MEDIBLES</p>
              <h2>Una meta concreta</h2>
            </div>
            <Icon name="target" />
          </div>
          <form className="tracking-form" onSubmit={(event) => void submitGoal(event)}>
            <SelectField
              label="Ejercicio"
              value={goalExercise}
              onChange={setGoalExercise}
              options={catalog.slice(0, 200).map((exercise) => ({ value: exercise.id, label: exercise.name }))}
            />
            <Field
              label="Carga objetivo"
              type="number"
              step={0.5}
              value={goalTarget}
              onChange={setGoalTarget}
              suffix={profile.units}
            />
            <Button variant="secondary" type="submit">
              Añadir objetivo
            </Button>
          </form>
          {goals.map((goal) => {
            const progress = goalProgress(goal);
            return (
              <div className="goal-row" key={goal.id}>
                <div className="goal-heading">
                  <div>
                    <strong>{exerciseName(catalog, goal.exerciseId)}</strong>
                    <small>
                      {formatted(progress.best)} / {formatted(goal.target)} {goal.units}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="icon-button danger-icon"
                    aria-label="Eliminar objetivo"
                    onClick={() => void onDeleteGoal(goal)}
                  >
                    <Icon name="trash" size={17} />
                  </button>
                </div>
                <div className="progress-track">
                  <i style={{ width: `${progress.ratio}%` }} />
                </div>
                <small>
                  {progress.eta
                    ? `Proyección lineal orientativa: ${formatDate(progress.eta.getTime(), { month: "long", year: "numeric" })}. La tendencia puede cambiar.`
                    : "Sin tendencia suficiente para estimar una fecha."}
                </small>
              </div>
            );
          })}
        </section>
        <section className="tracking-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ACONDICIONAMIENTO</p>
              <h2>Cardio registrado</h2>
            </div>
            <Icon name="activity" />
          </div>
          <form className="tracking-form" onSubmit={(event) => void submitCardio(event)}>
            <SelectField
              label="Modalidad"
              value={cardioType}
              onChange={setCardioType}
              options={["Caminata", "Bicicleta", "Carrera", "Remo", "Otro"].map((item) => ({
                value: item,
                label: item,
              }))}
            />
            <Field
              label="Duración"
              type="number"
              min={1}
              value={cardioMinutes}
              onChange={setCardioMinutes}
              suffix="min"
            />
            <SelectField
              label="Intensidad percibida"
              value={String(cardioIntensity)}
              onChange={(value) => setCardioIntensity(Number(value))}
              options={[1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: `${value} de 5` }))}
            />
            <Button variant="secondary" type="submit">
              Guardar cardio
            </Button>
          </form>
          {cardio.slice(0, 5).map((record) => (
            <div className="cardio-row" key={record.id}>
              <div>
                <strong>{record.type}</strong>
                <small>
                  {formatDate(record.at, { day: "numeric", month: "short" })} · intensidad {record.intensity}/5
                </small>
              </div>
              <span>{record.minutes} min</span>
            </div>
          ))}
        </section>
      </div>

      <div className="tracking-grid">
        <section className="tracking-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">MOVILIDAD</p>
              <h2>Unos minutos de movimiento</h2>
            </div>
            <Icon name="activity" />
          </div>
          <SelectField
            label="Zona de movilidad"
            value={activeArea}
            onChange={setActiveArea}
            options={Object.keys(mobility).map((area) => ({ value: area, label: area }))}
          />
          <p className="mobility-copy">{mobility[activeArea as keyof typeof mobility]}</p>
          <small>Guía general, no terapéutica. Mantente en un rango cómodo y suspende ante dolor.</small>
        </section>
        <section className="tracking-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">FOTOS PRIVADAS</p>
              <h2>Solo en este dispositivo</h2>
            </div>
            <Icon name="image" />
          </div>
          <Field
            label="Etiqueta opcional"
            value={photoLabel}
            onChange={setPhotoLabel}
            placeholder="Ejemplo: vista frontal"
          />
          <label className="upload-trigger">
            <Icon name="plus" size={17} />
            <span>Guardar foto de progreso</span>
            <input type="file" accept="image/*" capture="environment" onChange={(event) => void handlePhoto(event)} />
          </label>
          <p className="muted-copy">Archivos de imagen hasta 12 MB. Las fotos entran en el respaldo JSON.</p>
          {photos.length > 1 && (
            <div className="photo-comparison">
              <span className="eyebrow">COMPARACIÓN LADO A LADO</span>
              <div className="photo-compare-pickers">
                {(["before", "after"] as const).map((slot) => (
                  <SelectField
                    key={slot}
                    label={slot === "before" ? "Antes" : "Después"}
                    value={(slot === "before" ? compareBefore : compareAfter)?.id ?? ""}
                    onChange={(id) => setCompare({ ...compare, [slot]: id })}
                    options={photos.map((photo) => ({
                      value: photo.id,
                      label: `${formatDate(photo.at, { day: "numeric", month: "short", year: "numeric" })} · ${photo.label || "Foto"}`,
                    }))}
                  />
                ))}
              </div>
              <div>
                {[compareBefore, compareAfter].map(
                  (photo, index) =>
                    photo && (
                      <PhotoTile
                        key={`${photo.id}-${index}`}
                        photo={photo}
                        onDelete={() => void onDeletePhoto(photo.id)}
                      />
                    ),
                )}
              </div>
            </div>
          )}
          {photos.length > 0 && (
            <details className="photo-gallery">
              <summary>Todas las fotos ({photos.length})</summary>
              <div className="photo-gallery-grid">
                {photos.map((photo) => (
                  <PhotoTile key={photo.id} photo={photo} onDelete={() => void onDeletePhoto(photo.id)} />
                ))}
              </div>
            </details>
          )}
        </section>
      </div>
    </div>
  );
}
