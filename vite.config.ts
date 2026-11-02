/// <reference types="vitest/config" />
import { createHash } from "crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8")) as { version: string };

function listFiles(dir: string, base = dir): string[] {
  try {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory()
        ? listFiles(full, base)
        : [path.relative(base, full).split(path.sep).join("/")];
    });
  } catch {
    return [];
  }
}

// Emite dist/sw.js desde src/sw/sw.js con la versión y la lista de assets opcionales inyectadas.
// La versión incluye un hash del index.html final: cada deploy distinto produce un SW distinto y
// dispara el aviso de actualización, aunque no se cambie package.json.
function serviceWorker(): Plugin {
  let outDir = "dist";
  return {
    name: "manteyym-service-worker",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    writeBundle() {
      const html = readFileSync(path.join(outDir, "index.html"));
      const hash = createHash("sha256").update(html).digest("hex").slice(0, 10);
      const optional = [
        ...listFiles(path.join(outDir, "icons")).map((file) => `icons/${file}`),
        ...listFiles(path.join(outDir, "exercises"))
          .filter((file) => file.endsWith(".webp"))
          .map((file) => `exercises/${file}`),
      ].sort();
      const template = readFileSync(path.resolve(__dirname, "src/sw/sw.js"), "utf8");
      const output = template
        .replace("const VERSION = __APP_VERSION__;", `const VERSION = ${JSON.stringify(`${pkg.version}+${hash}`)};`)
        .replace("__OPTIONAL_ASSETS__.map", `${JSON.stringify(optional)}.map`);
      if (output.includes("= __APP_VERSION__") || output.includes("__OPTIONAL_ASSETS__.map")) {
        throw new Error("No se pudieron inyectar los valores en el service worker.");
      }
      writeFileSync(path.join(outDir, "sw.js"), output);
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile(), serviceWorker()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // Vitest solo corre las pruebas unitarias; e2e/ es de Playwright.
  test: {
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
