import { randomUUID } from "node:crypto";
import type { APIRoute } from "astro";
import { getServiceClient } from "../../../../lib/supabase.ts";
import { generarSlugUnico } from "../../../../lib/slugs.ts";
import {
  cargaCerrada,
  mudarRutasDelBorrador,
  obtenerPedidoConRegalo,
  reclamarRegalo,
} from "../../../../lib/pedidos.ts";
import { parsearBorrador } from "../../../../lib/borrador/esquema.ts";
import { aContenido, sePuedeEnviar } from "../../../../lib/borrador/a-contenido.ts";
import { mudarFotos } from "../../../../lib/fotos.ts";

export const prerender = false;

// Contrato: specs/002-compra-a-qr/contracts/api-enviar-historia.md
//
// Es la frontera del producto: de un lado el borrador, que admite estar incompleto; del
// otro, el contenido entregable que consume el motor de la feature 001. Este es el único
// lugar del sistema donde se cruza de una forma a la otra (research.md #8).

export const POST: APIRoute = async ({ params, redirect }) => {
  const id = params.id ?? "";
  const pedido = await obtenerPedidoConRegalo(id);
  if (!pedido) return new Response(null, { status: 404 });

  const cerrada = cargaCerrada(pedido);
  if (cerrada) {
    return new Response(
      cerrada === "no_pagado"
        ? "Este pedido todavía está pendiente de pago."
        : "El regalo ya fue aprobado: lo entregado es inmutable, así que no se puede reemplazar.",
      { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const borrador = parsearBorrador(pedido.borrador);

  // Los faltantes no se guardan en ninguna parte: la página de resumen los recalcula. Por
  // eso acá alcanza con redirigir, sin mensaje de un solo uso que sobreviva al redirect.
  if (!sePuedeEnviar(borrador)) return redirect(`/contar/${id}/resumen`, 303);

  const supabase = getServiceClient();

  // ── Reenvío: se reemplaza el contenido, nunca el slug ──────────────────────────────
  if (pedido.regaloId) {
    // Una foto agregada durante la corrección ya nació en el prefijo del regalo; si alguna
    // quedó bajo el prefijo del pedido —por una mudanza que falló a mitad— se mueve ahora.
    if (!(await mudarFotos(id, pedido.regaloId))) return new Response(null, { status: 500 });
    await mudarRutasDelBorrador(id, pedido.regaloId);

    const actualizado = parsearBorrador(
      (await obtenerPedidoConRegalo(id))?.borrador ?? pedido.borrador,
    );
    const contenido = aContenido(actualizado, id, pedido.regaloId);

    // UPDATE condicional: si el regalo pasó a `publicado` entre la comprobación y la
    // escritura, afecta cero filas y la carrera se pierde del lado seguro (FR-016).
    const { data: filas, error } = await supabase
      .from("regalos")
      .update({ contenido, tema: actualizado.tema })
      .eq("id", pedido.regaloId)
      .eq("estado", "en_revision")
      .select("id");

    if (error) return new Response(null, { status: 500 });
    if (!filas || filas.length === 0) {
      return new Response(
        "El regalo ya fue aprobado mientras enviabas: lo entregado es inmutable.",
        { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } },
      );
    }

    // No se vuelve a emitir el aviso de regalo listo: el enlace de revisión es el mismo que
    // el comprador ya tiene (FR-026; la emisión se suma en T065).
    return redirect(`/contar/${id}/enviado`, 303);
  }

  // ── Primer envío: nace el regalo ───────────────────────────────────────────────────

  // El slug se reserva insertando su fila antes de que exista el regalo, igual que en la
  // feature 001. Esa fila no se borra nunca, pase lo que pase más abajo (Principio VI).
  const slug = await generarSlugUnico(supabase);

  // El id del regalo se genera ANTES del INSERT para que la traducción pueda nombrar el
  // prefijo definitivo de las fotos (`regalos/<id_regalo>/`).
  const regaloId = randomUUID();
  const contenido = aContenido(borrador, id, regaloId);

  const { error: errorRegalo } = await supabase.from("regalos").insert({
    id: regaloId,
    slug,
    tema: borrador.tema,
    contenido,
    estado: "en_revision",
    aprobado_en: null,
    vencimiento: null,
  });

  if (errorRegalo) return new Response(null, { status: 500 });

  await supabase.from("slugs").update({ regalo_id: regaloId }).eq("slug", slug);

  // Reclamo atómico: `WHERE regalo_id IS NULL` es el mecanismo; la restricción única de
  // `pedidos.regalo_id` es la red de contención (research.md #9).
  const gano = await reclamarRegalo(id, regaloId);

  if (!gano) {
    // Otro envío simultáneo llegó primero. Este deshace lo suyo: borra el regalo que acababa
    // de crear y suelta su fila de `slugs`, que NO se borra —ese valor queda bloqueado para
    // siempre—. No mueve ningún archivo: las fotos las muda el ganador.
    await supabase.from("slugs").update({ regalo_id: null }).eq("slug", slug);
    await supabase.from("regalos").delete().eq("id", regaloId);

    // Se responde como el camino feliz, con el regalo que sí quedó.
    return redirect(`/contar/${id}/enviado`, 303);
  }

  // Mudanza de las fotos al prefijo que el borrado de la feature 001 ya barre. Si falla, el
  // regalo existe con su contenido apuntando al prefijo definitivo y el reintento del envío
  // completa la mudanza: se prefiere esto a mover antes de reclamar, porque mover primero
  // obligaría al perdedor de la carrera a devolver los archivos (research.md #16).
  if (!(await mudarFotos(id, regaloId))) return new Response(null, { status: 500 });
  await mudarRutasDelBorrador(id, regaloId);

  // El aviso de regalo listo (`tipo = 'revision'`) se emite desde acá en T065.

  return redirect(`/contar/${id}/enviado`, 303);
};
