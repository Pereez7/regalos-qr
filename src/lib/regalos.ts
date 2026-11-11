import { z } from "zod";
import { getServiceClient } from "./supabase.ts";
import { firmarRutas } from "./fotos.ts";
import { parsearContenido } from "./contenido/esquema.ts";
import type { Bloque, Contenido, Foto } from "./contenido/tipos-bloque.ts";

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

// Si `contenido` no pasa el esquema actual (fila vieja, seed desactualizado), no
// tiramos el error sin más: en dev queda logueado el detalle de zod para diagnosticar
// rápido; en cualquier entorno el regalo se trata como no disponible.
function mapear(fila: FilaRegalo): Regalo | null {
  try {
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
  } catch (error) {
    if (import.meta.env.DEV) {
      const detalle = error instanceof z.ZodError ? z.prettifyError(error) : error;
      console.error(`[regalos] contenido inválido para regalo ${fila.id}:`, detalle);
    }
    return null;
  }
}

// Resolución de `foto.ruta` a dirección firmada (feature 002, research.md #6, #7).
//
// Vive acá y no en los componentes de bloque: la capa de datos entrega el contenido ya
// resuelto, y el motor sigue sin saber si detrás hay un bucket privado, uno público o un
// enlace externo. Es lo que hace compatible el bucket privado con la restricción de no
// tocar el motor (research.md #20).
//
// Tres reglas, en orden:
//   1. `ruta` presente → se firma por lote y el resultado se entrega en `url`.
//   2. `ruta` ausente  → `url` se usa tal cual. Es el caso del contenido nacido antes de
//      esta feature y del seed de demo, que apuntan a un origen externo.
//   3. Ninguna de las dos resuelve → la foto se omite, como ya hace la 001 con un bloque
//      sin contenido renderizable. Nunca una imagen rota (Principio I).

function rutasDe(contenido: Contenido): string[] {
  const rutas: string[] = [];

  for (const bloque of contenido.receta) {
    const foto = (bloque as { foto?: Foto }).foto;
    if (foto?.ruta) rutas.push(foto.ruta);

    for (const deGaleria of (bloque as { fotos?: Foto[] }).fotos ?? []) {
      if (deGaleria.ruta) rutas.push(deGaleria.ruta);
    }
  }

  return rutas;
}

/** `null` si la foto no se puede mostrar: quien llama la omite. */
function resolverFoto(foto: Foto, firmadas: Map<string, string>): Foto | null {
  if (foto.ruta) {
    const url = firmadas.get(foto.ruta);
    return url ? { ...foto, url } : null;
  }

  return foto.url ? foto : null;
}

async function resolverFotos(contenido: Contenido): Promise<Contenido> {
  const rutas = rutasDe(contenido);
  // Sin rutas no hay nada que firmar: el contenido de la 001 no paga ninguna ida y vuelta.
  if (rutas.length === 0) return contenido;

  // Una sola llamada por render, no una por foto (research.md #6, vigilado por lcp.spec.ts).
  const firmadas = await firmarRutas(rutas);

  const receta: Bloque[] = contenido.receta.map((bloque) => {
    const foto = (bloque as { foto?: Foto }).foto;
    if (foto) {
      const resuelta = resolverFoto(foto, firmadas);
      const copia = { ...bloque } as Bloque & { foto?: Foto };
      if (resuelta) copia.foto = resuelta;
      else delete copia.foto;
      return copia;
    }

    const fotos = (bloque as { fotos?: Foto[] }).fotos;
    if (fotos) {
      return {
        ...bloque,
        fotos: fotos
          .map((f) => resolverFoto(f, firmadas))
          .filter((f): f is Foto => f !== null),
      } as Bloque;
    }

    return bloque;
  });

  return { ...contenido, receta };
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

  return await conFotosResueltas(mapear(data as FilaRegalo));
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

  return await conFotosResueltas(mapear(data as FilaRegalo));
}

async function conFotosResueltas(regalo: Regalo | null): Promise<Regalo | null> {
  if (!regalo) return null;
  return { ...regalo, contenido: await resolverFotos(regalo.contenido) };
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
