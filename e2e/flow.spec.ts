// Recorrido principal en celular: onboarding → sesión → serie → molestia → terminar → dolor → respaldo.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

async function onboarding(page: Page) {
  await page.goto("./");
  for (let step = 0; step < 12; step++) {
    const finish = page.getByRole("button", { name: "Crear mi plan" });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await page.getByRole("button", { name: /^(Siguiente|Continuar)$/ }).click();
  }
  await expect(page.getByRole("button", { name: "Iniciar entrenamiento" })).toBeVisible();
}

test("registro completo de una sesión con molestia y respaldo", async ({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await onboarding(page);

  // "Sin dolor" en un toque desde Hoy.
  await page.getByRole("button", { name: "Sin dolor", exact: true }).click();
  await expect(page.getByText("Hoy: sin dolor ✓")).toBeVisible();

  await page.getByRole("button", { name: "Iniciar entrenamiento" }).click();
  await expect(page.getByText("SESIÓN EN CURSO")).toBeVisible();

  // Completar la primera serie.
  await page.getByRole("button", { name: "Completar serie" }).first().click();
  await expect(page.getByRole("button", { name: "Serie completada" }).first()).toBeVisible();

  // Molestia rápida: abrir (1) + zona (2) + intensidad (3) + guardar (4).
  await page
    .getByRole("button", { name: /^Registrar molestia en / })
    .first()
    .click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Hombro", exact: true }).click();
  await sheet.getByRole("button", { name: "4", exact: true }).click();
  await sheet.getByRole("button", { name: "Guardar registro" }).click();
  await expect(sheet).toBeHidden();

  // Terminar (acepta el confirm de series pendientes) y responder "¿Cómo terminaste?".
  await page.getByRole("button", { name: "Finalizar entrenamiento" }).click();
  const summary = page.getByRole("dialog", { name: "Sesión guardada" });
  await expect(summary).toBeVisible();
  await summary.getByRole("button", { name: "Sin dolor", exact: true }).click();
  await expect(summary.getByText("Registrado: terminaste sin dolor.")).toBeVisible();
  await summary.getByRole("button", { name: "Cerrar", exact: true }).first().click();

  // Pantalla Dolor: 3 registros (sin dolor previo, molestia en sesión, sin dolor al cerrar), ninguno sobrescrito.
  await page
    .getByRole("button", { name: /Historial/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Cómo está tu cuerpo" })).toBeVisible();
  await expect(page.locator(".pain-card")).toHaveCount(3);
  await expect(page.locator(".pain-card").filter({ hasText: "Hombro" })).toContainText("Durante:");

  // Exportar respaldo y volver a importarlo.
  await page.getByRole("button", { name: "Ajustes" }).last().click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar respaldo JSON" }).click();
  const download = await downloadPromise;
  const file = await download.path();
  const backup = JSON.parse(readFileSync(file!, "utf8"));
  expect(backup.schemaVersion).toBe(2);
  expect(backup.stores.sessions).toHaveLength(1);
  expect(backup.stores.painEntries).toHaveLength(3);

  await page.locator('input[type="file"][accept*="json"]').setInputFiles(file!);
  await page.getByRole("button", { name: "Restaurar datos" }).click();
  await expect(page.getByText(/Restaurados 1 rutinas, 1 sesiones/)).toBeVisible();
});
