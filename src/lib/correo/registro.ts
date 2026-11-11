import type { AdaptadorCorreo } from "./tipos.ts";
import { consola } from "./consola.ts";
import { resend } from "./resend.ts";

// Mapa clave -> adaptador de correo, mismo patrón que src/lib/pagos/registro.ts y que
// src/bloques/registro.ts (Principio II). `avisos.proveedor` no lleva `check` por el mismo
// motivo: el catálogo vive acá.
export const registro: Record<string, AdaptadorCorreo> = {
  consola,
  resend,
};

/** `undefined` para una clave no registrada. Quien la pida decide qué hacer con eso. */
export function obtenerAdaptadorCorreo(clave: string): AdaptadorCorreo | undefined {
  return registro[clave];
}
