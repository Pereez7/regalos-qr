import type { APIRoute } from "astro";
import { getServiceClient } from "../../../../lib/supabase.ts";

export const prerender = false;

const BUCKET = "fotos";

// FR-018 / Principio V. Protegido por secreto de servidor, no por el UUID del regalo
// (research.md #9, contracts/api-eliminar.md).
export const DELETE: APIRoute = async ({ params, request }) => {
  const opsSecret = process.env.OPS_SECRET;
  const auth = request.headers.get("authorization");
  if (!opsSecret || auth !== `Bearer ${opsSecret}`) {
    return new Response(null, { status: 401 });
  }

  const id = params.id;
  if (!id) return new Response(null, { status: 404 });

  const supabase = getServiceClient();

  const { data: regalo } = await supabase
    .from("regalos")
    .select("id, slug")
    .eq("id", id)
    .maybeSingle();

  if (!regalo) return new Response(null, { status: 404 });

  const { data: archivos } = await supabase.storage.from(BUCKET).list(`regalos/${id}`);
  if (archivos && archivos.length > 0) {
    const rutas = archivos.map((archivo) => `regalos/${id}/${archivo.name}`);
    await supabase.storage.from(BUCKET).remove(rutas);
  }

  // El on delete cascade de aperturas.regalo_id se encarga de las aperturas asociadas.
  await supabase.from("regalos").delete().eq("id", id);

  // La fila de `slugs` NO se borra — el valor queda bloqueado para siempre
  // (Principio VI, research.md #4).
  await supabase.from("slugs").update({ regalo_id: null }).eq("slug", regalo.slug);

  return new Response(null, { status: 204 });
};
