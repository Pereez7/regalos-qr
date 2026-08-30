import { test, expect } from "@playwright/test";
import { crearRegalo } from "./utils/crear-regalo.ts";

test("una carta de ~4000 caracteres se muestra completa, sin scroll horizontal", async ({
  page,
}) => {
  const parrafo = "Recuerdo cada instante que pasamos juntos, uno detrás del otro. ";
  const texto = parrafo.repeat(Math.ceil(4000 / parrafo.length)).slice(0, 4000);

  const { slug } = await crearRegalo({
    v: 1,
    receta: [{ tipo: "carta", posicion: 0, texto }],
  });

  await page.goto(`/r/${slug}`);
  await page.locator("[data-pantalla-apertura]").click();

  const carta = page.locator('[data-bloque="carta"] p');
  await expect(carta).toHaveText(texto);

  const anchoDocumento = await page.evaluate(() => document.documentElement.scrollWidth);
  const anchoViewport = await page.evaluate(() => document.documentElement.clientWidth);
  expect(anchoDocumento).toBeLessThanOrEqual(anchoViewport);
});
