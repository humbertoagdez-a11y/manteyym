import { labelList, labelTitle } from "../i18n/es";
import { ExerciseVisual } from "../components/ExerciseVisual";
import { Icon } from "../components/Icon";
import { Button, EmptyState, SelectField } from "../components/ui";
import { EXERCISE_PATTERN_LABELS } from "../constants";
import { FREE_DB } from "../data/exerciseSource";
import { MUSCLE_LABELS, MUSCLES, normalizeText } from "../engine/fitness";
import type { Exercise } from "../types";
import { useMemo, useState } from "react";

export function ExerciseBrowser({
  catalog,
  onOpen,
  onDownload,
  onCreate,
  downloadLabel,
  downloading,
}: {
  catalog: Exercise[];
  onOpen: (exercise: Exercise) => void;
  onDownload: () => void;
  onCreate: () => void;
  downloadLabel: string;
  downloading: boolean;
}) {
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState("todos");
  const [equipment, setEquipment] = useState("todos");
  const [pattern, setPattern] = useState("todos");
  const [limit, setLimit] = useState(24);
  const equipmentValues = [...new Set(catalog.flatMap((item) => item.equipment))].sort();
  const matches = useMemo(
    () =>
      catalog.filter((exercise) => {
        const text = normalizeText(
          `${exercise.name} ${exercise.muscle} ${exercise.equipment.join(" ")} ${exercise.pattern}`,
        );
        return (
          (!query || text.includes(normalizeText(query))) &&
          (muscle === "todos" || exercise.muscle === muscle) &&
          (equipment === "todos" || exercise.equipment.includes(equipment)) &&
          (pattern === "todos" || exercise.pattern === pattern)
        );
      }),
    [catalog, equipment, muscle, pattern, query],
  );
  return (
    <div className="screen">
      <div className="page-intro">
        <p className="eyebrow">BIBLIOTECA PERSONAL</p>
        <h1>Ejercicios</h1>
        <p>Guía, técnica e historial en un solo lugar. El catálogo básico funciona sin conexión.</p>
      </div>
      <div className="library-toolbar">
        <label className="search-field">
          <Icon name="search" size={19} />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(24);
            }}
            placeholder="Buscar ejercicio o músculo"
            aria-label="Buscar ejercicios"
          />
          {query && (
            <button type="button" aria-label="Limpiar búsqueda" onClick={() => setQuery("")}>
              <Icon name="close" size={16} />
            </button>
          )}
        </label>
        <SelectField
          label="Músculo"
          value={muscle}
          onChange={(value) => {
            setMuscle(value);
            setLimit(24);
          }}
          options={[
            { value: "todos", label: "Todos los músculos" },
            ...MUSCLES.map((item) => ({ value: item, label: MUSCLE_LABELS[item] })),
          ]}
        />
        <SelectField
          label="Equipo"
          value={equipment}
          onChange={(value) => {
            setEquipment(value);
            setLimit(24);
          }}
          options={[
            { value: "todos", label: "Todo el equipo" },
            ...equipmentValues.map((item) => ({ value: item, label: labelTitle(item) })),
          ]}
        />
        <SelectField
          label="Patrón"
          value={pattern}
          onChange={(value) => {
            setPattern(value);
            setLimit(24);
          }}
          options={[
            { value: "todos", label: "Todos los patrones" },
            ...Object.entries(EXERCISE_PATTERN_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />
      </div>
      <div className="library-summary">
        <span>{matches.length} ejercicios</span>
        <div className="inline-actions">
          <Button variant="quiet" icon="plus" onClick={onCreate}>
            Crear ejercicio
          </Button>
          <Button variant="secondary" icon="download" onClick={onDownload} disabled={downloading}>
            {downloading ? downloadLabel : "Descargar biblioteca completa"}
          </Button>
        </div>
      </div>
      {downloading && (
        <div className="download-progress">
          <span>{downloadLabel}</span>
          <div className="progress-track">
            <i style={{ width: `${Number(downloadLabel.match(/\d+/)?.[0] ?? 0)}%` }} />
          </div>
        </div>
      )}
      {!matches.length ? (
        <EmptyState title="No encontramos ese ejercicio" description="Prueba con otra palabra o cambia los filtros." />
      ) : (
        <div className="exercise-list">
          {matches.slice(0, limit).map((exercise) => (
            <button type="button" className="exercise-row" key={exercise.id} onClick={() => onOpen(exercise)}>
              <ExerciseVisual exercise={exercise} compact />
              <span className="exercise-row-copy">
                <strong>{exercise.name}</strong>
                <small>
                  {MUSCLE_LABELS[exercise.muscle] ?? exercise.muscle} ·{" "}
                  {EXERCISE_PATTERN_LABELS[exercise.pattern] ?? "Otro"} · {labelList(exercise.equipment)}
                </small>
                {exercise.originalName && (
                  <small className="original-label">Nombre original sin traducción confirmada</small>
                )}
              </span>
              <span className="exercise-row-trailing">
                <span>{exercise.category === "compuesto" ? "Compuesto" : "Aislamiento"}</span>
                <Icon name="next" size={17} />
              </span>
            </button>
          ))}
        </div>
      )}
      {limit < matches.length && (
        <div className="load-more">
          <Button variant="secondary" onClick={() => setLimit((value) => value + 24)}>
            Mostrar más ejercicios
          </Button>
        </div>
      )}
      <p className="source-note">
        La biblioteca opcional usa{" "}
        <a href={FREE_DB.repository} target="_blank" rel="noreferrer">
          free-exercise-db
        </a>
        , publicada bajo Unlicense. Sus instrucciones pueden estar en inglés; no se inventan traducciones. Las imágenes
        reales se cargan y cachean al abrirlas.
      </p>
    </div>
  );
}
