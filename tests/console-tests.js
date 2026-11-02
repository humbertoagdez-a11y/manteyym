// Ejecutar desde la consola del navegador con el servidor de desarrollo activo:
// await import('/tests/console-tests.js').then((module) => module.runTests())
const engineUrl = new URL("../src/engine/fitness.ts", import.meta.url);
const catalogUrl = new URL("../src/data/catalog.ts", import.meta.url);
const [{ estimatedOneRepMax, calculatePlates, warmupSets, suggestProgression, detectStagnation, buildRoutine, isExerciseCompatible, volumeByMuscle }, { LOCAL_CATALOG }] = await Promise.all([
  import(engineUrl.href), import(catalogUrl.href),
]);

const resultRows = [];
function test(name, callback) {
  try {
    const details = callback();
    resultRows.push({ prueba: name, resultado: "PASA", detalle: details ?? "Correcto" });
  } catch (error) {
    resultRows.push({ prueba: name, resultado: "FALLA", detalle: error instanceof Error ? error.message : String(error) });
  }
}
function assert(condition, message) { if (!condition) throw new Error(message); }
function profile(overrides = {}) {
  return { id: "main", onboardingComplete: true, goal: "hipertrofia", level: "principiante", yearsTraining: 1, days: 3, minutes: 45,
    equipment: ["Gimnasio completo"], priorities: [], injuries: [], exclusions: [], units: "kg", progression: "doble", ...overrides };
}
function trainingSession(id, endedAt, exerciseId, sets) {
  return { id, routineId: "r", dayId: "d", dayName: "Dia A", startedAt: endedAt - 45_000, endedAt, timeZone: "UTC", durationMs: 45_000, volume: 0, notes: "",
    exercises: [{ exerciseId, targetSets: sets.length, repsMin: 6, repsMax: 12, restSec: 90, note: "", sets: sets.map((set, index) => ({ id: `${id}-${index}`, type: "normal", rir: 2, note: "", completed: true, ...set })) }] };
}

export function runTests() {
  resultRows.length = 0;
  test("1RM estimado de Epley", () => {
    assert(Math.abs(estimatedOneRepMax(100, 10) - 133.3333) < 0.01, "100 kg x 10 deberia ser aproximadamente 133,33 kg.");
    assert(estimatedOneRepMax(0, 10) === 0 && estimatedOneRepMax(100, 1) === 100, "Casos de carga nula o una repeticion incorrectos.");
    return "100 x 10 = 133,33; casos limite correctos";
  });
  test("Calculadora de discos por lado", () => {
    const result = calculatePlates(62.5, 20, [20, 15, 10, 5, 2.5, 1.25]);
    assert(result.actual === 62.5 && result.eachSide.join(",") === "20,1.25", "No se calculo 62,5 kg con los discos disponibles.");
    assert(calculatePlates(100, 20, [20, 10]).actual <= 100, "La carga real no puede superar el objetivo.");
    return "Carga por lado y redondeo descendente correctos";
  });
  test("Series de aproximacion", () => {
    const warmups = warmupSets(100);
    assert(warmups.map((set) => set.percent).join(",") === "40,60,80", "Se esperaban aproximaciones al 40, 60 y 80 por ciento.");
    assert(warmups.map((set) => set.reps).join(",") === "8,5,3", "El numero de repeticiones de aproximacion no coincide.");
    return "40/60/80 por ciento; 8/5/3 repeticiones";
  });
  test("Doble progresion", () => {
    const previous = trainingSession("old", 20, "bench-barbell", [{ weight: 80, reps: 12 }]);
    const suggestion = suggestProgression([previous], "bench-barbell", "doble", [6, 12], "kg");
    assert(suggestion.weight === 82.5 && suggestion.reps === 6, "Al alcanzar el tope, deberia sugerir una subida pequena y volver al rango bajo.");
    assert(suggestProgression([], "bench-barbell", "doble", [6, 12], "kg").reps === 6, "El primer objetivo debe usar el minimo del rango.");
    return suggestion.reason;
  });
  test("Deteccion de estancamiento en tres sesiones", () => {
    const history = [30, 20, 10].map((date, index) => trainingSession(`stall-${index}`, date, "bench-barbell", [{ weight: 80, reps: 8 }]));
    assert(detectStagnation(history, "bench-barbell"), "Tres exposiciones iguales se deben marcar como estancamiento.");
    assert(!detectStagnation(history.slice(0, 2), "bench-barbell"), "Dos exposiciones no son suficientes para marcar estancamiento.");
    return "Tres sesiones iguales: detectadas; dos: no detectadas";
  });
  test("Generacion para semanas de 2 a 6 dias", () => {
    const plans = [2, 3, 4, 5, 6].map((days) => buildRoutine(profile({ days }), LOCAL_CATALOG));
    assert(plans.every((plan, index) => plan.days.length === index + 2), "No se generaron todos los dias solicitados.");
    assert(plans[0].split === "full body" && plans[2].split === "torso / pierna" && plans[4].split === "PPL", "La division no coincide con la disponibilidad semanal.");
    assert(buildRoutine(profile({ goal: "fuerza" }), LOCAL_CATALOG).days[0].exercises.every((item) => item.repsMin >= 3 && item.repsMax <= 6), "La rutina de fuerza debe priorizar 3-6 repeticiones.");
    return plans.map((plan) => `${plan.days.length} dias: ${plan.split}`).join(" · ");
  });
  test("Rutina respeta lesion, equipo y exclusiones", () => {
    const bodyOnly = profile({ days: 3, equipment: ["peso corporal"], injuries: [{ id: "i", zone: "rodilla", note: "", pain: 2, createdAt: 1 }], exclusions: ["dominada"] });
    const plan = buildRoutine(bodyOnly, LOCAL_CATALOG);
    const used = plan.days.flatMap((day) => day.exercises.map((item) => LOCAL_CATALOG.find((exercise) => exercise.id === item.exerciseId))).filter(Boolean);
    assert(used.length > 0, "No se encontro ningun ejercicio de peso corporal sin restricciones.");
    assert(used.every((exercise) => isExerciseCompatible(exercise, bodyOnly)), "Se propuso un ejercicio incompatible con equipo, lesion o exclusion.");
    assert(!used.some((exercise) => exercise.name.toLowerCase().includes("dominada")), "Se incluyo un ejercicio excluido.");
    return `${used.length} propuestas compatibles con peso corporal, rodilla y exclusiones`;
  });
  test("Volumen semanal por musculo", () => {
    const session = trainingSession("volume", 100, "bench-barbell", [{ weight: 60, reps: 10 }, { weight: 60, reps: 8 }]);
    const volume = volumeByMuscle([session], LOCAL_CATALOG, 50);
    assert(volume.pecho === 2, `Pecho deberia sumar 2 series, obtuvo ${volume.pecho}.`);
    assert(volume.triceps === 1 && volume.hombros === 1, "Los musculos secundarios deben recibir medio credito por serie.");
    return "Pecho 2 series; triceps y hombros 1 serie equivalente";
  });

  console.table(resultRows);
  const passed = resultRows.filter((row) => row.resultado === "PASA").length;
  const failed = resultRows.length - passed;
  console.log(`ManteYym: ${passed}/${resultRows.length} pruebas pasan${failed ? `; ${failed} fallan.` : "."}`);
  if (failed) throw new Error("Hay pruebas de logica pendientes. Revisa la tabla anterior.");
  return resultRows;
}