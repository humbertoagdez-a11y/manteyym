import { EXERCISE_PATTERN_LABELS } from "../constants";
import { cx } from "../lib/format";
import type { Exercise } from "../types";
import { Icon } from "./Icon";
import { useEffect, useState } from "react";

export function ExerciseVisual({ exercise, compact = false }: { exercise: Exercise; compact?: boolean }) {
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
    if (images.length < 2 || paused || (slow && reducedMotion) || reducedMotion) return;
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
  if (images.length > 1 && reducedMotion && !compact && !failed)
    return (
      <div className="exercise-visual exercise-static-frames">
        <div>
          {images.slice(0, 2).map((image, index) => (
            <figure className={frame === index ? "static-frame-active" : ""} key={image}>
              <img
                src={imageUrl(image)}
                alt={`Posición ${index + 1} de ${exercise.name}`}
                loading="lazy"
                onError={() => setFailed(true)}
              />
              <figcaption>Posición {index + 1}</figcaption>
            </figure>
          ))}
        </div>
        <div className="visual-controls">
          <button type="button" onClick={() => setFrame((value) => (value + 1) % 2)} aria-label="Cambiar posición">
            <Icon name="refresh" size={16} /> Posición {frame + 1}
          </button>
        </div>
      </div>
    );
  if (images.length && !failed)
    return (
      <div className={cx("exercise-visual", compact && "exercise-visual-compact")}>
        <img
          src={imageUrl(images[frame % images.length])}
          alt={`Posición ${frame + 1} de ${exercise.name}`}
          loading="lazy"
          onError={() => setFailed(true)}
        />
        {!compact && (
          <div className="visual-controls">
            <button
              type="button"
              onClick={() => setFrame((value) => (value + 1) % images.length)}
              aria-label="Cambiar posición"
            >
              <Icon name="refresh" size={16} />
            </button>
            <button
              type="button"
              onClick={() => setPaused(!paused)}
              aria-label={paused ? "Reanudar animación" : "Pausar animación"}
            >
              <Icon name={paused ? "play" : "pause"} size={16} />
            </button>
            <button type="button" onClick={() => setSlow(!slow)} aria-label="Cambiar velocidad">
              {slow ? "Lento" : "Normal"}
            </button>
          </div>
        )}
        {!compact && reducedMotion && (
          <p className="visual-note">Movimiento reducido activo. Cambia la posición con el control manual.</p>
        )}
      </div>
    );
  return (
    <div className={cx("visual-guide", compact && "visual-guide-compact")}>
      <div className="guide-symbol">
        <Icon name="ejercicios" size={compact ? 20 : 35} />
      </div>
      {!compact && (
        <>
          <span className="eyebrow">GUÍA TÉCNICA</span>
          <strong>{EXERCISE_PATTERN_LABELS[exercise.pattern] ?? "Movimiento"}</strong>
          <small>Sin imagen disponible. Consulta los pasos y errores frecuentes.</small>
        </>
      )}
    </div>
  );
}
