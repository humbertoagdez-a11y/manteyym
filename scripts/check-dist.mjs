// Verifica que todo lo que referencian index.html, el manifest y el service worker exista en dist/.
// Falla con código 1 si falta algo (así un ícono faltante no vuelve a romper la instalación del SW).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, process.argv[2] ?? "dist");
const missing = [];
const checked = new Set();

function check(ref, origin) {
  if (!ref || /^(https?:|data:|blob:|#)/.test(ref)) return;
  const clean = ref.replace(/^\.\//, "").split(/[?#]/)[0];
  if (clean === "" || checked.has(clean)) return;
  checked.add(clean);
  if (!existsSync(path.join(dist, clean))) missing.push(`${clean} (referenciado en ${origin})`);
}

if (!existsSync(path.join(dist, "index.html"))) {
  console.error(`No existe ${path.join(dist, "index.html")}. Corré npm run build primero.`);
  process.exit(1);
}

const html = readFileSync(path.join(dist, "index.html"), "utf8");
for (const match of html.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g)) check(match[1], "index.html");
for (const match of html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)) check(match[1], "index.html");

const manifest = JSON.parse(readFileSync(path.join(dist, "manifest.webmanifest"), "utf8"));
for (const icon of manifest.icons ?? []) check(icon.src, "manifest.icons");
for (const shortcut of manifest.shortcuts ?? []) for (const icon of shortcut.icons ?? []) check(icon.src, "manifest.shortcuts");
const sizes = new Set((manifest.icons ?? []).filter((icon) => icon.type === "image/png").map((icon) => icon.sizes));
for (const required of ["192x192", "512x512"]) {
  if (!sizes.has(required)) missing.push(`ícono PNG ${required} en el manifest (requisito de instalación)`);
}

const sw = readFileSync(path.join(dist, "sw.js"), "utf8");
if (/__APP_VERSION__|__OPTIONAL_ASSETS__\.map/.test(sw.replace(/\/\*[\s\S]*?\*\//g, ""))) {
  missing.push("sw.js conserva marcadores sin reemplazar");
}
if (sw.includes('"no-cors"')) missing.push("sw.js todavía pide imágenes con mode no-cors");
const optional = sw.match(/const OPTIONAL_ASSETS = (\[[^\]]*\])/);
if (!optional) missing.push("sw.js no tiene la lista OPTIONAL_ASSETS inyectada");
else for (const asset of JSON.parse(optional[1])) check(asset, "sw.js OPTIONAL_ASSETS");
for (const match of sw.matchAll(/new URL\("([^"]+)", BASE_URL\)/g)) check(match[1], "sw.js");

if (missing.length) {
  console.error(`Faltan ${missing.length} archivo(s) en ${path.relative(root, dist)}/:`);
  for (const item of missing) console.error(`  - ${item}`);
  process.exit(1);
}
console.log(`check-dist: ${checked.size} referencias verificadas, todas presentes.`);
