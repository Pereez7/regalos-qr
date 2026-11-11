import { test, expect } from "@playwright/test";
import { crearPedido, crearPago, borrarPedidoDeTest } from "./utils/crear-pedido.ts";
import { clienteDeTest } from "./utils/crear-regalo.ts";
import { postFormulario } from "./utils/cargar-historia.ts";

test.describe.configure({ timeout: 120_000 });

// research.md #24: cobro con QR interbancario y confirmación manual.
//
// Lo que estos tests cuidan no es el botón: es que el cobro manual NO sea un segundo camino
// hacia el dinero. La confirmación emite el mismo aviso firmado que emitiría un proveedor con
// API, así que la idempotencia y el registro previo del evento valen igual (Principio VII).

const MONTO = 35000;
const MONEDA = "BOB";

function clave(): string {
  return `?clave=${encodeURIComponent(process.env.OPS_SECRET!)}`;
}

test("el comprador declara su pago y el pedido NO queda pagado por eso", async ({ page }) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido({ estado: "iniciado", email: "qr@ejemplo.test" });
  await crearPago(pedido.id, { proveedor: "qr-manual", montoCentavos: MONTO, moneda: MONEDA });

  await page.goto(`/pagar/${pedido.id}`);
  await page.fill("#comprobante", "TRX-99887766");
  await page.click("[data-form-comprobante] button");

  await expect(page.locator("[data-declarado]")).toBeVisible();

  // Declarar no es pagar: el pedido sigue `iniciado` y /gracias dice la verdad.
  const { data: tras } = await supabase
    .from("pedidos")
    .select("estado, pagado_en")
    .eq("id", pedido.id)
    .single();
  expect(tras!.estado).toBe("iniciado");
  expect(tras!.pagado_en).toBeNull();

  await page.goto(`/gracias/${pedido.id}`);
  await expect(page.locator('[data-estado="iniciado"]')).toBeVisible();

  // El comprobante queda guardado en el cobro, que es donde se mira para confirmarlo.
  const { data: pago } = await supabase
    .from("pagos")
    .select("referencia_comprador, estado")
    .eq("pedido_id", pedido.id)
    .single();
  expect(pago!.referencia_comprador).toBe("TRX-99887766");
  expect(pago!.estado).toBe("pendiente");

  // Y aparece en la cola operativa, esperando que alguien lo confirme.
  await page.goto(`/pedidos${clave()}`);
  const fila = page.locator(`[data-por-confirmar="${pedido.id}"]`);
  await expect(fila).toHaveCount(1);
  await expect(fila).toContainText("TRX-99887766");

  await borrarPedidoDeTest(pedido.id);
});

test("confirmar desde la cola paga el pedido, y confirmar dos veces no cobra dos veces", async ({
  page,
  request,
}) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido({ estado: "iniciado", email: "qr2@ejemplo.test" });
  await crearPago(pedido.id, { proveedor: "qr-manual", montoCentavos: MONTO, moneda: MONEDA });

  await page.goto(`/pagar/${pedido.id}`);
  await page.fill("#comprobante", "TRX-11223344");
  await page.click("[data-form-comprobante] button");

  // El operador mira su app del banco, encuentra la transferencia y confirma.
  await page.goto(`/pedidos${clave()}`);
  await page.click(`[data-por-confirmar="${pedido.id}"] [data-confirmar]`);

  const { data: pagado } = await supabase
    .from("pedidos")
    .select("estado, pagado_en")
    .eq("id", pedido.id)
    .single();
  expect(pagado!.estado).toBe("pagado");
  const instante = pagado!.pagado_en as string;

  // El pago quedó aprobado con el comprobante como identificador del movimiento.
  const { data: pago } = await supabase
    .from("pagos")
    .select("estado, pago_id_proveedor")
    .eq("pedido_id", pedido.id)
    .single();
  expect(pago!.estado).toBe("aprobado");
  expect(pago!.pago_id_proveedor).toBe("TRX-11223344");

  // Y el evento quedó registrado, como el de cualquier proveedor.
  const { data: eventos } = await supabase
    .from("eventos_pago")
    .select("proveedor, resultado")
    .eq("pedido_id", pedido.id);
  expect(eventos).toHaveLength(1);
  expect(eventos![0].proveedor).toBe("qr-manual");
  expect(eventos![0].resultado).toBe("aplicado");

  // Segunda confirmación —doble clic del operador, o dos personas mirando la misma cola—:
  // el pedido ya está pagado, así que no hay segundo efecto.
  const otraVez = await postFormulario(request, `/api/pagos/confirmar/${pedido.id}`, {
    decision: "aprobado",
  });
  expect([204, 401]).toContain(otraVez.status());

  const { data: final } = await supabase
    .from("pedidos")
    .select("estado, pagado_en")
    .eq("id", pedido.id)
    .single();
  expect(final!.pagado_en).toBe(instante);

  await borrarPedidoDeTest(pedido.id);
});

test("sin la credencial de la cola, nadie confirma un pago", async ({ request }) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido({ estado: "iniciado" });
  await crearPago(pedido.id, { proveedor: "qr-manual", montoCentavos: MONTO, moneda: MONEDA });

  // Sin cookie y sin secreto: 401. El enlace del pedido no alcanza para pagarse solo.
  const sinNada = await postFormulario(request, `/api/pagos/confirmar/${pedido.id}`, {
    decision: "aprobado",
  });
  expect(sinNada.status()).toBe(401);

  const { data: sigue } = await supabase
    .from("pedidos")
    .select("estado")
    .eq("id", pedido.id)
    .single();
  expect(sigue!.estado).toBe("iniciado");

  // Con el secreto de servidor por cabecera sí, para una llamada fuera del navegador.
  const conSecreto = await request.post(`/api/pagos/confirmar/${pedido.id}`, {
    data: "decision=aprobado",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "http://localhost:4321",
      Authorization: `Bearer ${process.env.OPS_SECRET}`,
    },
    maxRedirects: 0,
  });
  expect(conSecreto.status()).toBe(204);

  const { data: ahora } = await supabase
    .from("pedidos")
    .select("estado")
    .eq("id", pedido.id)
    .single();
  expect(ahora!.estado).toBe("pagado");

  await borrarPedidoDeTest(pedido.id);
});

test("un comprobante no declarado no bloquea la confirmación, pero queda anotado", async ({
  request,
}) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido({ estado: "iniciado" });
  await crearPago(pedido.id, { proveedor: "qr-manual", montoCentavos: MONTO, moneda: MONEDA });

  // El comprador pagó y nunca avisó; el negocio ve la transferencia igual y confirma.
  const confirmado = await request.post(`/api/pagos/confirmar/${pedido.id}`, {
    data: "decision=aprobado",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "http://localhost:4321",
      Authorization: `Bearer ${process.env.OPS_SECRET}`,
    },
    maxRedirects: 0,
  });
  expect(confirmado.status()).toBe(204);

  const { data: pago } = await supabase
    .from("pagos")
    .select("estado, pago_id_proveedor")
    .eq("pedido_id", pedido.id)
    .single();
  expect(pago!.estado).toBe("aprobado");
  // Queda rastro de que se confirmó sin comprobante declarado, en vez de un campo vacío.
  expect(pago!.pago_id_proveedor).toContain("sin-comprobante");

  await borrarPedidoDeTest(pedido.id);
});
