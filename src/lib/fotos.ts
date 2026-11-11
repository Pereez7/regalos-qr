import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { getServiceClient } from "./supabase.ts";

// Fotos del regalo: reducción, almacenamiento en bucket privado y firma por lote.
// Server-only.
//
// Tres reglas que no son negociables y que viven acá:
//   1. El original NO se almacena (FR-038). Vive en memoria el tiempo del procesamiento.
//   2. Los metadatos se eliminan, incluida la ubicación GPS de las fotos de celular (FR-039).
//   3. La dirección de acceso se firma en cada render y nunca se persiste (FR-020,
//      research.md #6).
//
// Contrato: specs/002-compra-a-qr/contracts/api-fotos.md

export const BUCKET = "fotos";

/** Tope por regalo (Assumptions, SC-014). Protege el tiempo de carga de la página. */
export const MAX_FOTOS = 10;

/**
 * Tope del cuerpo de la petición en el camino sin JavaScript. El límite real de la
 * plataforma es 4,5 MB; se declara 4 MB para que el mensaje del formulario sea honesto
 * (research.md #5). Con JavaScript, la foto se reduce en el navegador antes de subir y el
 * tope declarado al comprador es de 10 MB de original.
 */
export const MAX_BYTES_SUBIDA = 4 * 1024 * 1024;

/**
 * Lado mayor de la versión almacenada.
 *
 * La galería del regalo se dibuja dentro de `--ancho-pagina` (640 px), así que 1280 cubre
 * una pantalla de celular a 2x con margen. Estaba en 1600, que es resolución que nadie ve y
 * bytes que todos pagan: medido sobre una foto de 3000×2000, bajar a 1280 con calidad 74
 * lleva el archivo de 120 KB a 86 KB, un 28% menos sin diferencia perceptible en un
 * teléfono.
 */
const LADO_MAYOR = 1280;

/** Vigencia de la firma. Amplia a propósito: nace y muere dentro del render que la usa. */
const VIGENCIA_FIRMA_SEGUNDOS = 60 * 60;

export interface FotoProcesada {
  bytes: Buffer;
  ancho: number;
  alto: number;
}

/**
 * `sharp` es la autoridad final (research.md #5): no se confía en el `Content-Type`
 * declarado ni en la extensión del nombre, se decodifica el archivo. `null` si no es una
 * imagen real o su formato no está admitido → la ruta responde 415 y el borrador queda
 * intacto.
 */
export async function procesarFoto(original: Buffer): Promise<FotoProcesada | null> {
  try {
    const salida = await sharp(original)
      // `rotate()` sin argumentos aplica la orientación EXIF y la descarta. Sin esto, al
      // borrar los metadatos una foto vertical de celular quedaría acostada.
      .rotate()
      // `withoutEnlargement`: una foto que ya viene chica y optimizada no se agranda
      // (Edge Case correspondiente).
      .resize({ width: LADO_MAYOR, height: LADO_MAYOR, fit: "inside", withoutEnlargement: true })
      // sharp descarta todos los metadatos salvo que se pidan explícitamente con
      // `withMetadata()`. No pedirlos es lo que cumple FR-039: ni GPS, ni modelo de cámara,
      // ni fecha de captura.
      //
      // WebP y no AVIF, aunque AVIF pese un 38% menos: lo soportan Chrome 85+ y Safari
      // 16.4+, y el destinatario de un regalo puede estar abriendo desde un Android viejo.
      // Los componentes de bloque sirven un `<img src>` pelado —son del motor y no se
      // tocan—, así que no hay alternativa que ofrecerle a un navegador que no entienda el
      // formato: sería una foto rota en el regalo de alguien. `effort: 6` exprime unos KB
      // más del mismo formato, a costa de tiempo de CPU en la subida, que sí podemos pagar.
      .webp({ quality: 74, effort: 6 })
      .toBuffer({ resolveWithObject: true });

    return { bytes: salida.data, ancho: salida.info.width, alto: salida.info.height };
  } catch {
    return null;
  }
}

/**
 * Nombre aleatorio, nunca derivado del nombre del archivo subido ni de un contador: es lo
 * que vuelve la ubicación no adivinable (FR-020, Principio V).
 */
export function nombreAleatorio(): string {
  return `${randomBytes(8).toString("hex")}.webp`;
}

/** `pedidos/<id>/` mientras el regalo no nació; `regalos/<id>/` desde el envío. */
export function prefijoDePedido(pedidoId: string): string {
  return `pedidos/${pedidoId}/`;
}

export function prefijoDeRegalo(regaloId: string): string {
  return `regalos/${regaloId}/`;
}

/** Sube la versión ya reducida y devuelve su ruta. El original no llega hasta acá. */
export async function guardarFoto(prefijo: string, foto: FotoProcesada): Promise<string | null> {
  const supabase = getServiceClient();
  const ruta = `${prefijo}${nombreAleatorio()}`;

  const { error } = await supabase.storage.from(BUCKET).upload(ruta, foto.bytes, {
    contentType: "image/webp",
    upsert: false,
  });

  if (error) return null;

  return ruta;
}

/** Borra un objeto. Se llama en el momento de quitar la foto, no al enviar (FR-019). */
export async function borrarFoto(ruta: string): Promise<boolean> {
  const supabase = getServiceClient();
  const { error } = await supabase.storage.from(BUCKET).remove([ruta]);
  return !error;
}

/** Borra todo lo que cuelgue de un prefijo. Lo usa el borrado del pedido (FR-030). */
export async function borrarPrefijo(prefijo: string): Promise<void> {
  const supabase = getServiceClient();
  const sinBarra = prefijo.replace(/\/$/, "");

  const { data: archivos } = await supabase.storage.from(BUCKET).list(sinBarra);
  if (!archivos || archivos.length === 0) return;

  await supabase.storage.from(BUCKET).remove(archivos.map((a) => `${sinBarra}/${a.name}`));
}

/**
 * Mueve los objetos del prefijo del pedido al del regalo, conservando el nombre aleatorio
 * (research.md #16). `regalos/<id>/` es el prefijo que el borrado de la feature 001 ya
 * barre: sin esta mudanza, borrar un regalo por la vía existente dejaría sus fotos en el
 * bucket para siempre.
 *
 * Idempotente: un objeto que ya está en el destino no se vuelve a mover, así que un reenvío
 * o un reintento tras una falla parcial converge al mismo estado.
 *
 * Devuelve `false` si alguna mudanza falló; quien llama responde 500 y el reintento del
 * envío la completa.
 */
export async function mudarFotos(pedidoId: string, regaloId: string): Promise<boolean> {
  const supabase = getServiceClient();
  const origen = prefijoDePedido(pedidoId).replace(/\/$/, "");

  const { data: archivos } = await supabase.storage.from(BUCKET).list(origen);
  if (!archivos || archivos.length === 0) return true;

  for (const archivo of archivos) {
    const { error } = await supabase.storage
      .from(BUCKET)
      .move(`${origen}/${archivo.name}`, `${prefijoDeRegalo(regaloId)}${archivo.name}`);

    // "already exists" en el destino = la mudanza ya había ocurrido para ese objeto.
    if (error && !/exists|duplicate/i.test(error.message)) return false;
  }

  return true;
}

/**
 * Firma un lote de rutas en una sola llamada. La firma nace y muere dentro del request que
 * la usa: nunca se persiste, nunca se imprime, nunca se comparte. El QR apunta a
 * `/r/[slug]`, que no lleva firma alguna (research.md #6).
 *
 * Una ruta que no se pudo firmar queda fuera del mapa, y quien llama omite esa foto en vez
 * de renderizar una imagen rota (Principio I).
 */
export async function firmarRutas(rutas: string[]): Promise<Map<string, string>> {
  const firmadas = new Map<string, string>();
  if (rutas.length === 0) return firmadas;

  const supabase = getServiceClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(rutas, VIGENCIA_FIRMA_SEGUNDOS);

  if (error || !data) return firmadas;

  for (const fila of data) {
    if (fila.signedUrl && fila.path) firmadas.set(fila.path, fila.signedUrl);
  }

  return firmadas;
}
