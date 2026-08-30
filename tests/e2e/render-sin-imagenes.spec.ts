import { test, expect } from "@playwright/test";
import { crearRegalo } from "./utils/crear-regalo.ts";

test("con imágenes bloqueadas, todo el texto sigue siendo legible", async ({ page }) => {
  const { slug } = await crearRegalo({
    v: 1,
    receta: [
      { tipo: "portada", posicion: 0, nombreDestinatario: "Ana" },
      {
        tipo: "momento",
        posicion: 1,
        titulo: "Primer viaje",
        texto: "El día que nos escapamos sin avisarle a nadie.",
        foto: { url: "https://images.unsplash.com/photo-1", alt: "Los dos en el aeropuerto" },
      },
      {
        tipo: "galeria",
        posicion: 2,
        fotos: [{ url: "https://images.unsplash.com/photo-2", alt: "Los dos en la playa" }],
      },
      { tipo: "carta", posicion: 3, texto: "Todo lo que quiero decirte." },
    ],
  });

  await page.route("**/*.{png,jpg,jpeg,webp,gif,avif}", (route) => route.abort());
  await page.route("**images.unsplash.com/**", (route) => route.abort());

  await page.goto(`/r/${slug}`);
  await page.locator("[data-pantalla-apertura]").click();

  await expect(page.locator('[data-bloque="portada"] h1')).toHaveText("Ana");
  await expect(page.locator('[data-bloque="momento"] h2')).toHaveText("Primer viaje");
  await expect(page.locator('[data-bloque="momento"] p')).toContainText(
    "El día que nos escapamos",
  );
  await expect(page.locator('[data-bloque="carta"] p')).toContainText("Todo lo que quiero");
});
