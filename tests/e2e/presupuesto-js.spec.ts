import { test, expect } from "@playwright/test";
import { crearRegalo } from "./utils/crear-regalo.ts";

// Constitution Compuerta 5 / Reglas de Calidad: JS de la página del regalo por debajo de
// 100 KB duro (objetivo real <20 KB). research.md #10 estima <5 KB sin comprimir; este test
// lo hace verificable en CI en vez de solo declarado.
const PRESUPUESTO_DURO_BYTES = 100 * 1024;
const OBJETIVO_BYTES = 20 * 1024;

test("el JavaScript servido en /r/[slug] se mantiene bajo el presupuesto duro de 100 KB", async ({
  page,
}) => {
  const { slug } = await crearRegalo({
    v: 1,
    receta: [
      { tipo: "portada", posicion: 0, nombreDestinatario: "Ana" },
      { tipo: "contador", posicion: 1, fechaInicio: "2024-02-14T00:00:00Z" },
      {
        tipo: "cancion",
        posicion: 2,
        url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
      },
      { tipo: "pregunta", posicion: 3, texto: "¿Te casás conmigo?", respuesta: "Sí" },
    ],
  });

  let totalBytes = 0;
  page.on("response", async (respuesta) => {
    if (respuesta.request().resourceType() !== "script") return;
    const cuerpo = await respuesta.body().catch(() => null);
    if (cuerpo) totalBytes += cuerpo.length;
  });

  await page.goto(`/r/${slug}`);
  await page.locator("[data-pantalla-apertura]").click();
  await page.waitForLoadState("networkidle");

  expect(totalBytes, "bytes totales de JS servidos").toBeLessThan(PRESUPUESTO_DURO_BYTES);
  if (totalBytes >= OBJETIVO_BYTES) {
    console.warn(
      `[presupuesto-js] ${totalBytes} bytes por encima del objetivo real de ${OBJETIVO_BYTES} (no falla el test, solo el techo de ${PRESUPUESTO_DURO_BYTES} lo hace)`,
    );
  }
});
