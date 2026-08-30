import { test, expect } from "@playwright/test";
import { crearRegalo } from "./utils/crear-regalo.ts";

// Constitution Compuerta 2: "Degradación verificada con foto rota, canción rota y conexión
// caída: la página se lee." Esto es degradación ante fallas parciales de red durante una
// sesión activa, NO funcionamiento offline (research.md #24) — un service worker fue
// evaluado y descartado por el riesgo de servir contenido desactualizado tras una
// reaprobación (Principio III). La foto rota ya la cubre render-sin-imagenes.spec.ts; la
// canción rota, cancion-rota.spec.ts; este test cubre el caso general de "recursos que no
// cargan" sin que la página quede en blanco.
test("ante fallas parciales de red, la página nunca queda en blanco y el texto sigue legible", async ({
  page,
}) => {
  const { slug } = await crearRegalo({
    v: 1,
    receta: [
      { tipo: "portada", posicion: 0, nombreDestinatario: "Ana" },
      {
        tipo: "momento",
        posicion: 1,
        titulo: "Primer viaje",
        texto: "Un momento importante que no debería desaparecer.",
        foto: { url: "https://images.unsplash.com/photo-1", alt: "foto" },
      },
      {
        tipo: "galeria",
        posicion: 2,
        fotos: [{ url: "https://images.unsplash.com/photo-2", alt: "foto" }],
      },
      { tipo: "carta", posicion: 3, texto: "Todo lo que quiero decirte." },
      { tipo: "cierre", posicion: 4, texto: "Fin" },
    ],
  });

  // Simula recursos que no cargan (no toda la conexión caída: el documento y el JS del
  // propio sitio sí llegan, como en una red inestable real).
  await page.route("**/*.{png,jpg,jpeg,webp,gif,avif}", (route) => route.abort("failed"));
  await page.route("**images.unsplash.com/**", (route) => route.abort("failed"));

  const errores: string[] = [];
  page.on("pageerror", (err) => errores.push(err.message));

  await page.goto(`/r/${slug}`);
  await page.locator("[data-pantalla-apertura]").click();

  const textoVisible = await page.locator("body").innerText();
  expect(textoVisible.length, "la página no queda en blanco").toBeGreaterThan(0);
  expect(textoVisible).toContain("Ana");
  expect(textoVisible).toContain("Un momento importante");
  expect(textoVisible).toContain("Todo lo que quiero decirte");
  expect(textoVisible).toContain("Fin");
  expect(errores).toHaveLength(0);
});
