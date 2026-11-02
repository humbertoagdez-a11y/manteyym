/* Plantilla del service worker. vite.config.ts la emite como dist/sw.js reemplazando:
 *  - __APP_VERSION__: versión de package.json + hash del build (cambia en cada deploy).
 *  - __OPTIONAL_ASSETS__: íconos y fotos locales de ejercicios encontrados en dist/.
 * No editar dist/sw.js a mano. */
/* global __APP_VERSION__, __OPTIONAL_ASSETS__ */
const VERSION = __APP_VERSION__;
const PREFIX = "manteyym-";
const SHELL_CACHE = `${PREFIX}shell-${VERSION}`;
const MEDIA_CACHE = `${PREFIX}media-${VERSION}`;
const IMAGE_CACHE = `${PREFIX}exercise-images`;
const BASE_URL = new URL("./", self.registration.scope);
const SHELL_URL = BASE_URL.href;
const IMAGE_LIMIT = 200;
const REMOTE_IMAGE_PREFIX = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/";

// Sin estos dos archivos la app no arranca offline: si fallan, la instalación debe fallar.
const CRITICAL_ASSETS = [SHELL_URL, new URL("manifest.webmanifest", BASE_URL).href];
// Opcionales: si alguno da 404 la instalación sigue (antes un ícono faltante rompía todo el SW).
const OPTIONAL_ASSETS = __OPTIONAL_ASSETS__.map((path) => new URL(path, BASE_URL).href);

self.addEventListener("install", (event) => {
  // Sin skipWaiting acá: el SW nuevo espera a que el usuario toque "Aplicar ahora".
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await shell.addAll(CRITICAL_ASSETS);
      const media = await caches.open(MEDIA_CACHE);
      await Promise.allSettled(OPTIONAL_ASSETS.map((url) => media.add(url)));
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(PREFIX) && ![SHELL_CACHE, MEDIA_CACHE, IMAGE_CACHE].includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "GET_VERSION") event.source?.postMessage({ type: "VERSION", version: VERSION });
});

async function keepImageCacheSmall(cache) {
  const keys = await cache.keys();
  if (keys.length > IMAGE_LIMIT) {
    await Promise.all(keys.slice(0, keys.length - IMAGE_LIMIT).map((key) => cache.delete(key)));
  }
}

// Imágenes de la biblioteca ampliada: se piden con CORS (el origen envía access-control-allow-origin: *),
// así la respuesta no es opaca, se puede validar y no infla la cuota con relleno.
async function exerciseImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const remote = new URL(request.url).searchParams.get("url");
  if (!remote || !remote.startsWith(REMOTE_IMAGE_PREFIX)) {
    return new Response("Imagen no válida", { status: 400 });
  }
  try {
    const response = await fetch(remote, { mode: "cors", credentials: "omit" });
    const type = response.headers.get("content-type") ?? "";
    if (response.ok && type.startsWith("image/")) {
      await cache.put(request, response.clone());
      await keepImageCacheSmall(cache);
    }
    return response;
  } catch {
    return new Response("Imagen no disponible sin conexión", { status: 504 });
  }
}

async function shellNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(SHELL_URL, response.clone());
    }
    return response;
  } catch {
    return (
      (await caches.match(SHELL_URL)) ||
      new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })
    );
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(MEDIA_CACHE);
    void cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok) void cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || (await fresh) || new Response("Recurso no disponible sin conexión", { status: 504 });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("/exercise-image")) {
    event.respondWith(exerciseImage(request));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(shellNavigation(request));
    return;
  }
  if (!url.pathname.startsWith(BASE_URL.pathname)) return;
  // Fotos e íconos no cambian sin cambiar de nombre/versión: cache primero.
  const relative = url.pathname.slice(BASE_URL.pathname.length);
  if (relative.startsWith("exercises/") || relative.startsWith("icons/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});
