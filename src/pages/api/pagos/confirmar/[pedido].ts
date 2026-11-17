import type { APIRoute } from "astro";
import { getServiceClient } from "../../../../lib/supabase.ts";
import { COOKIE_OPS, autorizadoPorCabecera, sesionOpsValida } from "../../../../lib/ops.ts";
import { obtenerPedido } from "../../../../lib/pedidos.ts";
import {
  CABECERA_FIRMA,
  CLAVE,
  construirAviso,
  nuevoEventoId,
} from "../../../../lib/pagos/qr-manual.ts";

export const prerender = false;

// Confirmación operativa de un cobro por QR (research.md #24).
//
// Es el botón de la cola operativa: el negocio miró su app del banco, encontró la
// transferencia y la confirma. **No escribe el estado del pedido**: emite el mismo aviso
// firmado que emitiría un proveedor con API y lo manda al webhook, servidor a servidor.
//
// Esa indirección es el punto entero del diseño. Si esta ruta marcara el pedido como pagado
// por su cuenta, el cobro manual sería un segundo camino hacia el dinero —sin idempotencia,
// sin registro previo del evento, sin las acciones derivadas— y el Principio VII tendría un
// agujero del tamaño de un botón. Así, confirmar dos veces deja un solo pedido pagado, igual
// que veinte avisos duplicados de un proveedor real.

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
  // Dos credenciales para el mismo permiso: la cookie de la cola, para el botón; el secreto
  // por cabecera, para una llamada desde fuera del navegador.
  const desdeLaCola = sesionOpsValida(cookies.get(COOKIE_OPS)?.value);
  if (!desdeLaCola && !autorizadoPorCabecera(request)) {
    return new Response(null, { status: 401 });
  }

  const pedidoId = params.pedido ?? "";
  const pedido = await obtenerPedido(pedidoId);
  if (!pedido) return new Response(null, { status: 404 });

  const supabase = getServiceClient();
  const { data: pago } = await supabase
    .from("pagos")
    .select("id, monto_centavos, moneda, referencia_comprador")
    .eq("pedido_id", pedido.id)
    .eq("proveedor", CLAVE)
    .order("creado_en", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!pago) return new Response(null, { status: 404 });

  const formulario = await request.formData().catch(() => null);
  const decision = (formulario?.get("decision") ?? "aprobado").toString();
  if (decision !== "aprobado" && decision !== "rechazado") {
    return new Response(null, { status: 400 });
  }

  // El monto que se informa es el cotizado: en el cobro manual nadie transcribe un número a
  // mano, y un monto tecleado sería una discrepancia inventada por el teclado del operador.
  // Si lo transferido no coincide con lo cotizado, eso se mira en el banco antes de
  // confirmar, no después.
  const { cuerpo, firma } = construirAviso({
    evento: nuevoEventoId(),
    comprobante: (pago.referencia_comprador as string | null) ?? `sin-comprobante-${pago.id}`,
    pedido: pedido.id,
    monto_centavos: pago.monto_centavos as number,
    moneda: pago.moneda as string,
    estado: decision,
  });

  const respuesta = await fetch(new URL(`/api/pagos/webhook/${CLAVE}`, request.url), {
    method: "POST",
    headers: { "Content-Type": "application/json", [CABECERA_FIRMA]: firma },
    body: cuerpo,
  });

  if (!respuesta.ok) {
    return new Response(`El aviso no pudo aplicarse (${respuesta.status}).`, {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // Desde el navegador se vuelve a la cola; desde una llamada con secreto, un 204 seco.
  if (desdeLaCola) return redirect("/pedidos", 303);
  return new Response(null, { status: 204 });
};
