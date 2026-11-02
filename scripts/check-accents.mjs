// Detecta palabras sin tilde/ñ en textos visibles: literales y texto JSX de src/, más index.html,
// el manifest y el service worker. Sale con código 1 si encuentra candidatas.
//   node scripts/check-accents.mjs         → solo reporta
//   node scripts/check-accents.mjs --fix   → corrige las palabras del diccionario (no las ambiguas)
// No toca literales que se usan como valores persistidos o en comparaciones (ver PROTECTED_VALUES).
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACCENT_WORDS, PROTECTED_VALUES, applyCase } from "./lib/accents.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ts = createRequire(path.join(root, "package.json"))("typescript");
const fix = process.argv.includes("--fix");
const WORD = /(?<![\p{L}\-_./])([A-Za-z]+)(?![\p{L}\-_/])/gu;
const SKIP_ATTRS = new Set(["className", "id", "name", "type", "role", "href", "htmlFor", "autoComplete", "inputMode", "key"]);
const LOOKUPS = new Set(["includes", "startsWith", "endsWith", "indexOf", "has", "get"]);
const COMPARISONS = new Set([ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken]);

function walk(dir) {
  return fs.readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(name) && !name.endsWith(".d.ts") ? [full] : [];
  });
}
const isText = (n) =>
  ts.isStringLiteral(n) ||
  ts.isNoSubstitutionTemplateLiteral(n) ||
  ts.isTemplateHead(n) ||
  ts.isTemplateMiddle(n) ||
  ts.isTemplateTail(n) ||
  ts.isJsxText(n);

function fixText(text, report) {
  return text.replace(WORD, (word) => {
    const target = ACCENT_WORDS[word.toLowerCase()];
    if (!target) return word;
    report(word, applyCase(word, target));
    return applyCase(word, target);
  });
}

const sources = walk(path.join(root, "src")).map((file) => {
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return [file, ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, kind)];
});

// 1) Literales usados en comparaciones o búsquedas: son datos, no textos visibles.
const protectedValues = new Set(PROTECTED_VALUES);
for (const [, sf] of sources) {
  const visit = (n) => {
    if (ts.isStringLiteral(n)) {
      const p = n.parent;
      const isData =
        (ts.isBinaryExpression(p) && COMPARISONS.has(p.operatorToken.kind)) ||
        ts.isCaseClause(p) ||
        ts.isLiteralTypeNode(p) ||
        ts.isElementAccessExpression(p) ||
        (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && LOOKUPS.has(p.expression.name.text));
      if (isData) protectedValues.add(n.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

const findings = [];
for (const [file, sf] of sources) {
  const edits = [];
  const visit = (n) => {
    if (isText(n) && !protectedValues.has(n.text)) {
      const p = n.parent;
      const skip =
        ts.isImportDeclaration(p) ||
        ts.isExportDeclaration(p) ||
        ts.isLiteralTypeNode(p) ||
        (ts.isPropertyAssignment(p) && p.name === n) ||
        (ts.isJsxAttribute(p) && SKIP_ATTRS.has(p.name.getText()));
      if (!skip) {
        const original = n.getText();
        const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
        const next = fixText(original, (from, to) => findings.push(`${path.relative(root, file)}:${line}  ${from} → ${to}`));
        if (next !== original) edits.push([n.getStart(), n.end, next]);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (fix && edits.length) {
    let text = sf.getFullText();
    for (const [start, end, value] of edits.sort((a, b) => b[0] - a[0])) text = text.slice(0, start) + value + text.slice(end);
    fs.writeFileSync(file, text);
  }
}

// 2) Archivos de texto plano visibles: se revisan solo las cadenas entre comillas / contenido.
for (const relative of ["index.html", "public/manifest.webmanifest", "src/sw/sw.js"]) {
  const file = path.join(root, relative);
  const text = fs.readFileSync(file, "utf8");
  const pattern = relative.endsWith(".js") ? /"([^"\n]*\s[^"\n]*)"/g : /(?:content|title|"name"|"description"|"short_name")\s*[=:]\s*"([^"]+)"|<title>([^<]+)</g;
  let next = text;
  for (const match of text.matchAll(pattern)) {
    const value = match[1] ?? match[2];
    const fixed = fixText(value, (from, to) => findings.push(`${relative}  ${from} → ${to}`));
    if (fixed !== value) next = next.replace(value, fixed);
  }
  if (fix && next !== text) fs.writeFileSync(file, next);
}

if (findings.length) {
  console[fix ? "log" : "error"](`${fix ? "Corregidas" : "Candidatas sin tilde"}: ${findings.length}`);
  for (const item of findings) console[fix ? "log" : "error"](`  ${item}`);
  if (!fix) process.exit(1);
} else {
  console.log("check-accents: sin palabras sin tilde del diccionario en textos visibles.");
}
