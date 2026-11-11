import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { enlaceDeAviso } from "../../src/lib/avisos.ts";
import { crearPedido, crearPago, borrarPedidoDeTest } from "./utils/crear-pedido.ts";
import { clienteDeTest } from "./utils/crear-regalo.ts";
import { firmarAviso } from "./utils/firmar-aviso.ts";
import {
  cargarMinimo,
  enviarHistoria,
  leerBorrador,
  postFormulario,
} from "./utils/cargar-historia.ts";

test.describe.configure({ timeout: 180_000 });

// FR-026 (tres avisos, uno de cada tipo), FR-027 (nada que el comprador no haya dado) y
// FR-029 (una falla no bloquea ni pierde el pedido, y queda reintentable).

const MONTO = 1200000;
const MONEDA = "ARS";

async function pagar(request: import("@playwright/test").APIRequestContext, pedidoId: string) {
  const aviso = {
    id_evento: `ev_${randomBytes(6).toString("hex")}`,
    id_pago: `pay_${randomBytes(6).toString("hex")}`,
    referencia: pedidoId,
    monto_centavos: MONTO,
    moneda: MONEDA,
    estado: "aprobado",
  };
  const { cuerpo, headers } = firmarAviso(aviso);
  return request.post("/api/pagos/webhook/simulado", { data: cuerpo, headers });
}

test("los tres avisos se emiten una sola vez cada uno, con su enlace", async ({ request }) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido({ estado: "iniciado", email: "avisos@ejemplo.test" });
  await crearPago(pedido.id, { montoCentavos: MONTO, moneda: MONEDA });

  // 1 · comprobante de compra, al quedar pagado.
  expect((await pagar(request, pedido.id)).status()).toBe(200);

  // 2 · regalo listo, al nacer el regalo.
  await cargarMinimo(request, pedido.id);
  await enviarHistoria(request, pedido.id);
  const { regaloId } = await leerBorrador(request, pedido.id);

  // 3 · aprobación, cuando el comprador aprueba desde /revisar/[id].
  const aprobacion = await postFormulario(request, `/api/regalos/${regaloId}/aprobar`, {});
  expect(aprobacion.status()).toBe(303);

  const { data: avisos } = await supabase
    .from("avisos")
    .select("tipo, estado, destinatario, proveedor, intentos, enviado_en")
    .eq("pedido_id", pedido.id);

  expect(avisos).toHaveLength(3);
  expect(avisos!.map((a) => a.tipo).sort()).toEqual(["aprobacion", "comprobante", "revision"]);

  for (const aviso of avisos!) {
    expect(aviso.estado, aviso.tipo as string).toBe("enviado");
    expect(aviso.enviado_en).not.toBeNull();
    expect(aviso.intentos).toBe(1);
    // FR-027: el destinatario es el correo que el propio comprador dio, y no hay otra fuente.
    expect(aviso.destinatario).toBe("avisos@ejemplo.test");
    // El registro se escribe igual con cualquier proveedor: es del negocio, no del proveedor.
    expect(aviso.proveedor).toBe("consola");
  }

  // Corregir y reenviar no vuelve a avisar: sin eso, cada corrección le llenaría la casilla
  // al comprador (FR-014 contra FR-026).
  await enviarHistoria(request, pedido.id);
  await enviarHistoria(request, pedido.id);
  // Y un aviso de pago repetido tampoco emite un segundo comprobante.
  await pagar(request, pedido.id);

  const { count } = await supabase
    .from("avisos")
    .select("id", { count: "exact", head: true })
    .eq("pedido_id", pedido.id);
  expect(count).toBe(3);

  await borrarPedidoDeTest(pedido.id);
});

test("cada aviso lleva el enlace que le corresponde", () => {
  const original = process.env.SITIO_URL;
  process.env.SITIO_URL = "https://regalos.bo";

  const pedidoId = "11111111-2222-3333-4444-555555555555";
  const regaloId = "66666666-7777-8888-9999-000000000000";

  // El comprobante lleva a la carga; los otros dos, al enlace de revisión, que es el mismo
  // que el comprador ya tiene y no cambia nunca.
  expect(enlaceDeAviso("comprobante", { pedidoId })).toBe(
    `https://regalos.bo/contar/${pedidoId}/destinatario`,
  );
  expect(enlaceDeAviso("revision", { pedidoId, regaloId })).toBe(
    `https://regalos.bo/revisar/${regaloId}`,
  );
  expect(enlaceDeAviso("aprobacion", { pedidoId, regaloId })).toBe(
    `https://regalos.bo/revisar/${regaloId}`,
  );

  // Ningún enlace de aviso lleva el token de baja ni una dirección firmada de foto.
  for (const enlace of [
    enlaceDeAviso("comprobante", { pedidoId }),
    enlaceDeAviso("revision", { pedidoId, regaloId }),
  ]) {
    expect(enlace).not.toContain("token");
    expect(enlace).not.toContain("/storage/");
  }

  if (original === undefined) delete process.env.SITIO_URL;
  else process.env.SITIO_URL = original;
});

test("una falla de envío no bloquea el pedido, queda registrada y se reintenta", async ({
  request,
}) => {
  const supabase = clienteDeTest();

  // `a@b` pasa el check de la tabla —tiene arroba y más de dos caracteres— y no es una
  // dirección de correo válida, así que el proveedor la rechaza. Es la forma honesta de
  // provocar la falla: sin tocar el código que se está probando.
  const pedido = await crearPedido({ estado: "iniciado", email: "a@b" });
  await crearPago(pedido.id, { montoCentavos: MONTO, moneda: MONEDA });

  // El pago entra igual: la respuesta del webhook no depende del correo.
  expect((await pagar(request, pedido.id)).status()).toBe(200);

  const { data: pagado } = await supabase
    .from("pedidos")
    .select("estado")
    .eq("id", pedido.id)
    .single();
  expect(pagado!.estado).toBe("pagado");

  const { data: fallido } = await supabase
    .from("avisos")
    .select("id, estado, error, intentos, enviado_en")
    .eq("pedido_id", pedido.id)
    .single();

  expect(fallido!.estado).toBe("fallido");
  expect(fallido!.intentos).toBe(1);
  expect(fallido!.enviado_en).toBeNull();
  // El motivo queda acotado y en la fila: es de ahí de donde sale el reintento.
  expect(fallido!.error).toContain("destinatario");

  // La carga de la historia sigue abierta: ninguna transición del pedido depende de un aviso.
  await cargarMinimo(request, pedido.id);
  expect((await enviarHistoria(request, pedido.id)).status()).toBe(303);

  // Reintentar sin credencial no se puede.
  const sinCredencial = await postFormulario(
    request,
    `/api/avisos/${fallido!.id}/reintentar`,
    {},
  );
  expect(sinCredencial.status()).toBe(401);

  // Con el secreto de servidor sí, y sigue fallando por el mismo motivo: el intento se
  // cuenta igual.
  const reintento = await request.post(`/api/avisos/${fallido!.id}/reintentar`, {
    data: "",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "http://localhost:4321",
      Authorization: `Bearer ${process.env.OPS_SECRET}`,
    },
    maxRedirects: 0,
  });
  expect(reintento.status()).toBe(204);

  const { data: segundo } = await supabase
    .from("avisos")
    .select("estado, intentos")
    .eq("id", fallido!.id)
    .single();
  expect(segundo!.estado).toBe("fallido");
  expect(segundo!.intentos).toBe(2);

  // Corregida la dirección, el mismo reintento lo manda: la fila es la misma, el contador
  // sigue subiendo, y no nace un aviso nuevo.
  await supabase
    .from("avisos")
    .update({ destinatario: "corregido@ejemplo.test" })
    .eq("id", fallido!.id);

  const tercero = await request.post(`/api/avisos/${fallido!.id}/reintentar`, {
    data: "",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "http://localhost:4321",
      Authorization: `Bearer ${process.env.OPS_SECRET}`,
    },
    maxRedirects: 0,
  });
  expect(tercero.status()).toBe(204);

  const { data: enviado } = await supabase
    .from("avisos")
    .select("estado, intentos, enviado_en, error")
    .eq("id", fallido!.id)
    .single();
  expect(enviado!.estado).toBe("enviado");
  expect(enviado!.intentos).toBe(3);
  expect(enviado!.enviado_en).not.toBeNull();
  expect(enviado!.error).toBeNull();

  // Un aviso ya enviado no se reencola.
  const deMas = await request.post(`/api/avisos/${fallido!.id}/reintentar`, {
    data: "",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "http://localhost:4321",
      Authorization: `Bearer ${process.env.OPS_SECRET}`,
    },
    maxRedirects: 0,
  });
  expect(deMas.status()).toBe(409);

  await borrarPedidoDeTest(pedido.id);
});

test("los avisos fallidos aparecen en la cola con su botón de reintento", async ({ page }) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido({ estado: "iniciado", email: "a@c" });
  await crearPago(pedido.id, { montoCentavos: MONTO, moneda: MONEDA });
  await pagar(page.request, pedido.id);

  const { data: aviso } = await supabase
    .from("avisos")
    .select("id")
    .eq("pedido_id", pedido.id)
    .single();

  await page.goto(`/pedidos?clave=${encodeURIComponent(process.env.OPS_SECRET!)}`);
  const fila = page.locator(`[data-aviso="${aviso!.id}"]`);
  await expect(fila).toHaveCount(1);
  await expect(fila).toHaveAttribute("data-estado", "fallido");

  // El botón reencola desde la misma cola, con la cookie que ya tiene el operador.
  await fila.locator("[data-reintentar]").click();
  await expect(page).toHaveURL(/\/pedidos$/);

  const { data: despues } = await supabase
    .from("avisos")
    .select("intentos")
    .eq("id", aviso!.id)
    .single();
  expect(despues!.intentos).toBe(2);

  await borrarPedidoDeTest(pedido.id);
});
