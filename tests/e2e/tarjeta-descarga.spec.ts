import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { crearPedido, borrarPedidoDeTest } from "./utils/crear-pedido.ts";
import { clienteDeTest } from "./utils/crear-regalo.ts";
import { cargarMinimo, enviarHistoria, leerBorrador, postFormulario } from "./utils/cargar-historia.ts";

test.describe.configure({ timeout: 180_000 });

// El comprador baja su propia tarjeta desde su enlace, una vez aprobado el regalo.
//
// Esta ruta NO esquiva la compuerta del QR: llama al mismo `emitirQr` que el script, así que
// hereda sus negativas y suma dos condiciones propias —que la tarjeta sea del pedido que la
// pide, y que nunca salga marcada como simulación—. Lo que estos tests cuidan es justamente
// eso: que no haya un atajo por HTTP hacia un QR que el negocio no habría emitido.

async function aprobar(request: import("@playwright/test").APIRequestContext, regaloId: string) {
  return postFormulario(request, `/api/regalos/${regaloId}/aprobar`, {});
}

test("con el regalo aprobado, el comprador baja su tarjeta", async ({ request }) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido({ estado: "pagado" });
  await cargarMinimo(request, pedido.id);
  await enviarHistoria(request, pedido.id);

  const { regaloId } = await leerBorrador(request, pedido.id);
  await aprobar(request, regaloId!);

  const respuesta = await request.get(`/api/pedidos/${pedido.id}/tarjeta`);
  expect(respuesta.status()).toBe(200);
  expect(respuesta.headers()["content-type"]).toBe("image/png");
  // Viene como archivo para guardar, no como imagen para mirar en una pestaña.
  expect(respuesta.headers()["content-disposition"]).toContain("attachment");
  expect(respuesta.headers()["content-disposition"]).not.toContain("simulacion");

  const bytes = Buffer.from(await respuesta.body());
  const meta = await sharp(bytes).metadata();
  expect(meta.width).toBe(1181);
  expect(meta.height).toBe(1772);

  // El código solo también se puede bajar, para pegarlo en una caja o un ramo.
  const codigo = await request.get(`/api/pedidos/${pedido.id}/tarjeta?formato=qr`);
  expect(codigo.status()).toBe(200);
  const metaCodigo = await sharp(Buffer.from(await codigo.body())).metadata();
  expect(metaCodigo.width).toBe(591);

  // Y la descarga queda registrada como cualquier emisión: si el soporte salió, hay rastro.
  const { data } = await supabase
    .from("pedidos")
    .select("qr_emitido_en, qr_simulacion")
    .eq("id", pedido.id)
    .single();
  expect(data!.qr_emitido_en).not.toBeNull();
  expect(data!.qr_simulacion).toBe(false);

  await borrarPedidoDeTest(pedido.id);
});

test("sin aprobar, no hay tarjeta: no existe QR antes de la aprobación", async ({ request }) => {
  const pedido = await crearPedido({ estado: "pagado" });

  // Sin historia enviada todavía.
  const sinRegalo = await request.get(`/api/pedidos/${pedido.id}/tarjeta`);
  expect(sinRegalo.status()).toBe(409);
  expect(await sinRegalo.text()).toContain("historia");

  await cargarMinimo(request, pedido.id);
  await enviarHistoria(request, pedido.id);

  // Enviada pero en revisión: sigue sin haber tarjeta (FR-025).
  const enRevision = await request.get(`/api/pedidos/${pedido.id}/tarjeta`);
  expect(enRevision.status()).toBe(409);
  expect(await enRevision.text()).toContain("revisión");

  await borrarPedidoDeTest(pedido.id);
});

test("la tarjeta de otro no se baja con el enlace propio", async ({ request }) => {
  const mio = await crearPedido({ estado: "pagado" });
  const ajeno = await crearPedido({ estado: "pagado" });

  await cargarMinimo(request, ajeno.id);
  await enviarHistoria(request, ajeno.id);
  const { regaloId } = await leerBorrador(request, ajeno.id);
  await aprobar(request, regaloId!);

  // Mi pedido no tiene regalo: con mi enlace no bajo la tarjeta del de al lado.
  const conMiEnlace = await request.get(`/api/pedidos/${mio.id}/tarjeta`);
  expect(conMiEnlace.status()).toBe(409);

  // Y un id inventado no revela nada.
  const inventado = await request.get(`/api/pedidos/${randomUUID()}/tarjeta`);
  expect(inventado.status()).toBe(404);

  await borrarPedidoDeTest(mio.id);
  await borrarPedidoDeTest(ajeno.id);
});

test("el botón aparece en el enlace del pedido recién cuando hay tarjeta", async ({
  page,
  request,
}) => {
  const pedido = await crearPedido({ estado: "pagado" });
  await cargarMinimo(request, pedido.id);
  await enviarHistoria(request, pedido.id);

  // Todavía en revisión: se explica qué va a pasar, sin ofrecer un botón que fallaría.
  await page.goto(`/contar/${pedido.id}/enviado`);
  await expect(page.locator("[data-bajar-tarjeta]")).toHaveCount(0);

  const { regaloId } = await leerBorrador(request, pedido.id);
  await aprobar(request, regaloId!);

  await page.goto(`/contar/${pedido.id}/enviado`);
  await expect(page.locator("[data-bajar-tarjeta]")).toBeVisible();

  await page.goto(`/gracias/${pedido.id}`);
  await expect(page.locator("[data-bajar-tarjeta]")).toBeVisible();

  await borrarPedidoDeTest(pedido.id);
});
