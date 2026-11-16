import { getServiceClient } from "./supabase.ts";

export interface Ocasion {
  /** Clave estable, la que viaja en la configuración. */
  clave: string;
  /** Nombre para mostrar. */
  etiqueta: string;
}

/**
 * Las ocasiones que la vidriera muestra. Vive acá y NO en la base: el motor no sabe de
 * ocasiones y la tabla `regalos` no tiene ni va a tener una columna para esto (Principio II,
 * research.md #10). Un regalo es un regalo; la ocasión es una decisión comercial sobre qué
 * ejemplo mostrar.
 */
export const OCASIONES: Ocasion[] = [
  { clave: "aniversario", etiqueta: "Aniversario" },
  { clave: "cumpleanos", etiqueta: "Cumpleaños" },
  { clave: "amistad", etiqueta: "Día de la amistad" },
  { clave: "propuesta", etiqueta: "Una propuesta" },
];

export interface Ejemplo extends Ocasion {
  /** Slug del regalo publicado que ilustra esta ocasión. */
  slug: string;
}

/**
 * Mapa ocasión → slug, leído de `EJEMPLOS_POR_OCASION` con la forma
 * `aniversario:ABC12345,cumpleanos:DEF67890`.
 *
 * Es configuración del despliegue y no un dato del producto: qué regalo se muestra como
 * ejemplo se cambia sin tocar código ni migrar nada, igual que el precio (research.md #18).
 */
export function slugsPorOcasion(): Record<string, string> {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const crudo = env?.EJEMPLOS_POR_OCASION ?? process.env.EJEMPLOS_POR_OCASION;
  if (!crudo) return {};

  const mapa: Record<string, string> = {};
  for (const par of crudo.split(",")) {
    const [clave, slug] = par.split(":").map((t) => t.trim());
    if (clave && slug) mapa[clave] = slug;
  }
  return mapa;
}

/**
 * Los ejemplos que de verdad se pueden abrir: solo los que existen, están publicados y no
 * vencieron. Lista vacía si no hay ninguno —la landing muestra las ocasiones igual, como
 * texto sin enlace—: es mejor nombrar las ocasiones sin ejemplo que ofrecer un enlace roto.
 */
export async function obtenerEjemplos(): Promise<Ejemplo[]> {
  const mapa = slugsPorOcasion();
  const slugs = Object.values(mapa);
  if (slugs.length === 0) return [];

  const supabase = getServiceClient();
  const ahora = new Date().toISOString();

  const { data, error } = await supabase
    .from("regalos")
    .select("slug")
    .in("slug", slugs)
    .eq("estado", "publicado")
    .or(`vencimiento.is.null,vencimiento.gt.${ahora}`);

  if (error || !data) return [];

  const servibles = new Set(data.map((fila) => fila.slug as string));

  return OCASIONES.flatMap((ocasion) => {
    const slug = mapa[ocasion.clave];
    return slug && servibles.has(slug) ? [{ ...ocasion, slug }] : [];
  });
}

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
