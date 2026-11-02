import { LineChart } from "../components/Charts";
import { Icon } from "../components/Icon";
import { Button, EmptyState } from "../components/ui";
import { label, labelTitle } from "../i18n/es";
import { cx, exerciseName, formatClock, formatDate } from "../lib/format";
import {
  activePainZones,
  dailyMaxIntensity,
  PAIN_QUALITIES,
  PAIN_SIDES,
  PAIN_WHEN,
  redFlags,
  SAFETY_MESSAGE,
  todaysEntries,
  trainingBefore,
} from "../lib/pain";
import type { Exercise, PainEntry, TrainingSession } from "../types";
import { useMemo, useState } from "react";

export function PainScreen({
  entries,
  sessions,
  catalog,
  onBack,
  onLog,
  onNoPain,
  onEdit,
  onResolve,
  onDelete,
}: {
  entries: PainEntry[];
  sessions: TrainingSession[];
  catalog: Exercise[];
  onBack: () => void;
  onLog: () => void;
  onNoPain: () => void;
  onEdit: (entry: PainEntry) => void;
  onResolve: (entry: PainEntry) => void;
  onDelete: (entry: PainEntry) => void;
}) {
  const [zone, setZone] = useState<string>("");
  const active = activePainZones(entries);
  const today = todaysEntries(entries);
  const zonesWithData = useMemo(
    () => [...new Set(entries.flatMap((entry) => entry.zones))].sort((a, b) => label(a).localeCompare(label(b))),
    [entries],
  );
  const filtered = zone
    ? entries.filter((entry) => entry.status === "sin_dolor" || entry.zones.includes(zone))
    : entries;
  const series = dailyMaxIntensity(entries, zone || undefined).slice(-45);
  const alerting = active.filter((item) => redFlags(item.entry).length > 0);

  return (
    <div className="screen pain-screen">
      <div className="subscreen-head">
        <button type="button" className="icon-button" onClick={onBack} aria-label="Volver">
          <Icon name="back" />
        </button>
        <div>
          <p className="eyebrow">REGISTRO DE DOLOR</p>
          <h1>Cómo está tu cuerpo</h1>
        </div>
      </div>
      <p className="muted-copy">
        Cada registro se guarda aparte y nunca se sobrescribe. Es un diario descriptivo: no diagnostica ni indica
        causas.
      </p>

      {alerting.length > 0 && (
        <div className="safety-alert" role="alert">
          <Icon name="alert" size={20} />
          <div>
            <strong>Registraste señales de alerta</strong>
            <p>{SAFETY_MESSAGE}</p>
          </div>
        </div>
      )}

      <div className="pain-actions">
        <Button variant="secondary" icon="smile" onClick={onNoPain}>
          Sin dolor hoy
        </Button>
        <Button variant="primary" icon="pain" onClick={onLog}>
          Registrar dolor
        </Button>
      </div>
      {today[0] && (
        <p className="pain-today-status">
          Hoy: {today[0].status === "sin_dolor" ? "sin dolor" : `dolor en ${today[0].zones.map(label).join(", ")}`} ·{" "}
          {formatClock(today[0].at)}
        </p>
      )}

      <section className="tracking-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">EN CURSO</p>
            <h2>{active.length ? "Zonas con dolor activo" : "Sin zonas con dolor activo"}</h2>
          </div>
        </div>
        {active.length ? (
          <div className="active-pain-list">
            {active.map(({ zone: activeZone, entry }) => (
              <div className="active-pain-row" key={activeZone}>
                <div>
                  <strong>{labelTitle(activeZone)}</strong>
                  <small>
                    Último registro {formatDate(entry.at, { day: "numeric", month: "short" })} ·{" "}
                    {entry.intensity ?? "?"}
                    /10
                  </small>
                </div>
                <Button variant="quiet" icon="check" onClick={() => onResolve(entry)}>
                  Resuelto
                </Button>
              </div>
            ))}
            <small className="muted-copy">
              Mientras haya dolor activo, al adaptar la sesión se sugerirán alternativas para esas zonas. Nada se cambia
              solo.
            </small>
          </div>
        ) : (
          <p className="muted-copy">Cuando registres un dolor en curso aparecerá acá hasta que lo marques resuelto.</p>
        )}
      </section>

      {zonesWithData.length > 0 && (
        <div className="chip-row" role="group" aria-label="Filtrar por zona">
          <button type="button" className={cx("chip", !zone && "chip-active")} onClick={() => setZone("")}>
            Todas
          </button>
          {zonesWithData.map((item) => (
            <button
              key={item}
              type="button"
              className={cx("chip", zone === item && "chip-active")}
              aria-pressed={zone === item}
              onClick={() => setZone(zone === item ? "" : item)}
            >
              {labelTitle(item)}
            </button>
          ))}
        </div>
      )}

      <section className="tracking-panel">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">TENDENCIA</p>
            <h2>Intensidad máxima por día{zone ? ` · ${label(zone)}` : ""}</h2>
          </div>
        </div>
        <LineChart
          values={series.map((point) => point.value)}
          labels={series.map((point) =>
            formatDate(new Date(`${point.day}T12:00:00`).getTime(), { day: "numeric", month: "short" }),
          )}
          unit="/10"
          empty="Todavía no hay registros para graficar."
        />
      </section>

      <section className="pain-timeline" aria-label="Historial de registros">
        {filtered.length === 0 ? (
          <EmptyState
            title="Sin registros"
            description="Usa «Sin dolor hoy» o «Registrar dolor». Un registro diario, aunque sea sin dolor, da contexto."
          />
        ) : (
          filtered.map((entry) => {
            const before = trainingBefore(entry, sessions);
            const flags = redFlags(entry);
            return (
              <article key={entry.id} className={cx("pain-card", entry.status === "sin_dolor" && "pain-card-ok")}>
                <header>
                  <span
                    className={cx("pain-badge", entry.status === "sin_dolor" ? "pain-badge-ok" : "pain-badge-pain")}
                  >
                    {entry.status === "sin_dolor" ? "Sin dolor" : `${entry.intensity ?? "?"}/10`}
                  </span>
                  <div>
                    <strong>
                      {entry.status === "sin_dolor" ? "Sin dolor" : entry.zones.map(labelTitle).join(", ")}
                      {entry.side
                        ? ` · ${PAIN_SIDES.find((side) => side.value === entry.side)?.label.toLowerCase()}`
                        : ""}
                    </strong>
                    <small>
                      {formatDate(entry.at, { weekday: "short", day: "numeric", month: "short" })} ·{" "}
                      {formatClock(entry.at)} · {PAIN_WHEN.find((item) => item.value === entry.when)?.label}
                    </small>
                  </div>
                  {entry.status === "dolor" && (
                    <span className="pain-state">
                      {entry.resolvedAt
                        ? `Resuelto ${formatDate(entry.resolvedAt, { day: "numeric", month: "short" })}`
                        : entry.ongoing
                          ? "En curso"
                          : "Puntual"}
                    </span>
                  )}
                </header>
                {entry.quality?.length ? (
                  <p className="pain-meta">
                    {entry.quality
                      .map((value) => PAIN_QUALITIES.find((item) => item.value === value)?.label)
                      .join(", ")}
                  </p>
                ) : null}
                {entry.note && <p className="pain-note">{entry.note}</p>}
                {flags.length > 0 && (
                  <p className="error-copy">
                    {flags.join(" · ")}. {SAFETY_MESSAGE}
                  </p>
                )}
                {entry.context?.exerciseId && (
                  <p className="pain-meta">Durante: {exerciseName(catalog, entry.context.exerciseId)}</p>
                )}
                {entry.status === "dolor" && before.length > 0 && (
                  <details className="pain-before">
                    <summary>Lo que entrenaste antes (descriptivo)</summary>
                    {before.map((session) => (
                      <p key={session.id}>
                        <strong>
                          {session.dayName} · {formatDate(session.endedAt, { day: "numeric", month: "short" })}
                        </strong>
                        : {session.exercises.map((item) => exerciseName(catalog, item.exerciseId)).join(", ")}
                      </p>
                    ))}
                  </details>
                )}
                {entry.revision && entry.revision > 1 ? (
                  <small className="muted-copy">
                    {entry.revision === 2 ? "Editado 1 vez" : `Editado ${entry.revision - 1} veces`} (ver bitácora en
                    Ajustes)
                  </small>
                ) : null}
                <div className="pain-card-actions">
                  {entry.status === "dolor" && (
                    <button type="button" className="text-action" onClick={() => onEdit(entry)}>
                      Editar
                    </button>
                  )}
                  {entry.status === "dolor" && entry.ongoing && !entry.resolvedAt && (
                    <button type="button" className="text-action" onClick={() => onResolve(entry)}>
                      Marcar resuelto
                    </button>
                  )}
                  <button type="button" className="text-action danger-text" onClick={() => onDelete(entry)}>
                    Eliminar
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
