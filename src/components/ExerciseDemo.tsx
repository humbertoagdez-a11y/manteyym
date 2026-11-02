import { EXERCISE_PATTERN_LABELS } from "../constants";
import { cx } from "../lib/format";
import type { Exercise } from "../types";
import { Icon } from "./Icon";
import { useEffect, useRef, useState } from "react";

const REMOTE_PREFIX = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/";

/** URL para mostrar un frame: local (empaquetado) o remoto pasando por el SW para cachearlo. */
function frameUrl(frame: string): string {
  if (!frame.startsWith(REMOTE_PREFIX)) return new URL(frame, document.baseURI).href;
  if (!navigator.serviceWorker?.controller) return frame;
  const local = new URL("exercise-image", new URL("./", document.baseURI));
  local.searchParams.set("url", frame);
  return local.href;
}

export function exerciseFrames(exercise: Exercise): string[] {
  if (exercise.media?.frames.length) return exercise.media.frames;
  return exercise.images ?? [];
}

// Curva suave (ease-in-out) para que la transición no sea un corte seco.
const ease = (t: number) => 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, t))) / 2;
// Ciclo: pausa en inicio → transición → pausa en final → transición de vuelta.
function positionAt(phase: number): number {
  if (phase < 0.2) return 0;
  if (phase < 0.5) return ease((phase - 0.2) / 0.3);
  if (phase < 0.7) return 1;
  return 1 - ease((phase - 0.7) / 0.3);
}

/**
 * Demo animada a partir de 2 fotos (posición inicial y final).
 * - compact: miniatura estática (primer frame), para listas y la sesión activa.
 * - Respeta prefers-reduced-motion: arranca en modo manual con el control deslizante.
 */
export function ExerciseDemo({ exercise, compact = false }: { exercise: Exercise; compact?: boolean }) {
  const frames = exerciseFrames(exercise).slice(0, 2);
  const reducedMotion =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  const [playing, setPlaying] = useState(!reducedMotion);
  const [slow, setSlow] = useState(false);
  const [position, setPosition] = useState(0);
  const [failed, setFailed] = useState(false);
  const phaseRef = useRef(0);

  useEffect(() => {
    if (compact || !playing || frames.length < 2 || failed) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const cycle = slow ? 6400 : 3400;
      // Si la pestaña está oculta no se avanza (ahorra batería).
      if (document.visibilityState === "visible") phaseRef.current = (phaseRef.current + (now - last) / cycle) % 1;
      last = now;
      setPosition(positionAt(phaseRef.current));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [compact, playing, slow, frames.length, failed]);

  const alt = (index: number) =>
    exercise.media?.alt
      ? `${exercise.media.alt}: ${index === 0 ? "posición inicial" : "posición final"}`
      : `${exercise.name}, ${index === 0 ? "posición inicial" : "posición final"}`;

  if (!frames.length || failed) {
    return (
      <div className={cx("visual-guide", compact && "visual-guide-compact")} role={compact ? undefined : "note"}>
        <div className="guide-symbol">
          <Icon name="ejercicios" size={compact ? 20 : 35} />
        </div>
        {!compact && (
          <>
            <span className="eyebrow">SIN DEMO DISPONIBLE</span>
            <strong>{EXERCISE_PATTERN_LABELS[exercise.pattern] ?? "Movimiento"}</strong>
            <small>
              {failed
                ? "No se pudo cargar la imagen (¿sin conexión?). Sigue los pasos escritos."
                : "Este ejercicio todavía no tiene imágenes. Sigue los pasos y errores frecuentes."}
            </small>
          </>
        )}
      </div>
    );
  }

  if (compact) {
    return (
      <div className="demo-thumb">
        <img
          src={frameUrl(frames[0])}
          alt={alt(0)}
          width={640}
          height={427}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  const percent = Math.round(position * 100);
  return (
    <figure className="exercise-demo">
      <div className="demo-stage">
        <img src={frameUrl(frames[0])} alt={alt(0)} width={640} height={427} onError={() => setFailed(true)} />
        {frames[1] && (
          <img
            src={frameUrl(frames[1])}
            alt={alt(1)}
            width={640}
            height={427}
            className="demo-top"
            style={{ opacity: position }}
            aria-hidden={position < 0.5}
            onError={() => setFailed(true)}
          />
        )}
        <div className="demo-labels" aria-hidden="true">
          <span className={cx(position < 0.5 && "demo-label-active")}>Inicio</span>
          <span className={cx(position >= 0.5 && "demo-label-active")}>Final</span>
        </div>
      </div>
      {frames.length > 1 && (
        <div className="demo-controls">
          <button
            type="button"
            className="icon-button"
            onClick={() => setPlaying(!playing)}
            aria-label={playing ? "Pausar demostración" : "Reproducir demostración"}
          >
            <Icon name={playing ? "pause" : "play"} size={18} />
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={percent}
            aria-label="Recorrer el movimiento de inicio a final"
            aria-valuetext={`${percent}% del recorrido`}
            onChange={(event) => {
              setPlaying(false);
              const value = Number(event.target.value) / 100;
              setPosition(value);
              phaseRef.current = 0.2 + 0.3 * value;
            }}
          />
          <button
            type="button"
            className="demo-speed"
            onClick={() => setSlow(!slow)}
            aria-pressed={slow}
            aria-label="Velocidad lenta"
          >
            {slow ? "Lento" : "Normal"}
          </button>
        </div>
      )}
      <figcaption>
        {reducedMotion && "Movimiento reducido activo: usa el control deslizante. "}
        {exercise.media?.note && <span className="demo-note">{exercise.media.note} </span>}
        {exercise.media && (
          <span className="demo-credit">
            Imágenes: {exercise.media.source} ({exercise.media.license})
          </span>
        )}
      </figcaption>
    </figure>
  );
}
