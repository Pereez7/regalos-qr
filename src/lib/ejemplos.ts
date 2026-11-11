import { getServiceClient } from "./supabase.ts";

// FR-001 pide que la landing muestre "al menos un ejemplo real navegable". Real significa
// un regalo publicado de verdad, servido por el mismo motor que recibe un comprador — no
// una captura ni una maqueta.
//
// Vive en su propio archivo y no en src/lib/regalos.ts a propósito: esta feature se
// comprometió a tocar exactamente cuatro archivos de la 001 (research.md #20), y una
// consulta de la landing no es motivo para ampliar ese perímetro.

/**
 * Slug del ejemplo a mostrar, o `null` si no hay ninguno servible.
 *
 * `EJEMPLO_SLUG` manda, y por una razón que se descubrió al abrir la landing al público: sin
 * esa variable, "el ejemplo" era el último regalo aprobado, y el último regalo aprobado es
 * casi siempre uno que acaba de crear la suite de tests. Un visitante se encontraba con una
 * foto rota y una palabra de ochenta y nueve letras sin sentido.
 *
 * Qué regalo se muestra como ejemplo es una decisión del negocio, no el resultado de una
 * consulta ordenada por fecha. Si la variable falta o apunta a un regalo que no está
 * servible, cae al último publicado: es mejor mostrar algo imperfecto que una landing sin
 * ejemplo (FR-001).
 */
export async function obtenerSlugDeEjemplo(): Promise<string | null> {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const elegido = env?.EJEMPLO_SLUG ?? process.env.EJEMPLO_SLUG;

  if (elegido) {
    const slug = await slugServible(elegido);
    if (slug) return slug;
  }

  return slugServible();
}

/** Comprueba que el regalo exista, esté publicado y no haya vencido. */
async function slugServible(slug?: string): Promise<string | null> {
  const supabase = getServiceClient();
  const ahora = new Date().toISOString();

  let consulta = supabase
    .from("regalos")
    .select("slug")
    .eq("estado", "publicado")
    .or(`vencimiento.is.null,vencimiento.gt.${ahora}`);

  if (slug) consulta = consulta.eq("slug", slug);
  else consulta = consulta.order("aprobado_en", { ascending: false });

  const { data, error } = await consulta.limit(1).maybeSingle();

  if (error || !data) return null;

  return data.slug as string;
}
