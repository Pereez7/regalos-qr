import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { coincideSecreto } from "./acceso.ts";

// Compuerta de la cola operativa y de las rutas de operación. Server-only.
//
// **Independiente de `MODO_INTERNO`, y eso es el punto entero de este módulo**
// (research.md #14, CONTRADICCIONES H9): el modo interno se apaga exactamente el día que la
// landing se abre al público, y en ese momento `/pedidos` —que lista correos de compradores y
// su estado de pago— quedaría accesible para cualquiera si dependiera de ese flag. Los dos
// ciclos de vida son opuestos, así que las dos compuertas son distintas.
//
// Hay dos credenciales, con usos que no se cruzan:
//
//   - **Usuario y contraseña** (`OPS_USUARIO`, `OPS_PASSWORD_HASH`) para entrar por el
//     navegador. Es lo que el operador escribe en `/admin`.
//   - **`OPS_SECRET`** para las rutas de API (`Authorization: Bearer …`) y los scripts de
//     operación. Una máquina no llena formularios.
//
// Fail-closed en las dos: sin la variable configurada, nada está autorizado. Un error de
// configuración nunca abre la cola (mismo criterio que src/lib/acceso.ts).

/** Cookie que habilita la cola operativa en el navegador. */
export const COOKIE_OPS = "acceso_ops";

/**
 * Vida de la sesión: 12 horas, **deslizantes** — cada visita a la cola vuelve a poner el
 * reloj en 12 horas.
 *
 * Es la ventana de una jornada: se entra a la mañana y no vuelve a pedir nada hasta el día
 * siguiente, pero un teléfono olvidado en una mesa no queda abierto un mes. Antes eran 30
 * días fijos; lo que esta página muestra —correos de compradores y el botón que confirma
 * pagos— no justifica ese plazo cuando entrar cuesta un usuario y una contraseña que el
 * gestor del teléfono ya autocompleta.
 */
export const DURACION_SESION_OPS = 12 * 60 * 60;

/** Parámetros de scrypt con los que se generan los hashes nuevos (scripts/ops-clave.ts). */
export const SCRYPT_N = 16384;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
const SCRYPT_LARGO = 32;

// `import.meta.env` resuelve lo que había al compilar; `process.env`, lo que hay al
// ejecutar. Se leen los dos (mismo patrón que src/lib/supabase.ts) para que Vercel pueda
// cambiar la variable en runtime sin rebuild.
function variable(nombre: string): string | undefined {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const valor = env?.[nombre] ?? process.env[nombre];
  return valor ? valor : undefined;
}

/** El secreto de servidor que autoriza las rutas de API. `undefined` si falta. */
export function secretoOps(): string | undefined {
  return variable("OPS_SECRET");
}

/** Nombre de usuario que abre la cola por el navegador. `undefined` si falta. */
export function usuarioOps(): string | undefined {
  return variable("OPS_USUARIO");
}

/**
 * Hash de la contraseña, en el formato que imprime `npm run ops:clave`:
 * `scrypt$N$r$p$<sal hex>$<hash hex>`. **Nunca** la contraseña en texto plano: si se filtra
 * el entorno —un log, una captura del panel de Vercel— el hash no sirve para entrar.
 */
export function hashPasswordOps(): string | undefined {
  return variable("OPS_PASSWORD_HASH");
}

/** Genera el hash de una contraseña nueva, con sal aleatoria. Lo usa el script de la clave. */
export function hashearPassword(password: string): string {
  const sal = randomBytes(16);
  const hash = scryptSync(password.normalize("NFKC"), sal, SCRYPT_LARGO, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    sal.toString("hex"),
    hash.toString("hex"),
  ].join("$");
}

/**
 * Verifica una contraseña contra un hash almacenado. Devuelve `false` ante cualquier hash
 * ilegible: un `OPS_PASSWORD_HASH` mal copiado deja la puerta cerrada, no abierta.
 *
 * Los parámetros de scrypt se leen del hash y no de las constantes de arriba, así que subir
 * el costo más adelante no invalida los hashes ya emitidos.
 */
export function verificarPassword(password: string, almacenado: string): boolean {
  const partes = almacenado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;

  const N = Number(partes[1]);
  const r = Number(partes[2]);
  const p = Number(partes[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let sal: Buffer;
  let esperado: Buffer;
  try {
    sal = Buffer.from(partes[4], "hex");
    esperado = Buffer.from(partes[5], "hex");
  } catch {
    return false;
  }
  if (sal.length === 0 || esperado.length === 0) return false;

  let obtenido: Buffer;
  try {
    obtenido = scryptSync(password.normalize("NFKC"), sal, esperado.length, { N, r, p });
  } catch {
    // Parámetros fuera de rango (scrypt los valida y lanza). Hash inservible.
    return false;
  }

  return timingSafeEqual(obtenido, esperado);
}

/**
 * Las credenciales que llegan del formulario de `/admin`.
 *
 * El usuario se compara en tiempo constante y la contraseña se verifica **siempre**, incluso
 * cuando el usuario ya no coincide: así el tiempo de respuesta no distingue "ese usuario no
 * existe" de "la contraseña es otra", que es justo lo que ayudaría a adivinar el usuario.
 */
export function credencialesOpsValidas(
  usuario: string | null | undefined,
  password: string | null | undefined,
): boolean {
  const hash = hashPasswordOps();
  const esperado = usuarioOps();
  if (!hash || !esperado) return false;

  const usuarioOk = coincideSecreto(usuario, esperado);
  const passwordOk = verificarPassword(password ?? "", hash);
  return usuarioOk && passwordOk;
}

/**
 * Clave con la que se firma la cookie de sesión. Derivada de las credenciales del servidor,
 * y ese es el mecanismo de revocación: cambiar la contraseña (o `OPS_SECRET`) invalida todas
 * las sesiones abiertas de golpe, sin lista de sesiones que nadie mantiene.
 */
function claveDeFirma(): string | undefined {
  const material = [secretoOps(), hashPasswordOps()].filter(Boolean);
  if (material.length === 0) return undefined;
  return createHmac("sha256", material.join("|")).update("sesion-ops", "utf8").digest("hex");
}

/** La clave que llega por `?clave=…`: `OPS_SECRET`, la vía de emergencia sin formulario. */
export function claveOpsValida(candidato: string | null | undefined): boolean {
  return coincideSecreto(candidato, secretoOps());
}

/**
 * Emite el valor de la cookie: `v1.<vencimiento en segundos epoch>.<firma>`.
 *
 * Lo que va firmado es el vencimiento, así que el plazo lo decide el servidor y el navegador
 * no puede estirarlo: adelantar el reloj de la máquina o editar la cookie rompe la firma. Y
 * no hay nada secreto adentro —ni `OPS_SECRET`, ni el hash— así que una cookie filtrada de
 * un navegador prestado no entrega la credencial con la que se borran pedidos por API.
 */
export function emitirSesionOps(ahoraMs: number = Date.now()): string | undefined {
  const clave = claveDeFirma();
  if (!clave) return undefined;

  const vence = Math.floor(ahoraMs / 1000) + DURACION_SESION_OPS;
  return `v1.${vence}.${firmar(clave, vence)}`;
}

function firmar(clave: string, vence: number): string {
  return createHmac("sha256", clave).update(`v1|${vence}`, "utf8").digest("hex");
}

/**
 * La cookie ya emitida: firma válida y todavía dentro del plazo. Se compara en tiempo
 * constante.
 */
export function sesionOpsValida(
  valor: string | null | undefined,
  ahoraMs: number = Date.now(),
): boolean {
  if (!valor) return false;

  const partes = valor.split(".");
  if (partes.length !== 3 || partes[0] !== "v1") return false;

  const vence = Number(partes[1]);
  if (!Number.isInteger(vence)) return false;
  if (vence * 1000 <= ahoraMs) return false;

  const clave = claveDeFirma();
  if (!clave) return false;

  return coincideSecreto(partes[2], firmar(clave, vence));
}

/**
 * Atributos de la cookie de sesión, en un solo lugar: los usan la puerta (`/admin`) y la
 * renovación deslizante de `/pedidos`, y tienen que coincidir o el navegador guarda dos.
 */
export function opcionesCookieOps(esHttps: boolean) {
  return {
    httpOnly: true,
    secure: esHttps,
    sameSite: "lax" as const,
    path: "/",
    maxAge: DURACION_SESION_OPS,
  };
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
