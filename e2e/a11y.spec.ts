// Accesibilidad (axe-core, WCAG 2.1 A/AA) y objetivos táctiles en la sesión activa.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

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

async function audit(page: Page, name: string) {
  // Espera a que termine la animación de entrada (a mitad del fundido el contraste es menor).
  await page.waitForTimeout(900);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
  const report = serious.map(
    (violation) =>
      `${violation.id} (${violation.impact}): ${violation.nodes
        .slice(0, 3)
        .map((node) => `${node.target.join(" ")} [${node.any[0]?.message ?? ""}]`)
        .join(" | ")}`,
  );
  expect(report, `${name}:\n${report.join("\n")}`).toEqual([]);
}

test("pantallas principales sin violaciones graves de accesibilidad", async ({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept());
  await onboarding(page);
  await audit(page, "Hoy");
  for (const tab of ["Rutinas", "Ejercicios", "Progreso", "Ajustes"]) {
    await page.getByRole("button", { name: tab }).last().click();
    await audit(page, tab);
  }
  await page.getByRole("button", { name: "Hoy" }).last().click();
  await page.getByRole("button", { name: "Registrar dolor" }).first().click();
  await audit(page, "Hoja de dolor");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("button", { name: "Iniciar entrenamiento" }).click();
  await audit(page, "Sesión activa");
});

test("objetivos táctiles de la sesión activa ≥ 44 px", async ({ page }) => {
  await onboarding(page);
  await page.getByRole("button", { name: "Iniciar entrenamiento" }).click();
  const small = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".workout-screen button, .workout-screen select, .workout-screen input")]
      .filter((element) => element.offsetParent !== null)
      .map((element) => {
        const box = element.getBoundingClientRect();
        return { label: element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 30), w: box.width, h: box.height };
      })
      .filter((item) => item.w < 44 || item.h < 44),
  );
  expect(small, JSON.stringify(small, null, 1)).toEqual([]);
});
