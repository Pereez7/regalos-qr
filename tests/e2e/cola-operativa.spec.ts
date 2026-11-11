import { test, expect } from "@playwright/test";
import { crearPedido, crearPago } from "./utils/crear-pedido.ts";
import { crearRegalo, clienteDeTest } from "./utils/crear-regalo.ts";

// Timeout propio: estos tests hacen muchas idas y vueltas contra el Supabase remoto (crear
// pedidos, 12 entregas del mismo aviso, verificar filas), y cada una paga la latencia de red.
// El default de 30 s alcanza para la feature 001, que es casi todo render local.
test.describe.configure({ timeout: 120_000 });

// FR-008 y SC-007: el negocio ve lo que quedó a medio camino. Principio VII leído como lo
// que es — visibilidad, no administración.
//
// La compuerta es propia, derivada de OPS_SECRET, y NO la de MODO_INTERNO: ese flag se
// apaga el día que la landing se abre al público (research.md #14, CONTRADICCIONES H9).

const CONTENIDO = {
  v: 1 as const,
  receta: [{ tipo: "portada", posicion: 0, nombreDestinatario: "Ana" }],
};

function conClave(ruta: string): string {
  return `${ruta}?clave=${encodeURIComponent(process.env.OPS_SECRET!)}`;
}

test("sin la credencial de OPS_SECRET, la cola no se sirve", async ({ page }) => {
  const sinClave = await page.goto("/pedidos");
  expect(sinClave!.status()).toBe(404);

  const claveMala = await page.goto("/pedidos?clave=no-es-el-secreto");
  expect(claveMala!.status()).toBe(404);
});

test("un pedido pagado sin regalo aparece en la cola", async ({ page }) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido({ estado: "pagado", email: "cola@ejemplo.test" });
  await crearPago(pedido.id, { estado: "aprobado", pagoIdProveedor: `pay_${pedido.id.slice(0, 8)}` });

  const respuesta = await page.goto(conClave("/pedidos"));
  expect(respuesta!.status()).toBe(200);

  const fila = page.locator(`[data-pedido="${pedido.id}"]`);
  await expect(fila).toHaveCount(1);
  await expect(fila).toContainText("cola@ejemplo.test");

  await supabase.from("pedidos").delete().eq("id", pedido.id);
});

test("un pedido pagado cuyo regalo ya está publicado sale de la cola", async ({ page }) => {
  const supabase = clienteDeTest();
  const regalo = await crearRegalo(CONTENIDO, { estado: "publicado" });
  const pedido = await crearPedido({ estado: "pagado", regaloId: regalo.id });

  await page.goto(conClave("/pedidos"));
  await expect(page.locator(`[data-pedido="${pedido.id}"]`)).toHaveCount(0);

  // Pero un regalo todavía en revisión sigue siendo "pagado sin entregar".
  const regaloEnRevision = await crearRegalo(CONTENIDO, { estado: "en_revision" });
  const pedidoEnRevision = await crearPedido({ estado: "pagado", regaloId: regaloEnRevision.id });

  await page.goto(conClave("/pedidos"));
  await expect(page.locator(`[data-pedido="${pedidoEnRevision.id}"]`)).toHaveCount(1);

  for (const id of [pedido.id, pedidoEnRevision.id]) {
    await supabase.from("pedidos").delete().eq("id", id);
  }
  for (const r of [regalo, regaloEnRevision]) {
    await supabase.from("slugs").update({ regalo_id: null }).eq("slug", r.slug);
    await supabase.from("regalos").delete().eq("id", r.id);
  }
});

test("un intento abandonado aparece como tal, nunca como venta", async ({ page }) => {
  const supabase = clienteDeTest();
  const abandonado = await crearPedido({ estado: "iniciado", email: "abandono@ejemplo.test" });

  await page.goto(conClave("/pedidos"));
  const fila = page.locator(`[data-pedido="${abandonado.id}"]`);
  await expect(fila).toHaveCount(1);
  await expect(fila).toHaveAttribute("data-estado", "iniciado");

  await supabase.from("pedidos").delete().eq("id", abandonado.id);
});
