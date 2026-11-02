// La PWA se instala (SW activo, assets en caché) y funciona sin conexión tras la primera carga.
import { expect, test } from "@playwright/test";

test("el service worker se instala, cachea los íconos y la app abre offline", async ({ page, context }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Espera a que el SW quede activo y controle la página.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) urls.push(new URL(request.url).pathname);
    }
    return urls;
  });
  for (const asset of [
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/maskable-512.png",
    "/manifest.webmanifest",
    "/",
  ]) {
    expect(cached, `falta ${asset} en la caché`).toContain(asset);
  }

  const manifest = await page.evaluate(async () => (await fetch("./manifest.webmanifest")).json());
  for (const icon of manifest.icons) {
    const status = await page.evaluate(async (src) => (await fetch(src)).status, icon.src);
    expect(status, icon.src).toBe(200);
  }

  const title = await page.getByRole("heading", { level: 1 }).textContent();
  await context.setOffline(true);
  // Sin el SW, esta recarga mostraría la página de error de red del navegador.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title ?? "");
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  await context.setOffline(false);
});
