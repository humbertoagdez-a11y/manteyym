// Descarga UNA VEZ las 2 fotos (inicio/final) de cada ejercicio mapeado en src/data/media-map.json,
// las convierte a WebP de 640 px y las guarda en public/exercises/<id>/0.webp y 1.webp.
// Así los ejercicios base funcionan sin conexión y sin hotlinkear a GitHub en producción.
//   node scripts/vendor-exercise-media.mjs [--force]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const force = process.argv.includes("--force");
const BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main";
const { map } = JSON.parse(readFileSync(path.join(root, "src/data/media-map.json"), "utf8"));

const response = await fetch(`${BASE}/dist/exercises.json`);
if (!response.ok) throw new Error(`No se pudo descargar el catálogo: ${response.status}`);
const dataset = new Map((await response.json()).map((exercise) => [exercise.id, exercise]));

const credits = [];
let downloaded = 0;
for (const [localId, entry] of Object.entries(map)) {
  const source = dataset.get(entry.source);
  if (!source || (source.images ?? []).length < 2) {
    console.error(`✗ ${localId}: ${entry.source} no existe o no tiene 2 imágenes`);
    process.exitCode = 1;
    continue;
  }
  const dir = path.join(root, "public/exercises", localId);
  mkdirSync(dir, { recursive: true });
  for (const [index, image] of source.images.slice(0, 2).entries()) {
    const target = path.join(dir, `${index}.webp`);
    if (existsSync(target) && !force) continue;
    const res = await fetch(`${BASE}/exercises/${image}`);
    if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) {
      throw new Error(`${localId}: respuesta inválida para ${image} (${res.status})`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await sharp(buffer).resize({ width: 640, withoutEnlargement: true }).webp({ quality: 74 }).toFile(target);
    downloaded++;
  }
  credits.push(`| ${localId} | ${source.name} | \`${entry.source}\` | ${entry.confidence}${entry.note ? ` — ${entry.note}` : ""} |`);
}

writeFileSync(
  path.join(root, "public/exercises/CREDITS.md"),
  `# Imágenes de ejercicios

Fuente: [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db), licencia **Unlicense** (dominio público;
la atribución no es obligatoria, se incluye por transparencia). Origen del dataset: \`wrkout/exercises.json\`.

Cada carpeta contiene la posición inicial (\`0.webp\`) y final (\`1.webp\`), convertidas a WebP de 640 px de ancho.
Generado con \`node scripts/vendor-exercise-media.mjs\`.

| Ejercicio local | Nombre en la fuente | Id en la fuente | Coincidencia |
|---|---|---|---|
${credits.join("\n")}
`,
);
console.log(`Listo: ${credits.length} ejercicios, ${downloaded} imágenes nuevas.`);
