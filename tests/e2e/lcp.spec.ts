import { test, expect } from "@playwright/test";
import { crearRegalo } from "./utils/crear-regalo.ts";
import { throttleToSlow3GLowEnd } from "./utils/network-throttle.ts";

// Dos mediciones bajo la misma emulación de 3G + gama baja (research.md #12, #23):
// (1) SC-001, pantalla de apertura; (2) SC-008, primer bloque real tras el tap.
test("pantalla de apertura <2,5s y primer bloque real <2,5s tras el tap", async ({ page }) => {
  const { slug } = await crearRegalo({
    v: 1,
    receta: [
      { tipo: "portada", posicion: 0, nombreDestinatario: "Ana" },
      {
        tipo: "galeria",
        posicion: 1,
        fotos: [
          { url: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee", alt: "foto" },
        ],
      },
      { tipo: "carta", posicion: 2, texto: "Un texto cualquiera" },
    ],
  });

  // images.unsplash.com es una red real fuera de nuestro control: bajo el
  // throttle Slow-3G simulado su latencia real se vuelve impredecible (visto
  // hasta ~37s) y no mide nada del propio sitio. Se mockea con un PNG 1x1.
  const PIXEL_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  await page.route("**images.unsplash.com/**", (route) =>
    route.fulfill({ contentType: "image/png", body: PIXEL_PNG }),
  );

  await throttleToSlow3GLowEnd(page);

  const inicioNavegacion = Date.now();
  // "load" espera además a que terminen las 3 fuentes (font-display: swap no
  // las bloquea para pintar, pero sí para el evento load) — no es lo que este
  // test quiere medir. domcontentloaded se acerca a "pantalla pintada".
  await page.goto(`/r/${slug}`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-pantalla-apertura]").waitFor({ state: "visible" });
  const tiempoPantalla = Date.now() - inicioNavegacion;
  expect(tiempoPantalla, "pantalla de apertura visible").toBeLessThan(2500);

  const inicioTap = Date.now();
  await page.locator("[data-pantalla-apertura]").click();
  await page.locator('[data-bloque="portada"]').waitFor({ state: "visible" });
  const tiempoContenido = Date.now() - inicioTap;
  expect(tiempoContenido, "primer bloque real visible tras el tap").toBeLessThan(2500);
});
