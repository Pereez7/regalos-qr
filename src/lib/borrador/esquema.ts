import { z } from "zod";

// Esquema del BORRADOR. Es un documento distinto del contenido del motor, con su propia
// línea de versión, y por un motivo que research.md #8 deja escrito: este esquema valida
// "esto es guardable"; src/lib/contenido/esquema.ts valida "esto es entregable".
//
// Acá nada es obligatorio. Un guardado solo se rechaza si el valor NO ES GUARDABLE —excede
// su tope o no respeta la forma de su tipo—, nunca por estar incompleto: la completitud se
// exige en un solo punto del sistema, el envío (FR-011).
//
// Contrato: specs/002-compra-a-qr/contracts/borrador.schema.md

/** Los siete pasos del formulario, en orden canónico (FR-009). */
export const PASOS = [
  "destinatario",
  "momentos",
  "fotos",
  "cancion",
  "carta",
  "preguntas",
  "cierre",
] as const;

export type Paso = (typeof PASOS)[number];

/** A dónde va el comprador después de guardar cada paso. */
export const SIGUIENTE: Record<Paso, string> = {
  destinatario: "momentos",
  momentos: "fotos",
  fotos: "cancion",
  cancion: "carta",
  carta: "preguntas",
  preguntas: "cierre",
  cierre: "resumen",
};

export function esPaso(valor: unknown): valor is Paso {
  return typeof valor === "string" && (PASOS as readonly string[]).includes(valor);
}

/**
 * Topes de tamaño. Los fija el contrato, no el spec: lo que no es negociable es que
 * existan. Sin tope, un campo de texto es un vector de abuso y el `jsonb` crece sin límite.
 */
export const TOPES = {
  nombre: 80,
  subtitulo: 120,
  momentos: 12,
  momentoTitulo: 120,
  momentoTexto: 2000,
  fotos: 10,
  alt: 160,
  cancionUrl: 500,
  cancionTexto: 120,
  carta: 8000,
  preguntas: 5,
  preguntaTexto: 300,
  preguntaRespuesta: 120,
  cierre: 500,
} as const;

/** Los tres temas de la feature 001. El `check` de `regalos.tema` no admite otro. */
export const TEMAS = ["nocturno", "papel", "luminoso"] as const;
export type Tema = (typeof TEMAS)[number];

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// `z.string()` a secas en todos lados: el texto se guarda literal, sin sanear ni escapar
// HTML. El escape es del renderer, igual que en el motor (FR-017).
const fecha = z.string().regex(FECHA, "la fecha tiene que ser YYYY-MM-DD");

const momento = z.object({
  titulo: z.string().max(TOPES.momentoTitulo).optional(),
  texto: z.string().max(TOPES.momentoTexto).optional(),
  fecha: fecha.optional(),
  // Ruta de storage, NUNCA una dirección de acceso: una dirección guardada sería
  // exactamente la dirección permanente que FR-020 prohíbe.
  fotoRuta: z.string().optional(),
});

const foto = z.object({
  // La ruta vigente del objeto en el bucket es el único identificador de la foto dentro del
  // borrador. Cambia una vez: al enviar, cuando el objeto se muda al prefijo del regalo.
  ruta: z.string(),
  alt: z.string().max(TOPES.alt).optional(),
  // Los escribe sharp al reducir, nunca el formulario.
  ancho: z.number().int().optional(),
  alto: z.number().int().optional(),
});

const pregunta = z.object({
  texto: z.string().max(TOPES.preguntaTexto).optional(),
  respuesta: z.string().max(TOPES.preguntaRespuesta).optional(),
});

export const esquemaBorrador = z.object({
  v: z.literal(1),
  paso: z.enum(PASOS).optional(),
  destinatario: z
    .object({
      nombre: z.string().max(TOPES.nombre).optional(),
      subtitulo: z.string().max(TOPES.subtitulo).optional(),
    })
    .optional(),
  tema: z.enum(TEMAS).optional(),
  fechaInicio: fecha.optional(),
  momentos: z.array(momento).max(TOPES.momentos).optional(),
  fotos: z.array(foto).max(TOPES.fotos).optional(),
  cancion: z
    .object({
      url: z.string().max(TOPES.cancionUrl).optional(),
      titulo: z.string().max(TOPES.cancionTexto).optional(),
      artista: z.string().max(TOPES.cancionTexto).optional(),
    })
    .optional(),
  carta: z.object({ texto: z.string().max(TOPES.carta).optional() }).optional(),
  preguntas: z.array(pregunta).max(TOPES.preguntas).optional(),
  cierre: z.object({ texto: z.string().max(TOPES.cierre).optional() }).optional(),
  actualizadoEn: z.string().optional(),
});

export type Borrador = z.infer<typeof esquemaBorrador>;
export type MomentoBorrador = z.infer<typeof momento>;
export type FotoBorrador = z.infer<typeof foto>;

/**
 * Lee un borrador guardado. Si el documento no valida —una fila vieja, un `v` futuro— se
 * devuelve el borrador vacío en vez de lanzar: el comprador ya pagó, y una excepción acá le
 * dejaría la página de carga rota sin forma de recuperarla (Principio I).
 */
export function parsearBorrador(json: unknown): Borrador {
  const resultado = esquemaBorrador.safeParse(json);
  return resultado.success ? resultado.data : { v: 1 };
}

export interface RamaInvalida {
  /** Nombre del campo en lenguaje del comprador, para el mensaje del 422. */
  campo: string;
  motivo: string;
}

/**
 * Valida la rama que un paso escribe, antes de tocar la base. Devuelve `null` si es
 * guardable.
 *
 * Es deliberadamente lo único que puede rechazar un guardado (`422`): un campo vacío, una
 * lista vacía, un momento sin texto o una foto sin texto alternativo pasan sin problema.
 */
export function validarRama(paso: Paso, rama: unknown): RamaInvalida | null {
  const parcial = esquemaBorrador.partial().safeParse({ v: 1, ...(rama as object) });
  if (parcial.success) return null;

  const problema = parcial.error.issues[0];
  const campo = problema.path.filter((p) => typeof p === "string").join(".") || paso;

  const motivo =
    problema.code === "too_big"
      ? `es más largo de lo que admite (${(problema as { maximum?: number }).maximum})`
      : problema.message;

  return { campo, motivo };
}
