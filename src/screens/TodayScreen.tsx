import { label } from "../i18n/es";
import { Icon } from "../components/Icon";
import { Button, EmptyState } from "../components/ui";
import { getExerciseHistory, warmupSets, weekStart } from "../engine/fitness";
import { cx, exerciseName, formatDate, formatted, weekIndex } from "../lib/format";
import { exercisesLoadingZones } from "../lib/pain";
import type { Exercise, PainEntry, Profile, Routine, RoutineDay, TrainingBlock, TrainingSession } from "../types";
import { useState } from "react";

export function TodayScreen({
  profile,
  routine,
  day,
  block,
  sessions,
  exercises,
  onStart,
  onOpenRoutines,
  onBackup,
  backupDue,
  onSaveReadiness,
  painToday,
  activeZones,
  onNoPain,
  onLogPain,
  onOpenPain,
}: {
  profile: Profile;
  routine?: Routine;
  day?: RoutineDay;
  block?: TrainingBlock;
  sessions: TrainingSession[];
  exercises: Exercise[];
  onStart: (day: RoutineDay) => void;
  onOpenRoutines: () => void;
  onBackup: () => void;
  backupDue: boolean;
  onSaveReadiness: (values: Record<string, number>) => void;
  painToday: PainEntry[];
  activeZones: string[];
  onNoPain: () => void;
  onLogPain: () => void;
  onOpenPain: () => void;
}) {
  const [readiness, setReadiness] = useState<Record<string, number>>({
    sueno: 3,
    energia: 3,
    agujetas: 3,
    estres: 3,
    animo: 3,
    horas: 0,
  });
  const todayStatus = painToday[0];
  const dayExercises = (day?.exercises ?? [])
    .map((plan) => exercises.find((exercise) => exercise.id === plan.exerciseId))
    .filter((exercise): exercise is Exercise => Boolean(exercise));
  const loaded = exercisesLoadingZones(dayExercises, activeZones);
  const [showWarmup, setShowWarmup] = useState(false);
  const week = weekIndex(block);
  const totalVolume = sessions
    .filter((session) => session.endedAt > weekStart())
    .reduce((sum, session) => sum + session.volume, 0);
  const firstPlan = day?.exercises[0];
  const previous = firstPlan
    ? getExerciseHistory(sessions, firstPlan.exerciseId)[0]?.item.sets.find((set) => set.completed)
    : undefined;
  const warmups = warmupSets(previous?.weight ?? 0);
  const readinessLow =
    readiness.sueno < 3 ||
    readiness.energia < 3 ||
    readiness.agujetas > 3 ||
    readiness.estres > 3 ||
    readiness.animo < 2;
  const readinessDimensions = [
    ["sueno", "Sueño"],
    ["energia", "Energía"],
    ["agujetas", "Agujetas"],
    ["estres", "Estrés"],
    ["animo", "Ánimo"],
  ] as const;
  return (
    <div className="screen screen-today">
      <section className="today-hero">
        <div className="hero-topline">
          <span className="hero-mark">M</span>
          <span className="eyebrow">TU ESPACIO DE ENTRENAMIENTO</span>
          <span className="hero-date">
            {formatDate(Date.now(), { weekday: "long", day: "numeric", month: "long" })}
          </span>
        </div>
        <div className="hero-copy">
          <p className="hero-overline">
            {routine ? `PLAN ACTIVO · ${label(routine.split).toUpperCase()}` : "UN PLAN HECHO PARA TI"}
          </p>
          <h1>
            Entrena con
            <br />
            <em>intención.</em>
          </h1>
          <p className="hero-lede">Un paso a la vez. Tu historial, tus rutinas y tu progreso, siempre contigo.</p>
        </div>
        <div className="hero-footer">
          <div>
            <span className="hero-caption">SIGUIENTE SESIÓN</span>
            <strong>{day?.name ?? "Tu plan empieza aquí"}</strong>
            <small>
              {day?.exercises.length
                ? `${day.exercises.length} ejercicios · ${profile.minutes} min aprox.`
                : "Genera una rutina para preparar tu semana."}
            </small>
          </div>
          {day?.exercises.length ? (
            <Button variant="primary" icon="play" onClick={() => onStart(day)}>
              Iniciar entrenamiento
            </Button>
          ) : (
            <Button variant="primary" icon="plus" onClick={onOpenRoutines}>
              Crear mi rutina
            </Button>
          )}
        </div>
        <div className="hero-orbit hero-orbit-one" />
        <div className="hero-orbit hero-orbit-two" />
        <div className="hero-line-art" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="dashboard-main">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ESTADO DEL PLAN</p>
              <h2>Tu semana, a tu ritmo</h2>
            </div>
            <span className="week-index">
              {block ? `SEMANA ${week} / ${block.weeks}` : `${profile.days} DÍAS / SEMANA`}
            </span>
          </div>
          {routine ? (
            <div className="week-panel">
              <div className="week-panel-copy">
                <div>
                  <span className="metric-label">BLOQUE ACTUAL</span>
                  <strong>{routine.name}</strong>
                </div>
                <span className="week-progress-label">
                  {week === block?.deloadWeek ? "Descarga sugerida" : `Semana ${week} de ${block?.weeks ?? 6}`}
                </span>
              </div>
              <div className="week-progress">
                <i style={{ width: `${Math.min(100, (week / (block?.weeks ?? 6)) * 100)}%` }} />
              </div>
              <div className="week-panel-bottom">
                <span>El volumen sube de forma gradual y baja en la semana de descarga.</span>
                <button type="button" className="text-action" onClick={onOpenRoutines}>
                  Ver plan <Icon name="next" size={16} />
                </button>
              </div>
            </div>
          ) : (
            <EmptyState
              title="Aún no hay rutina activa"
              description="Elige una plantilla o deja que el generador prepare tu primera semana."
              action={
                <Button variant="secondary" onClick={onOpenRoutines}>
                  Explorar rutinas
                </Button>
              }
            />
          )}

          <div className="pain-today-row" aria-live="polite">
            <div>
              <p className="eyebrow">CHEQUEO DE DOLOR</p>
              <strong>
                {todayStatus
                  ? todayStatus.status === "sin_dolor"
                    ? "Hoy: sin dolor ✓"
                    : `Hoy: dolor en ${todayStatus.zones.map(label).join(", ")} (${todayStatus.intensity ?? "?"}/10)`
                  : "¿Dolor hoy?"}
              </strong>
            </div>
            <div className="pain-today-actions">
              {todayStatus?.status !== "sin_dolor" && (
                <Button variant="secondary" icon="smile" onClick={onNoPain}>
                  Sin dolor
                </Button>
              )}
              <Button variant="quiet" icon="pain" onClick={onLogPain}>
                Registrar dolor
              </Button>
              <button type="button" className="text-action" onClick={onOpenPain}>
                Historial <Icon name="next" size={16} />
              </button>
            </div>
          </div>
          {loaded.length > 0 && (
            <div className="pain-hint" role="note">
              <Icon name="info" size={17} />
              <p>
                Tienes dolor activo en {activeZones.map(label).join(", ")}. Hoy cargan esa zona:{" "}
                {loaded.map((exercise) => exercise.name).join(", ")}. Si al empezar molesta, usa «Adaptar mi sesión»
                para ver alternativas. Es una sugerencia; tú decides.
              </p>
            </div>
          )}

          <div className="readiness-panel">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">ANTES DE EMPEZAR</p>
                <h3>Chequeo de disposición</h3>
              </div>
              <span className="optional-label">OPCIONAL</span>
            </div>
            <p className="muted-copy">Una lectura rápida de hoy; no es un diagnóstico ni una medición clínica.</p>
            <div className="readiness-list">
              {readinessDimensions.map(([key, label]) => (
                <div className="readiness-row" key={key}>
                  <span>{label}</span>
                  <div className="scale-buttons" role="group" aria-label={`${label}, escala de uno a cinco`}>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={cx(readiness[key] === value && "scale-active")}
                        aria-pressed={readiness[key] === value}
                        onClick={() => setReadiness({ ...readiness, [key]: value })}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="readiness-row">
              <span>Horas de sueño</span>
              <div className="scale-buttons" role="group" aria-label="Horas de sueño">
                {[5, 6, 7, 8, 9].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={cx(readiness.horas === value && "scale-active")}
                    aria-pressed={readiness.horas === value}
                    onClick={() => setReadiness({ ...readiness, horas: readiness.horas === value ? 0 : value })}
                  >
                    {value === 5 ? "≤5" : value === 9 ? "9+" : value}
                  </button>
                ))}
              </div>
            </div>
            {readinessLow && (
              <p className="notice-copy">
                <Icon name="info" size={16} /> Considera ampliar el descanso o reducir una serie si hoy no te sientes al
                cien por ciento.
              </p>
            )}
            <div className="readiness-footer">
              <span>1 = bajo · 5 = alto{readiness.agujetas === 1 ? "; menos agujetas" : ""}</span>
              <Button variant="quiet" onClick={() => onSaveReadiness(readiness)}>
                Guardar chequeo
              </Button>
            </div>
          </div>

          <section className="warmup-section">
            <button
              type="button"
              className="disclosure-button"
              aria-expanded={showWarmup}
              onClick={() => setShowWarmup(!showWarmup)}
            >
              <span>
                <span className="eyebrow">PREPARACIÓN</span>
                <strong>Calentamiento para tu sesión</strong>
              </span>
              <Icon name={showWarmup ? "minus" : "plus"} />
            </button>
            {showWarmup && (
              <div className="warmup-content">
                <p>
                  Empieza con movimiento suave de las zonas que trabajarás. Las series de aproximación preparan el
                  primer ejercicio; no cuentan como series efectivas.
                </p>
                <ul className="warmup-list">
                  <li>
                    <span>5 min</span> de actividad ligera y progresiva.
                  </li>
                  <li>
                    <span>Movilidad cómoda</span> de cadera, hombros y tórax, sin forzar rangos.
                  </li>
                </ul>
                {firstPlan && (
                  <div className="warmup-calculation">
                    <strong>{exerciseName(exercises, firstPlan.exerciseId)}</strong>
                    {warmups.length ? (
                      warmups.map((set) => (
                        <span key={set.percent}>
                          {set.percent}% · {formatted(set.weight)} {profile.units} × {set.reps}
                        </span>
                      ))
                    ) : (
                      <small>
                        Registra la carga de trabajo en tu sesión para calcular aproximaciones de la próxima vez.
                      </small>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>
        </section>

        <aside className="dashboard-aside">
          <div className="aside-heading">
            <p className="eyebrow">RESUMEN DE HOY</p>
            <span className="today-dot" />
          </div>
          <div className="aside-metric">
            <div>
              <span>Sesiones esta semana</span>
              <strong>
                {sessions.filter((session) => session.endedAt >= weekStart()).length}
                <small> / {profile.days}</small>
              </strong>
            </div>
            <Icon name="activity" size={20} />
          </div>
          <div className="aside-metric">
            <div>
              <span>Volumen registrado</span>
              <strong>
                {formatted(totalVolume, 0)}
                <small> {profile.units}</small>
              </strong>
            </div>
            <Icon name="weight" size={20} />
          </div>
          <div className="aside-metric">
            <div>
              <span>Entrenamientos completados</span>
              <strong>{sessions.length.toString().padStart(2, "0")}</strong>
            </div>
            <Icon name="calendar" size={20} />
          </div>
          <div className="aside-note">
            <Icon name="shieldCheck" size={17} />
            <p>El mejor progreso es el que puedes sostener. Ajusta el plan si lo necesitas.</p>
          </div>
          {backupDue && (
            <div className="backup-nudge">
              <div>
                <span className="eyebrow">COPIA LOCAL</span>
                <strong>Hace más de 14 días</strong>
                <p>Guarda un respaldo para conservar tu historial al cambiar de dispositivo.</p>
              </div>
              <Button variant="secondary" onClick={onBackup}>
                Crear respaldo
              </Button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
