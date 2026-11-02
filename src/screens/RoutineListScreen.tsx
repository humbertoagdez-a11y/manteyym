import { label } from "../i18n/es";
import { Icon } from "../components/Icon";
import { Button, EmptyState, SelectField } from "../components/ui";
import { workoutTemplateLabels } from "../engine/fitness";
import { cx, formatDate, weekIndex } from "../lib/format";
import type { Profile, Routine, TrainingBlock } from "../types";

export function RoutineListScreen({
  routines,
  activeId,
  activeBlock,
  profile,
  onCreate,
  onNew,
  onEdit,
  onSelect,
  onDuplicate,
  onDelete,
  onUpdateBlock,
}: {
  routines: Routine[];
  activeId?: string;
  activeBlock?: TrainingBlock;
  profile: Profile;
  onCreate: (template: string) => void;
  onNew: () => void;
  onEdit: (routine: Routine) => void;
  onSelect: (routine: Routine) => void;
  onDuplicate: (routine: Routine) => void;
  onDelete: (routine: Routine) => void;
  onUpdateBlock: (block: TrainingBlock) => void;
}) {
  const templates = workoutTemplateLabels();
  return (
    <div className="screen">
      <div className="page-intro">
        <p className="eyebrow">PLANIFICACIÓN</p>
        <h1>Rutinas</h1>
        <p>Una estructura flexible, que puedes ajustar cuando tu semana lo necesite.</p>
      </div>
      <section className="template-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">PLANTILLAS</p>
            <h2>Empieza con una estructura</h2>
          </div>
          <Button variant="secondary" icon="plus" onClick={onNew}>
            Rutina vacía
          </Button>
        </div>
        <div className="template-grid">
          {templates.map((template, index) => (
            <button type="button" key={template.id} className="template-choice" onClick={() => onCreate(template.id)}>
              <span className="template-number">0{index + 1}</span>
              <strong>{template.label}</strong>
              <small>
                {template.id === "auto"
                  ? `${profile.days} días, según tu disponibilidad`
                  : template.id === "5x5"
                    ? "Tres sesiones · foco en fuerza"
                    : template.id === "30 minutos"
                      ? "Cuatro movimientos por día"
                      : "Programa adaptable a tus días disponibles"}
              </small>
              <span className="template-cta">
                Usar plantilla <Icon name="next" size={16} />
              </span>
            </button>
          ))}
        </div>
      </section>
      <div className="section-heading routine-list-heading">
        <div>
          <p className="eyebrow">TUS PLANES</p>
          <h2>Rutinas guardadas</h2>
        </div>
        <span className="subtle-count">{routines.length} planes</span>
      </div>
      {!routines.length ? (
        <EmptyState
          title="Tus rutinas aparecerán aquí"
          description="Elige una de las plantillas de arriba o crea una rutina vacía para construir tu propio plan."
        />
      ) : (
        <div className="routine-list">
          {routines.map((routine) => {
            const active = routine.id === activeId;
            const block = active ? activeBlock : undefined;
            return (
              <article key={routine.id} className={cx("routine-row", active && "routine-row-active")}>
                <div className="routine-row-mark">
                  <span>{routine.name.slice(0, 1).toUpperCase()}</span>
                </div>
                <div className="routine-row-main">
                  <div className="routine-row-title">
                    <strong>{routine.name}</strong>
                    {active && <span className="active-label">ACTIVA</span>}
                  </div>
                  <p>
                    {label(routine.split)} · {routine.days.length} sesiones · creada {formatDate(routine.createdAt)}
                  </p>
                  <div className="routine-row-preview">
                    {routine.days.map((day) => (
                      <span key={day.id}>
                        {day.name} <small>{day.exercises.length} ejer.</small>
                      </span>
                    ))}
                  </div>
                  {active && block && (
                    <>
                      <small className="routine-block-copy">
                        Bloque de {block.weeks} semanas · semana {weekIndex(block)}
                      </small>
                      <div className="block-editor-controls">
                        <SelectField
                          label="Duración"
                          value={String(block.weeks)}
                          onChange={(value) =>
                            onUpdateBlock({
                              ...block,
                              weeks: Number(value),
                              deloadWeek: Math.min(block.deloadWeek, Number(value)),
                            })
                          }
                          options={[4, 5, 6, 7, 8].map((value) => ({
                            value: String(value),
                            label: `${value} semanas`,
                          }))}
                        />
                        <SelectField
                          label="Semana de descarga"
                          value={String(block.deloadWeek)}
                          onChange={(value) => onUpdateBlock({ ...block, deloadWeek: Number(value) })}
                          options={Array.from({ length: block.weeks }, (_, index) => ({
                            value: String(index + 1),
                            label: `Semana ${index + 1}`,
                          }))}
                        />
                      </div>
                    </>
                  )}
                  {active && !block && <small className="routine-block-copy">Sin bloque de entrenamiento activo</small>}
                </div>
                <div className="routine-row-actions">
                  {!active && (
                    <Button variant="secondary" onClick={() => onSelect(routine)}>
                      Activar
                    </Button>
                  )}
                  <Button
                    variant="quiet"
                    icon="edit"
                    ariaLabel={`Editar ${routine.name}`}
                    onClick={() => onEdit(routine)}
                  >
                    Editar
                  </Button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Duplicar ${routine.name}`}
                    onClick={() => onDuplicate(routine)}
                  >
                    <Icon name="copy" size={18} />
                  </button>
                  <button
                    type="button"
                    className="icon-button danger-icon"
                    aria-label={`Eliminar ${routine.name}`}
                    onClick={() => onDelete(routine)}
                  >
                    <Icon name="trash" size={17} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="note-inline">
        <Icon name="info" size={17} /> Los rangos de volumen semanal son orientativos y deben ajustarse a tu
        recuperación, experiencia y preferencias.
      </p>
      <details className="catalog-coverage">
        <summary>Cómo se genera el plan</summary>
        <p>
          La rutina organiza patrones de empuje, tirón, bisagra, sentadilla, zancada y zona media. Primero propone
          ejercicios compuestos; luego aislamientos, dentro del equipo que has marcado. Si no hay una opción compatible
          con una molestia, el movimiento se omite para que puedas elegir otra variante.
        </p>
      </details>
    </div>
  );
}
