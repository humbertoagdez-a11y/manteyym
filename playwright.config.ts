import { defineConfig, devices } from "@playwright/test";

// E2E sobre el build de producción (dist/) servido por vite preview, en viewport de celular.
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://localhost:4173/",
    ...devices["Pixel 7"],
    locale: "es-PY",
    timezoneId: "America/Asuncion",
    serviceWorkers: "allow",
  },
  projects: [{ name: "android-chrome", use: { browserName: "chromium" } }],
  webServer: {
    command: "npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173/",
    reuseExistingServer: !process.env.CI,
  },
});
