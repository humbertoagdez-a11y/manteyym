import { labelTitle } from "../i18n/es";
import { Button, DialogFrame, Field, SelectField } from "../components/ui";
import { EQUIPMENT_OPTIONS, EXERCISE_PATTERN_LABELS } from "../constants";
import { makeId, MUSCLE_LABELS, MUSCLES } from "../engine/fitness";
import { cx } from "../lib/format";
import type { Exercise, Muscle } from "../types";
import { type FormEvent, useState } from "react";

export function ExerciseCreateForm({
  onCreate,
  onClose,
}: {
  onCreate: (exercise: Exercise) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [muscle, setMuscle] = useState<Muscle>("pecho");
  const [pattern, setPattern] = useState<Exercise["pattern"]>("empuje-horizontal");
  const [equipment, setEquipment] = useState("peso corporal");
  const [secondary, setSecondary] = useState<Muscle[]>([]);
  const [steps, setSteps] = useState(
    "Coloca el cuerpo o el equipo en una posición cómoda.\nRealiza el movimiento con control y rango sin dolor.\nVuelve lentamente al inicio.",
  );
  const [errors, setErrors] = useState("Perder el control del movimiento.\nUsar una carga o rango que genera dolor.");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onCreate({
        id: makeId("custom"),
        name: name.trim(),
        muscle,
        secondary,
        equipment: [equipment],
        pattern,
        category: pattern === "aislamiento" ? "aislamiento" : "compuesto",
        steps: steps
          .split("\n")
          .map((step) => step.trim())
          .filter(Boolean),
        mistakes: errors
          .split("\n")
          .map((error) => error.trim())
          .filter(Boolean),
        source: "personal",
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };
  return (
    <DialogFrame title="Crear ejercicio" onClose={onClose}>
      <form className="form-stack" onSubmit={(event) => void submit(event)}>
        <Field label="Nombre" value={name} onChange={setName} placeholder="Nombre del ejercicio" />
        <SelectField
          label="Músculo principal"
          value={muscle}
          onChange={(value) => setMuscle(value as Muscle)}
          options={MUSCLES.map((item) => ({ value: item, label: MUSCLE_LABELS[item] }))}
        />
        <div className="field">
          <span>Músculos secundarios</span>
          <div className="chip-row">
            {MUSCLES.filter((item) => item !== muscle).map((item) => (
              <button
                key={item}
                className={cx("filter-chip", secondary.includes(item) && "filter-chip-active")}
                type="button"
                aria-pressed={secondary.includes(item)}
                onClick={() =>
                  setSecondary((current) =>
                    current.includes(item) ? current.filter((value) => value !== item) : [...current, item],
                  )
                }
              >
                {MUSCLE_LABELS[item]}
              </button>
            ))}
          </div>
        </div>
        <SelectField
          label="Patrón de movimiento"
          value={pattern}
          onChange={(value) => setPattern(value as Exercise["pattern"])}
          options={Object.entries(EXERCISE_PATTERN_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <SelectField
          label="Equipo"
          value={equipment}
          onChange={setEquipment}
          options={[...EQUIPMENT_OPTIONS.filter((item) => item !== "Gimnasio completo"), "otros"].map((item) => ({
            value: item,
            label: labelTitle(item),
          }))}
        />
        <Field label="Pasos, uno por línea" multiline value={steps} onChange={setSteps} />
        <Field label="Errores frecuentes, uno por línea" multiline value={errors} onChange={setErrors} />
        <div className="sheet-actions">
          <Button variant="quiet" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" disabled={!name.trim() || saving}>
            {saving ? "Guardando" : "Guardar ejercicio"}
          </Button>
        </div>
      </form>
    </DialogFrame>
  );
}
