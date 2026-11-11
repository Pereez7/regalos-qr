import { test, expect } from "@playwright/test";
import { randomBytes, randomUUID } from "node:crypto";
import { crearPedido, crearPago } from "./utils/crear-pedido.ts";
import { clienteDeTest } from "./utils/crear-regalo.ts";
import { firmarAviso } from "./utils/firmar-aviso.ts";

// Timeout propio: estos tests hacen muchas idas y vueltas contra el Supabase remoto (crear
// pedidos, 12 entregas del mismo aviso, verificar filas), y cada una paga la latencia de red.
// El default de 30 s alcanza para la feature 001, que es casi todo render local.
test.describe.configure({ timeout: 120_000 });

// FR-004, FR-005, FR-006, SC-006 y Principio VII: el dinero no se pierde ni se duplica.
// Contrato: specs/002-compra-a-qr/contracts/api-webhook-pago.md
//
// El cuerpo es el del proveedor `simulado`, con SUS nombres de campo: el adaptador existe
// justamente porque cada proveedor nombra distinto (research.md #3).

const WEBHOOK = "/api/pagos/webhook/simulado";
const MONTO = 1200000;
const MONEDA = "ARS";

function avisoDe(opciones: {
  pedidoId: string;
  idEvento?: string;
  idPago?: string;
  estado?: "aprobado" | "rechazado" | "pendiente";
  monto?: number;
}) {
  return {
    id_evento: opciones.idEvento ?? `ev_${randomBytes(6).toString("hex")}`,
    id_pago: opciones.idPago ?? `pay_${randomBytes(6).toString("hex")}`,
    referencia: opciones.pedidoId,
    monto_centavos: opciones.monto ?? MONTO,
    moneda: MONEDA,
    estado: opciones.estado ?? "aprobado",
  };
}

test("el mismo aviso entregado 10 veces y 2 en simultáneo deja un solo pedido pagado", async ({
  request,
}) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido();
  await crearPago(pedido.id, { montoCentavos: MONTO, moneda: MONEDA });

  const aviso = avisoDe({ pedidoId: pedido.id });
  const { cuerpo, headers } = firmarAviso(aviso);

  // Primera entrega: aplica.
  const primera = await request.post(WEBHOOK, { data: cuerpo, headers });
  expect(primera.status()).toBe(200);

  const { data: tras } = await supabase
    .from("pedidos")
    .select("estado, pagado_en")
    .eq("id", pedido.id)
    .single();
  expect(tras!.estado).toBe("pagado");
  const pagadoEn = tras!.pagado_en as string;
  expect(pagadoEn).not.toBeNull();

  // Nueve re-entregas secuenciales: 200 y nada cambia. Nunca 409 — un 409 provocaría
  // reintentos infinitos del proveedor (research.md #2).
  for (let i = 0; i < 9; i++) {
    const respuesta = await request.post(WEBHOOK, { data: cuerpo, headers });
    expect(respuesta.status()).toBe(200);
  }

  // Dos entregas simultáneas del mismo evento: la restricción única es la que decide, no
  // una comprobación previa en el código.
  const simultaneas = await Promise.all([
    request.post(WEBHOOK, { data: cuerpo, headers }),
    request.post(WEBHOOK, { data: cuerpo, headers }),
  ]);
  for (const respuesta of simultaneas) expect(respuesta.status()).toBe(200);

  // Un solo efecto: el pedido pagado una vez, con su instante original intacto.
  const { data: final } = await supabase
    .from("pedidos")
    .select("estado, pagado_en")
    .eq("id", pedido.id)
    .single();
  expect(final!.estado).toBe("pagado");
  expect(final!.pagado_en).toBe(pagadoEn);

  // Un solo evento registrado para 12 entregas del mismo id (FR-004).
  const { count: eventos } = await supabase
    .from("eventos_pago")
    .select("id", { count: "exact", head: true })
    .eq("evento_id", aviso.id_evento);
  expect(eventos).toBe(1);

  // Un solo pago, aprobado, con el identificador del proveedor y sin discrepancia.
  const { data: pagos } = await supabase
    .from("pagos")
    .select("estado, pago_id_proveedor, monto_centavos, monto_informado_centavos")
    .eq("pedido_id", pedido.id);
  expect(pagos).toHaveLength(1);
  expect(pagos![0].estado).toBe("aprobado");
  expect(pagos![0].pago_id_proveedor).toBe(aviso.id_pago);
  expect(pagos![0].monto_centavos).toBe(MONTO);
  expect(pagos![0].monto_informado_centavos).toBeNull();

  await supabase.from("pedidos").delete().eq("id", pedido.id);
});

test("un aviso con firma inválida se rechaza con 401 y no deja fila en eventos_pago", async ({
  request,
}) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido();
  await crearPago(pedido.id, { montoCentavos: MONTO, moneda: MONEDA });

  const aviso = avisoDe({ pedidoId: pedido.id });
  const { cuerpo, headers } = firmarAviso(aviso, "no-es-el-secreto");

  const respuesta = await request.post(WEBHOOK, { data: cuerpo, headers });
  expect(respuesta.status()).toBe(401);

  // Sin fila: si la dejara, cualquiera podría envenenar la clave de idempotencia con un
  // evento_id inventado y el aviso legítimo se descartaría como duplicado — el pago nunca
  // se aplicaría (FR-005, research.md #2).
  const { count } = await supabase
    .from("eventos_pago")
    .select("id", { count: "exact", head: true })
    .eq("evento_id", aviso.id_evento);
  expect(count).toBe(0);

  // Y el aviso legítimo con ese MISMO evento_id sí se aplica después.
  const legitimo = firmarAviso(aviso);
  const segunda = await request.post(WEBHOOK, { data: legitimo.cuerpo, headers: legitimo.headers });
  expect(segunda.status()).toBe(200);

  const { data } = await supabase
    .from("pedidos")
    .select("estado")
    .eq("id", pedido.id)
    .single();
  expect(data!.estado).toBe("pagado");

  await supabase.from("pedidos").delete().eq("id", pedido.id);
});

test("sin cabecera de firma, 401 y ningún pedido modificado", async ({ request }) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido();
  await crearPago(pedido.id, { montoCentavos: MONTO, moneda: MONEDA });

  const aviso = avisoDe({ pedidoId: pedido.id });
  const respuesta = await request.post(WEBHOOK, {
    data: JSON.stringify(aviso),
    headers: { "Content-Type": "application/json" },
  });
  expect(respuesta.status()).toBe(401);

  const { data } = await supabase.from("pedidos").select("estado").eq("id", pedido.id).single();
  expect(data!.estado).toBe("iniciado");

  await supabase.from("pedidos").delete().eq("id", pedido.id);
});

test("los códigos por content-type vienen de dos capas distintas", async ({ request }) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido();
  await crearPago(pedido.id, { montoCentavos: MONTO, moneda: MONEDA });

  // `application/json` pasa sin `Origin`, que es lo que mandan los proveedores de pago
  // (research.md #1, medido contra el deploy real).
  const aviso = avisoDe({ pedidoId: pedido.id });
  const { cuerpo, headers } = firmarAviso(aviso);
  const json = await request.post(WEBHOOK, { data: cuerpo, headers });
  expect(json.status()).toBe(200);

  // 403 del FRAMEWORK, antes de que el manejador exista: checkOrigin vigila estos
  // content-types por CSRF. Un test que espere 415 acá falla, y el error sería del test.
  for (const contentType of ["application/x-www-form-urlencoded", "text/plain"]) {
    const respuesta = await request.post(WEBHOOK, {
      data: cuerpo,
      headers: { "Content-Type": contentType, ...{ "X-Firma": headers["X-Firma"] } },
    });
    expect(respuesta.status(), contentType).toBe(403);
  }

  // 415 del MANEJADOR: `application/xml` no lo vigila checkOrigin, así que el manejador
  // corre y es él el que exige application/json.
  const xml = await request.post(WEBHOOK, {
    data: cuerpo,
    headers: { "Content-Type": "application/xml", "X-Firma": headers["X-Firma"] },
  });
  expect(xml.status()).toBe(415);

  // Un proveedor desconocido: 404 sin leer el cuerpo ni registrar nada.
  const desconocido = await request.post("/api/pagos/webhook/inexistente", {
    data: cuerpo,
    headers,
  });
  expect(desconocido.status()).toBe(404);

  await supabase.from("pedidos").delete().eq("id", pedido.id);
});

test("un aviso cuyo pedido no existe responde 404 y queda registrado como sin_pedido", async ({
  request,
}) => {
  const supabase = clienteDeTest();
  const pedidoInexistente = randomUUID();

  const aviso = avisoDe({ pedidoId: pedidoInexistente });
  const { cuerpo, headers } = firmarAviso(aviso);

  const respuesta = await request.post(WEBHOOK, { data: cuerpo, headers });
  expect(respuesta.status()).toBe(404);

  const { data: evento } = await supabase
    .from("eventos_pago")
    .select("pedido_id, resultado, estado_informado")
    .eq("evento_id", aviso.id_evento)
    .single();
  expect(evento!.pedido_id).toBeNull();
  expect(evento!.resultado).toBe("sin_pedido");
  expect(evento!.estado_informado).toBe("aprobado");

  // La re-entrega del mismo evento responde 200 por la regla del duplicado: asimetría
  // conocida y declarada en el contrato, inofensiva porque no se altera ningún pedido.
  const repetida = await request.post(WEBHOOK, { data: cuerpo, headers });
  expect(repetida.status()).toBe(200);

  const { count } = await supabase
    .from("eventos_pago")
    .select("id", { count: "exact", head: true })
    .eq("evento_id", aviso.id_evento);
  expect(count).toBe(1);

  await supabase.from("eventos_pago").delete().eq("evento_id", aviso.id_evento);
});

test("un aviso rechazado por el proveedor no paga el pedido y queda sin_efecto", async ({
  request,
}) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido();
  await crearPago(pedido.id, { montoCentavos: MONTO, moneda: MONEDA });

  const aviso = avisoDe({ pedidoId: pedido.id, estado: "rechazado" });
  const { cuerpo, headers } = firmarAviso(aviso);

  const respuesta = await request.post(WEBHOOK, { data: cuerpo, headers });
  expect(respuesta.status()).toBe(200);

  const { data } = await supabase
    .from("pedidos")
    .select("estado, pagado_en")
    .eq("id", pedido.id)
    .single();
  expect(data!.estado).toBe("iniciado");
  expect(data!.pagado_en).toBeNull();

  const { data: evento } = await supabase
    .from("eventos_pago")
    .select("resultado")
    .eq("evento_id", aviso.id_evento)
    .single();
  expect(evento!.resultado).toBe("sin_efecto");

  const { data: pagos } = await supabase.from("pagos").select("estado").eq("pedido_id", pedido.id);
  expect(pagos![0].estado).toBe("rechazado");

  await supabase.from("pedidos").delete().eq("id", pedido.id);
});

test("una discrepancia de monto no bloquea el pago y queda registrada", async ({ request }) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido();
  await crearPago(pedido.id, { montoCentavos: MONTO, moneda: MONEDA });

  // El proveedor informa menos de lo cotizado: el caso normal es un cambio de precio entre
  // que el comprador abrió la página y terminó de pagar (research.md #23).
  const informado = MONTO - 50000;
  const aviso = avisoDe({ pedidoId: pedido.id, monto: informado });
  const { cuerpo, headers } = firmarAviso(aviso);

  const respuesta = await request.post(WEBHOOK, { data: cuerpo, headers });
  expect(respuesta.status()).toBe(200);

  // No se bloquea: bloquear dejaría a un comprador que pagó sin su regalo.
  const { data } = await supabase.from("pedidos").select("estado").eq("id", pedido.id).single();
  expect(data!.estado).toBe("pagado");

  // Se guardan los dos montos, que es lo que hace detectable la discrepancia.
  const { data: pagos } = await supabase
    .from("pagos")
    .select("monto_centavos, monto_informado_centavos, estado")
    .eq("pedido_id", pedido.id);
  expect(pagos![0].monto_centavos).toBe(MONTO);
  expect(pagos![0].monto_informado_centavos).toBe(informado);
  expect(pagos![0].estado).toBe("aprobado");

  await supabase.from("pedidos").delete().eq("id", pedido.id);
});
