import { test, expect } from "@playwright/test";
import { crearRegalo } from "./utils/crear-regalo.ts";

const ANCHOS = [320, 375, 768, 1024, 1440];

test("cero scroll horizontal entre 320 y 1440px, en ningún bloque", async ({ page }) => {
  const { slug } = await crearRegalo({
    v: 1,
    receta: [
      { tipo: "portada", posicion: 0, nombreDestinatario: "Ana", subtitulo: "para vos" },
      { tipo: "contador", posicion: 1, fechaInicio: "2024-02-14T00:00:00Z" },
      {
        tipo: "momento",
        posicion: 2,
        titulo: "unpalabramuylargaquenotieneespaciosniguionesniformadecortarseadentrodeunacontenedorangosto",
        texto: "https://un-link-muy-largo-sin-espacios.example.com/a/b/c/d/e/f/g/h/i/j/k/l/m/n",
        foto: { url: "https://images.unsplash.com/photo-1", alt: "foto" },
      },
      {
        tipo: "galeria",
        posicion: 3,
        fotos: [{ url: "https://images.unsplash.com/photo-2", alt: "foto", ancho: 100, alto: 2000 }],
      },
      {
        tipo: "cancion",
        posicion: 4,
        url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
        titulo: "Canción",
      },
      { tipo: "carta", posicion: 5, texto: "Todo lo que quiero decirte cabe en esta carta." },
      { tipo: "pregunta", posicion: 6, texto: "¿Te casás conmigo?", respuesta: "Sí" },
      { tipo: "cierre", posicion: 7, texto: "Fin" },
    ],
  });

  for (const ancho of ANCHOS) {
    await page.setViewportSize({ width: ancho, height: 900 });
    await page.goto(`/r/${slug}`);
    await page.locator("[data-pantalla-apertura]").click();

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth, `ancho de viewport ${ancho}px`).toBeLessThanOrEqual(clientWidth);
  }
});
