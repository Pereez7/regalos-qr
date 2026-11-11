import type { APIRoute } from "astro";
import { getServiceClient } from "../../../../lib/supabase.ts";
import { autorizadoPorCabecera } from "../../../../lib/ops.ts";
import { obtenerPedidoConRegalo } from "../../../../lib/pedidos.ts";
import { borrarPrefijo, prefijoDePedido, prefijoDeRegalo } from "../../../../lib/fotos.ts";

export const prerender = false;

// Contrato: specs/002-compra-a-qr/contracts/api-eliminar-pedido.md
//
// FR-030 y Principio V. La credencial es `OPS_SECRET` y NO el id del pedido: FR-030 dice
// «a pedido del comprador», no «por el comprador», y un borrado irreversible que se
// disparara con el solo conocimiento del enlace convertiría cada enlace filtrado en una
// destrucción posible.
//
// El orden no es intercambiable: cada paso que falla deja la información necesaria para
// reintentar el siguiente, y el inverso no.
//
// MEDIDO, y hay que saberlo para llamarla: el `checkOrigin` de Astro corta un DELETE sin
// `Origin` y sin content-type con 403 ANTES de que este manejador exista, aunque traiga el
// secreto correcto (research.md #1; la ruta de borrado de la feature 001 se comporta igual).
// Desde curl hay que mandar un content-type que `checkOrigin` no vigile:
//
//   curl -X DELETE -H "Authorization: Bearer $OPS_SECRET" \
//        -H "Content-Type: application/json" https://<sitio>/api/pedidos/<id>/eliminar

export const DELETE: APIRoute = async ({ params, request }) => {
  if (!autorizadoPorCabecera(request)) return new Response(null, { status: 401 });

  const id = params.id ?? "";
  const pedido = await obtenerPedidoConRegalo(id);
  // Repetir el borrado responde 404, y no es un error de la operación.
  if (!pedido) return new Response(null, { status: 404 });

  const supabase = getServiceClient();

  // 1. Storage primero. Los DOS prefijos: las fotos nacen bajo el del pedido y se mudan al
  // del regalo al enviar, así que un pedido abandonado antes del envío las tiene sin mudar
  // (research.md #16). Ninguna cascada de Postgres alcanza Storage, y si el orden se
  // invirtiera y fallara el borrado de archivos se perdería el prefijo que dice qué borrar.
  try {
    await borrarPrefijo(prefijoDePedido(id));
    if (pedido.regaloId) await borrarPrefijo(prefijoDeRegalo(pedido.regaloId));
  } catch {
    return new Response(null, { status: 500 });
  }

  // 2. El regalo asociado, si ya nació. Dispara la cascada de `aperturas` de la 001 y el
  // `set null` de `pedidos.regalo_id`.
  if (pedido.regaloId) {
    // La fila de `slugs` referencia al regalo sin `ON DELETE`, así que hay que soltar la
    // referencia antes de borrarlo. La fila en sí NUNCA se borra: si ese slug volviera al
    // espacio disponible, un QR ya impreso podría abrir el regalo de otra persona
    // (Principio VI, research.md #16).
    if (pedido.slugRegalo) {
      const { error } = await supabase
        .from("slugs")
        .update({ regalo_id: null })
        .eq("slug", pedido.slugRegalo);
      if (error) return new Response(null, { status: 500 });
    }

    const { error } = await supabase.from("regalos").delete().eq("id", pedido.regaloId);
    if (error) return new Response(null, { status: 500 });
  }

  // 3. La fila del pedido. Con ella se van el correo, el celular, el consentimiento y su
  // fecha, el token de baja, el borrador entero y el registro de emisión del QR; y por
  // cascada, `pagos`, `eventos_pago` del pedido y `avisos`.
  //
  // Los `eventos_pago` huérfanos no se tocan: no pertenecen a ningún pedido y no contienen
  // datos personales.
  const { error } = await supabase.from("pedidos").delete().eq("id", id);
  if (error) return new Response(null, { status: 500 });

  return new Response(null, { status: 204 });
};
