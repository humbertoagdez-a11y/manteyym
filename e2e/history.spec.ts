// Historial: editar una sesión terminada recalcula el volumen; borrar se puede deshacer.
import { expect, test } from "@playwright/test";

test("editar y borrar/deshacer una sesión del historial", async ({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await page.goto("./");
  for (let step = 0; step < 12; step++) {
    const finish = page.getByRole("button", { name: "Crear mi plan" });
    if (await finish.isVisible()) {
      await finish.click();
      break;
    }
    await page.getByRole("button", { name: /^(Siguiente|Continuar)$/ }).click();
  }
  await page.getByRole("button", { name: "Iniciar entrenamiento" }).click();
  await page.getByRole("button", { name: "Completar serie" }).first().click();
  await page.getByRole("button", { name: "Finalizar entrenamiento" }).click();
  await page
    .getByRole("dialog", { name: "Sesión guardada" })
    .getByRole("button", { name: "Cerrar", exact: true })
    .first()
    .click();

  await page.getByRole("button", { name: "Progreso" }).last().click();
  await page.getByRole("button", { name: /Ver y editar todo el historial/ }).click();
  await expect(page.getByRole("heading", { name: "1 sesiones registradas" })).toBeVisible();
  await page.locator(".history-card").first().click();

  const editor = page.getByRole("dialog", { name: "Editar sesión" });
  await editor.getByLabel("Carga").first().fill("50");
  await editor.getByRole("button", { name: "Agregar serie olvidada" }).first().click();
  await expect(editor.getByText(/Volumen recalculado: (\d|\.)+ kg/)).toContainText("Volumen recalculado:");
  await editor.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(editor).toBeHidden();
  await expect(page.locator(".history-card").first()).toContainText("Editada");

  await page.locator(".history-card").first().click();
  await page.getByRole("dialog", { name: "Editar sesión" }).getByRole("button", { name: "Eliminar sesión" }).click();
  await expect(page.locator(".history-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(page.locator(".history-card")).toHaveCount(1);
});
