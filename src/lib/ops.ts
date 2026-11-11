import { createHmac } from "node:crypto";
import { coincideSecreto } from "./acceso.ts";

// Compuerta de la cola operativa y de las rutas de operación. Server-only.
//
// **Independiente de `MODO_INTERNO`, y eso es el punto entero de este módulo**
// (research.md #14, CONTRADICCIONES H9): el modo interno se apaga exactamente el día que la
// landing se abre al público, y en ese momento `/pedidos` —que lista correos de compradores y
// su estado de pago— quedaría accesible para cualquiera si dependiera de ese flag. Los dos
// ciclos de vida son opuestos, así que las dos compuertas son distintas.
//
// Fail-closed: sin `OPS_SECRET` configurado, nada está autorizado. Un error de configuración
// nunca abre la cola (mismo criterio que src/lib/acceso.ts).

/** Cookie que habilita la cola operativa en el navegador. */
export const COOKIE_OPS = "acceso_ops";

/**
 * Vida de la cookie: 12 horas. Mucho más corta que la del acceso interno (30 días) porque lo
 * que esta cookie abre son datos de compradores, no una landing.
 */
export const DURACION_COOKIE_OPS = 12 * 60 * 60;

/** El mismo secreto de servidor que protege las rutas de borrado. `undefined` si falta. */
export function secretoOps(): string | undefined {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const valor = env?.OPS_SECRET ?? process.env.OPS_SECRET;
  return valor ? valor : undefined;
}

/**
 * Valor que va en la cookie: **derivado** de `OPS_SECRET`, no el secreto mismo. Así una
 * cookie filtrada —de un navegador prestado, de una captura de pantalla— no entrega la
 * credencial con la que se borran pedidos por API.
 */
export function tokenOps(): string | undefined {
  const secreto = secretoOps();
  if (!secreto) return undefined;
  return createHmac("sha256", secreto).update("cola-operativa", "utf8").digest("hex");
}

/** La clave que llega por `?clave=…` para abrir la cola y dejar la cookie. */
export function claveOpsValida(candidato: string | null | undefined): boolean {
  return coincideSecreto(candidato, secretoOps());
}

/** La cookie ya emitida. Se compara contra el token derivado, en tiempo constante. */
export function cookieOpsValida(valor: string | null | undefined): boolean {
  return coincideSecreto(valor, tokenOps());
}

/**
 * Autorización de las rutas de operación: `Authorization: Bearer <OPS_SECRET>`, igual que el
 * `DELETE` de la feature 001. Para una ruta de API no hay cookie ni redirección: o trae la
 * credencial o recibe 401.
 */
export function autorizadoPorCabecera(request: Request): boolean {
  const cabecera = request.headers.get("authorization");
  if (!cabecera || !cabecera.startsWith("Bearer ")) return false;
  return coincideSecreto(cabecera.slice("Bearer ".length), secretoOps());
}
