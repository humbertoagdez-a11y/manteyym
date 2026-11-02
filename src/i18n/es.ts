// Etiquetas visibles para valores que se guardan en IndexedDB.
// El valor persistido NO cambia (p. ej. "muneca", "maquinas", "5 dias"): datos y respaldos viejos
// siguen funcionando y la UI muestra la forma correcta en español.

const VALUE_LABELS: Record<string, string> = {
  // Equipo
  maquinas: "máquinas",
  "balon medicinal": "balón medicinal",
  "gimnasio completo": "Gimnasio completo",
  // Zonas corporales
  muneca: "muñeca",
  "espalda baja": "espalda baja",
  "espalda alta": "espalda alta",
  // Divisiones de rutina
  "5 dias": "5 días",
  // Músculos (por si alguno se muestra en minúscula)
  cuadriceps: "cuádriceps",
  gluteos: "glúteos",
  biceps: "bíceps",
  triceps: "tríceps",
};

/** Devuelve la etiqueta en español correcto de un valor persistido; si no se conoce, el mismo valor. */
export function label(value: string): string {
  return VALUE_LABELS[value] ?? VALUE_LABELS[value.toLowerCase()] ?? value;
}

/** Igual que label() pero con mayúscula inicial, para títulos y chips. */
export function labelTitle(value: string): string {
  const text = label(value);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function labelList(values: string[]): string {
  return values.map(label).join(", ");
}
