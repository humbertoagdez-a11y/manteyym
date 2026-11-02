// Genera los PNG del manifest a partir de los SVG de public/icons.
// Se corre a mano (npm run icons) y los PNG resultantes se commitean.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = path.join(root, "public", "icons");

const targets = [
  { source: "icon.svg", output: "icon-192.png", size: 192 },
  { source: "icon.svg", output: "icon-512.png", size: 512 },
  { source: "maskable.svg", output: "maskable-512.png", size: 512 },
  // iOS ignora el manifest para el ícono de inicio: usa apple-touch-icon (180 px, sin transparencia).
  { source: "maskable.svg", output: "apple-touch-icon.png", size: 180 },
];

for (const target of targets) {
  const svg = await readFile(path.join(iconsDir, target.source));
  // density alta para que el rasterizado no quede borroso al escalar.
  await sharp(svg, { density: Math.ceil((72 * target.size) / 512) * 2 })
    .resize(target.size, target.size)
    .png({ compressionLevel: 9 })
    .toFile(path.join(iconsDir, target.output));
  const meta = await sharp(path.join(iconsDir, target.output)).metadata();
  console.log(`${target.output}: ${meta.width}x${meta.height}`);
}
