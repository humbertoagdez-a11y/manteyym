// Fuente verificada el 2026-09-16: README, JSON combinado e imagen de ejemplo.
export const FREE_DB = {
  dataUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json",
  imageBaseUrl: "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/",
  license: "Unlicense",
  repository: "https://github.com/yuhonas/free-exercise-db",
} as const;

export const muscleTranslations: Record<string, string> = {
  abdominals: "abdomen",
  abductors: "gluteos",
  adductors: "aductores",
  biceps: "biceps",
  calves: "gemelos",
  chest: "pecho",
  forearms: "antebrazos",
  glutes: "gluteos",
  hamstrings: "isquiotibiales",
  lats: "espalda",
  lower_back: "espalda",
  middle_back: "espalda",
  quadriceps: "cuadriceps",
  shoulders: "hombros",
  traps: "espalda",
  triceps: "triceps",
  neck: "cuello",
};

export const exerciseNameTranslations: Record<string, string> = {
  "Barbell Bench Press - Medium Grip": "Press de banca con barra",
  "Barbell Deadlift": "Peso muerto con barra",
  "Barbell Squat": "Sentadilla con barra",
  "Bent Over Barbell Row": "Remo inclinado con barra",
  "Dumbbell Bench Press": "Press de banca con mancuernas",
  "Dumbbell Flyes": "Aperturas con mancuernas",
  "Dumbbell Shoulder Press": "Press de hombros con mancuernas",
  "Dumbbell Romanian Deadlift": "Peso muerto rumano con mancuernas",
  Pullups: "Dominadas",
  "Pull Up": "Dominadas",
  Pushups: "Flexiones",
  "Push Up": "Flexiones",
  "Wide-Grip Lat Pulldown": "Jalón al pecho con agarre amplio",
  "Seated Cable Rows": "Remo sentado en polea",
  "Standing Military Press": "Press militar de pie",
  "Leg Press": "Prensa de piernas",
  "Barbell Curl": "Curl de bíceps con barra",
  "Standing Calf Raises": "Elevación de gemelos de pie",
};
