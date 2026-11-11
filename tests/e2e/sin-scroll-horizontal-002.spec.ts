import { test, expect } from "@playwright/test";
import { crearPedido, crearPago, borrarPedidoDeTest } from "./utils/crear-pedido.ts";
import { guardarPaso, enviarHistoria } from "./utils/cargar-historia.ts";

test.describe.configure({ timeout: 180_000 });

// FR-032 y SC-010: 320 a 1440 px sin scroll horizontal, en TODAS las páginas de esta feature.
// El gate de la 001 cubre /r/[slug]; este cubre las nuevas.
//
// Se cargan textos sin espacios ni forma de cortarse a propósito: una palabra larga o un
// enlace sin guiones es lo que rompe un layout angosto, y es exactamente lo que un comprador
// pega sin pensarlo.

const ANCHOS = [320, 375, 768, 1024, 1440];

const PALABRA_IMPOSIBLE =
  "unapalabramuylargaquenotieneespaciosniguionesniformadecortarseadentrodeuncontenedorangosto";
const ENLACE_LARGO =
  "https://un-enlace-larguisimo-sin-espacios.example.com/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p";

async function sinDesborde(page: import("@playwright/test").Page, ruta: string) {
  for (const ancho of ANCHOS) {
    await page.setViewportSize({ width: ancho, height: 900 });
    await page.goto(ruta);

    const desborde = await page.evaluate(() => {
      const raiz = document.documentElement;
      // +1 de tolerancia: el redondeo de píxeles fraccionarios no es un defecto de layout.
      return raiz.scrollWidth - raiz.clientWidth;
    });

    expect(desborde, `${ruta} a ${ancho}px`).toBeLessThanOrEqual(1);
  }
}

test("ninguna página de la compra desborda entre 320 y 1440px", async ({ page, request }) => {
  const pedido = await crearPedido({ estado: "pagado", celular: "+5491100000000" });
  await crearPago(pedido.id, { proveedor: "qr-manual" });

  // Un borrador con todo cargado, y con los textos que rompen layouts.
  await guardarPaso(request, pedido.id, "destinatario", {
    nombre: PALABRA_IMPOSIBLE,
    subtitulo: ENLACE_LARGO,
    tema: "papel",
    fecha_inicio: "2024-02-14",
  });
  await guardarPaso(request, pedido.id, "momentos", {
    momento_titulo: PALABRA_IMPOSIBLE,
    momento_texto: `${ENLACE_LARGO} ${PALABRA_IMPOSIBLE}`,
  });
  await guardarPaso(request, pedido.id, "cancion", {
    cancion_url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    cancion_titulo: PALABRA_IMPOSIBLE,
  });
  await guardarPaso(request, pedido.id, "carta", { carta_texto: `${PALABRA_IMPOSIBLE} ` .repeat(8) });
  await guardarPaso(request, pedido.id, "preguntas", {
    pregunta_texto: PALABRA_IMPOSIBLE,
    pregunta_respuesta: ENLACE_LARGO,
  });
  await guardarPaso(request, pedido.id, "cierre", { cierre_texto: PALABRA_IMPOSIBLE });

  await sinDesborde(page, "/");
  await sinDesborde(page, `/gracias/${pedido.id}`);
  await sinDesborde(page, `/pagar/${pedido.id}`);
  await sinDesborde(page, `/baja/${pedido.tokenBaja}`);

  for (const paso of [
    "destinatario",
    "momentos",
    "fotos",
    "cancion",
    "carta",
    "preguntas",
    "cierre",
    "resumen",
  ]) {
    await sinDesborde(page, `/contar/${pedido.id}/${paso}`);
  }

  // Y después de enviar, la pantalla de enviado.
  await enviarHistoria(request, pedido.id);
  await sinDesborde(page, `/contar/${pedido.id}/enviado`);

  // La cola operativa es la más ancha de todas: cinco tablas con correos y fechas.
  await sinDesborde(page, `/pedidos?clave=${encodeURIComponent(process.env.OPS_SECRET!)}`);

  await borrarPedidoDeTest(pedido.id);
});
