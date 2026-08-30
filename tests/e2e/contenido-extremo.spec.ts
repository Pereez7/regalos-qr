import { test, expect } from "@playwright/test";
import { crearRegalo } from "./utils/crear-regalo.ts";

test("nombre con emoji y acentos se muestra tal cual", async ({ page }) => {
  const nombreDestinatario = "José 💙 Ñañez";
  const { slug } = await crearRegalo({
    v: 1,
    receta: [{ tipo: "portada", posicion: 0, nombreDestinatario }],
  });

  await page.goto(`/r/${slug}`);
  await expect(page.locator("[data-pantalla-apertura] p")).toContainText(nombreDestinatario);

  await page.locator("[data-pantalla-apertura]").click();
  await expect(page.locator('[data-bloque="portada"] h1')).toHaveText(nombreDestinatario);
});

test("una carta vacía se omite del render", async ({ page }) => {
  const { slug } = await crearRegalo({
    v: 1,
    receta: [
      { tipo: "carta", posicion: 0, texto: "   " },
      { tipo: "cierre", posicion: 1, texto: "Fin" },
    ],
  });

  await page.goto(`/r/${slug}`);
  await page.locator("[data-pantalla-apertura]").click();

  await expect(page.locator('[data-bloque="carta"]')).toHaveCount(0);
  await expect(page.locator('[data-bloque="cierre"]')).toBeVisible();
});

test("foto cuadrada y foto vertical muy alargada no se recortan (object-fit: contain)", async ({
  page,
}) => {
  const { slug } = await crearRegalo({
    v: 1,
    receta: [
      {
        tipo: "galeria",
        posicion: 0,
        fotos: [
          {
            url: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee",
            alt: "Foto cuadrada",
            ancho: 800,
            alto: 800,
          },
        ],
      },
      {
        tipo: "momento",
        posicion: 1,
        texto: "Un momento con foto extrema",
        foto: {
          url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e",
          alt: "Foto vertical muy alargada",
          ancho: 100,
          alto: 2000,
        },
      },
    ],
  });

  await page.goto(`/r/${slug}`);
  await page.locator("[data-pantalla-apertura]").click();

  const galeriaImg = page.locator('[data-bloque="galeria"] .foto-marco img');
  await expect(galeriaImg).toHaveCSS("object-fit", "contain");
  await expect(page.locator('[data-bloque="galeria"] .foto-marco')).toHaveCSS(
    "aspect-ratio",
    "800 / 800",
  );

  const momentoImg = page.locator('[data-bloque="momento"] .foto-marco img');
  await expect(momentoImg).toHaveCSS("object-fit", "contain");
  await expect(page.locator('[data-bloque="momento"] .foto-marco')).toHaveCSS(
    "aspect-ratio",
    "100 / 2000",
  );
});
