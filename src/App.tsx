import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { BarChart, BodyMap, LineChart } from "./components/Charts";
import { Icon } from "./components/Icon";
import { FREE_DB } from "./data/exerciseSource";
import { buildRoutine, calculatePlates, detectStagnation, elapsedSessionMs, estimatedOneRepMax, getExerciseHistory, isExerciseCompatible, makeId, MUSCLES, MUSCLE_LABELS, normalizeRemoteExercise, normalizeText, sessionVolume, suggestProgression, volumeByMuscle, volumeTargets, warmupSets, weekStart, workoutTemplateLabels } from "./engine/fitness";
import { deleteRecord, exportBackup, getSnapshot, importBackup, initializeStore, resetStore, saveMany, saveRecord, storageErrorMessage, subscribe, validateBackup } from "./store";
import type { ActiveSession, BodyMetric, Exercise, GoalRecord, Injury, LoggedSet, Muscle, Profile, Routine, RoutineDay, SessionExercise, Settings, StoreName, TrainingBlock, TrainingSession, WorkoutExercise } from "./types";
import "./index.css";

const APP_VERSION = "1.0.0";
const DAY_MS = 24 * 60 * 60 * 1000;
const NAV_ITEMS: { id: "hoy" | "rutinas" | "ejercicios" | "progreso" | "ajustes"; label: string; icon: string }[] = [
  { id: "hoy", label: "Hoy", icon: "hoy" }, { id: "rutinas", label: "Rutinas", icon: "rutinas" },
  { id: "ejercicios", label: "Ejercicios", icon: "ejercicios" }, { id: "progreso", label: "Progreso", icon: "progreso" },
  { id: "ajustes", label: "Ajustes", icon: "ajustes" },
];

const GOALS: { value: Profile["goal"]; title: string; description: string }[] = [
  { value: "hipertrofia", title: "Ganar masa muscular", description: "Volumen gradual y ejercicios de fuerza." },
  { value: "fuerza", title: "Aumentar mi fuerza", description: "Prioridad a movimientos compuestos y descansos amplios." },
  { value: "perdida_grasa", title: "Perder grasa", description: "Entrenamiento de fuerza sostenible; sin planes de dieta." },
  { value: "resistencia", title: "Mejorar resistencia", description: "Rangos de repeticiones altos y trabajo constante." },
  { value: "salud", title: "Salud general", description: "Una rutina equilibrada, adaptable y progresiva." },
];
const EQUIPMENT_OPTIONS = ["Gimnasio completo", "barra", "mancuernas", "banco", "poleas", "maquinas", "bandas", "peso corporal"];
const INJURY_ZONES = ["hombro", "codo", "muneca", "espalda baja", "rodilla", "cadera", "tobillo"];
const EXERCISE_PATTERN_LABELS: Record<string, string> = {
  "empuje-horizontal": "Empuje horizontal", "empuje-vertical": "Empuje vertical", "tiron-horizontal": "Tiron horizontal",
  "tiron-vertical": "Tiron vertical", bisagra: "Bisagra de cadera", sentadilla: "Sentadilla", zancada: "Zancada",
  core: "Zona media", aislamiento: "Aislamiento", otro: "Otro",
};

function cx(...values: (string | false | null | undefined)[]) { return values.filter(Boolean).join(" "); }
function formatDuration(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(total / 3600)).padStart(2, "0")}:${String(Math.floor((total % 3600) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
function formatDate(timestamp: number, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  return new Intl.DateTimeFormat("es-ES", options).format(new Date(timestamp));
}
function formatClock(timestamp: number) { return new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp)); }
function cleanNumber(value: string | number) { const number = typeof value === "number" ? value : Number(String(value).replace(",", ".")); return Number.isFinite(number) ? number : 0; }
function formatted(value: number, digits = 1) { return value.toLocaleString("es-ES", { maximumFractionDigits: digits }); }
function exerciseName(exercises: Exercise[], id: string) { return exercises.find((exercise) => exercise.id === id)?.name ?? "Ejercicio guardado"; }
function allTargetSets(exercises: SessionExercise[]) { return exercises.reduce((sum, exercise) => sum + exercise.targetSets, 0); }
function completedSets(exercises: SessionExercise[]) { return exercises.reduce((sum, exercise) => sum + exercise.sets.filter((set) => set.completed).length, 0); }
function weekIndex(block: TrainingBlock | undefined, now = Date.now()) {
  if (!block) return 1;
  const elapsedWeeks = Math.max(0, Math.floor((now - block.startAt) / (7 * DAY_MS)));
  return elapsedWeeks % Math.max(4, block.weeks) + 1;
}
function currentDay(routine: Routine | undefined, sessionCount: number): RoutineDay | undefined {
  if (!routine?.days.length) return undefined;
  return routine.days[sessionCount % routine.days.length];
}

function Button({ children, onClick, variant = "secondary", icon, disabled = false, className = "", type = "button", ariaLabel }: {
  children: ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "quiet" | "danger"; icon?: string;
  disabled?: boolean; className?: string; type?: "button" | "submit"; ariaLabel?: string;
}) {
  return <button type={type} className={cx("button", `button-${variant}`, className)} onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
    {icon && <Icon name={icon} size={18} />}{children}
  </button>;
}

function Field({ label, value, onChange, type = "text", placeholder, min, max, step, suffix, multiline = false, inputMode }: {
  label: string; value: string | number; onChange: (value: string) => void; type?: string; placeholder?: string;
  min?: number; max?: number; step?: number; suffix?: string; multiline?: boolean; inputMode?: "decimal" | "numeric" | "text";
}) {
  const inputProps = { value, onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value), placeholder, min, max, step, inputMode, "aria-label": label };
  return <label className="field"><span>{label}</span><div className="field-control">
    {multiline ? <textarea {...inputProps} rows={3} /> : <input {...inputProps} type={type} />}
    {suffix && <small>{suffix}</small>}
  </div></label>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return <label className="field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
    {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select></label>;
}

function Choice({ title, description, selected, onClick, multi = false }: { title: string; description?: string; selected: boolean; onClick: () => void; multi?: boolean }) {
  return <button type="button" className={cx("choice", selected && "choice-selected")} aria-pressed={selected} onClick={onClick}>
    <span className="choice-copy"><strong>{title}</strong>{description && <small>{description}</small>}</span>
    <span className={cx("choice-indicator", multi && "choice-square")}>{selected && <Icon name="check" size={15} />}</span>
  </button>;
}

function Onboarding({ initialProfile, edit = false, onCancel, onComplete }: {
  initialProfile: Profile; edit?: boolean; onCancel?: () => void; onComplete: (profile: Profile, regenerate: boolean) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Profile>(initialProfile);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const total = 10;
  const toggleList = <T extends string,>(list: T[], value: T) => list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  const toggleEquipment = (equipment: string) => setDraft((previous) => {
    if (equipment === "Gimnasio completo") return { ...previous, equipment: previous.equipment.includes(equipment) ? [] : [equipment] };
    const withoutGym = previous.equipment.filter((item) => item !== "Gimnasio completo");
    return { ...previous, equipment: toggleList(withoutGym, equipment) };
  });
  const toggleInjury = (zone: string) => setDraft((previous) => {
    const found = previous.injuries.some((item) => item.zone === zone);
    return { ...previous, injuries: found ? previous.injuries.filter((item) => item.zone !== zone) : [...previous.injuries, { id: makeId("injury"), zone, note: "", pain: 1, createdAt: Date.now() }] };
  });
  const title = ["Tu objetivo", "Tu experiencia", "Tu disponibilidad semanal", "Tiempo por sesion", "Equipo disponible", "Musculos prioritarios", "Molestias o lesiones", "Ejercicios que quieres excluir", "Tus unidades", "Como progresar"];
  const handleFinish = async (regenerate: boolean) => {
    setBusy(true); setFormError("");
    try { await onComplete({ ...draft, onboardingComplete: true }, regenerate); }
    catch (error) { setFormError(storageErrorMessage(error)); setBusy(false); }
  };
  return <main className="onboarding-shell">
    <div className="onboarding-brand"><span className="brand-mark"><Icon name="exercises" size={21} /></span><strong>ManteYym</strong><span className="eyebrow">ENTRENAMIENTO PERSONAL</span></div>
    <section className="onboarding-panel" aria-labelledby="onboarding-title">
      <div className="onboarding-progress"><span>PASO {step + 1} DE {total}</span><span>{Math.round(((step + 1) / total) * 100)}%</span></div>
      <div className="progress-track"><i style={{ width: `${((step + 1) / total) * 100}%` }} /></div>
      <div className="onboarding-heading"><p className="eyebrow">{edit ? "PERFIL PERSONAL" : "EMPECEMOS POR TI"}</p><h1 id="onboarding-title">{title[step]}</h1></div>
      {step === 0 && <div className="choice-list">{GOALS.map((goal) => <Choice key={goal.value} title={goal.title} description={goal.description} selected={draft.goal === goal.value} onClick={() => setDraft({ ...draft, goal: goal.value })} />)}</div>}
      {step === 1 && <div className="step-fields"><div className="choice-list">{([
        ["principiante", "Estoy empezando", "Menos de 1 ano de entrenamiento constante."],
        ["intermedio", "Tengo experiencia", "Entre 1 y 3 anos entrenando con continuidad."],
        ["avanzado", "Llevo varios anos", "Mas de 3 anos de trabajo constante."],
      ] as [Profile["level"], string, string][]).map(([value, heading, description]) => <Choice key={value} title={heading} description={description} selected={draft.level === value} onClick={() => setDraft({ ...draft, level: value })} />)}</div>
        <Field label="Anos entrenando (aproximado)" type="number" min={0} max={60} step={1} value={draft.yearsTraining} onChange={(value) => setDraft({ ...draft, yearsTraining: Math.max(0, cleanNumber(value)) })} suffix="anos" />
      </div>}
      {step === 2 && <div className="step-fields"><p className="muted-copy">Cuantos dias puedes reservar con regularidad. La recuperacion tambien forma parte del plan.</p><div className="number-choice-row">{[2, 3, 4, 5, 6].map((days) => <button type="button" key={days} className={cx("number-choice", draft.days === days && "selected")} onClick={() => setDraft({ ...draft, days })}><strong>{days}</strong><small>dias</small></button>)}</div></div>}
      {step === 3 && <div className="step-fields"><p className="muted-copy">El generador ajustara el numero de movimientos a esta ventana.</p><div className="number-choice-row">{([30, 45, 60, 90] as const).map((minutes) => <button type="button" key={minutes} className={cx("number-choice", draft.minutes === minutes && "selected")} onClick={() => setDraft({ ...draft, minutes })}><strong>{minutes}</strong><small>minutos</small></button>)}</div></div>}
      {step === 4 && <div className="choice-list choice-grid">{EQUIPMENT_OPTIONS.map((item) => <Choice key={item} title={item === "maquinas" ? "Maquinas" : item} selected={draft.equipment.includes(item)} onClick={() => toggleEquipment(item)} multi />)}</div>}
      {step === 5 && <div className="choice-list choice-grid">{MUSCLES.filter((muscle) => muscle !== "antebrazos").map((muscle) => <Choice key={muscle} title={MUSCLE_LABELS[muscle]} selected={draft.priorities.includes(muscle)} onClick={() => setDraft({ ...draft, priorities: toggleList(draft.priorities, muscle) })} multi />)}</div>}
      {step === 6 && <div className="step-fields"><p className="muted-copy">La aplicacion evitara movimientos que coincidan con la zona seleccionada. Esto no es una evaluacion medica.</p><div className="choice-list choice-grid">{INJURY_ZONES.map((zone) => <Choice key={zone} title={zone.charAt(0).toUpperCase() + zone.slice(1)} selected={draft.injuries.some((injury) => injury.zone === zone)} onClick={() => toggleInjury(zone)} multi />)}</div></div>}
      {step === 7 && <div className="step-fields"><Field label="Nombres separados por coma" multiline value={draft.exclusions.join(", ")} onChange={(value) => setDraft({ ...draft, exclusions: value.split(",").map((entry) => entry.trim()).filter(Boolean) })} placeholder="Por ejemplo: sentadilla trasera, burpees" /><p className="muted-copy">Tambien puedes excluir movimientos desde el editor de rutinas.</p></div>}
      {step === 8 && <div className="choice-list">{([{ value: "kg", title: "Sistema metrico", description: "Kilogramos para registrar las cargas." }, { value: "lb", title: "Sistema imperial", description: "Libras para registrar las cargas." }] as const).map((item) => <Choice key={item.value} title={item.title} description={item.description} selected={draft.units === item.value} onClick={() => setDraft({ ...draft, units: item.value })} />)}</div>}
      {step === 9 && <div className="choice-list">{([
        ["doble", "Doble progresion", "Completa el rango de repeticiones y luego sube la carga."],
        ["lineal", "Lineal", "Anade un incremento pequeno en cada exposicion; pensada para principiantes."],
        ["rir", "Por esfuerzo (RIR)", "Ajusta la carga segun las repeticiones que te quedan en reserva."],
      ] as [Profile["progression"], string, string][]).map(([value, heading, description]) => <Choice key={value} title={heading} description={description} selected={draft.progression === value} onClick={() => setDraft({ ...draft, progression: value })} />)}</div>}
      <p className="health-note"><Icon name="shield" size={17} /> ManteYym no sustituye a un profesional de la salud. Ante dolor agudo o condiciones medicas, consulta a uno.</p>
      {formError && <p className="error-copy" role="alert">{formError}</p>}
      <div className="onboarding-actions">
        {step > 0 ? <Button icon="back" variant="quiet" onClick={() => setStep(step - 1)}>Anterior</Button> : onCancel ? <Button variant="quiet" onClick={onCancel}>Cancelar</Button> : <span />}
        {step < total - 1 ? <Button variant="primary" icon="next" onClick={() => setStep(step + 1)}>{step === 6 ? "Continuar" : "Siguiente"}</Button>
          : edit ? <div className="inline-actions"><Button variant="secondary" disabled={busy} onClick={() => void handleFinish(false)}>Guardar perfil</Button><Button variant="primary" disabled={busy} onClick={() => void handleFinish(true)}>Guardar y generar rutina</Button></div>
            : <Button variant="primary" disabled={busy} onClick={() => void handleFinish(true)}>{busy ? "Guardando" : "Crear mi plan"}</Button>}
      </div>
    </section>
    <p className="onboarding-footnote">Tus datos se guardan solamente en este dispositivo.</p>
  </main>;
}

function LocalBadge({ online }: { online: boolean }) {
  return <span className={cx("local-badge", !online && "local-badge-offline")}><i />{online ? "Solo en este dispositivo" : "Sin conexion"}</span>;
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-mark"><Icon name="activity" size={23} /></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}

function DialogFrame({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const sheetRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => sheetRef.current?.querySelector<HTMLElement>("button, input, select, textarea")?.focus(), 0);
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") { closeRef.current(); return; }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = [...sheetRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]")];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeys);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener("keydown", handleKeys); previousFocus?.focus(); };
  }, []);
  return <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={sheetRef} className={cx("sheet", wide && "sheet-wide")} role="dialog" aria-modal="true" aria-label={title}>
      <div className="sheet-handle" /><div className="sheet-header"><h2>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar"><Icon name="close" /></button></div>{children}
    </section>
  </div>;
}

function TodayScreen({ profile, routine, day, block, sessions, exercises, onStart, onOpenRoutines, onBackup, backupDue, onSaveReadiness, onToast }: {
  profile: Profile; routine?: Routine; day?: RoutineDay; block?: TrainingBlock; sessions: TrainingSession[]; exercises: Exercise[];
  onStart: (day: RoutineDay) => void; onOpenRoutines: () => void; onBackup: () => void; backupDue: boolean;
  onSaveReadiness: (values: Record<string, number>) => void; onToast: (message: string) => void;
}) {
  const [readiness, setReadiness] = useState<Record<string, number>>({ sueno: 3, energia: 3, agujetas: 3, estres: 3 });
  const [showWarmup, setShowWarmup] = useState(false);
  const week = weekIndex(block);
  const totalVolume = sessions.filter((session) => session.endedAt > weekStart()).reduce((sum, session) => sum + session.volume, 0);
  const firstPlan = day?.exercises[0];
  const previous = firstPlan ? getExerciseHistory(sessions, firstPlan.exerciseId)[0]?.item.sets.find((set) => set.completed) : undefined;
  const warmups = warmupSets(previous?.weight ?? 0);
  const readinessLow = readiness.sueno < 3 || readiness.energia < 3 || readiness.agujetas > 3 || readiness.estres > 3;
  const readinessDimensions = [["sueno", "Sueno"], ["energia", "Energia"], ["agujetas", "Agujetas"], ["estres", "Estres"]] as const;
  return <div className="screen screen-today">
    <section className="today-hero">
      <div className="hero-topline"><span className="hero-mark">M</span><span className="eyebrow">TU ESPACIO DE ENTRENAMIENTO</span><span className="hero-date">{formatDate(Date.now(), { weekday: "long", day: "numeric", month: "long" })}</span></div>
      <div className="hero-copy"><p className="hero-overline">{routine ? `PLAN ACTIVO · ${routine.split.toUpperCase()}` : "UN PLAN HECHO PARA TI"}</p>
        <h1>Entrena con<br /><em>intencion.</em></h1><p className="hero-lede">Un paso a la vez. Tu historial, tus rutinas y tu progreso, siempre contigo.</p>
      </div>
      <div className="hero-footer"><div><span className="hero-caption">SIGUIENTE SESION</span><strong>{day?.name ?? "Tu plan empieza aqui"}</strong><small>{day?.exercises.length ? `${day.exercises.length} ejercicios · ${profile.minutes} min aprox.` : "Genera una rutina para preparar tu semana."}</small></div>
        {day?.exercises.length ? <Button variant="primary" icon="play" onClick={() => onStart(day)}>Iniciar entrenamiento</Button> : <Button variant="primary" icon="plus" onClick={onOpenRoutines}>Crear mi rutina</Button>}
      </div>
      <div className="hero-orbit hero-orbit-one" /><div className="hero-orbit hero-orbit-two" /><div className="hero-line-art" aria-hidden="true"><span /><span /><span /><span /><span /></div>
    </section>

    <div className="dashboard-grid">
      <section className="dashboard-main">
        <div className="section-heading"><div><p className="eyebrow">ESTADO DEL PLAN</p><h2>Tu semana, a tu ritmo</h2></div><span className="week-index">{block ? `SEMANA ${week} / ${block.weeks}` : `${profile.days} DIAS / SEMANA`}</span></div>
        {routine ? <div className="week-panel">
          <div className="week-panel-copy"><div><span className="metric-label">BLOQUE ACTUAL</span><strong>{routine.name}</strong></div><span className="week-progress-label">{week === block?.deloadWeek ? "Descarga sugerida" : `Semana ${week} de ${block?.weeks ?? 6}`}</span></div>
          <div className="week-progress"><i style={{ width: `${Math.min(100, week / (block?.weeks ?? 6) * 100)}%` }} /></div>
          <div className="week-panel-bottom"><span>El volumen sube de forma gradual y baja en la semana de descarga.</span><button type="button" className="text-action" onClick={onOpenRoutines}>Ver plan <Icon name="next" size={16} /></button></div>
        </div> : <EmptyState title="Aun no hay rutina activa" description="Elige una plantilla o deja que el generador prepare tu primera semana." action={<Button variant="secondary" onClick={onOpenRoutines}>Explorar rutinas</Button>} />}

        <div className="readiness-panel"><div className="section-heading compact"><div><p className="eyebrow">ANTES DE EMPEZAR</p><h3>Chequeo de disposicion</h3></div><span className="optional-label">OPCIONAL</span></div>
          <p className="muted-copy">Una lectura rapida de hoy; no es un diagnostico ni una medicion clinica.</p>
          <div className="readiness-list">{readinessDimensions.map(([key, label]) => <div className="readiness-row" key={key}><span>{label}</span><div className="scale-buttons" role="group" aria-label={`${label}, escala de uno a cinco`}>{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" className={cx(readiness[key] === value && "scale-active")} aria-pressed={readiness[key] === value} onClick={() => setReadiness({ ...readiness, [key]: value })}>{value}</button>)}</div></div>)}</div>
          {readinessLow && <p className="notice-copy"><Icon name="info" size={16} /> Considera ampliar el descanso o reducir una serie si hoy no te sientes al cien por ciento.</p>}
          <div className="readiness-footer"><span>1 = bajo · 5 = alto{readiness.agujetas === 1 ? "; menos agujetas" : ""}</span><Button variant="quiet" onClick={() => { onSaveReadiness(readiness); onToast("Chequeo guardado en este dispositivo."); }}>Guardar chequeo</Button></div>
        </div>

        <section className="warmup-section"><button type="button" className="disclosure-button" aria-expanded={showWarmup} onClick={() => setShowWarmup(!showWarmup)}><span><span className="eyebrow">PREPARACION</span><strong>Calentamiento para tu sesion</strong></span><Icon name={showWarmup ? "minus" : "plus"} /></button>
          {showWarmup && <div className="warmup-content"><p>Empieza con movimiento suave de las zonas que trabajaras. Las series de aproximacion preparan el primer ejercicio; no cuentan como series efectivas.</p>
            <ul className="warmup-list"><li><span>5 min</span> de actividad ligera y progresiva.</li><li><span>Movilidad comoda</span> de cadera, hombros y torax, sin forzar rangos.</li></ul>
            {firstPlan && <div className="warmup-calculation"><strong>{exerciseName(exercises, firstPlan.exerciseId)}</strong>{warmups.length ? warmups.map((set) => <span key={set.percent}>{set.percent}% · {formatted(set.weight)} {profile.units} × {set.reps}</span>) : <small>Registra la carga de trabajo en tu sesion para calcular aproximaciones de la proxima vez.</small>}</div>}
          </div>}
        </section>
      </section>

      <aside className="dashboard-aside">
        <div className="aside-heading"><p className="eyebrow">RESUMEN DE HOY</p><span className="today-dot" /></div>
        <div className="aside-metric"><div><span>Sesiones esta semana</span><strong>{sessions.filter((session) => session.endedAt >= weekStart()).length}<small> / {profile.days}</small></strong></div><Icon name="activity" size={20} /></div>
        <div className="aside-metric"><div><span>Volumen registrado</span><strong>{formatted(totalVolume, 0)}<small> {profile.units}</small></strong></div><Icon name="weight" size={20} /></div>
        <div className="aside-metric"><div><span>Entrenamientos completados</span><strong>{sessions.length.toString().padStart(2, "0")}</strong></div><Icon name="calendar" size={20} /></div>
        <div className="aside-note"><Icon name="shieldCheck" size={17} /><p>El mejor progreso es el que puedes sostener. Ajusta el plan si lo necesitas.</p></div>
        {backupDue && <div className="backup-nudge"><div><span className="eyebrow">COPIA LOCAL</span><strong>Hace mas de 14 dias</strong><p>Guarda un respaldo para conservar tu historial al cambiar de dispositivo.</p></div><Button variant="secondary" onClick={onBackup}>Crear respaldo</Button></div>}
      </aside>
    </div>
  </div>;
}

function RoutineEditor({ routine, catalog, onSave, onClose, onPickExercise }: {
  routine: Routine; catalog: Exercise[]; onSave: (routine: Routine) => Promise<void>; onClose: () => void; onPickExercise: (callback: (exercise: Exercise) => void) => void;
}) {
  const [draft, setDraft] = useState<Routine>(routine);
  const [dayIndex, setDayIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(routine); setDayIndex(0); }, [routine.id]);
  const day = draft.days[dayIndex];
  const updateDay = (transform: (current: RoutineDay) => RoutineDay) => setDraft((previous) => ({ ...previous, days: previous.days.map((item, index) => index === dayIndex ? transform(item) : item) }));
  const updatePlan = (index: number, change: Partial<WorkoutExercise>) => updateDay((current) => ({ ...current, exercises: current.exercises.map((item, itemIndex) => itemIndex === index ? { ...item, ...change } : item) }));
  const moveExercise = (index: number, direction: -1 | 1) => updateDay((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.exercises.length) return current;
    const exercises = [...current.exercises]; [exercises[index], exercises[target]] = [exercises[target], exercises[index]];
    return { ...current, exercises };
  });
  const removeExercise = (index: number) => updateDay((current) => ({ ...current, exercises: current.exercises.filter((_, itemIndex) => itemIndex !== index) }));
  const addExercise = () => onPickExercise((exercise) => updateDay((current) => ({ ...current, exercises: [...current.exercises, {
    exerciseId: exercise.id, sets: 3, repsMin: 8, repsMax: 12, restSec: 90, rir: 2, note: "",
  }] })));
  const toggleGrouping = (index: number, groupType: "superset" | "circuito") => updateDay((current) => {
    if (index + 1 >= current.exercises.length && !current.exercises[index]?.superset) return current;
    const removing = current.exercises[index]?.groupType === groupType;
    const tag = removing ? undefined : `${groupType === "circuito" ? "C" : "A"}${Math.floor(index / 2) + 1}`;
    return { ...current, exercises: current.exercises.map((item, itemIndex) => itemIndex === index || itemIndex === index + 1 ? { ...item, superset: tag, groupType: removing ? undefined : groupType } : item) };
  });
  const save = async () => { setSaving(true); try { await onSave(draft); onClose(); } finally { setSaving(false); } };
  return <div className="routine-editor">
    <div className="editor-top"><button type="button" className="text-action" onClick={onClose}><Icon name="back" size={18} /> Volver a rutinas</button><Button variant="primary" onClick={() => void save()} disabled={saving}>{saving ? "Guardando" : "Guardar cambios"}</Button></div>
    <div className="editor-title"><Field label="Nombre de rutina" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} /><span className="eyebrow">{draft.split.toUpperCase()}</span></div>
    <div className="day-tabs" role="tablist" aria-label="Dias de rutina">{draft.days.map((item, index) => <button key={item.id} type="button" role="tab" aria-selected={index === dayIndex} className={cx(index === dayIndex && "day-tab-active")} onClick={() => setDayIndex(index)}>{item.name}</button>)}</div>
    {day && <>
      <div className="editor-day-heading"><div><p className="eyebrow">SESION {String(dayIndex + 1).padStart(2, "0")}</p><h2>{day.name}</h2></div><span>{day.exercises.length} ejercicios</span></div>
      <Field label="Nota de la sesion" value={day.note} onChange={(note) => updateDay((current) => ({ ...current, note }))} placeholder="Ejemplo: ritmo controlado, deja 2 repeticiones en reserva" />
      {!day.exercises.length ? <EmptyState title="Dia sin ejercicios" description="Anade movimientos compatibles con tu equipo y tus preferencias." /> : <div className="editor-exercise-list">{day.exercises.map((plan, index) => {
        const exercise = catalog.find((item) => item.id === plan.exerciseId);
        return <article className="editor-exercise" key={`${plan.exerciseId}-${index}`}>
          <div className="editor-exercise-header"><div className="editor-number">{String(index + 1).padStart(2, "0")}</div><div className="editor-exercise-name"><strong>{exercise?.name ?? "Ejercicio eliminado"}</strong><small>{exercise ? `${MUSCLE_LABELS[exercise.muscle]} · ${EXERCISE_PATTERN_LABELS[exercise.pattern] ?? "Otro"}` : ""}</small></div>
            <div className="editor-tools"><button type="button" className="icon-button small" title="Subir" aria-label="Subir ejercicio" onClick={() => moveExercise(index, -1)} disabled={index === 0}><Icon name="arrowUp" size={16} /></button><button type="button" className="icon-button small" title="Bajar" aria-label="Bajar ejercicio" onClick={() => moveExercise(index, 1)} disabled={index === day.exercises.length - 1}><Icon name="arrowDown" size={16} /></button><button type="button" className="icon-button small" title="Agrupar en superserie" aria-label="Activar o quitar superserie" onClick={() => toggleGrouping(index, "superset")}><Icon name="swap" size={16} /></button><button type="button" className="icon-button small" title="Agrupar en circuito" aria-label="Activar o quitar circuito" onClick={() => toggleGrouping(index, "circuito")}><Icon name="activity" size={16} /></button><button type="button" className="icon-button small danger-icon" aria-label={`Quitar ${exercise?.name ?? "ejercicio"}`} onClick={() => removeExercise(index)}><Icon name="trash" size={16} /></button></div>
          </div>
          {plan.superset && <span className="superset-tag">{plan.groupType === "circuito" ? "Circuito" : "Superserie"} {plan.superset}</span>}
          <div className="plan-fields"><Field label="Series" type="number" min={1} max={12} value={plan.sets} onChange={(value) => updatePlan(index, { sets: Math.min(12, Math.max(1, cleanNumber(value))) })} />
            <Field label="Reps min" type="number" min={1} max={100} value={plan.repsMin} onChange={(value) => updatePlan(index, { repsMin: Math.max(1, cleanNumber(value)) })} />
            <Field label="Reps max" type="number" min={1} max={100} value={plan.repsMax} onChange={(value) => updatePlan(index, { repsMax: Math.max(plan.repsMin, cleanNumber(value)) })} />
            <Field label="Descanso" type="number" min={15} max={600} step={15} value={plan.restSec} suffix="s" onChange={(value) => updatePlan(index, { restSec: Math.max(15, cleanNumber(value)) })} />
          </div>
          <Field label="Nota tecnica" value={plan.note} onChange={(note) => updatePlan(index, { note })} placeholder="Pista tecnica opcional" />
        </article>;
      })}</div>}
      <Button variant="secondary" icon="plus" onClick={addExercise}>Anadir ejercicio</Button>
    </>}
  </div>;
}

function ExerciseVisual({ exercise, compact = false }: { exercise: Exercise; compact?: boolean }) {
  const [frame, setFrame] = useState(0);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [slow, setSlow] = useState(false);
  const [controlled, setControlled] = useState(Boolean(navigator.serviceWorker?.controller));
  const images = exercise.images ?? [];
  const reducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const updateControl = () => setControlled(Boolean(navigator.serviceWorker.controller));
    navigator.serviceWorker.addEventListener("controllerchange", updateControl);
    navigator.serviceWorker.ready.then(updateControl).catch(() => undefined);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", updateControl);
  }, []);
  useEffect(() => {
    if (images.length < 2 || paused || slow && reducedMotion || reducedMotion) return;
    const timer = window.setInterval(() => setFrame((value) => (value + 1) % images.length), slow ? 5000 : 2600);
    return () => window.clearInterval(timer);
  }, [images.length, paused, slow, reducedMotion]);
  const imageUrl = (remote: string) => {
    if (!controlled || !remote.startsWith("https://raw.githubusercontent.com/yuhonas/free-exercise-db/")) return remote;
    const base = new URL("./", document.baseURI);
    const local = new URL("exercise-image", base);
    local.searchParams.set("url", remote);
    return local.href;
  };
  if (images.length > 1 && reducedMotion && !compact && !failed) return <div className="exercise-visual exercise-static-frames">
    <div>{images.slice(0, 2).map((image, index) => <figure className={frame === index ? "static-frame-active" : ""} key={image}><img src={imageUrl(image)} alt={`Posicion ${index + 1} de ${exercise.name}`} loading="lazy" onError={() => setFailed(true)} /><figcaption>Posicion {index + 1}</figcaption></figure>)}</div>
    <div className="visual-controls"><button type="button" onClick={() => setFrame((value) => (value + 1) % 2)} aria-label="Cambiar posicion"><Icon name="refresh" size={16} /> Posicion {frame + 1}</button></div>
  </div>;
  if (images.length && !failed) return <div className={cx("exercise-visual", compact && "exercise-visual-compact")}>
    <img src={imageUrl(images[frame % images.length])} alt={`Posicion ${frame + 1} de ${exercise.name}`} loading="lazy" onError={() => setFailed(true)} />
    {!compact && <div className="visual-controls"><button type="button" onClick={() => setFrame((value) => (value + 1) % images.length)} aria-label="Cambiar posicion"><Icon name="refresh" size={16} /></button><button type="button" onClick={() => setPaused(!paused)} aria-label={paused ? "Reanudar animacion" : "Pausar animacion"}><Icon name={paused ? "play" : "pause"} size={16} /></button><button type="button" onClick={() => setSlow(!slow)} aria-label="Cambiar velocidad">{slow ? "Lento" : "Normal"}</button></div>}
    {!compact && reducedMotion && <p className="visual-note">Movimiento reducido activo. Cambia la posicion con el control manual.</p>}
  </div>;
  return <div className={cx("visual-guide", compact && "visual-guide-compact")}><div className="guide-symbol"><Icon name="exercises" size={compact ? 20 : 35} /></div>{!compact && <><span className="eyebrow">GUIA TECNICA</span><strong>{EXERCISE_PATTERN_LABELS[exercise.pattern] ?? "Movimiento"}</strong><small>Sin imagen disponible. Consulta los pasos y errores frecuentes.</small></>}</div>;
}

function ExerciseDetail({ exercise, catalog, sessions, units, onClose }: { exercise: Exercise; catalog: Exercise[]; sessions: TrainingSession[]; units: "kg" | "lb"; onClose: () => void }) {
  const history = getExerciseHistory(sessions, exercise.id);
  const completed = history.flatMap((entry) => entry.item.sets.filter((set) => set.completed && set.type !== "calentamiento"));
  const bestWeight = Math.max(0, ...completed.map((set) => set.weight));
  const bestEstimated = Math.max(0, ...completed.map((set) => estimatedOneRepMax(set.weight, set.reps)));
  const alternatives = catalog.filter((item) => item.id !== exercise.id && item.pattern === exercise.pattern && (item.muscle === exercise.muscle || item.secondary.includes(exercise.muscle))).slice(0, 4);
  return <DialogFrame title={exercise.name} onClose={onClose} wide>
    <div className="exercise-detail">
      <ExerciseVisual exercise={exercise} />
      <div className="exercise-detail-content">
        <div className="exercise-tags"><span>{MUSCLE_LABELS[exercise.muscle] ?? exercise.muscle}</span><span>{EXERCISE_PATTERN_LABELS[exercise.pattern] ?? "Otro"}</span><span>{exercise.source === "free-exercise-db" ? "Free Exercise DB" : exercise.source === "personal" ? "Personalizado" : "Catalogo local"}</span></div>
        {exercise.originalName && <p className="notice-copy"><Icon name="info" size={16} /> Nombre original en ingles: no hay traduccion confirmada.</p>}
        {exercise.originalMuscle && <p className="muted-copy">Grupo muscular original sin traduccion confirmada: {exercise.originalMuscle}.</p>}
        <div className="detail-metrics"><div><span>MEJOR CARGA</span><strong>{bestWeight ? `${formatted(bestWeight)} ${units}` : "Sin datos"}</strong></div><div><span>1RM ESTIMADO</span><strong>{bestEstimated ? `${formatted(bestEstimated)} ${units}` : "Sin datos"}</strong></div><div><span>SESIONES</span><strong>{history.length}</strong></div></div>
        {bestEstimated > 0 && <p className="muted-copy">El 1RM estimado usa la formula de Epley. Es una aproximacion, no una prueba de fuerza maxima.</p>}
        <div className="detail-section"><h3>Equipo</h3><p>{exercise.equipment.join(" · ")}</p></div>
        <div className="detail-section"><h3>Musculos secundarios</h3><p>{exercise.secondary.length ? exercise.secondary.map((muscle) => MUSCLE_LABELS[muscle] ?? muscle).join(" · ") : "No especificados"}</p></div>
        <div className="detail-section"><h3>Pasos</h3>{exercise.instructionsOriginal && <p className="muted-copy">Instrucciones originales del catalogo en ingles, sin traducir.</p>}<ol className="instruction-list">{exercise.steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol></div>
        <div className="detail-section"><h3>Errores frecuentes</h3><ul className="mistake-list">{exercise.mistakes.map((mistake) => <li key={mistake}>{mistake}</li>)}</ul></div>
        <div className="detail-section"><h3>Alternativas del mismo patron</h3>{alternatives.length ? alternatives.map((item) => <div className="alternative-row" key={item.id}><span>{item.name}</span><small>{MUSCLE_LABELS[item.muscle] ?? item.muscle}</small></div>) : <p>No hay alternativas compatibles en esta seleccion.</p>}</div>
        <div className="detail-section"><h3>Ultimas sesiones</h3>{history.slice(0, 4).map(({ session, item }) => <div key={session.id} className="history-row"><span>{formatDate(session.endedAt, { day: "numeric", month: "short", year: "numeric" })}</span><span>{item.sets.filter((set) => set.completed).length} series</span><strong>{Math.max(0, ...item.sets.filter((set) => set.completed).map((set) => set.weight))} {units}</strong></div>)}{!history.length && <p>Aun no hay registros. Tus series apareceran aqui.</p>}</div>
      </div>
    </div>
  </DialogFrame>;
}

function ExerciseBrowser({ catalog, onOpen, onDownload, onCreate, downloadLabel, downloading }: {
  catalog: Exercise[]; onOpen: (exercise: Exercise) => void; onDownload: () => void; onCreate: () => void; downloadLabel: string; downloading: boolean;
}) {
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("todos");
  const [equipment, setEquipment] = useState("todos");
  const [pattern, setPattern] = useState("todos");
  const [limit, setLimit] = useState(24);
  const equipmentValues = [...new Set(catalog.flatMap((item) => item.equipment))].sort();
  const matches = useMemo(() => catalog.filter((exercise) => {
    const text = normalizeText(`${exercise.name} ${exercise.muscle} ${exercise.equipment.join(" ")} ${exercise.pattern}`);
    return (!query || text.includes(normalizeText(query))) && (muscle === "todos" || exercise.muscle === muscle)
      && (equipment === "todos" || exercise.equipment.includes(equipment)) && (pattern === "todos" || exercise.pattern === pattern);
  }), [catalog, equipment, muscle, pattern, query]);
  return <div className="screen">
    <div className="page-intro"><p className="eyebrow">BIBLIOTECA PERSONAL</p><h1>Ejercicios</h1><p>Guia, tecnica e historial en un solo lugar. El catalogo basico funciona sin conexion.</p></div>
    <div className="library-toolbar"><label className="search-field"><Icon name="search" size={19} /><input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(24); }} placeholder="Buscar ejercicio o musculo" aria-label="Buscar ejercicios" />{query && <button type="button" aria-label="Limpiar busqueda" onClick={() => setQuery("")}><Icon name="close" size={16} /></button>}</label>
      <SelectField label="Musculo" value={muscle} onChange={(value) => { setMuscle(value); setLimit(24); }} options={[{ value: "todos", label: "Todos los musculos" }, ...MUSCLES.map((item) => ({ value: item, label: MUSCLE_LABELS[item] }))]} />
      <SelectField label="Equipo" value={equipment} onChange={(value) => { setEquipment(value); setLimit(24); }} options={[{ value: "todos", label: "Todo el equipo" }, ...equipmentValues.map((item) => ({ value: item, label: item }))]} />
      <SelectField label="Patron" value={pattern} onChange={(value) => { setPattern(value); setLimit(24); }} options={[{ value: "todos", label: "Todos los patrones" }, ...Object.entries(EXERCISE_PATTERN_LABELS).map(([value, label]) => ({ value, label }))]} />
    </div>
    <div className="library-summary"><span>{matches.length} ejercicios</span><div className="inline-actions"><Button variant="quiet" icon="plus" onClick={onCreate}>Crear ejercicio</Button><Button variant="secondary" icon="download" onClick={onDownload} disabled={downloading}>{downloading ? downloadLabel : "Descargar biblioteca completa"}</Button></div></div>
    {downloading && <div className="download-progress"><span>{downloadLabel}</span><div className="progress-track"><i style={{ width: `${Number(downloadLabel.match(/\d+/)?.[0] ?? 0)}%` }} /></div></div>}
    {!matches.length ? <EmptyState title="No encontramos ese ejercicio" description="Prueba con otra palabra o cambia los filtros." /> : <div className="exercise-list">{matches.slice(0, limit).map((exercise) => <button type="button" className="exercise-row" key={exercise.id} onClick={() => onOpen(exercise)}>
      <ExerciseVisual exercise={exercise} compact /><span className="exercise-row-copy"><strong>{exercise.name}</strong><small>{MUSCLE_LABELS[exercise.muscle] ?? exercise.muscle} · {EXERCISE_PATTERN_LABELS[exercise.pattern] ?? "Otro"} · {exercise.equipment.join(", ")}</small>{exercise.originalName && <small className="original-label">Nombre original sin traduccion confirmada</small>}</span><span className="exercise-row-trailing"><span>{exercise.category === "compuesto" ? "Compuesto" : "Aislamiento"}</span><Icon name="next" size={17} /></span>
    </button>)}</div>}
    {limit < matches.length && <div className="load-more"><Button variant="secondary" onClick={() => setLimit((value) => value + 24)}>Mostrar mas ejercicios</Button></div>}
    <p className="source-note">La biblioteca opcional usa <a href={FREE_DB.repository} target="_blank" rel="noreferrer">free-exercise-db</a>, publicada bajo Unlicense. Sus instrucciones pueden estar en ingles; no se inventan traducciones. Las imagenes reales se cargan y cachean al abrirlas.</p>
  </div>;
}

function ExerciseCreateForm({ onCreate, onClose }: { onCreate: (exercise: Exercise) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState("");
  const [muscle, setMuscle] = useState<Muscle>("pecho");
  const [pattern, setPattern] = useState<Exercise["pattern"]>("empuje-horizontal");
  const [equipment, setEquipment] = useState("peso corporal");
  const [secondary, setSecondary] = useState<Muscle[]>([]);
  const [steps, setSteps] = useState("Coloca el cuerpo o el equipo en una posicion comoda.\nRealiza el movimiento con control y rango sin dolor.\nVuelve lentamente al inicio.");
  const [errors, setErrors] = useState("Perder el control del movimiento.\nUsar una carga o rango que genera dolor.");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onCreate({ id: makeId("custom"), name: name.trim(), muscle, secondary, equipment: [equipment], pattern,
        category: pattern === "aislamiento" ? "aislamiento" : "compuesto", steps: steps.split("\n").map((step) => step.trim()).filter(Boolean),
        mistakes: errors.split("\n").map((error) => error.trim()).filter(Boolean), source: "personal" });
      onClose();
    } finally { setSaving(false); }
  };
  return <DialogFrame title="Crear ejercicio" onClose={onClose}>
    <form className="form-stack" onSubmit={(event) => void submit(event)}>
      <Field label="Nombre" value={name} onChange={setName} placeholder="Nombre del ejercicio" />
      <SelectField label="Musculo principal" value={muscle} onChange={(value) => setMuscle(value as Muscle)} options={MUSCLES.map((item) => ({ value: item, label: MUSCLE_LABELS[item] }))} />
      <div className="field"><span>Musculos secundarios</span><div className="chip-row">{MUSCLES.filter((item) => item !== muscle).map((item) => <button key={item} className={cx("filter-chip", secondary.includes(item) && "filter-chip-active")} type="button" aria-pressed={secondary.includes(item)} onClick={() => setSecondary((current) => current.includes(item) ? current.filter((value) => value !== item) : [...current, item])}>{MUSCLE_LABELS[item]}</button>)}</div></div>
      <SelectField label="Patron de movimiento" value={pattern} onChange={(value) => setPattern(value as Exercise["pattern"])} options={Object.entries(EXERCISE_PATTERN_LABELS).map(([value, label]) => ({ value, label }))} />
      <SelectField label="Equipo" value={equipment} onChange={setEquipment} options={[...EQUIPMENT_OPTIONS.filter((item) => item !== "Gimnasio completo"), "otros"].map((item) => ({ value: item, label: item }))} />
      <Field label="Pasos, uno por linea" multiline value={steps} onChange={setSteps} />
      <Field label="Errores frecuentes, uno por linea" multiline value={errors} onChange={setErrors} />
      <div className="sheet-actions"><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button variant="primary" type="submit" disabled={!name.trim() || saving}>{saving ? "Guardando" : "Guardar ejercicio"}</Button></div>
    </form>
  </DialogFrame>;
}

function RoutineListScreen({ routines, activeId, activeBlock, profile, onCreate, onNew, onEdit, onSelect, onDuplicate, onDelete, onUpdateBlock }: {
  routines: Routine[]; activeId?: string; activeBlock?: TrainingBlock; profile: Profile; onCreate: (template: string) => void;
  onNew: () => void; onEdit: (routine: Routine) => void; onSelect: (routine: Routine) => void; onDuplicate: (routine: Routine) => void; onDelete: (routine: Routine) => void; onUpdateBlock: (block: TrainingBlock) => void;
}) {
  const templates = workoutTemplateLabels();
  return <div className="screen">
    <div className="page-intro"><p className="eyebrow">PLANIFICACION</p><h1>Rutinas</h1><p>Una estructura flexible, que puedes ajustar cuando tu semana lo necesite.</p></div>
    <section className="template-section"><div className="section-heading"><div><p className="eyebrow">PLANTILLAS</p><h2>Empieza con una estructura</h2></div><Button variant="secondary" icon="plus" onClick={onNew}>Rutina vacia</Button></div>
      <div className="template-grid">{templates.map((template, index) => <button type="button" key={template.id} className="template-choice" onClick={() => onCreate(template.id)}>
        <span className="template-number">0{index + 1}</span><strong>{template.label}</strong><small>{template.id === "auto" ? `${profile.days} dias, segun tu disponibilidad` : template.id === "5x5" ? "Tres sesiones · foco en fuerza" : template.id === "30 minutos" ? "Cuatro movimientos por dia" : "Programa adaptable a tus dias disponibles"}</small><span className="template-cta">Usar plantilla <Icon name="next" size={16} /></span>
      </button>)}</div>
    </section>
    <div className="section-heading routine-list-heading"><div><p className="eyebrow">TUS PLANES</p><h2>Rutinas guardadas</h2></div><span className="subtle-count">{routines.length} planes</span></div>
    {!routines.length ? <EmptyState title="Tus rutinas apareceran aqui" description="Elige una de las plantillas de arriba o crea una rutina vacia para construir tu propio plan." /> : <div className="routine-list">{routines.map((routine) => {
      const active = routine.id === activeId;
      const block = active ? activeBlock : undefined;
      return <article key={routine.id} className={cx("routine-row", active && "routine-row-active")}>
        <div className="routine-row-mark"><span>{routine.name.slice(0, 1).toUpperCase()}</span></div>
        <div className="routine-row-main"><div className="routine-row-title"><strong>{routine.name}</strong>{active && <span className="active-label">ACTIVA</span>}</div><p>{routine.split} · {routine.days.length} sesiones · creada {formatDate(routine.createdAt)}</p>
          <div className="routine-row-preview">{routine.days.map((day) => <span key={day.id}>{day.name} <small>{day.exercises.length} ejer.</small></span>)}</div>
          {active && block && <><small className="routine-block-copy">Bloque de {block.weeks} semanas · semana {weekIndex(block)}</small><div className="block-editor-controls"><SelectField label="Duracion" value={String(block.weeks)} onChange={(value) => onUpdateBlock({ ...block, weeks: Number(value), deloadWeek: Math.min(block.deloadWeek, Number(value)) })} options={[4, 5, 6, 7, 8].map((value) => ({ value: String(value), label: `${value} semanas` }))} /><SelectField label="Semana de descarga" value={String(block.deloadWeek)} onChange={(value) => onUpdateBlock({ ...block, deloadWeek: Number(value) })} options={Array.from({ length: block.weeks }, (_, index) => ({ value: String(index + 1), label: `Semana ${index + 1}` }))} /></div></>}
          {active && !block && <small className="routine-block-copy">Sin bloque de entrenamiento activo</small>}
        </div>
        <div className="routine-row-actions">{!active && <Button variant="secondary" onClick={() => onSelect(routine)}>Activar</Button>}<Button variant="quiet" icon="edit" ariaLabel={`Editar ${routine.name}`} onClick={() => onEdit(routine)}>Editar</Button><button type="button" className="icon-button" aria-label={`Duplicar ${routine.name}`} onClick={() => onDuplicate(routine)}><Icon name="copy" size={18} /></button><button type="button" className="icon-button danger-icon" aria-label={`Eliminar ${routine.name}`} onClick={() => onDelete(routine)}><Icon name="trash" size={17} /></button></div>
      </article>;
    })}</div>}
    <p className="note-inline"><Icon name="info" size={17} /> Los rangos de volumen semanal son orientativos y deben ajustarse a tu recuperacion, experiencia y preferencias.</p>
    <details className="catalog-coverage"><summary>Como se genera el plan</summary><p>La rutina organiza patrones de empuje, tiron, bisagra, sentadilla, zancada y zona media. Primero propone ejercicios compuestos; luego aislamientos, dentro del equipo que has marcado. Si no hay una opcion compatible con una molestia, el movimiento se omite para que puedas elegir otra variante.</p></details>
  </div>;
}

function NumericPad({ config, onClose }: { config: { title: string; value: number; unit: string; step: number; onSave: (value: number) => void } | null; onClose: () => void }) {
  const [value, setValue] = useState("");
  useEffect(() => { setValue(config?.value ? String(config.value) : ""); }, [config]);
  if (!config) return null;
  const add = (digit: string) => setValue((current) => current.length > 10 ? current : `${current}${digit}`);
  const numericValue = cleanNumber(value);
  const finish = () => { config.onSave(numericValue); onClose(); };
  return <DialogFrame title={config.title} onClose={onClose}>
    <div className="numeric-pad">
      <label className="pad-display"><input type="text" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value.replace(/[^0-9.,]/g, ""))} autoFocus aria-label={config.title} /><span>{config.unit}</span></label>
      <div className="pad-steps">{(config.unit === "reps" ? [1] : [...new Set([config.step, 1, 2.5, 5])]).map((step) => <div key={step} className="pad-step-group"><span>±{formatted(step, 1)}</span><button type="button" onClick={() => setValue(String(Math.max(0, numericValue - step)))} aria-label={`Restar ${step}`}>−</button><button type="button" onClick={() => setValue(String(numericValue + step))} aria-label={`Sumar ${step}`}>+</button></div>)}</div>
      <div className="digit-grid">{["1", "2", "3", "4", "5", "6", "7", "8", "9", ",", "0", "⌫"].map((digit) => <button type="button" key={digit} onClick={() => digit === "⌫" ? setValue((current) => current.slice(0, -1)) : digit === "," ? setValue((current) => current.includes(",") || current.includes(".") ? current : `${current},`) : add(digit)}>{digit}</button>)}</div>
      <div className="sheet-actions"><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={finish}>Guardar valor</Button></div>
    </div>
  </DialogFrame>;
}

function WorkoutSession({ active, profile, settings, catalog, history, onChange, onFinish, onDiscard, onPause, onOpenExercise, onOpenPicker, onAdapt, onKeypad, onToast, onRestFinished }: {
  active: ActiveSession; profile: Profile; settings: Settings; catalog: Exercise[]; history: TrainingSession[];
  onChange: (update: (current: ActiveSession) => ActiveSession) => void; onFinish: () => void; onDiscard: () => void; onPause: () => void;
  onOpenExercise: (exercise: Exercise) => void; onOpenPicker: (index: number) => void; onAdapt: () => void;
  onKeypad: (config: { title: string; value: number; unit: string; step: number; onSave: (value: number) => void }) => void;
  onToast: (message: string) => void; onRestFinished: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [showDiscs, setShowDiscs] = useState(false);
  const [barWeight, setBarWeight] = useState(settings.barWeight);
  const [plateTarget, setPlateTarget] = useState(60);
  const notifiedRest = useRef<number | null>(null);
  const pendingCompletions = useRef(new Set<string>());
  useEffect(() => { const interval = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(interval); }, []);
  useEffect(() => {
    if (!active.restEndsAt) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, active.restEndsAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [active.restEndsAt]);
  const elapsed = elapsedSessionMs(active.startedAt, active.elapsedBeforePause, active.segmentStartedAt, now);
  const targetSets = allTargetSets(active.exercises);
  const doneSets = completedSets(active.exercises);
  const progress = targetSets ? Math.min(100, doneSets / targetSets * 100) : 0;
  const restSeconds = active.restEndsAt ? Math.max(0, Math.ceil((active.restEndsAt - now) / 1000)) : 0;
  const currentExercise = active.exercises[active.currentExercise];
  const discResult = calculatePlates(plateTarget, barWeight, settings.plates);
  const mutateSet = (exerciseIndex: number, setIndex: number, change: Partial<LoggedSet>) => {
    onChange((current) => ({ ...current, exercises: current.exercises.map((exercise, index) => index === exerciseIndex ? { ...exercise, sets: exercise.sets.map((set, nested) => nested === setIndex ? { ...set, ...change } : set) } : exercise) }));
  };
  const completeSet = (exerciseIndex: number, setIndex: number) => {
    const item = active.exercises[exerciseIndex];
    const set = item.sets[setIndex];
    if (!set || set.completed || set.weight < 0 || set.reps < 0) return;
    if (!set.reps) { onToast("Registra al menos una repeticion antes de completar la serie."); return; }
    if (pendingCompletions.current.has(set.id)) return;
    pendingCompletions.current.add(set.id);
    window.setTimeout(() => pendingCompletions.current.delete(set.id), 4000);
    const previous = history.flatMap((session) => session.exercises.filter((entry) => entry.exerciseId === item.exerciseId).flatMap((entry) => entry.sets.filter((log) => log.completed && log.type !== "calentamiento")));
    const highestWeight = Math.max(0, ...previous.map((entry) => entry.weight));
    const highestReps = Math.max(0, ...previous.map((entry) => entry.reps));
    const highestE1rm = Math.max(0, ...previous.map((entry) => estimatedOneRepMax(entry.weight, entry.reps)));
    const e1rm = estimatedOneRepMax(set.weight, set.reps);
    const completedAt = Date.now();
    const recordParts: string[] = [];
    if (set.type !== "calentamiento" && set.weight > highestWeight) recordParts.push("mejor carga");
    if (set.type !== "calentamiento" && set.reps > highestReps) recordParts.push("mas repeticiones");
    if (set.type !== "calentamiento" && e1rm > highestE1rm) recordParts.push("1RM estimado");
    if (recordParts.length) onToast(`Nuevo record personal: ${recordParts.join(" y ")}.`);
    if (settings.vibration && "vibrate" in navigator) navigator.vibrate(18);
    onChange((current) => ({ ...current,
      exercises: current.exercises.map((exercise, index) => index === exerciseIndex ? { ...exercise, sets: exercise.sets.map((itemSet, nested) => nested === setIndex ? { ...itemSet, completed: true, completedAt } : itemSet) } : exercise),
      ...(set.type !== "calentamiento" ? { restEndsAt: completedAt + item.restSec * 1000, restDurationSec: item.restSec } : {}),
    }));
  };
  const updateSessionNote = (notes: string) => onChange((current) => ({ ...current, notes }));
  const scrollToExercise = (index: number) => {
    onChange((current) => ({ ...current, currentExercise: index }));
    document.getElementById(`active-exercise-${index}`)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };
  const finishRest = () => {
    if (notifiedRest.current === active.restEndsAt) return;
    notifiedRest.current = active.restEndsAt;
    if (settings.vibration && "vibrate" in navigator) navigator.vibrate([30, 40, 30]);
    if (settings.sound) {
      try { const context = new AudioContext(); const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.frequency.value = 880; gain.gain.value = 0.035; oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.16); } catch { /* Audio puede no estar disponible en el navegador. */ }
    }
    if (settings.notifications && "Notification" in window && Notification.permission === "granted") {
      if (navigator.serviceWorker?.controller) void navigator.serviceWorker.ready.then((registration) => registration.showNotification("Descanso terminado", { body: "Cuando estes listo, continua con tu siguiente serie.", tag: "manteyym-descanso" }));
      else new Notification("Descanso terminado", { body: "Cuando estes listo, continua con tu siguiente serie." });
    }
    onToast("Descanso terminado.");
    onRestFinished();
  };
  useEffect(() => { if (active.restEndsAt && now >= active.restEndsAt) finishRest(); }, [now, active.restEndsAt]);

  return <div className="workout-screen">
    <div className="workout-topbar"><button type="button" className="brand-lockup" onClick={() => onPause()} aria-label="Pausar entrenamiento"><span className="brand-mark"><Icon name="exercises" size={19} /></span><strong>ManteYym</strong></button><span className="live-indicator"><i /> ENTRENAMIENTO ACTIVO</span><button type="button" className="icon-button" aria-label="Terminar sesion" onClick={onFinish}><Icon name="close" /></button></div>
    <div className="workout-layout"><main className="workout-main">
      <div className="workout-heading"><div><p className="eyebrow">{active.status === "paused" ? "SESION EN PAUSA" : "SESION EN CURSO"}</p><h1>{active.dayName}</h1><p>Iniciada {formatClock(active.startedAt)} · {formatDate(active.startedAt, { day: "numeric", month: "short" })}</p></div><div className="workout-clock"><span>TIEMPO</span><strong>{formatDuration(elapsed)}</strong></div></div>
      <div className="session-progress"><div><span>{doneSets} de {targetSets} series</span><span>{Math.round(progress)}%</span></div><div className="progress-track"><i style={{ width: `${progress}%` }} /></div></div>
      {active.status === "paused" && <div className="paused-banner"><Icon name="pause" size={18} /><span>La sesion esta pausada. El cronometro se reanuda desde donde quedo.</span><Button variant="secondary" onClick={onPause}>Reanudar</Button></div>}
      <div className="workout-tools"><Button variant="quiet" icon="swap" onClick={onAdapt}>Adaptar mi sesion</Button><Button variant="quiet" icon="weight" onClick={() => setShowDiscs(!showDiscs)}>Calculadora de discos</Button><Button variant="quiet" icon={active.status === "running" ? "pause" : "play"} onClick={onPause}>{active.status === "running" ? "Pausar" : "Reanudar"}</Button></div>
      {showDiscs && <section className="plate-panel"><div className="section-heading compact"><div><p className="eyebrow">CALCULADORA DE BARRA</p><h3>Discos por lado</h3></div><button type="button" className="icon-button" onClick={() => setShowDiscs(false)} aria-label="Cerrar calculadora"><Icon name="close" /></button></div><div className="plate-inputs"><Field label="Peso objetivo" type="number" step={0.5} value={plateTarget} onChange={(value) => setPlateTarget(Math.max(0, cleanNumber(value)))} suffix={profile.units} /><Field label="Peso de la barra" type="number" step={0.5} value={barWeight} onChange={(value) => setBarWeight(Math.max(0, cleanNumber(value)))} suffix={profile.units} /></div><div className="plate-result"><span>CADA LADO</span><strong>{discResult.eachSide.length ? discResult.eachSide.map((plate) => formatted(plate)).join(" + ") : "Sin discos"}</strong><small>Carga real: {formatted(discResult.actual)} {profile.units}{discResult.remainder > 0 ? ` · faltan ${formatted(discResult.remainder)} ${profile.units}` : ""}</small></div></section>}
      <div className="workout-exercises">{active.exercises.length ? active.exercises.map((item, exerciseIndex) => {
        const exercise = catalog.find((entry) => entry.id === item.exerciseId);
        const range = [item.repsMin, item.repsMax] as [number, number];
        const suggestion = suggestProgression(history, item.exerciseId, profile.progression, range, profile.units);
        const stalled = detectStagnation(history, item.exerciseId);
        return <article key={`${item.exerciseId}-${exerciseIndex}`} id={`active-exercise-${exerciseIndex}`} className={cx("session-exercise", active.currentExercise === exerciseIndex && "session-exercise-current")}>
          <div className="session-exercise-head"><div className="exercise-order">{String(exerciseIndex + 1).padStart(2, "0")}</div><button type="button" className="session-exercise-title" onClick={() => exercise && onOpenExercise(exercise)}><strong>{exercise?.name ?? "Ejercicio eliminado"}</strong><small>{exercise ? `${MUSCLE_LABELS[exercise.muscle]} · ${item.sets.length} / ${item.targetSets} series` : ""}</small></button><button type="button" className="icon-button" aria-label="Cambiar ejercicio" onClick={() => onOpenPicker(exerciseIndex)}><Icon name="swap" /></button><button type="button" className="icon-button" aria-label="Ver detalles del ejercicio" onClick={() => exercise && onOpenExercise(exercise)}><Icon name="info" /></button></div>
          {item.superset && <span className="superset-tag">{item.groupType === "circuito" ? "Circuito" : "Superserie"} {item.superset}</span>}
          <div className="suggestion-line"><Icon name="target" size={16} /><span>Sugerencia: {suggestion.weight ? `${formatted(suggestion.weight)} ${profile.units} · ` : ""}{suggestion.reps} reps. {suggestion.reason}</span></div>
          {stalled && <div className="stall-notice"><Icon name="info" size={16} /><span>Tres sesiones sin progreso. Prueba un deload, otra variante o mas descanso.</span></div>}
          {item.note && <p className="exercise-note">{item.note}</p>}
          <div className="set-table-head"><span>SERIE</span><span>CARGA</span><span>REPS</span><span>TIPO</span><span>LISTO</span></div>
          {item.sets.map((set, setIndex) => <div key={set.id} className={cx("set-row", set.completed && "set-row-complete")}>
            <span className="set-number">{String(setIndex + 1).padStart(2, "0")}</span>
            <button type="button" className="number-control" onClick={() => onKeypad({ title: "Carga de la serie", value: set.weight, unit: profile.units, step: profile.units === "kg" ? 2.5 : 5, onSave: (weight) => mutateSet(exerciseIndex, setIndex, { weight }) })}><strong>{formatted(set.weight)}</strong><small>{profile.units}</small></button>
            <button type="button" className="number-control" onClick={() => onKeypad({ title: "Repeticiones", value: set.reps, unit: "reps", step: 1, onSave: (reps) => mutateSet(exerciseIndex, setIndex, { reps: Math.max(0, Math.round(reps)) }) })}><strong>{set.reps}</strong><small>reps</small></button>
            <select className="set-type-select" aria-label="Tipo de serie" value={set.type} onChange={(event) => mutateSet(exerciseIndex, setIndex, { type: event.target.value as LoggedSet["type"] })}>
              <option value="normal">Normal</option><option value="calentamiento">Aproximacion</option><option value="fallo">Al fallo</option><option value="descendente">Drop set</option>
            </select>
            <button type="button" className={cx("set-check", set.completed && "set-check-complete")} aria-label={set.completed ? "Serie completada" : "Completar serie"} disabled={set.completed} onClick={() => completeSet(exerciseIndex, setIndex)}><Icon name="check" size={18} /></button>
            <details className="set-extra"><summary>RIR, RPE y nota</summary><div className="set-extra-fields"><SelectField label="RIR" value={String(set.rir ?? "")} onChange={(value) => mutateSet(exerciseIndex, setIndex, { rir: value === "" ? null : Number(value) })} options={[{ value: "", label: "Sin dato" }, ...[0, 1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: `${value} en reserva` }))]} /><SelectField label="RPE" value={String(set.rpe ?? "")} onChange={(value) => mutateSet(exerciseIndex, setIndex, { rpe: value === "" ? null : Number(value) })} options={[{ value: "", label: "Sin dato" }, ...[6, 7, 8, 9, 10].map((value) => ({ value: String(value), label: String(value) }))]} /><Field label="Nota de serie" value={set.note} onChange={(note) => mutateSet(exerciseIndex, setIndex, { note })} placeholder="Nota opcional" /></div></details>
          </div>)}
          <Button variant="quiet" icon="plus" onClick={() => onChange((current) => ({ ...current, exercises: current.exercises.map((entry, index) => index === exerciseIndex ? { ...entry, targetSets: entry.targetSets + 1, sets: [...entry.sets, { id: makeId("set"), weight: entry.sets.at(-1)?.weight ?? 0, reps: entry.repsMin, type: "normal", rir: null, rpe: null, note: "", completed: false }] } : entry) }))}>Anadir serie</Button>
        </article>;
      }) : <EmptyState title="La sesion esta vacia" description="Puedes adaptar la sesion o volver a la rutina para anadir ejercicios." />}</div>
      <div className="session-notes"><Field label="Notas de la sesion" value={active.notes} onChange={updateSessionNote} multiline placeholder="Como te sentiste, tecnica o cualquier observacion" /></div>
      <div className="session-bottom-actions"><Button variant="quiet" onClick={onDiscard}>Descartar sesion</Button><Button variant="primary" icon="check" onClick={onFinish}>Finalizar entrenamiento</Button></div>
    </main>
    <aside className="workout-rail"><div className="rail-clock"><span>TIEMPO TRANSCURRIDO</span><strong>{formatDuration(elapsed)}</strong><small>Inicio {formatClock(active.startedAt)} · {active.timeZone}</small></div><div className="rail-progress"><div className="rail-progress-copy"><span>PROGRESO</span><strong>{doneSets}<small> / {targetSets}</small></strong></div><div className="progress-track"><i style={{ width: `${progress}%` }} /></div></div><div className="rail-exercise-list"><span className="eyebrow">EJERCICIOS</span>{active.exercises.map((item, index) => <button type="button" key={`${item.exerciseId}-rail`} onClick={() => scrollToExercise(index)} className={cx(active.currentExercise === index && "rail-exercise-active")}><span>{String(index + 1).padStart(2, "0")}</span><strong>{exerciseName(catalog, item.exerciseId)}</strong><small>{item.sets.filter((set) => set.completed).length}/{item.targetSets}</small></button>)}</div></aside>
    </div>
    {active.restEndsAt && <div className="rest-bar" aria-live="polite"><div className="rest-ring" style={{ background: `conic-gradient(var(--accent) ${Math.max(0, 1 - restSeconds / Math.max(1, active.restDurationSec)) * 360}deg, var(--surface-3) 0deg)` }}><span>{formatDuration(restSeconds * 1000).slice(3)}</span></div><div><span className="eyebrow">DESCANSO · {currentExercise ? exerciseName(catalog, currentExercise.exerciseId) : "SERIE"}</span><strong>{restSeconds ? `Quedan ${restSeconds} s` : "Listo para continuar"}</strong></div><button type="button" className="rest-skip" onClick={() => onChange((current) => ({ ...current, restEndsAt: null }))}>Omitir descanso</button></div>}
  </div>;
}

function PhotoTile({ photo, onDelete }: { photo: { id: string; at: number; label: string; blob?: Blob }; onDelete: () => void }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    if (!photo.blob) return;
    const url = URL.createObjectURL(photo.blob);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [photo.blob]);
  return <article className="photo-tile">{source ? <img src={source} alt={photo.label || `Progreso del ${formatDate(photo.at)}`} /> : <div className="photo-missing"><Icon name="image" size={24} /><span>Vista no disponible</span></div>}<div><span>{photo.label || "Progreso"}</span><small>{formatDate(photo.at, { day: "numeric", month: "short", year: "numeric" })}</small></div><button type="button" className="icon-button danger-icon" aria-label="Eliminar foto" onClick={onDelete}><Icon name="trash" size={17} /></button></article>;
}

function ProgressScreen({ profile, sessions, catalog, metrics, injuries, goals, cardio, photos, onOpenExercise, onAddMetric, onAddInjury, onDeleteInjury, onAddGoal, onDeleteGoal, onAddCardio, onAddPhoto, onDeletePhoto }: {
  profile: Profile; sessions: TrainingSession[]; catalog: Exercise[]; metrics: BodyMetric[]; injuries: Injury[]; goals: GoalRecord[]; cardio: { id: string; type: string; minutes: number; intensity: number; at: number }[];
  photos: { id: string; at: number; label: string; blob?: Blob }[]; onOpenExercise: (exercise: Exercise) => void;
  onAddMetric: (metric: BodyMetric) => Promise<void>; onAddInjury: (injury: Injury) => Promise<void>; onDeleteInjury: (injury: Injury) => Promise<void>;
  onAddGoal: (goal: GoalRecord) => Promise<void>; onDeleteGoal: (goal: GoalRecord) => Promise<void>;
  onAddCardio: (record: { id: string; type: string; minutes: number; intensity: number; at: number }) => Promise<void>;
  onAddPhoto: (file: File, label: string) => Promise<void>; onDeletePhoto: (id: string) => Promise<void>;
}) {
  const [rangeWeeks, setRangeWeeks] = useState(12);
  const [selectedExercise, setSelectedExercise] = useState(catalog[0]?.id ?? "");
  const [metricType, setMetricType] = useState("peso");
  const [bodyValues, setBodyValues] = useState({ weight: "", waist: "", chest: "", hip: "" });
  const [injuryZone, setInjuryZone] = useState("hombro");
  const [injuryNote, setInjuryNote] = useState("");
  const [pain, setPain] = useState(2);
  const [goalExercise, setGoalExercise] = useState(catalog[0]?.id ?? "");
  const [goalTarget, setGoalTarget] = useState("");
  const [cardioType, setCardioType] = useState("Caminata");
  const [cardioMinutes, setCardioMinutes] = useState("20");
  const [cardioIntensity, setCardioIntensity] = useState(3);
  const [photoLabel, setPhotoLabel] = useState("");
  const [activeArea, setActiveArea] = useState("Cadera");
  const weeklyVolume = volumeByMuscle(sessions, catalog, Date.now() - 7 * DAY_MS);
  const targets = volumeTargets(profile);
  const selected = catalog.find((exercise) => exercise.id === selectedExercise);
  const recentSessions = [...sessions].filter((session) => session.endedAt >= Date.now() - rangeWeeks * 7 * DAY_MS).sort((a, b) => a.endedAt - b.endedAt);
  const chartEntries = recentSessions.map((session) => {
    const found = session.exercises.find((item) => item.exerciseId === selectedExercise);
    const sets = found?.sets.filter((set) => set.completed && set.type !== "calentamiento") ?? [];
    const values = metricType === "peso" ? sets.map((set) => set.weight)
      : metricType === "e1rm" ? sets.map((set) => estimatedOneRepMax(set.weight, set.reps))
        : metricType === "volumen" ? [sets.reduce((sum, set) => sum + set.weight * set.reps, 0)] : [sets.length ? 1 : 0];
    return { session, value: values.length ? metricType === "volumen" ? values[0] : Math.max(...values) : 0 };
  }).filter((item) => item.value > 0);
  const lastSessions = sessions.filter((session) => session.endedAt >= weekStart());
  const belowTargets = MUSCLES.filter((muscle) => weeklyVolume[muscle] > 0 && weeklyVolume[muscle] < targets[muscle] * 0.6);
  const exerciseStalls = catalog.filter((exercise) => detectStagnation(sessions, exercise.id)).slice(0, 3);
  const lastMetrics = [...metrics].sort((a, b) => b.at - a.at);
  const injuryList = [...new Map([...profile.injuries, ...injuries].map((injury) => [injury.id, injury])).values()];
  const currentMonth = new Date();
  const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const dayOffset = (monthStart.getDay() + 6) % 7;
  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const dateKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const sessionCountByDate = new Map<string, number>();
  sessions.forEach((session) => { const date = new Date(session.startedAt); const key = dateKey(date); sessionCountByDate.set(key, (sessionCountByDate.get(key) ?? 0) + 1); });
  const calendarDays = [...Array(dayOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  const mobility = {
    "Cadera": "Movilidad suave de cadera: 2 rondas de 6 rotaciones controladas por lado.",
    "Hombros": "Deslizamientos de brazos en pared y rotaciones suaves, 2 rondas de 8 repeticiones.",
    "Tobillos": "Moviliza el tobillo hacia delante con el talon apoyado, 2 rondas de 8 por lado.",
    "Torax": "Rotacion toracica en cuadrupedia, 2 rondas de 6 por lado sin forzar.",
  };
  const submitMetric = async (event: FormEvent) => {
    event.preventDefault();
    const metric: BodyMetric = { id: makeId("metric"), at: Date.now(), ...(bodyValues.weight ? { weight: cleanNumber(bodyValues.weight) } : {}), ...(bodyValues.waist ? { waist: cleanNumber(bodyValues.waist) } : {}), ...(bodyValues.chest ? { chest: cleanNumber(bodyValues.chest) } : {}), ...(bodyValues.hip ? { hip: cleanNumber(bodyValues.hip) } : {}) };
    if (Object.keys(metric).length <= 2) return;
    await onAddMetric(metric); setBodyValues({ weight: "", waist: "", chest: "", hip: "" });
  };
  const submitInjury = async (event: FormEvent) => {
    event.preventDefault();
    const injury = { id: makeId("injury"), zone: injuryZone, note: injuryNote.trim(), pain, createdAt: Date.now() };
    await onAddInjury(injury); setInjuryNote("");
  };
  const submitGoal = async (event: FormEvent) => {
    event.preventDefault();
    if (!goalExercise || cleanNumber(goalTarget) <= 0) return;
    await onAddGoal({ id: makeId("goal"), exerciseId: goalExercise, target: cleanNumber(goalTarget), units: profile.units, createdAt: Date.now() });
    setGoalTarget("");
  };
  const submitCardio = async (event: FormEvent) => {
    event.preventDefault();
    if (cleanNumber(cardioMinutes) <= 0) return;
    await onAddCardio({ id: makeId("cardio"), type: cardioType, minutes: cleanNumber(cardioMinutes), intensity: cardioIntensity, at: Date.now() });
    setCardioMinutes("20");
  };
  const handlePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { event.target.value = ""; return; }
    if (file.size > 12 * 1024 * 1024) { event.target.value = ""; return; }
    await onAddPhoto(file, photoLabel.trim()); setPhotoLabel(""); event.target.value = "";
  };
  const weeklyCoachNote = lastSessions.length < Math.max(1, Math.round(profile.days * 0.5))
    ? "El cumplimiento de esta semana esta por debajo de la mitad de las sesiones previstas. Prioriza una frecuencia que puedas sostener."
    : belowTargets.length ? `Volumen reciente bajo en ${belowTargets.map((muscle) => MUSCLE_LABELS[muscle]).join(", ")}. Revisa si quieres añadir una serie en la proxima semana.`
      : exerciseStalls.length ? `Sin progreso en ${exerciseStalls.map((exercise) => exercise.name).join(", ")}. Considera una descarga o cambiar la variante.`
        : "Semana consistente. Mantén el plan si recuperas bien y las repeticiones conservan buena tecnica.";
  const goalProgress = (goal: GoalRecord) => {
    const best = Math.max(0, ...sessions.flatMap((session) => session.exercises.filter((item) => item.exerciseId === goal.exerciseId).flatMap((item) => item.sets.filter((set) => set.completed).map((set) => set.weight))));
    const ratio = Math.min(100, goal.target ? best / goal.target * 100 : 0);
    const first = [...sessions].reverse().find((session) => session.exercises.some((item) => item.exerciseId === goal.exerciseId));
    const mostRecent = sessions.find((session) => session.exercises.some((item) => item.exerciseId === goal.exerciseId));
    const firstBest = first ? Math.max(0, ...first.exercises.filter((item) => item.exerciseId === goal.exerciseId).flatMap((item) => item.sets.filter((set) => set.completed).map((set) => set.weight))) : 0;
    const slope = first && mostRecent && mostRecent.endedAt > first.endedAt ? (best - firstBest) / Math.max(1, (mostRecent.endedAt - first.endedAt) / (7 * DAY_MS)) : 0;
    const eta = slope > 0 && goal.target > best ? new Date(Date.now() + ((goal.target - best) / slope) * 7 * DAY_MS) : null;
    return { best, ratio, eta };
  };
  return <div className="screen">
    <div className="page-intro"><p className="eyebrow">CONSTANCIA, NO PERFECCION</p><h1>Progreso</h1><p>Una lectura de tu entrenamiento. Las estimaciones se basan solo en los registros que guardas aqui.</p></div>
    <section className="coach-review"><div className="coach-review-icon"><Icon name="activity" size={20} /></div><div><p className="eyebrow">REVISION SEMANAL</p><h2>{lastSessions.length} sesiones esta semana</h2><p>{weeklyCoachNote}</p></div><span className="review-status">REGLAS LOCALES</span></section>
    <div className="progress-columns">
      <section className="progress-volume"><div className="section-heading"><div><p className="eyebrow">ULTIMOS 7 DIAS</p><h2>Volumen por grupo muscular</h2></div><span className="subtle-count">Series efectivas</span></div>
        <div className="volume-display"><div className="volume-bars"><BarChart values={weeklyVolume} targets={targets} /></div><div className="body-map-column"><BodyMap values={weeklyVolume} /><small>Volumen orientativo. Las series secundarias cuentan parcialmente.</small></div></div>
        <p className="note-inline"><Icon name="info" size={17} /> Como referencia general, el plan usa rangos orientativos de 8 a 20 series efectivas por semana en musculos grandes; no son una prescripcion universal.</p>
      </section>
      <aside className="recovery-panel"><p className="eyebrow">LECTURA ESTIMADA</p><h2>Fatiga y recuperacion</h2><p>Estimacion por el volumen reciente, no una medicion fisiologica.</p>{["pecho", "espalda", "cuadriceps", "isquiotibiales", "hombros"].map((key) => {
        const muscle = key as Muscle; const sets = weeklyVolume[muscle]; const target = targets[muscle];
        const label = sets === 0 ? "Sin carga reciente" : sets >= target * 1.25 ? "Carga alta" : sets >= target * 0.55 ? "En rango orientativo" : "Carga baja";
        const width = Math.min(100, sets / Math.max(target, 1) * 100);
        return <div className="recovery-row" key={key}><div><span>{MUSCLE_LABELS[muscle]}</span><small>{label}</small></div><div className="recovery-track"><i style={{ width: `${width}%` }} /></div><strong>{sets}</strong></div>;
      })}</aside>
    </div>

    <section className="progress-chart-section"><div className="section-heading"><div><p className="eyebrow">TENDENCIA DE EJERCICIO</p><h2>{selected?.name ?? "Elige un ejercicio"}</h2></div><button type="button" className="text-action" onClick={() => selected && onOpenExercise(selected)}>Abrir ficha <Icon name="next" size={16} /></button></div>
      <div className="chart-controls"><SelectField label="Ejercicio" value={selectedExercise} onChange={setSelectedExercise} options={catalog.slice(0, 160).map((exercise) => ({ value: exercise.id, label: exercise.name }))} /><SelectField label="Dato" value={metricType} onChange={setMetricType} options={[{ value: "peso", label: "Peso maximo" }, { value: "e1rm", label: "1RM estimado" }, { value: "volumen", label: "Volumen" }, { value: "frecuencia", label: "Frecuencia" }]} /><div className="range-control" aria-label="Rango de tiempo">{[4, 12, 52].map((weeks) => <button type="button" key={weeks} className={rangeWeeks === weeks ? "active-range" : ""} aria-pressed={rangeWeeks === weeks} onClick={() => setRangeWeeks(weeks)}>{weeks} sem.</button>)}</div></div>
      <LineChart values={chartEntries.map((entry) => entry.value)} labels={chartEntries.map((entry) => formatDate(entry.session.endedAt))} unit={metricType === "frecuencia" ? " sesion" : metricType === "volumen" ? ` ${profile.units}` : ` ${profile.units}`} />
      {metricType === "e1rm" && <p className="muted-copy">Estimacion de Epley basada en series registradas. No representa un intento de maximo real.</p>}
    </section>

    <section className="calendar-section"><div className="section-heading"><div><p className="eyebrow">REGISTRO</p><h2>Calendario de entrenamiento</h2></div><span>{new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(currentMonth)}</span></div>
      <div className="calendar-grid">{["L", "M", "X", "J", "V", "S", "D"].map((day) => <span className="calendar-weekday" key={day}>{day}</span>)}{calendarDays.map((day, index) => {
        if (!day) return <span className="calendar-empty" key={`blank-${index}`} />;
        const key = dateKey(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day));
        const count = sessionCountByDate.get(key) ?? 0;
        return <div key={day} className={cx("calendar-day", count > 0 && "calendar-day-trained", day === currentMonth.getDate() && "calendar-day-today")} title={count ? `${count} sesiones registradas` : undefined}><span>{day}</span>{count > 0 && <i />}</div>;
      })}</div>
      <div className="session-history-list">{sessions.slice(0, 8).map((session) => <article className="history-session" key={session.id}><div className="history-date"><strong>{formatDate(session.startedAt, { day: "numeric" })}</strong><small>{formatDate(session.startedAt, { month: "short" })}</small></div><div><strong>{session.dayName}</strong><small>{formatClock(session.startedAt)} - {formatClock(session.endedAt)} · {formatDuration(session.durationMs)}</small></div><span>{formatted(session.volume, 0)} {profile.units}</span></article>)}{!sessions.length && <p className="muted-copy">Tu calendario se llenara con tus sesiones finalizadas.</p>}</div>
    </section>

    <div className="tracking-grid"><section className="tracking-panel"><div className="section-heading"><div><p className="eyebrow">MEDICIONES CORPORALES</p><h2>Seguimiento, sin dieta</h2></div><Icon name="user" /></div><p className="muted-copy">Opcional. Solo se guarda en tu dispositivo.</p>
        <form className="tracking-form" onSubmit={(event) => void submitMetric(event)}><Field label="Peso corporal" type="number" step={0.1} value={bodyValues.weight} onChange={(weight) => setBodyValues({ ...bodyValues, weight })} suffix={profile.units} /><Field label="Cintura" type="number" step={0.1} value={bodyValues.waist} onChange={(waist) => setBodyValues({ ...bodyValues, waist })} suffix={profile.units} /><Field label="Pecho" type="number" step={0.1} value={bodyValues.chest} onChange={(chest) => setBodyValues({ ...bodyValues, chest })} suffix={profile.units} /><Field label="Cadera" type="number" step={0.1} value={bodyValues.hip} onChange={(hip) => setBodyValues({ ...bodyValues, hip })} suffix={profile.units} /><Button variant="secondary" type="submit">Guardar medicion</Button></form>
        {lastMetrics.slice(0, 5).map((metric) => <div className="metric-history-row" key={metric.id}><span>{formatDate(metric.at, { day: "numeric", month: "short" })}</span><span>{metric.weight ? `${formatted(metric.weight)} ${profile.units}` : ""}</span><small>{metric.waist ? `Cintura ${formatted(metric.waist)} ${profile.units}` : ""}</small></div>)}
      </section>
      <section className="tracking-panel"><div className="section-heading"><div><p className="eyebrow">MOLESTIAS</p><h2>Registro de zona</h2></div><Icon name="heart" /></div><p className="muted-copy">El plan evita ejercicios que coincidan con esta zona. No es una herramienta de diagnostico.</p>
        <form className="tracking-form" onSubmit={(event) => void submitInjury(event)}><SelectField label="Zona" value={injuryZone} onChange={setInjuryZone} options={INJURY_ZONES.map((zone) => ({ value: zone, label: zone }))} /><Field label="Nota opcional" value={injuryNote} onChange={setInjuryNote} placeholder="Describe la molestia sin datos sensibles" /><SelectField label="Molestia percibida" value={String(pain)} onChange={(value) => setPain(Number(value))} options={[1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: `${value} de 5` }))} /><Button variant="secondary" type="submit">Guardar zona</Button></form>
        {injuryList.map((injury) => <div className="injury-row" key={injury.id}><div><strong>{injury.zone}</strong><small>{injury.note || `Nivel indicado: ${injury.pain} de 5`}</small>{injury.pain >= 4 && <small className="error-copy">Si el dolor persiste, consulta a un profesional de la salud.</small>}</div><button type="button" className="icon-button danger-icon" aria-label={`Eliminar registro de ${injury.zone}`} onClick={() => void onDeleteInjury(injury)}><Icon name="trash" size={17} /></button></div>)}
      </section></div>

    <div className="tracking-grid"><section className="tracking-panel"><div className="section-heading"><div><p className="eyebrow">OBJETIVOS MEDIBLES</p><h2>Una meta concreta</h2></div><Icon name="target" /></div>
        <form className="tracking-form" onSubmit={(event) => void submitGoal(event)}><SelectField label="Ejercicio" value={goalExercise} onChange={setGoalExercise} options={catalog.slice(0, 200).map((exercise) => ({ value: exercise.id, label: exercise.name }))} /><Field label="Carga objetivo" type="number" step={0.5} value={goalTarget} onChange={setGoalTarget} suffix={profile.units} /><Button variant="secondary" type="submit">Anadir objetivo</Button></form>
        {goals.map((goal) => { const progress = goalProgress(goal); return <div className="goal-row" key={goal.id}><div className="goal-heading"><div><strong>{exerciseName(catalog, goal.exerciseId)}</strong><small>{formatted(progress.best)} / {formatted(goal.target)} {goal.units}</small></div><button type="button" className="icon-button danger-icon" aria-label="Eliminar objetivo" onClick={() => void onDeleteGoal(goal)}><Icon name="trash" size={17} /></button></div><div className="progress-track"><i style={{ width: `${progress.ratio}%` }} /></div><small>{progress.eta ? `Proyeccion lineal orientativa: ${formatDate(progress.eta.getTime(), { month: "long", year: "numeric" })}. La tendencia puede cambiar.` : "Sin tendencia suficiente para estimar una fecha."}</small></div>; })}
      </section>
      <section className="tracking-panel"><div className="section-heading"><div><p className="eyebrow">ACONDICIONAMIENTO</p><h2>Cardio registrado</h2></div><Icon name="activity" /></div>
        <form className="tracking-form" onSubmit={(event) => void submitCardio(event)}><SelectField label="Modalidad" value={cardioType} onChange={setCardioType} options={["Caminata", "Bicicleta", "Carrera", "Remo", "Otro"].map((item) => ({ value: item, label: item }))} /><Field label="Duracion" type="number" min={1} value={cardioMinutes} onChange={setCardioMinutes} suffix="min" /><SelectField label="Intensidad percibida" value={String(cardioIntensity)} onChange={(value) => setCardioIntensity(Number(value))} options={[1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: `${value} de 5` }))} /><Button variant="secondary" type="submit">Guardar cardio</Button></form>
        {cardio.slice(0, 5).map((record) => <div className="cardio-row" key={record.id}><div><strong>{record.type}</strong><small>{formatDate(record.at, { day: "numeric", month: "short" })} · intensidad {record.intensity}/5</small></div><span>{record.minutes} min</span></div>)}
      </section></div>

    <div className="tracking-grid"><section className="tracking-panel"><div className="section-heading"><div><p className="eyebrow">MOVILIDAD</p><h2>Unos minutos de movimiento</h2></div><Icon name="activity" /></div><SelectField label="Zona de movilidad" value={activeArea} onChange={setActiveArea} options={Object.keys(mobility).map((area) => ({ value: area, label: area }))} /><p className="mobility-copy">{mobility[activeArea as keyof typeof mobility]}</p><small>Guia general, no terapeutica. Mantente en un rango comodo y suspende ante dolor.</small></section>
      <section className="tracking-panel"><div className="section-heading"><div><p className="eyebrow">FOTOS PRIVADAS</p><h2>Solo en este dispositivo</h2></div><Icon name="image" /></div><Field label="Etiqueta opcional" value={photoLabel} onChange={setPhotoLabel} placeholder="Ejemplo: vista frontal" /><label className="upload-trigger"><Icon name="plus" size={17} /><span>Guardar foto de progreso</span><input type="file" accept="image/*" capture="environment" onChange={(event) => void handlePhoto(event)} /></label><p className="muted-copy">Archivos de imagen hasta 12 MB. Las fotos entran en el respaldo JSON.</p>
        {photos.length > 0 && <div className="photo-comparison"><span className="eyebrow">COMPARACION LADO A LADO · RECIENTES</span><div>{photos.slice(0, 2).map((photo) => <PhotoTile key={photo.id} photo={photo} onDelete={() => void onDeletePhoto(photo.id)} />)}</div></div>}
      </section></div>
  </div>;
}

function SwitchRow({ title, description, checked, onChange }: { title: string; description?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="switch-row"><span><strong>{title}</strong>{description && <small>{description}</small>}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i aria-hidden="true" /></label>;
}

function SettingsScreen({ profile, settings, lastBackupAt, persistent, storageUsage, onProfile, onSaveSettings, onExport, onImport, onClear, onInstall, installAvailable, onToast }: {
  profile: Profile; settings: Settings; lastBackupAt: number; persistent: boolean | null; storageUsage: { usage?: number; quota?: number } | null;
  onProfile: () => void; onSaveSettings: (settings: Settings) => Promise<void>; onExport: () => void; onImport: () => void; onClear: () => void;
  onInstall: () => void; installAvailable: boolean; onToast: (message: string) => void;
}) {
  const [plates, setPlates] = useState(settings.plates.join(", "));
  const [editingPlates, setEditingPlates] = useState(false);
  useEffect(() => setPlates(settings.plates.join(", ")), [settings.plates]);
  const change = (patch: Partial<Settings>) => void onSaveSettings({ ...settings, ...patch });
  const savePlates = async () => {
    const values = plates.split(",").map((value) => cleanNumber(value.trim())).filter((value) => value > 0);
    await onSaveSettings({ ...settings, plates: values.sort((a, b) => b - a) }); setEditingPlates(false);
  };
  const toggleNotifications = async (enabled: boolean) => {
    if (!enabled) { await change({ notifications: false }); return; }
    if (!("Notification" in window)) { onToast("Este navegador no admite notificaciones."); return; }
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") { onToast("Permiso de notificaciones no concedido."); return; }
    await change({ notifications: true });
  };
  const storagePercent = storageUsage?.quota ? Math.min(100, Math.round((storageUsage.usage ?? 0) / storageUsage.quota * 100)) : 0;
  return <div className="screen settings-screen">
    <div className="page-intro"><p className="eyebrow">TU CONFIGURACION</p><h1>Ajustes</h1><p>Tu perfil, tus preferencias y la seguridad de tus datos locales.</p></div>
    <section className="settings-section"><div className="section-heading"><div><p className="eyebrow">PERFIL DE ENTRENAMIENTO</p><h2>Una configuracion personal</h2></div><Icon name="user" /></div><div className="profile-summary"><div><strong>{GOALS.find((goal) => goal.value === profile.goal)?.title}</strong><span>{profile.level} · {profile.days} dias · {profile.minutes} min · {profile.units}</span><small>{profile.equipment.join(", ")}</small></div><Button variant="secondary" icon="edit" onClick={onProfile}>Editar cuestionario</Button></div><p className="muted-copy">Cambiar tu perfil no modifica las rutinas guardadas. Usa el generador cuando quieras crear una nueva.</p></section>

    <div className="settings-columns"><section className="settings-section"><div className="section-heading"><div><p className="eyebrow">APARIENCIA</p><h2>Interfaz</h2></div></div><div className="theme-picker" role="group" aria-label="Tema visual">{(["dark", "light"] as const).map((theme) => <button type="button" key={theme} className={cx("theme-choice", settings.theme === theme && "theme-choice-active")} aria-pressed={settings.theme === theme} onClick={() => void change({ theme })}><span className={`theme-swatch theme-swatch-${theme}`} /><strong>{theme === "dark" ? "Oscuro" : "Claro"}</strong><small>{theme === "dark" ? "Refinado y bajo en luz" : "Alto contraste"}</small></button>)}</div></section>
      <section className="settings-section"><div className="section-heading"><div><p className="eyebrow">ENTRENAMIENTO</p><h2>Pesos y descansos</h2></div></div><div className="setting-fields"><Field label="Descanso por defecto" type="number" min={15} max={600} step={15} value={settings.defaultRest} suffix="seg" onChange={(value) => void change({ defaultRest: Math.max(15, cleanNumber(value)) })} /><Field label="Peso de la barra" type="number" min={0} step={0.5} value={settings.barWeight} suffix={profile.units} onChange={(value) => void change({ barWeight: Math.max(0, cleanNumber(value)) })} /></div><p className="muted-copy">El descanso del plan se ajusta por ejercicio; este valor se usa como alternativa cuando no hay uno definido.</p><div className="plate-config"><span>Discos disponibles · {profile.units} · repite un valor si tienes varios pares</span>{editingPlates ? <div className="inline-actions"><Field label="Lista de discos" value={plates} onChange={setPlates} placeholder="25, 20, 15, 10, 5, 2.5" /><Button variant="secondary" onClick={() => void savePlates()}>Guardar</Button></div> : <div className="plate-values"><strong>{settings.plates.join(" · ")}</strong><button type="button" className="text-action" onClick={() => setEditingPlates(true)}>Editar lista</button></div>}</div></section></div>

    <section className="settings-section"><div className="section-heading"><div><p className="eyebrow">MICROINTERACCIONES</p><h2>Preferencias de sesion</h2></div></div><SwitchRow title="Sonido al terminar el descanso" description="Un aviso breve usando Web Audio cuando el navegador lo permite." checked={settings.sound} onChange={(sound) => void change({ sound })} /><SwitchRow title="Vibracion" description="Vibracion sutil en dispositivos compatibles." checked={settings.vibration} onChange={(vibration) => void change({ vibration })} /><SwitchRow title="Notificaciones durante la sesion" description="Solo mientras la PWA esta abierta o el navegador permite actividad en segundo plano." checked={settings.notifications} onChange={(enabled) => void toggleNotifications(enabled)} />
      <div className="local-reminder"><SwitchRow title="Recordatorio local con la app abierta" description="Comprueba el horario mientras ManteYym esta abierta. No funciona como alarma fiable en segundo plano." checked={settings.reminders} onChange={(reminders) => void change({ reminders })} /><div className="reminder-settings"><Field label="Hora local" type="time" value={settings.reminderTime} onChange={(reminderTime) => void change({ reminderTime })} /><div className="field"><span>Dias</span><div className="reminder-days">{["L", "M", "X", "J", "V", "S", "D"].map((label, index) => { const day = index + 1; const chosen = settings.reminderDays.includes(day); return <button type="button" key={day} className={chosen ? "reminder-day-active" : ""} aria-label={`Recordatorio ${["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"][index]}`} aria-pressed={chosen} onClick={() => void change({ reminderDays: chosen ? settings.reminderDays.filter((item) => item !== day) : [...settings.reminderDays, day].sort() })}>{label}</button>; })}</div></div></div></div>
      <div className="notice-panel"><Icon name="bell" size={18} /><p>Sin un servidor push, los recordatorios en segundo plano no son fiables. iOS requiere añadir la PWA a inicio y el comportamiento depende del sistema; Android puede limitar tareas y avisos por ahorro de bateria. Usa el calendario del dispositivo si necesitas un aviso garantizado.</p></div>
    </section>

    <section className="settings-section"><div className="section-heading"><div><p className="eyebrow">RESPALDO LOCAL</p><h2>Tus datos son tuyos</h2></div><Icon name="shieldCheck" /></div><p className="muted-copy">La informacion vive en IndexedDB de este navegador. No hay cuentas, analitica ni sincronizacion. Un respaldo descargado te ayuda a conservarla al cambiar de dispositivo.</p><div className="backup-actions"><Button variant="primary" icon="download" onClick={onExport}>Exportar respaldo JSON</Button><Button variant="secondary" icon="upload" onClick={onImport}>Importar respaldo</Button><span>Ultimo respaldo: {lastBackupAt ? formatDate(lastBackupAt, { day: "numeric", month: "long", year: "numeric" }) : "Todavia no creado"}</span></div>
      <div className="storage-status"><div><span>Almacenamiento persistente</span><strong>{persistent === null ? "No disponible" : persistent ? "Concedido" : "No concedido"}</strong></div><div className="storage-meter"><i style={{ width: `${storagePercent}%` }} /></div><small>{storageUsage?.usage ? `${(storageUsage.usage / (1024 * 1024)).toFixed(1)} MB usados de ${storageUsage.quota ? (storageUsage.quota / (1024 * 1024)).toFixed(0) : "?"} MB estimados.` : "El navegador no ha informado del espacio utilizado."}</small></div>
      <p className="backup-note">Las copias no se sincronizan automaticamente. Exporta cada cierto tiempo y guarda el archivo en un lugar seguro.</p>
    </section>

    <section className="settings-section"><div className="section-heading"><div><p className="eyebrow">INSTALACION</p><h2>Usar como aplicacion</h2></div><Icon name="download" /></div><p className="muted-copy">En Android usa el menu del navegador y elige instalar. En iPhone abre Safari, toca Compartir y selecciona Anadir a pantalla de inicio.</p>{installAvailable && <Button variant="secondary" onClick={onInstall}>Instalar ManteYym</Button>}<p className="app-version">ManteYym {APP_VERSION} · Aplicacion local, sin servidor.</p></section>

    <section className="settings-section safety-section"><div className="section-heading"><div><p className="eyebrow">INFORMACION Y SEGURIDAD</p><h2>Entrena con criterio</h2></div><Icon name="shield" /></div><p>ManteYym es una herramienta de registro y planificacion general; no sustituye a un profesional de la salud. Ante dolor agudo, dolor persistente o condiciones medicas, consulta a un profesional. La alimentacion y la nutricion no forman parte de esta aplicacion.</p><div className="settings-footer-actions"><a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noreferrer" className="text-action">Fuente abierta de ejercicios <Icon name="external" size={16} /></a><Button variant="danger" icon="trash" onClick={onClear}>Borrar datos de este dispositivo</Button></div></section>
  </div>;
}

function AdaptDialog({ profile, catalog, onClose, onApply }: { profile: Profile; catalog: Exercise[]; onClose: () => void; onApply: (result: { minutes: number; reason: string; zone: string; equipment: string; explanation: string }) => void }) {
  const [reason, setReason] = useState("tiempo");
  const [minutes, setMinutes] = useState(30);
  const [zone, setZone] = useState("hombro");
  const [equipment, setEquipment] = useState("maquinas");
  const apply = () => {
    const active = getSnapshot().activeSession;
    if (!active) return;
    let exercises = [...active.exercises];
    let cause = "Se reorganizo la sesion para que puedas continuar con opciones disponibles.";
    if (reason === "tiempo") {
      const limit = minutes <= 20 ? 3 : minutes <= 30 ? 4 : minutes <= 45 ? 5 : 6;
      exercises = exercises.slice(0, limit).map((item) => ({ ...item, targetSets: Math.min(item.targetSets, minutes <= 20 ? 2 : item.targetSets) }));
      cause = `Ajustada a unos ${minutes} minutos: se priorizaron los primeros compuestos y se redujeron series accesorias.`;
    } else if (reason === "molestia") {
      const adjustedProfile = { ...profile, injuries: [...profile.injuries, { id: "temporary", zone, note: "", pain: 1, createdAt: Date.now() }] };
      exercises = exercises.filter((item) => { const movement = catalog.find((entry) => entry.id === item.exerciseId); return !movement || isExerciseCompatible(movement, adjustedProfile); });
      cause = `Se retiraron movimientos asociados a ${zone}. Revisa la sesion y detente si sientes dolor.`;
    } else {
      const available = equipment === "mancuernas" ? ["mancuernas", "peso corporal"] : ["peso corporal", "bandas"];
      const adjustedProfile = { ...profile, equipment: available };
      exercises = exercises.map((item) => {
        const original = catalog.find((entry) => entry.id === item.exerciseId);
        if (!original || !awaitCompatible(original, adjustedProfile)) {
          const alternative = catalog.find((entry) => entry.id !== item.exerciseId && entry.pattern === original?.pattern && (entry.muscle === original?.muscle || entry.secondary.includes(original?.muscle ?? "abdomen")) && awaitCompatible(entry, adjustedProfile));
          return alternative ? { ...item, exerciseId: alternative.id } : item;
        }
        return item;
      });
      cause = `Se buscaron variantes compatibles con ${equipment === "mancuernas" ? "mancuernas o peso corporal" : "bandas o peso corporal"}.`;
    }
    onApply({ minutes, reason, zone, equipment, explanation: cause });
    onClose();
  };
  return <DialogFrame title="Adaptar mi sesion" onClose={onClose}>
    <div className="form-stack"><p className="muted-copy">El ajuste es una sugerencia local. Revisa los cambios antes de empezar; no es un consejo medico.</p>
      <SelectField label="Que ha cambiado hoy" value={reason} onChange={setReason} options={[{ value: "tiempo", label: "Tengo menos tiempo" }, { value: "equipo", label: "Falta equipo o hay una maquina ocupada" }, { value: "molestia", label: "Quiero evitar una articulacion" }]} />
      {reason === "tiempo" && <SelectField label="Tiempo disponible" value={String(minutes)} onChange={(value) => setMinutes(Number(value))} options={[15, 20, 30, 45, 60].map((value) => ({ value: String(value), label: `${value} minutos` }))} />}
      {reason === "molestia" && <SelectField label="Zona a evitar" value={zone} onChange={setZone} options={INJURY_ZONES.map((value) => ({ value, label: value }))} />}
      {reason === "equipo" && <SelectField label="Equipo disponible" value={equipment} onChange={setEquipment} options={[{ value: "mancuernas", label: "Mancuernas y peso corporal" }, { value: "bandas", label: "Bandas y peso corporal" }]} />}
      <div className="sheet-actions"><Button variant="quiet" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={apply}>Aplicar ajuste</Button></div>
    </div>
  </DialogFrame>;
}

function awaitCompatible(exercise: Exercise, profile: Profile): boolean {
  const chosen = profile.equipment.map(normalizeText);
  const hasGym = chosen.some((value) => value.includes("gimnasio completo"));
  return hasGym || exercise.equipment.includes("peso corporal") && (chosen.includes("peso corporal") || chosen.length === 0) || exercise.equipment.every((item) => chosen.includes(normalizeText(item)));
}

function ExercisePicker({ title, catalog, onChoose, onClose, preferred }: { title: string; catalog: Exercise[]; onChoose: (exercise: Exercise) => void; onClose: () => void; preferred?: Exercise }) {
  const [query, setQuery] = useState("");
  const alternatives = preferred ? catalog.filter((exercise) => exercise.id !== preferred.id && exercise.pattern === preferred.pattern && (exercise.muscle === preferred.muscle || exercise.secondary.includes(preferred.muscle))) : catalog;
  const source = preferred && alternatives.length ? alternatives : catalog;
  const results = source.filter((exercise) => normalizeText(`${exercise.name} ${MUSCLE_LABELS[exercise.muscle] ?? exercise.muscle} ${exercise.equipment.join(" ")}`).includes(normalizeText(query))).slice(0, 80);
  return <DialogFrame title={title} onClose={onClose}>
    <div className="picker-content"><label className="search-field"><Icon name="search" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar ejercicio" aria-label="Buscar ejercicio para la rutina" /></label>{preferred && <p className="muted-copy">Alternativas del mismo patron y grupo muscular: {EXERCISE_PATTERN_LABELS[preferred.pattern] ?? "movimiento"}.</p>}
      <div className="picker-list">{results.map((exercise) => <button type="button" className="picker-row" key={exercise.id} onClick={() => onChoose(exercise)}><span><strong>{exercise.name}</strong><small>{MUSCLE_LABELS[exercise.muscle] ?? exercise.muscle} · {exercise.equipment.join(", ")}</small></span><Icon name="plus" size={17} /></button>)}{!results.length && <p className="muted-copy">No hay coincidencias en la biblioteca guardada.</p>}</div>
    </div>
  </DialogFrame>;
}

function SessionSummary({ session, previous, profile, exercises, onClose, onProgress }: { session: TrainingSession; previous?: TrainingSession; profile: Profile; exercises: Exercise[]; onClose: () => void; onProgress: () => void }) {
  const completed = session.exercises.reduce((sum, item) => sum + item.sets.filter((set) => set.completed).length, 0);
  const records = session.exercises.map((item) => {
    const completedSets = item.sets.filter((set) => set.completed && set.type !== "calentamiento");
    const before = previous?.exercises.find((entry) => entry.exerciseId === item.exerciseId)?.sets.filter((set) => set.completed) ?? [];
    const best = Math.max(0, ...completedSets.map((set) => estimatedOneRepMax(set.weight, set.reps)));
    const old = Math.max(0, ...before.map((set) => estimatedOneRepMax(set.weight, set.reps)));
    return best > old ? exerciseName(exercises, item.exerciseId) : "";
  }).filter(Boolean);
  const effectiveVolume = volumeByMuscle([session], exercises);
  return <DialogFrame title="Sesion guardada" onClose={onClose} wide>
    <div className="summary-screen"><div className="summary-greeting"><span className="summary-check"><Icon name="check" size={24} /></span><p className="eyebrow">ENTRENAMIENTO COMPLETADO</p><h2>{session.dayName}</h2><p>{formatDate(session.endedAt, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {formatClock(session.startedAt)} a {formatClock(session.endedAt)}</p></div>
      <div className="summary-metrics"><div><span>DURACION</span><strong>{formatDuration(session.durationMs)}</strong></div><div><span>VOLUMEN REGISTRADO</span><strong>{formatted(session.volume, 0)} {profile.units}</strong></div><div><span>SERIES COMPLETADAS</span><strong>{completed}</strong></div><div><span>RECORDS ESTIMADOS</span><strong>{records.length}</strong></div></div>
      {records.length > 0 && <div className="summary-records"><Icon name="trophy" size={18} /><div><strong>Nueva mejor marca estimada</strong><span>{records.join(" · ")}. 1RM estimado mediante Epley, no una medicion maxima.</span></div></div>}
      {previous && <p className="notice-copy"><Icon name="activity" size={17} /> Comparada con tu sesion anterior de {previous.dayName}, registraste {completed - previous.exercises.reduce((sum, item) => sum + item.sets.filter((set) => set.completed).length, 0)} series completadas de diferencia.</p>}
      <div className="summary-muscle-list"><span className="eyebrow">SERIES EFECTIVAS POR GRUPO</span>{MUSCLES.filter((muscle) => effectiveVolume[muscle] > 0).map((muscle) => <div key={muscle}><span>{MUSCLE_LABELS[muscle]}</span><strong>{formatted(effectiveVolume[muscle], 1)}</strong></div>)}</div>
      {session.notes && <div className="summary-note"><span className="eyebrow">NOTAS</span><p>{session.notes}</p></div>}
      <div className="sheet-actions"><Button variant="quiet" onClick={onClose}>Cerrar</Button><Button variant="primary" icon="progreso" onClick={onProgress}>Ver progreso</Button></div>
    </div>
  </DialogFrame>;
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function App() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [ready, setReady] = useState(false);
  const [initError, setInitError] = useState("");
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [storageUsage, setStorageUsage] = useState<{ usage?: number; quota?: number } | null>(null);
  const [tab, setTab] = useState<"hoy" | "rutinas" | "ejercicios" | "progreso" | "ajustes">(() => new URLSearchParams(window.location.search).get("shortcut") === "progreso" ? "progreso" : "hoy");
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [toast, setToast] = useState("");
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  const [exerciseDetail, setExerciseDetail] = useState<Exercise | null>(null);
  const [showExerciseCreate, setShowExerciseCreate] = useState(false);
  const [exercisePicker, setExercisePicker] = useState<{ title: string; onPick: (exercise: Exercise) => void; preferred?: Exercise } | null>(null);
  const [keypad, setKeypad] = useState<{ title: string; value: number; unit: string; step: number; onSave: (value: number) => void } | null>(null);
  const [adaptOpen, setAdaptOpen] = useState(false);
  const [summary, setSummary] = useState<TrainingSession | null>(null);
  const [backupCandidate, setBackupCandidate] = useState<{ value: unknown; summary: ReturnType<typeof validateBackup>["summary"] } | null>(null);
  const [libraryDownload, setLibraryDownload] = useState<{ active: boolean; progress: number; label: string }>({ active: false, progress: 0, label: "" });
  const fileInput = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<number | null>(null);
  const activeWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const serviceWorkerRegistration = useRef<ServiceWorkerRegistration | null>(null);
  const [clockNow, setClockNow] = useState(Date.now());
  const startingWorkout = useRef(false);
  const finishingWorkout = useRef(false);

  const activeRoutineId = state.meta.find((record) => record.id === "active-routine")?.routineId as string | undefined;
  const activeRoutine = state.routines.find((routine) => routine.id === activeRoutineId) ?? state.routines[0];
  const activeBlock = state.blocks.find((block) => block.routineId === activeRoutine?.id);
  const suggestedDay = currentDay(activeRoutine, state.sessions.length);
  const currentWeek = weekIndex(activeBlock, clockNow);
  const lastBackupAt = Number(state.meta.find((record) => record.id === "lastBackupAt")?.at ?? 0);
  const firstSeen = Number(state.meta.find((record) => record.id === "firstSeen")?.at ?? clockNow);
  const backupDue = clockNow - (lastBackupAt || firstSeen) > 14 * DAY_MS;

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3300);
  };

  useEffect(() => {
    let cancelled = false;
    void initializeStore().then(async (result) => {
      if (cancelled) return;
      setPersistent(result.persistent);
      setReady(true);
      if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        if (!cancelled) setStorageUsage({ usage: estimate.usage, quota: estimate.quota });
      }
    }).catch((error) => { if (!cancelled) setInitError(storageErrorMessage(error)); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const updateNetwork = () => setOnline(navigator.onLine);
    const beforeInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    window.addEventListener("online", updateNetwork); window.addEventListener("offline", updateNetwork);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    const tick = window.setInterval(() => setClockNow(Date.now()), 60_000);
    return () => { window.removeEventListener("online", updateNetwork); window.removeEventListener("offline", updateNetwork); window.removeEventListener("beforeinstallprompt", beforeInstall); window.clearInterval(tick); if (toastTimer.current !== null) window.clearTimeout(toastTimer.current); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const checkReminder = () => {
      const current = getSnapshot();
      const settings = current.settings;
      if (!settings.reminders || current.activeSession || document.visibilityState !== "visible") return;
      const now = new Date();
      const weekday = (now.getDay() + 6) % 7 + 1;
      const key = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
      if (!settings.reminderDays.includes(weekday) || now.toTimeString().slice(0, 5) !== settings.reminderTime) return;
      if (current.meta.find((record) => record.id === "lastReminderDay")?.dayKey === key) return;
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      if (current.sessions.some((session) => session.startedAt >= dayStart)) return;
      void saveRecord("meta", { id: "lastReminderDay", dayKey: key, at: Date.now() });
      if (settings.notifications && "Notification" in window && Notification.permission === "granted" && navigator.serviceWorker?.controller) {
        void navigator.serviceWorker.ready.then((registration) => registration.showNotification("Tu sesion de ManteYym", { body: "Tu recordatorio local de entrenamiento esta listo.", tag: "manteyym-recordatorio" }));
      }
      notify("Tu recordatorio local de entrenamiento esta listo.");
    };
    const timer = window.setInterval(checkReminder, 30_000);
    checkReminder();
    return () => window.clearInterval(timer);
  }, [ready]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme;
    document.documentElement.lang = "es";
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", state.settings.theme === "dark" ? "#10130f" : "#f4f5ef");
  }, [state.settings.theme]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let stopped = false;
    let controllerListener = () => { if (updateAvailable) window.location.reload(); };
    void (async () => {
      const pathname = window.location.pathname;
      const basePath = pathname.endsWith("/") ? pathname : pathname.endsWith("index.html") ? pathname.slice(0, pathname.lastIndexOf("/") + 1) : `${pathname}/`;
      try {
        const registration = await navigator.serviceWorker.register(new URL(`${basePath}sw.js`, window.location.origin).href, { scope: basePath });
        if (stopped) return;
        serviceWorkerRegistration.current = registration;
        if (registration.waiting && navigator.serviceWorker.controller) setUpdateAvailable(true);
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          installing?.addEventListener("statechange", () => { if (installing.state === "installed" && navigator.serviceWorker.controller) setUpdateAvailable(true); });
        });
        navigator.serviceWorker.addEventListener("controllerchange", controllerListener);
        void registration.update().catch(() => undefined);
      } catch { /* El modo web normal sigue disponible si el host no sirve service workers. */ }
    })();
    return () => { stopped = true; navigator.serviceWorker.removeEventListener("controllerchange", controllerListener); };
  }, [updateAvailable]);

  useEffect(() => {
    const active = state.activeSession;
    if (!active || active.status !== "running" || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    let disposed = false;
    const requestLock = async () => {
      try {
        const wakeNavigator = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
        lock = await wakeNavigator.wakeLock?.request("screen") ?? null;
      } catch { /* Wake Lock puede rechazarse por ahorro de energia o falta de permiso. */ }
    };
    const onVisible = () => { if (!disposed && document.visibilityState === "visible" && !lock) void requestLock(); };
    void requestLock(); document.addEventListener("visibilitychange", onVisible);
    return () => { disposed = true; document.removeEventListener("visibilitychange", onVisible); if (lock) void lock.release().catch(() => undefined); };
  }, [state.activeSession?.status, state.activeSession?.id]);

  const safePersist = async <S extends StoreName,>(store: S, record: Parameters<typeof saveRecord<S>>[1]) => {
    try { await saveRecord(store, record); return true; }
    catch (error) { notify(storageErrorMessage(error)); return false; }
  };

  const updateActive = (transform: (current: ActiveSession) => ActiveSession) => {
    activeWriteQueue.current = activeWriteQueue.current.catch(() => undefined).then(async () => {
      const current = getSnapshot().activeSession;
      if (!current) return;
      await saveRecord("activeSession", transform(current));
    }).catch((error) => { notify(storageErrorMessage(error)); });
  };

  const setRoutineActive = async (routine: Routine) => {
    await safePersist("meta", { id: "active-routine", routineId: routine.id });
    if (!getSnapshot().blocks.some((block) => block.routineId === routine.id)) {
      await safePersist("blocks", { id: makeId("block"), routineId: routine.id, name: "Bloque inicial", startAt: Date.now(), weeks: 6, deloadWeek: 6 });
    }
    notify(`${routine.name} es ahora tu rutina activa.`);
  };

  const createRoutine = async (template: string) => {
    const routine = buildRoutine(getSnapshot().profile, getSnapshot().exercises, undefined, template);
    const saved = await safePersist("routines", routine);
    if (saved) { await setRoutineActive(routine); setEditingRoutineId(routine.id); }
  };

  const createBlankRoutine = async () => {
    const profile = getSnapshot().profile;
    const days = Array.from({ length: profile.days }, (_, index) => ({ id: makeId("day"), name: `Sesion ${index + 1}`, note: "", exercises: [] }));
    const routine: Routine = { id: makeId("routine"), name: "Rutina personalizada", split: "Personalizada", template: "personal", createdAt: Date.now(), days };
    const saved = await safePersist("routines", routine);
    if (saved) { await setRoutineActive(routine); setEditingRoutineId(routine.id); }
  };

  const saveProfile = async (profile: Profile, regenerate: boolean) => {
    const saved = await safePersist("profile", profile);
    if (!saved) throw new Error("No se pudo guardar el perfil.");
    const injuryIds = new Set(profile.injuries.map((injury) => injury.id));
    await Promise.all(getSnapshot().injuries.filter((injury) => !injuryIds.has(injury.id)).map((injury) => deleteRecord("injuries", injury.id)));
    await Promise.all(profile.injuries.map((injury) => safePersist("injuries", injury)));
    if (regenerate) {
      const routine = buildRoutine(profile, getSnapshot().exercises, undefined, "auto");
      const created = await safePersist("routines", routine);
      if (created) await setRoutineActive(routine);
    }
    setEditingProfile(false);
    setTab("hoy");
    notify(regenerate ? "Perfil actualizado y rutina generada." : "Perfil actualizado.");
  };

  const startWorkout = async (day: RoutineDay) => {
    if (!day.exercises.length) { notify("Esta sesion no tiene ejercicios compatibles. Edita la rutina para anadir movimientos."); return; }
    if (startingWorkout.current) return;
    if (getSnapshot().activeSession) { setTab("hoy"); return; }
    startingWorkout.current = true;
    const now = Date.now();
    const deload = activeBlock && currentWeek === activeBlock.deloadWeek;
    const planned = day.exercises.map((plan): SessionExercise => {
      const previousSession = getSnapshot().sessions.find((session) => session.exercises.some((item) => item.exerciseId === plan.exerciseId));
      const previousSet = previousSession?.exercises.find((item) => item.exerciseId === plan.exerciseId)?.sets.filter((set) => set.completed).at(-1);
      const movement = getSnapshot().exercises.find((exercise) => exercise.id === plan.exerciseId);
      const weeklyAddition = !deload && currentWeek >= 3 && currentWeek < (activeBlock?.deloadWeek ?? 6) && currentWeek % 2 === 1 && movement?.category === "compuesto" ? 1 : 0;
      const targetSets = deload ? Math.max(1, Math.ceil(plan.sets * 0.6)) : plan.sets + weeklyAddition;
      return { exerciseId: plan.exerciseId, targetSets, repsMin: plan.repsMin, repsMax: plan.repsMax, restSec: plan.restSec || getSnapshot().settings.defaultRest, note: plan.note, superset: plan.superset, groupType: plan.groupType,
        sets: Array.from({ length: targetSets }, () => ({ id: makeId("set"), weight: previousSet?.weight ?? 0, reps: previousSet?.reps ?? plan.repsMin, type: "normal", rir: null, rpe: null, note: "", completed: false } as LoggedSet)) };
    });
    const active: ActiveSession = { id: "current", routineId: activeRoutine?.id ?? "sin-rutina", dayId: day.id, dayName: day.name, startedAt: now, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, segmentStartedAt: now, elapsedBeforePause: 0, status: "running", restEndsAt: null, restDurationSec: 0, currentExercise: 0, exercises: planned, notes: "" };
    try {
      const saved = await safePersist("activeSession", active);
      if (saved && deload) notify("Semana de descarga: volumen reducido de forma automatica.");
    } finally { startingWorkout.current = false; }
  };

  const finishWorkout = async () => {
    if (finishingWorkout.current) return;
    finishingWorkout.current = true;
    try {
      await activeWriteQueue.current;
      const active = getSnapshot().activeSession;
      if (!active) return;
      const completed = completedSets(active.exercises);
      if (completed === 0 && !window.confirm("No has completado ninguna serie. Guardar igualmente esta sesion?")) return;
      if (completed > 0 && completed < allTargetSets(active.exercises) && !window.confirm("Hay series pendientes. Finalizar y guardar la sesion tal como esta?")) return;
      const endedAt = Date.now();
      const record: TrainingSession = { id: makeId("session"), routineId: active.routineId, dayId: active.dayId, dayName: active.dayName, startedAt: active.startedAt, endedAt, timeZone: active.timeZone,
        durationMs: elapsedSessionMs(active.startedAt, active.elapsedBeforePause, active.segmentStartedAt, endedAt), volume: sessionVolume(active.exercises), notes: active.notes, exercises: active.exercises };
      const saved = await safePersist("sessions", record);
      if (!saved) return;
      await deleteRecord("activeSession", "current");
      const previous = getSnapshot().sessions.find((session) => session.dayId === record.dayId && session.id !== record.id);
      setSummary(record);
      if (!previous) notify("Sesion guardada. Buen comienzo para tu historial.");
    } finally { finishingWorkout.current = false; }
  };

  const discardWorkout = async () => {
    if (!getSnapshot().activeSession || !window.confirm("Descartar la sesion en curso y sus series? Esta accion no se puede deshacer.")) return;
    await activeWriteQueue.current;
    await deleteRecord("activeSession", "current"); notify("Sesion descartada.");
  };

  const togglePause = () => updateActive((active) => active.status === "running"
    ? { ...active, status: "paused", elapsedBeforePause: elapsedSessionMs(active.startedAt, active.elapsedBeforePause, active.segmentStartedAt), segmentStartedAt: null, restEndsAt: null }
    : { ...active, status: "running", segmentStartedAt: Date.now() });

  const handleAdapt = (change: { minutes: number; reason: string; zone: string; equipment: string; explanation: string }) => {
    updateActive((active) => {
      let exercises = [...active.exercises];
      if (change.reason === "tiempo") {
        const maximum = change.minutes <= 20 ? 3 : change.minutes <= 30 ? 4 : change.minutes <= 45 ? 5 : 6;
        exercises = exercises.slice(0, maximum).map((item) => ({ ...item, targetSets: change.minutes <= 20 ? Math.min(2, item.targetSets) : item.targetSets, sets: item.sets.slice(0, change.minutes <= 20 ? 2 : item.sets.length) }));
      }
      if (change.reason === "molestia") {
        const adaptedProfile = { ...getSnapshot().profile, injuries: [...getSnapshot().profile.injuries, { id: "temporary", zone: change.zone, note: "", pain: 1, createdAt: Date.now() }] };
        exercises = exercises.filter((item) => { const movement = getSnapshot().exercises.find((exercise) => exercise.id === item.exerciseId); return !movement || isExerciseCompatible(movement, adaptedProfile); });
      }
      if (change.reason === "equipo") {
        const equipment = change.equipment === "mancuernas" ? ["mancuernas", "peso corporal"] : ["bandas", "peso corporal"];
        const adaptedProfile = { ...getSnapshot().profile, equipment };
        exercises = exercises.flatMap((item) => {
          const original = getSnapshot().exercises.find((exercise) => exercise.id === item.exerciseId);
          if (!original || isExerciseCompatible(original, adaptedProfile)) return [item];
          const alternative = getSnapshot().exercises.find((exercise) => exercise.id !== item.exerciseId && exercise.pattern === original.pattern && (exercise.muscle === original.muscle || exercise.secondary.includes(original.muscle)) && isExerciseCompatible(exercise, adaptedProfile));
          return alternative ? [{ ...item, exerciseId: alternative.id }] : [];
        });
      }
      return { ...active, exercises, currentExercise: Math.min(active.currentExercise, Math.max(0, exercises.length - 1)) };
    });
    notify(change.explanation);
  };

  const downloadBackup = async () => {
    try {
      const backup = await exportBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `ManteYym-respaldo-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
      await saveRecord("meta", { id: "lastBackupAt", at: Date.now() });
      notify("Respaldo exportado. Guardalo fuera del navegador para conservarlo.");
    } catch (error) { notify(storageErrorMessage(error)); }
  };

  const onBackupFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 60 * 1024 * 1024) { notify("El respaldo supera el limite de 60 MB."); event.target.value = ""; return; }
    try {
      const value = JSON.parse(await file.text()) as unknown;
      const checked = validateBackup(value);
      setBackupCandidate({ value, summary: checked.summary });
    } catch (error) { notify(error instanceof Error ? error.message : "No se pudo leer el respaldo."); }
    event.target.value = "";
  };

  const confirmImport = async () => {
    if (!backupCandidate) return;
    try {
      const result = await importBackup(backupCandidate.value);
      await saveRecord("meta", { id: "lastBackupAt", at: Date.now() });
      setBackupCandidate(null); setTab("hoy"); notify(`Restaurados ${result.routines} rutinas, ${result.sessions} sesiones y ${result.exercises} ejercicios. Copia anterior guardada en este dispositivo.`);
    } catch (error) { notify(storageErrorMessage(error)); }
  };

  const downloadLibrary = async () => {
    setLibraryDownload({ active: true, progress: 0, label: "Preparando descarga" });
    try {
      const partialRecord = getSnapshot().meta.find((record) => record.id === "library-download-state");
      let base = partialRecord?.bytes instanceof Uint8Array ? partialRecord.bytes : new Uint8Array();
      const headers = base.length ? { Range: `bytes=${base.length}-` } : undefined;
      const response = await fetch(FREE_DB.dataUrl, { headers, cache: "no-store" });
      if (!response.ok) throw new Error(`El catalogo respondio con codigo ${response.status}.`);
      if (response.status !== 206) base = new Uint8Array();
      const contentRange = response.headers.get("content-range");
      const rangeTotal = contentRange?.match(/\/(\d+)$/)?.[1];
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      const totalBytes = Number(rangeTotal) || contentLength + base.length;
      const chunks: Uint8Array[] = [];
      let received = 0;
      let storedAt = 0;
      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const read = await reader.read();
          if (read.done) break;
          if (read.value) {
            chunks.push(read.value); received += read.value.length;
            const totalReceived = base.length + received;
            const progress = totalBytes ? Math.min(97, Math.round(totalReceived / totalBytes * 100)) : 0;
            setLibraryDownload({ active: true, progress, label: totalBytes ? `Descargando biblioteca · ${progress}%` : `Descargando · ${(totalReceived / 1048576).toFixed(1)} MB` });
            if (totalReceived - storedAt >= 1_000_000) {
              const partial = new Uint8Array(totalReceived); partial.set(base); let offset = base.length;
              chunks.forEach((chunk) => { partial.set(chunk, offset); offset += chunk.length; });
              await saveRecord("meta", { id: "library-download-state", bytes: partial, totalBytes }); storedAt = totalReceived;
            }
          }
        }
      } else {
        chunks.push(new Uint8Array(await response.arrayBuffer())); received = chunks[0].length;
      }
      const bytes = new Uint8Array(base.length + received); bytes.set(base); let offset = base.length;
      chunks.forEach((chunk) => { bytes.set(chunk, offset); offset += chunk.length; });
      let json: unknown;
      try { json = JSON.parse(new TextDecoder().decode(bytes)) as unknown; }
      catch { await saveRecord("meta", { id: "library-download-state", bytes, totalBytes }); throw new Error("La descarga quedo incompleta. Vuelve a intentarlo para reanudarla."); }
      if (!Array.isArray(json)) throw new Error("El formato remoto del catalogo no es el esperado.");
      const exercises = json.map((raw) => normalizeRemoteExercise(raw)).filter((exercise): exercise is Exercise => Boolean(exercise));
      await saveMany("exercises", exercises);
      await deleteRecord("meta", "library-download-state");
      setLibraryDownload({ active: false, progress: 100, label: `${exercises.length} ejercicios disponibles sin conexion` });
      notify(`Biblioteca descargada. ${exercises.length} ejercicios guardados en el dispositivo.`);
    } catch (error) {
      setLibraryDownload((current) => ({ ...current, active: false, label: "Descarga interrumpida; puedes reanudarla" }));
      notify(error instanceof Error ? error.message : "No se pudo descargar la biblioteca. Comprueba tu conexion.");
    }
  };

  const addExercise = async (exercise: Exercise) => { await safePersist("exercises", exercise); notify("Ejercicio guardado en tu catalogo local."); };
  const openSessionPicker = (index: number) => {
    const active = getSnapshot().activeSession;
    const preferred = active ? getSnapshot().exercises.find((exercise) => exercise.id === active.exercises[index]?.exerciseId) : undefined;
    setExercisePicker({ title: "Cambiar ejercicio", preferred, onPick: (exercise) => {
      updateActive((current) => ({ ...current, exercises: current.exercises.map((item, itemIndex) => itemIndex === index ? { ...item, exerciseId: exercise.id } : item) }));
      notify(`Sustituido por ${exercise.name}, del mismo patron cuando hay una alternativa disponible.`);
    } });
  };

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") notify("ManteYym se agrego a tus aplicaciones.");
    setInstallPrompt(null);
  };

  const clearAll = async () => {
    if (!window.confirm("Se borraran rutinas, sesiones, fotos y ajustes locales. Primero descarga un respaldo si quieres conservarlos.")) return;
    if (!window.confirm("Confirmacion final: borrar todos los datos locales de ManteYym en este navegador?")) return;
    try { await resetStore(); setEditingProfile(false); setTab("hoy"); notify("Datos locales borrados. La biblioteca base se ha restaurado."); }
    catch (error) { notify(storageErrorMessage(error)); }
  };

  if (initError) return <main className="loading-screen"><span className="brand-mark"><Icon name="exercises" size={21} /></span><h1>No se pudo iniciar ManteYym</h1><p>{initError}</p><Button variant="primary" onClick={() => window.location.reload()}>Reintentar</Button></main>;
  if (!ready) return <main className="loading-screen"><span className="brand-mark"><Icon name="exercises" size={21} /></span><p className="eyebrow">MANTEYYM</p><div className="loading-line" /><span className="muted-copy">Preparando tu espacio local...</span></main>;
  if (!state.profile.onboardingComplete) return <Onboarding initialProfile={state.profile} onComplete={saveProfile} />;
  if (editingProfile) return <Onboarding initialProfile={state.profile} edit onCancel={() => setEditingProfile(false)} onComplete={saveProfile} />;

  const showAppScreen = () => {
    if (state.activeSession) return <WorkoutSession active={state.activeSession} profile={state.profile} settings={state.settings} catalog={state.exercises} history={state.sessions}
      onChange={(transform) => updateActive(transform)} onFinish={() => void finishWorkout()} onDiscard={() => void discardWorkout()} onPause={togglePause}
      onOpenExercise={setExerciseDetail} onOpenPicker={openSessionPicker} onAdapt={() => setAdaptOpen(true)} onKeypad={setKeypad} onToast={notify}
      onRestFinished={() => updateActive((active) => ({ ...active, restEndsAt: null }))} />;
    if (tab === "hoy") return <TodayScreen profile={state.profile} routine={activeRoutine} day={suggestedDay} block={activeBlock} sessions={state.sessions} exercises={state.exercises}
      onStart={(day) => void startWorkout(day)} onOpenRoutines={() => setTab("rutinas")} onBackup={() => void downloadBackup()} backupDue={backupDue}
      onSaveReadiness={(values) => void safePersist("meta", { id: `readiness-${new Date().toISOString().slice(0, 10)}`, ...values, at: Date.now() })} onToast={notify} />;
    if (tab === "rutinas") {
      const edited = state.routines.find((routine) => routine.id === editingRoutineId);
      if (edited) return <RoutineEditor routine={edited} catalog={state.exercises} onSave={async (routine) => { await safePersist("routines", routine); notify("Cambios de rutina guardados."); }} onClose={() => setEditingRoutineId(null)}
        onPickExercise={(callback) => setExercisePicker({ title: "Anadir ejercicio a la rutina", onPick: callback })} />;
      return <RoutineListScreen routines={state.routines} activeId={activeRoutine?.id} activeBlock={activeBlock} profile={state.profile} onCreate={(template) => void createRoutine(template)} onNew={() => void createBlankRoutine()} onUpdateBlock={(block) => void safePersist("blocks", block).then((saved) => saved && notify(`Bloque actualizado a ${block.weeks} semanas.`))}
        onEdit={(routine) => setEditingRoutineId(routine.id)} onSelect={(routine) => void setRoutineActive(routine)}
        onDuplicate={(routine) => { const copy: Routine = { ...routine, id: makeId("routine"), name: `${routine.name} (copia)`, createdAt: Date.now(), days: routine.days.map((day) => ({ ...day, id: makeId("day"), exercises: day.exercises.map((item) => ({ ...item })) })) }; void safePersist("routines", copy).then((saved) => saved && notify("Rutina duplicada.")); }}
        onDelete={(routine) => { if (window.confirm(`Eliminar la rutina '${routine.name}'? Las sesiones guardadas no se borraran.`)) void deleteRecord("routines", routine.id).then(() => { if (routine.id === activeRoutine?.id) { const next = getSnapshot().routines.find((item) => item.id !== routine.id); if (next) void setRoutineActive(next); else void deleteRecord("meta", "active-routine"); } if (editingRoutineId === routine.id) setEditingRoutineId(null); notify("Rutina eliminada."); }); }} />;
    }
    if (tab === "ejercicios") return <ExerciseBrowser catalog={state.exercises} onOpen={setExerciseDetail} onDownload={() => void downloadLibrary()} onCreate={() => setShowExerciseCreate(true)} downloading={libraryDownload.active} downloadLabel={libraryDownload.label || (libraryDownload.progress ? `${libraryDownload.progress}% descargado` : "Descargar biblioteca completa")} />;
    if (tab === "progreso") return <ProgressScreen profile={state.profile} sessions={state.sessions} catalog={state.exercises} metrics={state.bodyMetrics} injuries={state.injuries} goals={state.goals} cardio={state.cardio} photos={state.photos}
      onOpenExercise={setExerciseDetail} onAddMetric={(metric) => safePersist("bodyMetrics", metric).then(() => notify("Medicion guardada."))}
      onAddInjury={async (injury) => { const profile = getSnapshot().profile; await Promise.all(getSnapshot().injuries.filter((item) => item.zone === injury.zone).map((item) => deleteRecord("injuries", item.id))); await safePersist("injuries", injury); await safePersist("profile", { ...profile, injuries: [...profile.injuries.filter((item) => item.zone !== injury.zone), injury] }); notify(injury.pain >= 4 ? "Molestia guardada. Si persiste, consulta a un profesional de la salud." : "Zona guardada; se revisaran los movimientos afectados."); }}
      onDeleteInjury={async (injury) => { await deleteRecord("injuries", injury.id); const profile = getSnapshot().profile; await safePersist("profile", { ...profile, injuries: profile.injuries.filter((item) => item.id !== injury.id) }); notify("Registro de molestia eliminado."); }}
      onAddGoal={(goal) => safePersist("goals", goal).then(() => notify("Objetivo guardado."))} onDeleteGoal={(goal) => deleteRecord("goals", goal.id).then(() => notify("Objetivo eliminado."))}
      onAddCardio={(record) => safePersist("cardio", record).then(() => notify("Sesion de cardio guardada."))}
      onAddPhoto={(file, label) => safePersist("photos", { id: makeId("photo"), at: Date.now(), label: label || file.name, blob: file }).then((saved) => { if (saved) notify("Foto guardada en el dispositivo."); })}
      onDeletePhoto={(id) => deleteRecord("photos", id).then(() => notify("Foto eliminada del dispositivo."))} />;
    return <SettingsScreen profile={state.profile} settings={state.settings} lastBackupAt={lastBackupAt} persistent={persistent} storageUsage={storageUsage}
      onProfile={() => setEditingProfile(true)} onSaveSettings={(settings) => safePersist("settings", settings).then((saved) => { if (saved) notify("Ajuste guardado."); })}
      onExport={() => void downloadBackup()} onImport={() => fileInput.current?.click()} onClear={() => void clearAll()} onInstall={() => void installApp()} installAvailable={Boolean(installPrompt)} onToast={notify} />;
  };

  return <div className={cx("app-shell", state.activeSession && "app-shell-session")}>
    {!state.activeSession && <header className="app-header"><div className="app-brand"><span className="brand-mark"><Icon name="exercises" size={19} /></span><strong>ManteYym</strong><span className="brand-divider" /><span className="brand-tagline">ENTRENADOR LOCAL</span></div><div className="header-right"><LocalBadge online={online} /><span className="header-date">{formatDate(clockNow, { weekday: "short", day: "numeric", month: "short" })}</span>{state.activeSession && <span className="session-header-dot"><i /> Sesion en curso</span>}</div></header>}
    {updateAvailable && <div className="update-banner" role="status"><span>Actualizacion disponible. Tu sesion activa seguira guardada.</span><Button variant="quiet" onClick={() => { navigator.serviceWorker?.controller?.postMessage({ type: "SKIP_WAITING" }); serviceWorkerRegistration.current?.waiting?.postMessage({ type: "SKIP_WAITING" }); }}>Aplicar ahora</Button></div>}
    <div className={cx("app-frame", state.activeSession && "app-frame-full")}>
      {!state.activeSession && <aside className="desktop-sidebar"><div className="sidebar-brand"><span className="brand-mark"><Icon name="exercises" size={20} /></span><div><strong>ManteYym</strong><small>FUERZA A TU MANERA</small></div></div><nav aria-label="Navegacion principal">{NAV_ITEMS.map((item) => <button type="button" key={item.id} className={cx("nav-item", tab === item.id && "nav-item-active")} aria-current={tab === item.id ? "page" : undefined} onClick={() => { setTab(item.id); setEditingRoutineId(null); }}><Icon name={item.icon} size={20} /><span>{item.label}</span>{item.id === "hoy" && state.activeSession && <i />}</button>)}</nav><div className="sidebar-footer"><span className="sidebar-dot" /><span>DATOS SOLO LOCALES</span><small>v{APP_VERSION}</small></div></aside>}
      <main className={cx("main-content", state.activeSession && "main-content-session")} id="contenido-principal" tabIndex={-1}>{showAppScreen()}</main>
    </div>
    {!state.activeSession && <nav className="bottom-nav" aria-label="Navegacion inferior">{NAV_ITEMS.map((item) => <button type="button" key={item.id} className={cx("bottom-nav-item", tab === item.id && "bottom-nav-active")} aria-current={tab === item.id ? "page" : undefined} onClick={() => { setTab(item.id); setEditingRoutineId(null); }}><Icon name={item.icon} size={20} /><span>{item.label}</span></button>)}</nav>}
    <input ref={fileInput} type="file" accept="application/json,.json" className="visually-hidden" onChange={(event) => void onBackupFile(event)} aria-label="Seleccionar archivo de respaldo" />
    {exerciseDetail && <ExerciseDetail exercise={exerciseDetail} catalog={state.exercises} sessions={state.sessions} units={state.profile.units} onClose={() => setExerciseDetail(null)} />}
    {showExerciseCreate && <ExerciseCreateForm onClose={() => setShowExerciseCreate(false)} onCreate={addExercise} />}
    {exercisePicker && <ExercisePicker title={exercisePicker.title} catalog={state.exercises} preferred={exercisePicker.preferred} onClose={() => setExercisePicker(null)} onChoose={(exercise) => { exercisePicker.onPick(exercise); setExercisePicker(null); }} />}
    {keypad && <NumericPad config={keypad} onClose={() => setKeypad(null)} />}
    {state.activeSession && adaptOpen && <AdaptDialog profile={state.profile} catalog={state.exercises} onClose={() => setAdaptOpen(false)} onApply={(change) => { handleAdapt(change); setAdaptOpen(false); }} />}
    {summary && <SessionSummary session={summary} previous={state.sessions.find((session) => session.id !== summary.id && session.dayId === summary.dayId)} profile={state.profile} exercises={state.exercises} onClose={() => setSummary(null)} onProgress={() => { setSummary(null); setTab("progreso"); }} />}
    {backupCandidate && <DialogFrame title="Revisar respaldo" onClose={() => setBackupCandidate(null)}><div className="form-stack"><p>El archivo es valido. Al restaurarlo, los datos locales actuales se reemplazaran. Antes se guardara una copia automatica dentro de este dispositivo.</p><div className="backup-summary-list"><span>Rutinas <strong>{backupCandidate.summary.routines}</strong></span><span>Sesiones <strong>{backupCandidate.summary.sessions}</strong></span><span>Ejercicios <strong>{backupCandidate.summary.exercises}</strong></span><span>Fotos <strong>{backupCandidate.summary.photos}</strong></span><span>Exportado <strong>{formatDate(backupCandidate.summary.exportedAt, { day: "numeric", month: "short", year: "numeric" })}</strong></span></div><div className="sheet-actions"><Button variant="quiet" onClick={() => setBackupCandidate(null)}>Cancelar</Button><Button variant="primary" onClick={() => void confirmImport()}>Restaurar datos</Button></div></div></DialogFrame>}
    {toast && <div className="toast" role="status" aria-live="polite"><span className="toast-mark"><Icon name="check" size={16} /></span>{toast}</div>}
  </div>;
}

export default App;
