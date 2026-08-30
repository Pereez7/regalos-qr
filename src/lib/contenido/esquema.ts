import { z } from "zod";
import type { Contenido } from "./tipos-bloque.ts";

const foto = z.object({
  url: z.string(),
  alt: z.string(),
  ancho: z.number().optional(),
  alto: z.number().optional(),
});

const base = { posicion: z.number() };

const bloquePortada = z.object({
  ...base,
  tipo: z.literal("portada"),
  nombreDestinatario: z.string(),
  subtitulo: z.string().optional(),
});

const bloqueContador = z.object({
  ...base,
  tipo: z.literal("contador"),
  fechaInicio: z.string(),
});

const bloqueMomento = z.object({
  ...base,
  tipo: z.literal("momento"),
  titulo: z.string().optional(),
  texto: z.string(),
  fecha: z.string().optional(),
  foto: foto.optional(),
});

const bloqueGaleria = z.object({
  ...base,
  tipo: z.literal("galeria"),
  fotos: z.array(foto),
});

const bloqueCancion = z.object({
  ...base,
  tipo: z.literal("cancion"),
  url: z.string(),
  titulo: z.string().optional(),
  artista: z.string().optional(),
});

const bloqueCarta = z.object({
  ...base,
  tipo: z.literal("carta"),
  texto: z.string(),
});

const bloquePregunta = z.object({
  ...base,
  tipo: z.literal("pregunta"),
  texto: z.string(),
  respuesta: z.string().optional(),
});

const bloqueCierre = z.object({
  ...base,
  tipo: z.literal("cierre"),
  texto: z.string().optional(),
});

// Cualquier tipo que no sea uno de los ocho de arriba se acepta igual — el renderer
// lo omite en silencio vía registro.ts (FR-006, contracts/regalo-contenido.schema.md
// regla 4). Debe ir último en la unión: es la opción "atrapa todo".
const bloqueDesconocido = z.looseObject({ ...base, tipo: z.string() });

const bloque = z.union([
  bloquePortada,
  bloqueContador,
  bloqueMomento,
  bloqueGaleria,
  bloqueCancion,
  bloqueCarta,
  bloquePregunta,
  bloqueCierre,
  bloqueDesconocido,
]);

const contenidoV1 = z.object({
  v: z.literal(1),
  receta: z.array(bloque),
});

// `v` decide el esquema aplicado (contracts/regalo-contenido.schema.md,
// "Compatibilidad hacia adelante"). Hoy solo existe v1; un v2 futuro se sumaría acá
// como una rama nueva de dispatch, nunca reemplazando esta.
export function parsearContenido(json: unknown): Contenido {
  const version = (json as { v?: unknown } | null)?.v;

  if (version === 1) {
    return contenidoV1.parse(json) as Contenido;
  }

  throw new Error(`Versión de contenido no soportada: ${JSON.stringify(version)}`);
}
