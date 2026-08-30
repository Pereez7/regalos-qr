import type { APIRoute } from "astro";
import { getServiceClient } from "../../../../lib/supabase.ts";

export const prerender = false;

// FR-013 / Principio III. Invocado por el <form> plano de /revisar/[id] (research.md #8).
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
    await supabase
      .from("regalos")
      .update({ aprobado_en: new Date().toISOString(), estado: "publicado" })
      .eq("id", id)
      .eq("estado", "en_revision");
  }

  return redirect(`/revisar/${id}`, 303);
};
