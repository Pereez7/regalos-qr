import { test, expect } from "@playwright/test";
import { crearRegalo } from "./utils/crear-regalo.ts";

test("contador con fechaInicio futura cuenta regresiva y nunca muestra un valor negativo", async ({
  page,
}) => {
  const fechaInicio = new Date(Date.now() + 4000).toISOString();
  const { slug } = await crearRegalo({
    v: 1,
    receta: [{ tipo: "contador", posicion: 0, fechaInicio }],
  });

  await page.goto(`/r/${slug}`);
  await page.locator("[data-pantalla-apertura]").click();

  const valor = page.locator("[data-contador-valor]");
  await expect(valor).not.toHaveText("—");

  // Muestreo del valor durante ~6s, cruzando el umbral de fechaInicio a mitad de camino.
  for (let i = 0; i < 6; i++) {
    const texto = await valor.textContent();
    const segundos = await valor.getAttribute("data-segundos");
    expect(texto).not.toContain("-");
    expect(Number(segundos)).toBeGreaterThanOrEqual(0);
    await page.waitForTimeout(1000);
  }
});
