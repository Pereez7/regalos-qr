import { getServiceClient } from "./supabase.ts";
import { parsearContenido } from "./contenido/esquema.ts";
import type { Contenido } from "./contenido/tipos-bloque.ts";

export interface Regalo {
  id: string;
  slug: string;
  tema: string;
  contenido: Contenido;
  estado: "en_revision" | "publicado";
  aprobadoEn: string | null;
  vencimiento: string | null;
  primeraAperturaEn: string | null;
}

interface FilaRegalo {
  id: string;
  slug: string;
  tema: string;
  contenido: unknown;
  estado: "en_revision" | "publicado";
  aprobado_en: string | null;
  vencimiento: string | null;
  primera_apertura_en: string | null;
}

const COLUMNAS =
  "id, slug, tema, contenido, estado, aprobado_en, vencimiento, primera_apertura_en";

function mapear(fila: FilaRegalo): Regalo {
  return {
    id: fila.id,
    slug: fila.slug,
    tema: fila.tema,
    contenido: parsearContenido(fila.contenido),
    estado: fila.estado,
    aprobadoEn: fila.aprobado_en,
    vencimiento: fila.vencimiento,
    primeraAperturaEn: fila.primera_apertura_en,
  };
}

// FR-002/FR-017: solo sirve un regalo publicado y no vencido.
export async function obtenerRegaloPublicado(slug: string): Promise<Regalo | null> {
  const supabase = getServiceClient();
  const ahora = new Date().toISOString();

  const { data, error } = await supabase
    .from("regalos")
    .select(COLUMNAS)
    .eq("slug", slug)
    .eq("estado", "publicado")
    .or(`vencimiento.is.null,vencimiento.gt.${ahora}`)
    .maybeSingle();

  if (error || !data) return null;

  return mapear(data as FilaRegalo);
}

// FR-012: sin filtro de estado — el comprador ve exactamente lo que hay, cualquiera
// sea el estado.
export async function obtenerRegaloParaRevision(id: string): Promise<Regalo | null> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("regalos")
    .select(COLUMNAS)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  return mapear(data as FilaRegalo);
}

// research.md #5: UPDATE condicional atómica — ante dos llamadas simultáneas, solo una
// afecta una fila. Se invoca únicamente desde POST /api/abrir/[slug] (research.md #19),
// nunca desde el GET que sirve /r/[slug].
export async function registrarApertura(regaloId: string): Promise<void> {
  const supabase = getServiceClient();

  const { data: fila } = await supabase
    .from("regalos")
    .update({ primera_apertura_en: new Date().toISOString() })
    .eq("id", regaloId)
    .is("primera_apertura_en", null)
    .select("id")
    .maybeSingle();

  const esPrimera = fila != null;

  await supabase.from("aperturas").insert({ regalo_id: regaloId, es_primera: esPrimera });
}
