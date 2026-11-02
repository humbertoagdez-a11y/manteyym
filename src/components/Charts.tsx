import { MUSCLES, MUSCLE_LABELS } from "../engine/fitness";
import type { Muscle } from "../types";

export function LineChart({
  values,
  labels,
  unit = "",
  empty = "Registra una sesión para ver tu tendencia.",
}: {
  values: number[];
  labels?: string[];
  unit?: string;
  empty?: string;
}) {
  if (!values.length) return <div className="chart-empty">{empty}</div>;
  const width = 620;
  const height = 210;
  const pad = 22;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => ({
    x: pad + (values.length === 1 ? (width - pad * 2) / 2 : (index / (values.length - 1)) * (width - pad * 2)),
    y: height - pad - ((value - min) / range) * (height - pad * 2),
    value,
  }));
  const path = points.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const area = `${path} L${points.at(-1)?.x},${height - pad} L${points[0].x},${height - pad} Z`;
  return (
    <div className="chart-wrap">
      <svg
        className="line-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Gráfica de ${values.length} registros`}
      >
        {[0, 1, 2, 3].map((row) => (
          <line
            key={row}
            x1={pad}
            x2={width - pad}
            y1={pad + row * ((height - pad * 2) / 3)}
            y2={pad + row * ((height - pad * 2) / 3)}
            className="chart-grid"
          />
        ))}
        <path d={area} className="chart-area" />
        <path d={path} className="chart-line" />
        {points.map((point, index) => (
          <circle key={index} cx={point.x} cy={point.y} r="4" className="chart-dot">
            <title>{`${labels?.[index] ?? `Registro ${index + 1}`}: ${point.value}${unit}`}</title>
          </circle>
        ))}
      </svg>
      <div className="chart-axis">
        <span>{labels?.[0] ?? "Inicio"}</span>
        <strong>
          {values.at(-1)?.toLocaleString("es-ES", { maximumFractionDigits: 1 })} {unit}
        </strong>
        <span>{labels?.at(-1) ?? "Ahora"}</span>
      </div>
    </div>
  );
}

export function BarChart({ values, targets }: { values: Record<Muscle, number>; targets: Record<Muscle, number> }) {
  return (
    <div className="bar-chart" aria-label="Series efectivas por grupo muscular frente a rangos orientativos">
      {MUSCLES.map((muscle) => {
        const value = values[muscle] ?? 0;
        const target = targets[muscle] ?? 12;
        const width = Math.min(100, Math.max(0, (value / Math.max(target, 1)) * 72));
        return (
          <div className="bar-row" key={muscle}>
            <span>{MUSCLE_LABELS[muscle]}</span>
            <div className="bar-track">
              <i style={{ width: `${width}%` }} />
              <b style={{ left: `${Math.min(98, (target / Math.max(target, 1)) * 72)}%` }} />
            </div>
            <strong>{value.toLocaleString("es-ES", { maximumFractionDigits: 1 })}</strong>
          </div>
        );
      })}
    </div>
  );
}

export function BodyMap({ values }: { values: Record<Muscle, number> }) {
  const amount = Math.max(1, ...Object.values(values));
  const fill = (muscle: Muscle) =>
    values[muscle] ? `rgba(190, 237, 112, ${0.2 + Math.min(0.72, (values[muscle] / amount) * 0.72)})` : "#263129";
  return (
    <div className="body-map-wrap">
      <svg
        viewBox="0 0 180 250"
        className="body-map"
        role="img"
        aria-label="Mapa frontal aproximado de grupos musculares"
      >
        <circle cx="90" cy="22" r="15" fill="#39443b" />
        <path
          d="M78 40 61 46 49 79l9 5 12-22 4 43-12 36 12 5 16-32 16 32 12-5-12-36 4-43 12 22 9-5-12-33-17-6-10 8z"
          fill="#344037"
        />
        <path d="M72 51 61 76l10 7 10-17v-9zM108 51l11 25-10 7-10-17v-9z" fill={fill("pecho")} />
        <path d="M78 70q12 10 24 0l-2 24q-10 9-20 0z" fill={fill("abdomen")} />
        <path d="M63 91q14 7 27 1l-9 29-13-4zM117 91q-14 7-27 1l9 29 13-4z" fill={fill("cuadriceps")} />
        <path d="m62 146-4 47 10 2 7-44zM118 146l4 47-10 2-7-44z" fill="#39443b" />
        <path d="m58 193-4 37 10 3 4-35zM122 193l4 37-10 3-4-35z" fill={fill("gemelos")} />
        <path d="M48 79 35 119l7 5 20-38zM132 79l13 40-7 5-20-38z" fill="#39443b" />
        <path d="M70 48q20 9 40 0l-5 14H75z" fill={fill("hombros")} />
      </svg>
      <div className="body-map-key">
        <span>
          <i /> Actividad reciente
        </span>
        <small>Esquema orientativo; no es una medición corporal.</small>
      </div>
    </div>
  );
}
