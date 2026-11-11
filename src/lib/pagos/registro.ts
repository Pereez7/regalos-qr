import type { AdaptadorPago } from "./tipos.ts";
import { simulado } from "./simulado.ts";
import { qrManual } from "./qr-manual.ts";

// Mapa clave -> adaptador de pago, mismo patrón que src/bloques/registro.ts (Principio II).
// Conectar un proveedor real es un archivo nuevo en esta carpeta más una línea acá; ni las
// rutas ni el modelo de datos se enteran. Por eso `pagos.proveedor` no lleva `check`: el
// catálogo de proveedores vive en este archivo, no en una migración.
export const registro: Record<string, AdaptadorPago> = {
  simulado,
  "qr-manual": qrManual,
};

/**
 * `undefined` para una clave no registrada: el webhook responde 404 **sin leer el cuerpo** y
 * sin registrar nada (contracts/api-webhook-pago.md, paso 1).
 */
export function obtenerAdaptadorPago(clave: string): AdaptadorPago | undefined {
  return registro[clave];
}
