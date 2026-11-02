# ManteYym

PWA de entrenamiento de fuerza para una persona: rutinas, sesiones, progreso, registro de dolor y demos de
cada ejercicio. Todo se guarda en IndexedDB del navegador; no hay cuentas, servidor propio ni analítica.

React 19 · Vite 7 · Tailwind 4 · TypeScript estricto · IndexedDB (esquema v2 con migraciones) · service worker propio.

## Instalar en tu celular

La instalación de una PWA exige **HTTPS**. El camino recomendado:

1. Crea un repositorio en GitHub (puede ser privado si tu plan lo permite para Pages; si no, público) y súbelo:
   ```sh
   git remote add origin https://github.com/TU_USUARIO/manteyym.git
   git push -u origin main
   ```
2. En GitHub: **Settings › Pages › Source: GitHub Actions**. El workflow `.github/workflows/pages.yml`
   corre lint, pruebas, build, verificaciones y E2E, y publica `dist/`.
3. Abre la URL que muestra Pages (p. ej. `https://TU_USUARIO.github.io/manteyym/`) **en el celular**:
   - **Android (Chrome):** menú ⋮ › **Instalar aplicación**.
   - **iPhone (Safari):** botón Compartir › **Agregar a inicio**.
4. Abre la app una vez con conexión: el service worker guarda la app y las fotos de los ejercicios para usarla
   sin internet.

Alternativa sin Git: `npm run build` y arrastra la carpeta `dist/` a [app.netlify.com/drop](https://app.netlify.com/drop).

> Los datos pertenecen al origen exacto (dominio). Si cambias de dominio o de navegador, exporta un respaldo
> JSON en Ajustes e impórtalo en el nuevo.

## Desarrollo

```sh
npm ci
npm run dev          # servidor local
npm run verify       # lint + vitest + typecheck + build + check:dist + check:accents
npm run test:e2e     # build + Playwright en viewport de celular (SW/offline, flujo, historial, accesibilidad)
npm run icons        # regenera los PNG del manifest desde los SVG
node scripts/vendor-exercise-media.mjs   # vuelve a descargar las fotos de ejercicios (una vez)
node scripts/check-accents.mjs --fix     # corrige palabras sin tilde del diccionario
```

## Estructura

```text
src/App.tsx                  Estado de la app, navegación y acciones (persisten vía store.ts)
src/screens/                 Una pantalla por archivo (Hoy, Rutinas, Ejercicios, Sesión, Progreso, Dolor, Historial…)
src/components/              UI compartida, ExerciseDemo, PainSheet, SessionEditor, gráficos
src/store.ts                 IndexedDB: apertura + migración, commit() atómico con bitácora, respaldo/importación
src/data/migrations.ts       Cadena de migraciones v1 → v2 (la usan la base y la importación)
src/data/catalog.ts          64 ejercicios base; contenido en exerciseContent.ts; media en media-map.json
src/lib/pain.ts              Registro de dolor (zonas activas, señales de alerta, contexto)
src/lib/records.ts           PR derivados de las sesiones y exportación CSV
src/i18n/es.ts               Etiquetas visibles de valores persistidos (muneca → muñeca)
src/sw/sw.js                 Plantilla del service worker (Vite inyecta versión y assets)
public/exercises/            Fotos WebP de los ejercicios + CREDITS.md
scripts/                     Íconos, media, verificación de dist y de tildes
tests/                       Vitest (motor, store/migraciones, dolor, PR/CSV, catálogo)
e2e/                         Playwright
```

## Datos y privacidad

- **Nada sale del dispositivo** salvo dos descargas opcionales que inicia el usuario: la biblioteca ampliada
  (`raw.githubusercontent.com/yuhonas/free-exercise-db`, JSON + fotos al abrir cada ejercicio). Las fotos de los
  64 ejercicios base vienen dentro de la app.
- Sin analítica, sin cookies, sin cuentas.
- Respaldo JSON (versión de esquema incluida; los respaldos v1 se migran al importar) y CSV de sesiones,
  dolor y medidas. Antes de importar se guarda una copia que se puede restaurar desde Ajustes.
- El registro de dolor y las sesiones son editables, pero cada cambio queda en la bitácora (Ajustes) con el
  estado anterior.

## Salud

ManteYym registra y sugiere; **no diagnostica**. Ante dolor en el pecho, hormigueo o entumecimiento, dolor
tras un golpe o dolor muy intenso, la app muestra un aviso para dejar de entrenar y consultar a un profesional.
El contenido técnico de los ejercicios y el mapeo zona → patrón de movimiento están **pendientes de revisión
humana** (`contentReviewed: false`, comentarios en `src/engine/fitness.ts`).

## Licencias

Imágenes y biblioteca ampliada: [free-exercise-db](https://github.com/yuhonas/free-exercise-db), Unlicense
(dominio público). Ver `public/exercises/CREDITS.md`.
