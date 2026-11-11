import type { APIRoute } from "astro";
import { getServiceClient } from "../../../../lib/supabase.ts";
import { emitirAviso, enlaceDeAviso } from "../../../../lib/avisos.ts";

export const prerender = false;

// FR-013 / Principio III. Invocado por el <form> plano de /revisar/[id] (research.md #8).
//
// La feature 002 agrega acá —y solo acá— la emisión del aviso de aprobación: este es el
// único punto del sistema que se entera de que la aprobación ocurrió (research.md #20,
// FR-026). El agregado es aditivo: no cambia la transición de estado, ni la condición que la
// gobierna, ni la respuesta de la ruta. `revision-y-aprobacion.spec.ts` de la 001 es el gate
// de que así sea.
export const POST: APIRoute = async ({ params, redirect }) => {
  const id = params.id;
  if (!id) return redirect("/no-disponible", 303);

  const supabase = getServiceClient();

  const { data: existente } = await supabase
    .from("regalos")
    .select("id, estado")
    .eq("id", id)
    .maybeSingle();

  if (!existente) return redirect("/no-disponible", 303);

  if (existente.estado === "en_revision") {
    // UPDATE condicional (misma técnica atómica que research.md #5): a prueba de
    // doble submit del form, `aprobado_en` nunca se sobreescribe una vez seteado.
    const { data: aprobado } = await supabase
      .from("regalos")
      .update({ aprobado_en: new Date().toISOString(), estado: "publicado" })
      .eq("id", id)
      .eq("estado", "en_revision")
      .select("id")
      .maybeSingle();

    // Solo avisa quien ganó la transición: un doble submit no manda dos correos. Un regalo
    // sin pedido —un seed, una demo, los helpers de test de la 001— no tiene a quién avisar,
    // y eso no es un error: el motor no sabe de pedidos (Principio II).
    if (aprobado) {
      const { data: pedido } = await supabase
        .from("pedidos")
        .select("id, email")
        .eq("regalo_id", id)
        .maybeSingle();

      if (pedido) {
        await emitirAviso(
          "aprobacion",
          { id: pedido.id as string, email: pedido.email as string },
          { enlace: enlaceDeAviso("aprobacion", { pedidoId: pedido.id as string, regaloId: id }) },
        );
      }
    }
  }

  return redirect(`/revisar/${id}`, 303);
};
