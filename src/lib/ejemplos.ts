import { getServiceClient } from "./supabase.ts";

// FR-001 pide que la landing muestre "al menos un ejemplo real navegable". Real significa
// un regalo publicado de verdad, servido por el mismo motor que recibe un comprador — no
// una captura ni una maqueta.
//
// Vive en su propio archivo y no en src/lib/regalos.ts a propósito: esta feature se
// comprometió a tocar exactamente cuatro archivos de la 001 (research.md #20), y una
// consulta de la landing no es motivo para ampliar ese perímetro.

/** Slug del ejemplo a mostrar, o `null` si todavía no hay ninguno publicado. */
export async function obtenerSlugDeEjemplo(): Promise<string | null> {
  const supabase = getServiceClient();
  const ahora = new Date().toISOString();

  const { data, error } = await supabase
    .from("regalos")
    .select("slug")
    .eq("estado", "publicado")
    .or(`vencimiento.is.null,vencimiento.gt.${ahora}`)
    .order("aprobado_en", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  return data.slug as string;
}
