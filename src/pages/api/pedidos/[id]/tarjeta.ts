import type { APIRoute } from "astro";
import { EmisionNegada, emitirQr } from "../../../../lib/qr.ts";
import { obtenerPedidoConRegalo } from "../../../../lib/pedidos.ts";

export const prerender = false;

// Descarga de la tarjeta por parte del comprador, una vez que aprobó su regalo.
//
// La feature 002 decidió que NINGUNA ruta HTTP emitiera un QR (research.md #11), y el motivo
// sigue siendo válido: una compuerta alcanzable por HTTP es una compuerta que alguien va a
// alcanzar el día de apuro, y un QR impreso con el dominio equivocado no se corrige nunca.
//
// Lo que cambió no es el motivo, es dónde se aplica. Esta ruta NO esquiva la compuerta: llama
// al mismo `emitirQr` que el script, así que se niega exactamente por las mismas razones —sin
// dominio propio, sin regalo publicado, con el regalo vencido— y además agrega dos
// condiciones que el script no necesita, porque el script lo corre el negocio y esto lo pide
// un desconocido:
//
//   1. La tarjeta tiene que ser del pedido que la pide. El id del pedido es la credencial del
//      comprador (FR-003), y con él solo se baja la propia.
//   2. Nunca emite marcada como simulación. Una tarjeta de prueba no se entrega, así que no
//      hay forma de pedirla por acá: si el sitio todavía no tiene dominio, esto se niega y
//      punto. La de simulación la saca el negocio desde la terminal.
//
// Toda descarga exitosa queda registrada en `pedidos.qr_emitido_en` como cualquier emisión
// (research.md #22): si el soporte salió, hay rastro de cuándo.

export const GET: APIRoute = async ({ params, url }) => {
  const pedido = await obtenerPedidoConRegalo(params.id ?? "");
  if (!pedido) return new Response(null, { status: 404 });

  const explicar = (texto: string, status: number) =>
    new Response(texto, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  if (!pedido.regaloId || !pedido.slugRegalo) {
    return explicar("Todavía no enviaste tu historia, así que no hay tarjeta que preparar.", 409);
  }

  if (pedido.estadoRegalo !== "publicado") {
    return explicar(
      "Tu regalo todavía está en revisión. Aprobalo desde tu enlace de revisión y la tarjeta queda lista.",
      409,
    );
  }

  // `qr` baja el código solo, para pegarlo en una caja o un ramo; por defecto, la tarjeta.
  const soloCodigo = url.searchParams.get("formato") === "qr";

  try {
    const emision = await emitirQr(pedido.slugRegalo);
    const archivo = emision.archivos.find((a) =>
      soloCodigo ? a.nombre.startsWith("qr-") : a.nombre.startsWith("tarjeta-"),
    );

    if (!archivo) return new Response(null, { status: 500 });

    return new Response(new Uint8Array(archivo.bytes), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        // `attachment`: el comprador viene a buscar un archivo para llevar a imprimir, no a
        // mirarlo en una pestaña.
        "Content-Disposition": `attachment; filename="${archivo.nombre}"`,
        // Se genera en cada pedido: el QR es función pura del slug, pero la compuerta tiene
        // que evaluarse con la configuración de HOY, no con la de cuando se cacheó.
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof EmisionNegada) {
      return explicar(
        "Tu tarjeta todavía no se puede emitir. Escribinos y la resolvemos a mano.\n\n" +
          `Motivo técnico: ${error.message}`,
        409,
      );
    }

    return new Response(null, { status: 500 });
  }
};
