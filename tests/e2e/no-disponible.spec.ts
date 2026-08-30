import { test, expect } from "@playwright/test";
import { crearRegalo } from "./utils/crear-regalo.ts";

// FR-002 / FR-017 / US1 Acceptance Scenario 4: código inexistente, no publicado o vencido
// deben mostrar "no disponible", nunca un error técnico crudo. El disparador "en_revision"
// ya está cubierto por revision-y-aprobacion.spec.ts; este test cubre los otros dos.

test("un slug inexistente muestra la página de no disponible", async ({ page }) => {
  await page.goto(`/r/NOEXISTE1`);
  await expect(page.getByText("no está disponible")).toBeVisible();
});

test("un regalo publicado pero vencido muestra la página de no disponible", async ({ page }) => {
  const { slug } = await crearRegalo(
    { v: 1, receta: [{ tipo: "cierre", posicion: 0, texto: "Fin" }] },
    { estado: "publicado", vencimiento: new Date(Date.now() - 60_000).toISOString() },
  );

  await page.goto(`/r/${slug}`);
  await expect(page.getByText("no está disponible")).toBeVisible();
});
