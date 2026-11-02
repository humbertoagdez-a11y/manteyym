import { labelTitle } from "../i18n/es";
import { newPainEntry, PAIN_QUALITIES, PAIN_SIDES, PAIN_WHEN, PAIN_ZONES, redFlags, SAFETY_MESSAGE } from "../lib/pain";
import { cx } from "../lib/format";
import type { PainEntry, PainQuality, PainSide, PainWhen } from "../types";
import { Icon } from "./Icon";
import { Button, DialogFrame, Field, SelectField, SwitchRow } from "./ui";
import { useState } from "react";

export interface PainSheetConfig {
  title: string;
  /** Si viene, se edita esa entrada (crea una revisión en la bitácora). */
  initial?: PainEntry;
  when: PainWhen;
  context?: PainEntry["context"];
  /** Modo rápido (en sesión): zona + intensidad + guardar; los detalles quedan plegados. */
  quick?: boolean;
  /** Zonas sugeridas primero (p. ej. las que tienen dolor activo). */
  suggestedZones?: string[];
}

/** Hoja para registrar o editar un dolor. "Sin dolor" se registra fuera de esta hoja con un solo toque. */
export function PainSheet({
  config,
  onSave,
  onClose,
}: {
  config: PainSheetConfig;
  onSave: (entry: PainEntry) => void;
  onClose: () => void;
}) {
  const initial = config.initial;
  const [zones, setZones] = useState<string[]>(initial?.zones ?? []);
  const [intensity, setIntensity] = useState<number | undefined>(initial?.intensity);
  const [side, setSide] = useState<PainSide | undefined>(initial?.side);
  const [quality, setQuality] = useState<PainQuality[]>(initial?.quality ?? []);
  const [when, setWhen] = useState<PainWhen>(initial?.when ?? config.when);
  const [afterImpact, setAfterImpact] = useState(Boolean(initial?.afterImpact));
  const [note, setNote] = useState(initial?.note ?? "");
  const [ongoing, setOngoing] = useState(initial ? initial.ongoing : true);
  const [details, setDetails] = useState(!config.quick || Boolean(initial));
  const orderedZones = [
    ...(config.suggestedZones ?? []).filter((zone) => (PAIN_ZONES as readonly string[]).includes(zone)),
    ...PAIN_ZONES.filter((zone) => !config.suggestedZones?.includes(zone)),
  ];
  const flags = redFlags({ status: "dolor", zones, quality, afterImpact, intensity });
  const canSave = zones.length > 0 && intensity !== undefined;
  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  const save = () => {
    if (!canSave) return;
    const fields = {
      status: "dolor" as const,
      zones,
      intensity,
      side,
      quality: quality.length ? quality : undefined,
      when,
      afterImpact: afterImpact || undefined,
      note: note.trim(),
      ongoing,
      resolvedAt: ongoing ? undefined : (initial?.resolvedAt ?? Date.now()),
      context: initial?.context ?? config.context,
    };
    onSave(initial ? { ...initial, ...fields } : newPainEntry(fields));
  };

  return (
    <DialogFrame title={config.title} onClose={onClose}>
      <div className="form-stack pain-sheet">
        <fieldset className="pain-fieldset">
          <legend>¿Dónde?</legend>
          <div className="chip-grid">
            {orderedZones.map((zone) => (
              <button
                key={zone}
                type="button"
                className={cx("chip", zones.includes(zone) && "chip-active")}
                aria-pressed={zones.includes(zone)}
                onClick={() => setZones(config.quick && !details ? [zone] : toggle(zones, zone))}
              >
                {labelTitle(zone)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="pain-fieldset">
          <legend>Intensidad (0 = nada, 10 = el peor imaginable)</legend>
          <div className="intensity-scale" role="group" aria-label="Intensidad de 0 a 10">
            {Array.from({ length: 11 }, (_, value) => (
              <button
                key={value}
                type="button"
                className={cx("intensity-button", intensity === value && "intensity-active")}
                style={{ ["--level" as string]: value }}
                aria-pressed={intensity === value}
                onClick={() => setIntensity(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </fieldset>

        {flags.length > 0 && (
          <div className="safety-alert" role="alert">
            <Icon name="alert" size={20} />
            <div>
              <strong>{flags.join(" · ")}</strong>
              <p>{SAFETY_MESSAGE}</p>
            </div>
          </div>
        )}

        {!details ? (
          <button type="button" className="text-action" onClick={() => setDetails(true)}>
            Agregar detalles (lado, tipo, nota) <Icon name="plus" size={16} />
          </button>
        ) : (
          <>
            <fieldset className="pain-fieldset">
              <legend>Lado</legend>
              <div className="chip-row">
                {PAIN_SIDES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cx("chip", side === option.value && "chip-active")}
                    aria-pressed={side === option.value}
                    onClick={() => setSide(side === option.value ? undefined : option.value)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="pain-fieldset">
              <legend>¿Cómo se siente?</legend>
              <div className="chip-row">
                {PAIN_QUALITIES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={cx("chip", quality.includes(option.value) && "chip-active")}
                    aria-pressed={quality.includes(option.value)}
                    onClick={() => setQuality(toggle(quality, option.value))}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <SelectField
              label="¿Cuándo apareció?"
              value={when}
              onChange={(value) => setWhen(value as PainWhen)}
              options={PAIN_WHEN}
            />
            <SwitchRow
              title="Apareció después de un golpe, caída o torsión"
              checked={afterImpact}
              onChange={setAfterImpact}
            />
            <SwitchRow
              title="Sigue presente"
              description="Desactívalo cuando la molestia se haya resuelto."
              checked={ongoing}
              onChange={setOngoing}
            />
            <Field label="Nota" value={note} onChange={setNote} multiline placeholder="Qué la empeora o la alivia" />
          </>
        )}

        <p className="muted-copy">ManteYym registra lo que indicas; no diagnostica ni reemplaza a un profesional.</p>
        <div className="sheet-actions">
          <Button variant="quiet" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={!canSave}>
            {initial ? "Guardar cambios" : "Guardar registro"}
          </Button>
        </div>
      </div>
    </DialogFrame>
  );
}
