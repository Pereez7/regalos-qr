import { test, expect } from "@playwright/test";
import { crearRegalo } from "./utils/crear-regalo.ts";

// Constitution Compuerta 2: "canción rota" — el embed de terceros (research.md #21) puede
// fallar en cargar; el resto de la página debe seguir legible y sin errores.
test("el embed de canción roto no rompe el resto de la página", async ({ page }) => {
  const { slug } = await crearRegalo({
    v: 1,
    receta: [
      { tipo: "portada", posicion: 0, nombreDestinatario: "Ana" },
      {
        tipo: "cancion",
        posicion: 1,
        url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
        titulo: "Canción",
      },
      { tipo: "carta", posicion: 2, texto: "Todo lo que quiero decirte." },
      { tipo: "cierre", posicion: 3, texto: "Fin" },
    ],
  });

  await page.route("**youtube-nocookie.com/**", (route) => route.abort("failed"));
  await page.route("**open.spotify.com/**", (route) => route.abort("failed"));

  const errores: string[] = [];
  page.on("pageerror", (err) => errores.push(err.message));

  await page.goto(`/r/${slug}`);
  await page.locator("[data-pantalla-apertura]").click();

  // Tocar el botón inserta el <iframe> igual (research.md #21); su request falla, pero eso
  // no debe generar un error de JS ni ocultar el resto del contenido.
  await page.locator("[data-boton-cancion]").click();

  await expect(page.locator('[data-bloque="portada"] h1')).toHaveText("Ana");
  await expect(page.locator('[data-bloque="carta"] p')).toContainText("Todo lo que quiero");
  await expect(page.locator('[data-bloque="cierre"] p')).toHaveText("Fin");
  expect(errores).toHaveLength(0);
});
