import { createHmac } from "node:crypto";

// Firma avisos de pago como lo hace el proveedor simulado: HMAC-SHA256 en hexadecimal sobre
// el CUERPO CRUDO, en la cabecera `X-Firma` (contracts/api-webhook-pago.md, research.md #3).
//
// Existe para que los tests manden avisos auténticos y el camino de verificación de firma se
// ejercite de verdad. La protección del webhook es la firma y nada más: sin `Origin`, sin
// lista de IP, sin secreto en la URL (FR-005, Principio VII).

/** Cabecera de firma del proveedor simulado. */
export const CABECERA_FIRMA = "X-Firma";

function secreto(): string {
  const valor = process.env.PAGO_SIMULADO_SECRETO;
  if (!valor) {
    throw new Error("Falta PAGO_SIMULADO_SECRETO para firmar avisos en los tests e2e");
  }
  return valor;
}

/** HMAC-SHA256 hex del cuerpo crudo tal como viaja por la red. */
export function firmarCuerpo(cuerpoCrudo: string, claveSecreta: string = secreto()): string {
  return createHmac("sha256", claveSecreta).update(cuerpoCrudo, "utf8").digest("hex");
}

export interface AvisoFirmado {
  /** El cuerpo exacto que hay que enviar: la firma es sobre estos bytes, no sobre el objeto. */
  cuerpo: string;
  headers: Record<string, string>;
}

/**
 * Serializa el aviso una sola vez y firma esa serialización. Serializar dos veces —una para
 * firmar y otra para enviar— es la forma clásica de que la firma deje de validar por una
 * diferencia de orden de claves o de espacios.
 *
 * `claveSecreta` se puede pasar distinta a propósito: es como se construye el caso de firma
 * inválida que debe responder 401 sin dejar fila en `eventos_pago`.
 */
export function firmarAviso(aviso: unknown, claveSecreta?: string): AvisoFirmado {
  const cuerpo = JSON.stringify(aviso);
  return {
    cuerpo,
    headers: {
      // `application/json` es el único content-type que el webhook acepta, y el único que
      // pasa el checkOrigin de Astro sin `Origin` (research.md #1).
      "Content-Type": "application/json",
      [CABECERA_FIRMA]: firmarCuerpo(cuerpo, claveSecreta ?? secreto()),
    },
  };
}
