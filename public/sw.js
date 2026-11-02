/* Cache version is intentionally explicit so an update can remove stale shells. */
const VERSION = "1.0.0";
const PREFIX = "manteyym-";
const SHELL_CACHE = `${PREFIX}shell-${VERSION}`;
const IMAGE_CACHE = `${PREFIX}exercise-images-${VERSION}`;
const BASE_URL = new URL("./", self.registration.scope);
const SHELL_URL = BASE_URL.href;
const IMAGE_LIMIT = 200;
const STATIC_ASSETS = [
  SHELL_URL,
  new URL("manifest.webmanifest", BASE_URL).href,
  new URL("icons/icon.svg", BASE_URL).href,
  new URL("icons/icon-192.png", BASE_URL).href,
  new URL("icons/icon-512.png", BASE_URL).href,
  new URL("icons/maskable-512.png", BASE_URL).href,
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith(PREFIX) && ![SHELL_CACHE, IMAGE_CACHE].includes(key)).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

async function keepImageCacheSmall(cache) {
  const keys = await cache.keys();
  if (keys.length > IMAGE_LIMIT) await Promise.all(keys.slice(0, keys.length - IMAGE_LIMIT).map((key) => cache.delete(key)));
}

async function exerciseImage(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const requestUrl = new URL(request.url);
  const remote = requestUrl.searchParams.get("url");
  if (!remote || !remote.startsWith("https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/")) {
    return new Response("Imagen no valida", { status: 400 });
  }
  try {
    const response = await fetch(remote, { mode: "no-cors", cache: "force-cache" });
    if (response.ok || response.type === "opaque") {
      await cache.put(request, response.clone());
      await keepImageCacheSmall(cache);
    }
    return response;
  } catch {
    return new Response("Imagen no disponible sin conexion", { status: 504 });
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
    return (await caches.match(SHELL_URL)) || new Response("Sin conexion", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  const fresh = fetch(request).then((response) => {
    if (response.ok && new URL(request.url).origin === self.location.origin) void cache.put(request, response.clone());
    return response;
  }).catch(() => cached);
  return cached || await fresh || new Response("Recurso no disponible sin conexion", { status: 504 });
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
  if (url.pathname.startsWith(BASE_URL.pathname)) event.respondWith(staleWhileRevalidate(request));
});