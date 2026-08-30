import { test, expect } from "@playwright/test";
import { crearRegalo } from "./utils/crear-regalo.ts";

// FR-007 / Edge Case "Texto con etiquetas HTML dentro": el texto del comprador se trata
// como texto plano y se escapa antes de mostrarse; nunca se interpreta como HTML.
const PAYLOAD = '<script>window.__xss = true;</script><b>negrita</b>';

test("etiquetas HTML en texto del comprador se muestran literal y nunca se interpretan", async ({
  page,
}) => {
  const { slug } = await crearRegalo({
    v: 1,
    receta: [
      { tipo: "portada", posicion: 0, nombreDestinatario: PAYLOAD },
      { tipo: "momento", posicion: 1, texto: PAYLOAD },
      { tipo: "carta", posicion: 2, texto: PAYLOAD },
      { tipo: "pregunta", posicion: 3, texto: PAYLOAD, respuesta: PAYLOAD },
      { tipo: "cierre", posicion: 4, texto: PAYLOAD },
    ],
  });

  await page.goto(`/r/${slug}`);
  await expect(page.locator("[data-pantalla-apertura] p")).toContainText(PAYLOAD);
  await page.locator("[data-pantalla-apertura]").click();

  // Si el <script> inyectado se hubiera interpretado, esta variable existiría.
  const xssEjecutado = await page.evaluate(() => (window as unknown as Record<string, unknown>).__xss);
  expect(xssEjecutado).toBeUndefined();

  await expect(page.locator('[data-bloque="portada"] h1')).toHaveText(PAYLOAD);
  await expect(page.locator('[data-bloque="momento"] p')).toHaveText(PAYLOAD);
  await expect(page.locator('[data-bloque="carta"] p')).toHaveText(PAYLOAD);
  await expect(page.locator('[data-bloque="pregunta"] p')).toHaveText(PAYLOAD);
  await expect(page.locator('[data-bloque="cierre"] p')).toHaveText(PAYLOAD);

  await page.locator("[data-boton-pregunta]").click();
  await expect(page.locator("[data-respuesta]")).toHaveText(PAYLOAD);

  // Ningún <b> ni <script> propio del comprador debe existir como nodo real del DOM.
  await expect(page.locator('[data-bloque="carta"] b')).toHaveCount(0);
});
