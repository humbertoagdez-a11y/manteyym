# ManteYym

ManteYym es una PWA de entrenamiento de fuerza para una sola persona. Las rutinas, sesiones, preferencias, medidas, objetivos, lesiones, cardio y fotos se guardan en IndexedDB en el navegador; no hay cuentas, API propia, publicidad ni sincronizacion en la nube.

## Estructura

```text
index.html
manifest.webmanifest                 Configuracion instalable y accesos directos
public/sw.js                          Shell offline, actualizaciones y cache de imagenes
public/icons/                         Marca SVG y PNG normales / maskable
src/App.tsx                           Flujo, navegacion y pantallas
src/store.ts                          IndexedDB v1, migracion, importacion y respaldo
src/data/catalog.ts                   64 ejercicios en espanol disponibles sin red
src/data/exerciseSource.ts            URL, licencia y diccionario de free-exercise-db
src/engine/fitness.ts                 Rutinas, cargas, series, discos, volumen y 1RM
src/components/                       Iconos SVG y graficas propias
src/styles/                           Tokens, base, componentes y pantallas responsive
tests/console-tests.js                Pruebas puras ejecutables en la consola del navegador
tests/MANUAL_TESTS.md                 Recorrido de pruebas manuales
CHANGELOG.md                          Cambios de esta version
```

## Probar en local

1. Instala Node.js LTS desde [nodejs.org](https://nodejs.org/).
2. Abre una terminal dentro de la carpeta del proyecto.
3. Instala las dependencias del proyecto con `npm install`.
4. Arranca el entorno local con `npm run dev`.
5. Abre la direccion que indica Vite, normalmente `http://localhost:5173/`.
6. Completa el cuestionario. El plan base y los 64 ejercicios se pueden usar sin descargar la biblioteca opcional.
7. En `Ejercicios`, descarga `free-exercise-db` si quieres ampliar el catalogo. La descarga requiere conexion; los registros se guardan en el dispositivo.
8. Prueba la version final con `npm run build`. El sitio generado queda en `dist/`.

La consola de desarrollo muestra los errores del navegador. Para ejecutar las pruebas de logica con el servidor de desarrollo activo, abre DevTools > Console y ejecuta:

```js
await import('/tests/console-tests.js').then((module) => module.runTests())
```

El archivo prueba las funciones reales de `src/engine/fitness.ts` y muestra una tabla `PASA` / `FALLA`. Vite sirve los modulos TypeScript fuente durante el desarrollo.

## Publicar gratis

La instalacion de la PWA necesita HTTPS. Netlify y Cloudflare Pages proporcionan HTTPS automaticamente. El proyecto se compila como sitio estatico y no necesita backend.

### Netlify Drop

1. Ejecuta `npm run build` en tu computadora.
2. Entra en [app.netlify.com/drop](https://app.netlify.com/drop) y crea una cuenta gratuita si hace falta.
3. Arrastra la carpeta `dist` completa a la zona de carga.
4. Abre la URL HTTPS que entrega Netlify. Usa esa URL al instalar y al abrir la app.

### Cloudflare Pages

1. Ejecuta `npm run build`.
2. En Cloudflare Dashboard abre **Workers & Pages**, elige **Create application** y luego **Pages**.
3. Selecciona carga directa de archivos estaticos y sube el contenido de `dist`.
4. Publica y abre la URL HTTPS de Pages.

Tambien puedes conectar un repositorio GitHub y configurar `npm run build` como build command y `dist` como directorio de salida.

### GitHub Pages

1. Crea un repositorio en GitHub y sube el proyecto a la rama `main`.
2. El flujo incluido en `.github/workflows/pages.yml` instala, compila y publica `dist` en GitHub Pages en cada push a `main`.
3. En el repositorio abre **Settings > Pages** y elige **GitHub Actions** como fuente de publicacion.
4. Espera que el workflow termine y abre la direccion que aparece en **Settings > Pages**.
5. La aplicacion usa rutas relativas para que manifest, iconos y service worker funcionen bajo una ruta de repositorio, por ejemplo `https://usuario.github.io/manteyym/`.

Los datos pertenecen al origen exacto del navegador. Si cambias de dominio, puerto, perfil del navegador o borras los datos del sitio, exporta primero un JSON y restauralo en el nuevo origen.

## Instalar en el celular

- **Android / Chrome:** abre la URL HTTPS; usa el aviso de instalacion o el menu del navegador y selecciona **Instalar aplicacion** o **Anadir a pantalla de inicio**.
- **iPhone / Safari:** abre la URL HTTPS en Safari, toca **Compartir** y selecciona **Anadir a pantalla de inicio**. No se ha probado esta instalacion en un iPhone real.
- **Offline:** abre primero la app con conexion y deja que el service worker termine la instalacion. El catalogo local, las rutinas, el registro, las graficas y los datos ya guardados funcionan sin red. Las imagenes remotas se guardan en la cache al consultarlas; no se descargan todas las imagenes de la base completa.

## Biblioteca e imagenes

Se verificaron el README, el esquema de registros, la URL del JSON combinado y la licencia del repositorio [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) el 16 de septiembre de 2026.

- JSON combinado: `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json`
- Imagenes: `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/` mas la ruta relativa de imagen del registro.
- Licencia: **Unlicense**. El repositorio declara que su contenido se dedica al dominio publico; no se necesita atribucion obligatoria. ManteYym enlaza la fuente por transparencia.
- El formato de los ejercicios incluye `id`, `name`, `equipment`, `primaryMuscles`, `secondaryMuscles`, `instructions` e `images`. Algunos campos remotos pueden ser nulos o incompletos.
- La app incluye una traduccion limitada y explicita para nombres habituales. Si no hay una traduccion confirmada, conserva el nombre original y lo indica. Las instrucciones de la fuente se muestran en ingles; no se traducen a ciegas.
- No se producen ni se prometen videos reales. Los dos JPEG que proporciona el catalogo pueden alternarse como posiciones estaticas; el catalogo local ofrece pasos tecnicos en texto.
- La descarga de datos intenta continuar con HTTP Range si el origen permite reanudar; si la respuesta no admite rangos, la descarga comienza de nuevo. Las imagenes se cachean al abrirse, no como una descarga masiva de imagenes.

## Privacidad, respaldos y notificaciones

- IndexedDB se versiona con `schemaVersion: 1`; la apertura incluye la migracion desde la version 0.
- Se solicita almacenamiento persistente cuando el navegador lo permite. La cuota real y su conservacion dependen del navegador y del dispositivo.
- Exportar genera un JSON con todos los stores y fotos serializadas. Importar comprueba estructura y version, muestra un resumen, requiere confirmacion y conserva una copia automatica local antes de reemplazar los datos.
- El recordatorio suave de respaldo se muestra despues de 14 dias sin exportar.
- El recordatorio de entrenamiento es local y solo se comprueba mientras la aplicacion esta abierta. Una PWA sin servidor push no puede prometer recordatorios fiables en segundo plano. iOS y Android pueden suspender la app o retrasar notificaciones.
- Los permisos de notificaciones, vibracion, Wake Lock y reproduccion de audio dependen del navegador, la version y el estado de energia.
- Las fotos se guardan como Blob en IndexedDB y se incluyen en el respaldo. Los archivos pueden contener datos personales; conserva el JSON con cuidado.

## Seguridad de salud

ManteYym no diagnostica ni sustituye a un profesional de la salud. Ante dolor agudo, dolor persistente o condiciones medicas, consulta a un profesional. Las guias de movilidad son generales y deben mantenerse dentro de un rango comodo. Alimentacion y nutricion estan fuera del alcance de la aplicacion.

## Autoauditoria

- Revisados los imports, la creacion de los 13 stores, la inicializacion del perfil, la persistencia de la sesion, las acciones de navegacion, las rutas relativas de PWA y el renderizado de texto mediante React.
- La finalizacion y el descarte esperan las escrituras pendientes de una sesion; cada serie evita el doble toque mientras se guarda. El cronometro calcula tiempo a partir de timestamps UTC, y el descanso usa una hora de vencimiento persistida.
- La importacion valida los records y tipos principales, prepara los Blob antes de abrir la transaccion y restaura todo en una unica transaccion. Una copia previa se guarda en el dispositivo; una cuota insuficiente cancela la transaccion en vez de confirmar un reemplazo parcial.
- El service worker usa caches versionadas, limita la cache de imagenes a 200 entradas y elimina versiones viejas. El shell de produccion se genera con el build estatico de Vite.
- **Pendiente de verificacion real:** instalacion, notificaciones, Wake Lock, cuotas y reanudacion HTTP en iPhone/Android y en cada host. Ejecuta los pasos de `tests/MANUAL_TESTS.md` en un equipo real antes de depender de esas funciones.
- **Pendiente de prueba visual automatizada:** no hay un navegador movil ni una sesion interactiva de iOS/Android disponible en este entorno. El build de produccion y las pruebas puras se verifican por separado.