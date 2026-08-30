import { test, expect } from "@playwright/test";
import { crearRegalo } from "./utils/crear-regalo.ts";

test("un tipo de bloque no reconocido se omite en silencio; el resto de la página es normal", async ({
  page,
}) => {
  const { slug } = await crearRegalo({
    v: 1,
    receta: [
      { tipo: "cierre", posicion: 0, texto: "Antes" },
      // Tipo deliberadamente ausente de registro.ts (FR-006).
      { tipo: "bloque-inventado", posicion: 1, texto: "no debería aparecer" },
      {
        tipo: "cancion",
        posicion: 2,
        url: "https://audio-pirata.example.com/cancion.mp3",
      },
      { tipo: "carta", posicion: 3, texto: "Después" },
    ],
  });

  const errores: string[] = [];
  page.on("pageerror", (err) => errores.push(err.message));

  await page.goto(`/r/${slug}`);
  await page.locator("[data-pantalla-apertura]").click();

  await expect(page.getByText("no debería aparecer")).toHaveCount(0);
  await expect(page.locator('[data-bloque="cancion"]')).toHaveCount(0);
  await expect(page.locator('[data-bloque="cierre"]')).toContainText("Antes");
  await expect(page.locator('[data-bloque="carta"]')).toContainText("Después");
  expect(errores).toHaveLength(0);
});
