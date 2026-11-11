import type { APIRoute } from "astro";
import {
  agregarFoto,
  cargaCerrada,
  obtenerPedidoConRegalo,
  quitarFoto,
} from "../../../../lib/pedidos.ts";
import { parsearBorrador } from "../../../../lib/borrador/esquema.ts";
import {
  MAX_BYTES_SUBIDA,
  MAX_FOTOS,
  borrarFoto,
  guardarFoto,
  prefijoDePedido,
  prefijoDeRegalo,
  procesarFoto,
} from "../../../../lib/fotos.ts";

export const prerender = false;

// Contrato: specs/002-compra-a-qr/contracts/api-fotos.md
//
// Una sola ruta con dos acciones, discriminadas por el campo `accion`. Las dos son POST —y
// no un DELETE sobre una subruta— por el mismo motivo por el que aprobar es un POST en la
// feature 001: un formulario HTML sin JavaScript solo sabe emitir GET y POST, y el comprador
// que ya pagó no puede depender de que su JavaScript funcione.

function conTexto(cuerpo: string, status: number): Response {
  return new Response(cuerpo, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const id = params.id ?? "";
  const pedido = await obtenerPedidoConRegalo(id);
  if (!pedido) return new Response(null, { status: 404 });

  const cerrada = cargaCerrada(pedido);
  if (cerrada) {
    return conTexto(
      cerrada === "no_pagado"
        ? "Este pedido todavía está pendiente de pago."
        : "El regalo ya fue aprobado y publicado: sus fotos no se cambian.",
      409,
    );
  }

  const formulario = await request.formData();
  const accion = (formulario.get("accion") ?? "subir").toString();
  const borrador = parsearBorrador(pedido.borrador);
  const fotos = borrador.fotos ?? [];

  if (accion === "quitar") {
    const ruta = (formulario.get("ruta") ?? "").toString();

    // Una ruta que no está en el borrador de ESTE pedido no se puede quitar: ni la foto de
    // otro pedido, ni un objeto arbitrario del bucket (FR-031).
    if (!ruta || !fotos.some((foto) => foto.ruta === ruta)) {
      return new Response(null, { status: 404 });
    }

    // El objeto primero, la referencia después. Si el borrado del objeto falla, la entrada
    // se queda: es preferible una foto que sigue estando a una referencia huérfana que el
    // comprador ya no puede volver a quitar.
    if (!(await borrarFoto(ruta))) {
      return conTexto("No se pudo borrar la foto. Probá de nuevo.", 500);
    }

    if (!(await quitarFoto(id, ruta))) return new Response(null, { status: 500 });

    return redirect(`/contar/${id}/fotos`, 303);
  }

  // --- subir ---

  if (fotos.length >= MAX_FOTOS) {
    return conTexto(
      `Ya hay ${MAX_FOTOS} fotos en este regalo, que es el máximo. Quitá una para subir otra.`,
      409,
    );
  }

  const archivo = formulario.get("foto");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return conTexto("No llegó ninguna foto.", 400);
  }

  if (archivo.size > MAX_BYTES_SUBIDA) {
    return conTexto(
      `Esa foto pesa más de lo que se puede subir desde este formulario (${Math.round(
        MAX_BYTES_SUBIDA / (1024 * 1024),
      )} MB). Si tu navegador tiene JavaScript, la reducimos antes de subirla y podés usar fotos de hasta 10 MB.`,
      413,
    );
  }

  // `sharp` es la autoridad final: no se confía en el content-type declarado ni en la
  // extensión del nombre (research.md #5). El original vive en memoria el tiempo del
  // procesamiento y se descarta: no se escribe en ninguna parte (FR-038).
  const procesada = await procesarFoto(Buffer.from(await archivo.arrayBuffer()));
  if (!procesada) {
    return conTexto(
      "Ese archivo no es una imagen que podamos usar. Probá con un JPG, un PNG o un HEIC. " +
        "El resto de tu historia quedó como estaba.",
      415,
    );
  }

  // Mientras el regalo no nació, las fotos viven bajo el prefijo del pedido; una foto
  // agregada durante una corrección nace ya en el prefijo definitivo (research.md #16).
  const prefijo = pedido.regaloId ? prefijoDeRegalo(pedido.regaloId) : prefijoDePedido(id);

  const ruta = await guardarFoto(prefijo, procesada);
  if (!ruta) return conTexto("No se pudo guardar la foto. Probá de nuevo.", 500);

  const alt = (formulario.get("alt") ?? "").toString().trim();
  const agregada = await agregarFoto(id, {
    ruta,
    ...(alt ? { alt } : {}),
    ancho: procesada.ancho,
    alto: procesada.alto,
  });

  if (!agregada) {
    // La entrada no se pudo escribir: se borra el objeto para no dejar un archivo sin dueño.
    await borrarFoto(ruta);
    return new Response(null, { status: 500 });
  }

  return redirect(`/contar/${id}/fotos`, 303);
};
