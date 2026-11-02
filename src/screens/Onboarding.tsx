import { labelTitle } from "../i18n/es";
import { Icon } from "../components/Icon";
import { Button, Choice, Field } from "../components/ui";
import { EQUIPMENT_OPTIONS, GOALS, INJURY_ZONES } from "../constants";
import { makeId, MUSCLE_LABELS, MUSCLES } from "../engine/fitness";
import { cleanNumber, cx } from "../lib/format";
import { storageErrorMessage } from "../store";
import type { Profile } from "../types";
import { useState } from "react";

export function Onboarding({
  initialProfile,
  edit = false,
  onCancel,
  onComplete,
}: {
  initialProfile: Profile;
  edit?: boolean;
  onCancel?: () => void;
  onComplete: (profile: Profile, regenerate: boolean) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Profile>(initialProfile);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const total = 10;
  const toggleList = <T extends string>(list: T[], value: T) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  const toggleEquipment = (equipment: string) =>
    setDraft((previous) => {
      if (equipment === "Gimnasio completo")
        return { ...previous, equipment: previous.equipment.includes(equipment) ? [] : [equipment] };
      const withoutGym = previous.equipment.filter((item) => item !== "Gimnasio completo");
      return { ...previous, equipment: toggleList(withoutGym, equipment) };
    });
  const toggleInjury = (zone: string) =>
    setDraft((previous) => {
      const found = previous.injuries.some((item) => item.zone === zone);
      return {
        ...previous,
        injuries: found
          ? previous.injuries.filter((item) => item.zone !== zone)
          : [...previous.injuries, { id: makeId("injury"), zone, note: "", pain: 1, createdAt: Date.now() }],
      };
    });
  const title = [
    "Tu objetivo",
    "Tu experiencia",
    "Tu disponibilidad semanal",
    "Tiempo por sesión",
    "Equipo disponible",
    "Músculos prioritarios",
    "Molestias o lesiones",
    "Ejercicios que quieres excluir",
    "Tus unidades",
    "Cómo progresar",
  ];
  const handleFinish = async (regenerate: boolean) => {
    setBusy(true);
    setFormError("");
    try {
      await onComplete({ ...draft, onboardingComplete: true }, regenerate);
    } catch (error) {
      setFormError(storageErrorMessage(error));
      setBusy(false);
    }
  };
  return (
    <main className="onboarding-shell">
      <div className="onboarding-brand">
        <span className="brand-mark">
          <Icon name="ejercicios" size={21} />
        </span>
        <strong>ManteYym</strong>
        <span className="eyebrow">ENTRENAMIENTO PERSONAL</span>
      </div>
      <section className="onboarding-panel" aria-labelledby="onboarding-title">
        <div className="onboarding-progress">
          <span>
            PASO {step + 1} DE {total}
          </span>
          <span>{Math.round(((step + 1) / total) * 100)}%</span>
        </div>
        <div className="progress-track">
          <i style={{ width: `${((step + 1) / total) * 100}%` }} />
        </div>
        <div className="onboarding-heading">
          <p className="eyebrow">{edit ? "PERFIL PERSONAL" : "EMPECEMOS POR TI"}</p>
          <h1 id="onboarding-title">{title[step]}</h1>
        </div>
        {step === 0 && (
          <div className="choice-list">
            {GOALS.map((goal) => (
              <Choice
                key={goal.value}
                title={goal.title}
                description={goal.description}
                selected={draft.goal === goal.value}
                onClick={() => setDraft({ ...draft, goal: goal.value })}
              />
            ))}
          </div>
        )}
        {step === 1 && (
          <div className="step-fields">
            <div className="choice-list">
              {(
                [
                  ["principiante", "Estoy empezando", "Menos de 1 año de entrenamiento constante."],
                  ["intermedio", "Tengo experiencia", "Entre 1 y 3 años entrenando con continuidad."],
                  ["avanzado", "Llevo varios años", "Más de 3 años de trabajo constante."],
                ] as [Profile["level"], string, string][]
              ).map(([value, heading, description]) => (
                <Choice
                  key={value}
                  title={heading}
                  description={description}
                  selected={draft.level === value}
                  onClick={() => setDraft({ ...draft, level: value })}
                />
              ))}
            </div>
            <Field
              label="Años entrenando (aproximado)"
              type="number"
              min={0}
              max={60}
              step={1}
              value={draft.yearsTraining}
              onChange={(value) => setDraft({ ...draft, yearsTraining: Math.max(0, cleanNumber(value)) })}
              suffix="años"
            />
          </div>
        )}
        {step === 2 && (
          <div className="step-fields">
            <p className="muted-copy">
              ¿Cuántos días puedes reservar con regularidad? La recuperación también forma parte del plan.
            </p>
            <div className="number-choice-row">
              {[2, 3, 4, 5, 6].map((days) => (
                <button
                  type="button"
                  key={days}
                  className={cx("number-choice", draft.days === days && "selected")}
                  onClick={() => setDraft({ ...draft, days })}
                >
                  <strong>{days}</strong>
                  <small>días</small>
                </button>
              ))}
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="step-fields">
            <p className="muted-copy">El generador ajustará el número de movimientos a esta ventana.</p>
            <div className="number-choice-row">
              {([30, 45, 60, 90] as const).map((minutes) => (
                <button
                  type="button"
                  key={minutes}
                  className={cx("number-choice", draft.minutes === minutes && "selected")}
                  onClick={() => setDraft({ ...draft, minutes })}
                >
                  <strong>{minutes}</strong>
                  <small>minutos</small>
                </button>
              ))}
            </div>
          </div>
        )}
        {step === 4 && (
          <div className="choice-list choice-grid">
            {EQUIPMENT_OPTIONS.map((item) => (
              <Choice
                key={item}
                title={labelTitle(item)}
                selected={draft.equipment.includes(item)}
                onClick={() => toggleEquipment(item)}
                multi
              />
            ))}
          </div>
        )}
        {step === 5 && (
          <div className="choice-list choice-grid">
            {MUSCLES.filter((muscle) => muscle !== "antebrazos").map((muscle) => (
              <Choice
                key={muscle}
                title={MUSCLE_LABELS[muscle]}
                selected={draft.priorities.includes(muscle)}
                onClick={() => setDraft({ ...draft, priorities: toggleList(draft.priorities, muscle) })}
                multi
              />
            ))}
          </div>
        )}
        {step === 6 && (
          <div className="step-fields">
            <p className="muted-copy">
              La aplicación evitará movimientos que coincidan con la zona seleccionada. Esto no es una evaluación
              médica.
            </p>
            <div className="choice-list choice-grid">
              {INJURY_ZONES.map((zone) => (
                <Choice
                  key={zone}
                  title={labelTitle(zone)}
                  selected={draft.injuries.some((injury) => injury.zone === zone)}
                  onClick={() => toggleInjury(zone)}
                  multi
                />
              ))}
            </div>
          </div>
        )}
        {step === 7 && (
          <div className="step-fields">
            <Field
              label="Nombres separados por coma"
              multiline
              value={draft.exclusions.join(", ")}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  exclusions: value
                    .split(",")
                    .map((entry) => entry.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Por ejemplo: sentadilla trasera, burpees"
            />
            <p className="muted-copy">También puedes excluir movimientos desde el editor de rutinas.</p>
          </div>
        )}
        {step === 8 && (
          <div className="choice-list">
            {(
              [
                { value: "kg", title: "Sistema métrico", description: "Kilogramos para registrar las cargas." },
                { value: "lb", title: "Sistema imperial", description: "Libras para registrar las cargas." },
              ] as const
            ).map((item) => (
              <Choice
                key={item.value}
                title={item.title}
                description={item.description}
                selected={draft.units === item.value}
                onClick={() => setDraft({ ...draft, units: item.value })}
              />
            ))}
          </div>
        )}
        {step === 9 && (
          <div className="choice-list">
            {(
              [
                ["doble", "Doble progresión", "Completa el rango de repeticiones y luego sube la carga."],
                ["lineal", "Lineal", "Añade un incremento pequeño en cada exposición; pensada para principiantes."],
                ["rir", "Por esfuerzo (RIR)", "Ajusta la carga según las repeticiones que te quedan en reserva."],
              ] as [Profile["progression"], string, string][]
            ).map(([value, heading, description]) => (
              <Choice
                key={value}
                title={heading}
                description={description}
                selected={draft.progression === value}
                onClick={() => setDraft({ ...draft, progression: value })}
              />
            ))}
          </div>
        )}
        <p className="health-note">
          <Icon name="shield" size={17} /> ManteYym no sustituye a un profesional de la salud. Ante dolor agudo o
          condiciones médicas, consulta a uno.
        </p>
        {formError && (
          <p className="error-copy" role="alert">
            {formError}
          </p>
        )}
        <div className="onboarding-actions">
          {step > 0 ? (
            <Button icon="back" variant="quiet" onClick={() => setStep(step - 1)}>
              Anterior
            </Button>
          ) : onCancel ? (
            <Button variant="quiet" onClick={onCancel}>
              Cancelar
            </Button>
          ) : (
            <span />
          )}
          {step < total - 1 ? (
            <Button variant="primary" icon="next" onClick={() => setStep(step + 1)}>
              {step === 6 ? "Continuar" : "Siguiente"}
            </Button>
          ) : edit ? (
            <div className="inline-actions">
              <Button variant="secondary" disabled={busy} onClick={() => void handleFinish(false)}>
                Guardar perfil
              </Button>
              <Button variant="primary" disabled={busy} onClick={() => void handleFinish(true)}>
                Guardar y generar rutina
              </Button>
            </div>
          ) : (
            <Button variant="primary" disabled={busy} onClick={() => void handleFinish(true)}>
              {busy ? "Guardando" : "Crear mi plan"}
            </Button>
          )}
        </div>
      </section>
      <p className="onboarding-footnote">Tus datos se guardan solamente en este dispositivo.</p>
    </main>
  );
}
