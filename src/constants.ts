import type { Profile } from "./types";

export const APP_VERSION = __APP_VERSION__;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const NAV_ITEMS: {
  id: "hoy" | "rutinas" | "ejercicios" | "progreso" | "ajustes";
  label: string;
  icon: string;
}[] = [
  { id: "hoy", label: "Hoy", icon: "hoy" },
  { id: "rutinas", label: "Rutinas", icon: "rutinas" },
  { id: "ejercicios", label: "Ejercicios", icon: "ejercicios" },
  { id: "progreso", label: "Progreso", icon: "progreso" },
  { id: "ajustes", label: "Ajustes", icon: "ajustes" },
];
export const GOALS: { value: Profile["goal"]; title: string; description: string }[] = [
  { value: "hipertrofia", title: "Ganar masa muscular", description: "Volumen gradual y ejercicios de fuerza." },
  {
    value: "fuerza",
    title: "Aumentar mi fuerza",
    description: "Prioridad a movimientos compuestos y descansos amplios.",
  },
  {
    value: "perdida_grasa",
    title: "Perder grasa",
    description: "Entrenamiento de fuerza sostenible; sin planes de dieta.",
  },
  {
    value: "resistencia",
    title: "Mejorar resistencia",
    description: "Rangos de repeticiones altos y trabajo constante.",
  },
  { value: "salud", title: "Salud general", description: "Una rutina equilibrada, adaptable y progresiva." },
];
export const EQUIPMENT_OPTIONS = [
  "Gimnasio completo",
  "barra",
  "mancuernas",
  "banco",
  "poleas",
  "maquinas",
  "bandas",
  "peso corporal",
];
export const INJURY_ZONES = ["hombro", "codo", "muneca", "espalda baja", "rodilla", "cadera", "tobillo"];
export const EXERCISE_PATTERN_LABELS: Record<string, string> = {
  "empuje-horizontal": "Empuje horizontal",
  "empuje-vertical": "Empuje vertical",
  "tiron-horizontal": "Tirón horizontal",
  "tiron-vertical": "Tirón vertical",
  bisagra: "Bisagra de cadera",
  sentadilla: "Sentadilla",
  zancada: "Zancada",
  core: "Zona media",
  aislamiento: "Aislamiento",
  otro: "Otro",
};
