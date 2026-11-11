import type { APIRoute } from "astro";
import { getServiceClient } from "../../../../lib/supabase.ts";
import { obtenerAdaptadorPago } from "../../../../lib/pagos/registro.ts";
import { marcarPagado, obtenerPedido } from "../../../../lib/pedidos.ts";
import { emitirAviso, enlaceDeAviso } from "../../../../lib/avisos.ts";

export const prerender = false;

// Contrato: specs/002-compra-a-qr/contracts/api-webhook-pago.md
//
// Es el ÚNICO camino por el que un pedido pasa a `pagado`: ni el regreso del comprador
// desde el proveedor, ni ninguna página, ni ninguna otra ruta cambian el estado de pago
// (research.md #4).
//
// El orden de los pasos es el contrato, no una preferencia de estilo: cada paso es una
// compuerta y ninguno escribe antes de que pase el anterior. En particular, la firma se
// verifica ANTES de insertar en `eventos_pago`, porque insertar antes dejaría la clave de
// idempotencia envenenable: cualquiera podría mandar un `evento_id` inventado y el aviso
// legítimo que llegara después quedaría tratado como duplicado, de modo que el pago nunca
// se aplicaría (FR-005, research.md #2).

const VACIO = () => new Response(null, { status: 200 });

// 23505 = unique_violation. Acá significa "este evento ya fue procesado".
const UNIQUE_VIOLATION = "23505";

type Resultado = "aplicado" | "sin_efecto" | "sin_pedido";

export const POST: APIRoute = async ({ params, request }) => {
  // 1. Proveedor desconocido: 404 sin leer el cuerpo, sin registrar nada.
  const adaptador = obtenerAdaptadorPago(params.proveedor ?? "");
  if (!adaptador) return new Response(null, { status: 404 });

  // 2. Content-type. Este paso solo se alcanza con un content-type que el `checkOrigin` de
  // Astro no vigila (`application/xml` y similares): los de formulario, `text/plain` y la
  // ausencia de cabecera ya fueron rechazados con 403 por el framework, antes de que este
  // manejador exista (research.md #1).
  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim();
  if (contentType.toLowerCase() !== "application/json") {
    return new Response(null, { status: 415 });
  }

  // 3. Firma, sobre el cuerpo CRUDO y antes de parsearlo: la firma es sobre los bytes
  // recibidos. Se lee una sola vez, porque el cuerpo de un Request no se lee dos veces.
  const cuerpoCrudo = await request.text();
  if (!adaptador.verificarFirma(cuerpoCrudo, request.headers)) {
    return new Response(null, { status: 401 });
  }

  // 4. Interpretación. Sin los campos que el adaptador necesita no hay nada idempotable.
  const aviso = adaptador.interpretarAviso(cuerpoCrudo);
  if (!aviso) return new Response(null, { status: 400 });

  const supabase = getServiceClient();

  // 5. Lectura del pedido y del cobro. Leer no es escribir: el invariante es que nada se
  // escriba antes de verificar la firma, y que el evento quede registrado antes de
  // cualquier acción derivada de él.
  const pedido = await obtenerPedido(aviso.pedidoId);

  const { data: pagoExistente } = pedido
    ? await supabase
        .from("pagos")
        .select("id, monto_centavos, moneda, pago_id_proveedor")
        .eq("pedido_id", pedido.id)
        .or(`pago_id_proveedor.is.null,pago_id_proveedor.eq.${aviso.pagoId}`)
        .order("creado_en", { ascending: true })
        .limit(1)
        .maybeSingle()
    : { data: null };

  // El resultado se calcula antes de insertar para que la fila diga la verdad, y se corrige
  // más abajo si el UPDATE condicional del pedido lo desmiente.
  let resultado: Resultado = !pedido
    ? "sin_pedido"
    : aviso.estado === "aprobado" && pedido.estado === "iniciado"
      ? "aplicado"
      : "sin_efecto";

  // 6. Registro del evento, con la firma ya verificada. La restricción única sobre
  // (proveedor, evento_id) ES la idempotencia: si la inserción la viola, el evento ya fue
  // procesado y la respuesta es 200 — nunca 409, que provocaría reintentos infinitos del
  // proveedor. No se guarda el cuerpo crudo: podría traer datos de tarjeta (FR-006).
  const { data: evento, error: errorEvento } = await supabase
    .from("eventos_pago")
    .insert({
      proveedor: adaptador.clave,
      evento_id: aviso.eventoId,
      pedido_id: pedido?.id ?? null,
      pago_id: pagoExistente?.id ?? null,
      estado_informado: aviso.estado,
      resultado,
    })
    .select("id")
    .single();

  if (errorEvento) {
    if (errorEvento.code === UNIQUE_VIOLATION) return VACIO();
    return new Response(null, { status: 500 });
  }

  // 7. Pedido inexistente: queda el evento con `resultado = 'sin_pedido'`, no se altera
  // nada más y la respuesta es 404. Por research.md #4 no debería ocurrir nunca —el pedido
  // nace antes de ir a pagar—, así que cada caso es un error real y aparece en la cola.
  if (!pedido) return new Response(null, { status: 404 });

  // 8. Pago. La fila ya existe, en `pendiente`, creada al iniciar el cobro con el monto y la
  // moneda del momento. Este paso la actualiza; jamás entra un dato de tarjeta (FR-006).
  if (pagoExistente) {
    // Discrepancia de monto (research.md #23): vale el monto que informa el proveedor,
    // porque es el que el comprador pagó de verdad, pero el cotizado NO se reescribe —sin
    // los dos montos la discrepancia es indetectable—. El pago no se bloquea: bloquearlo
    // dejaría a un comprador que pagó sin su regalo, que es justo lo que el Principio VII
    // prohíbe. Queda marcado para la cola operativa.
    const hayDiscrepancia =
      aviso.monto !== pagoExistente.monto_centavos || aviso.moneda !== pagoExistente.moneda;

    const { error: errorPago } = await supabase
      .from("pagos")
      .update({
        pago_id_proveedor: aviso.pagoId,
        estado: aviso.estado,
        monto_informado_centavos: hayDiscrepancia ? aviso.monto : null,
        actualizado_en: new Date().toISOString(),
      })
      .eq("id", pagoExistente.id);

    if (errorPago) return new Response(null, { status: 500 });
  }

  // 9. Efecto sobre el pedido. Solo `aprobado` lo mueve, con UPDATE condicional: a prueba
  // de concurrencia y de reprocesos, igual que la aprobación de la feature 001.
  if (aviso.estado === "aprobado") {
    const gano = await marcarPagado(pedido.id);
    if (!gano && resultado === "aplicado") {
      // Otro aviso llegó primero entre la lectura y el UPDATE. El evento se registró igual
      // —no se pierde— pero no produjo el efecto, y la fila tiene que decirlo.
      resultado = "sin_efecto";
      await supabase.from("eventos_pago").update({ resultado }).eq("id", evento.id);
    }

    // 10. Acción derivada: el comprobante de compra (FR-026). Solo lo emite quien ganó la
    // transición, así que un aviso duplicado no vuelve a mandar correo. La restricción
    // `unique (pedido_id, tipo)` de `avisos` es la segunda red. Una falla de envío no
    // revierte el pago ni cambia la respuesta de esta ruta (FR-029).
    if (gano) {
      await emitirAviso("comprobante", pedido, {
        enlace: enlaceDeAviso("comprobante", { pedidoId: pedido.id }),
      });
    }
  }

  return VACIO();
};
