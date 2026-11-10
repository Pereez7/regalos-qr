import { timingSafeEqual } from "node:crypto";

// Compuerta de acceso interno. Los deploys de Vercel son públicos por defecto y el
// sitio todavía vive en un dominio *.vercel.app de uso interno (simulación de ventas,
// sin clientes reales). Esta compuerta no depende del plan de Vercel: la decide el
// servidor, en src/middleware.ts.
//
// Server-only: nunca importar este módulo desde código que termine en el bundle de
// cliente (igual que src/lib/supabase.ts).

/** Cookie que habilita el acceso mientras el modo interno está encendido. */
export const COOKIE_ACCESO = "acceso_interno";

/** Vida de la cookie: 30 días en segundos. */
export const DURACION_COOKIE = 30 * 24 * 60 * 60;

// `import.meta.env` resuelve lo que había al compilar; `process.env`, lo que hay al
// ejecutar. Se leen los dos (mismo patrón que src/lib/supabase.ts) para que Vercel
// pueda cambiar la variable en runtime sin rebuild.

/** `MODO_INTERNO=1` enciende la compuerta. Vacío, ausente o `0` la deja apagada. */
export function modoInternoActivo(): boolean {
  const valor: string | undefined = import.meta.env.MODO_INTERNO ?? process.env.MODO_INTERNO;
  return valor === "1";
}

/** Secreto que habilita el acceso. `undefined` si no está configurado. */
export function secretoInterno(): string | undefined {
  const valor: string | undefined =
    import.meta.env.ACCESO_INTERNO_SECRETO ?? process.env.ACCESO_INTERNO_SECRETO;
  return valor ? valor : undefined;
}

/**
 * Rutas que se sirven sin cookie con el modo interno encendido:
 *   - `/acceso` — la propia puerta; si exigiera cookie no habría forma de entrar.
 *   - `/robots.txt` — para que los buscadores puedan leer el "no indexar".
 *   - `/fuentes/*` — las woff2 de public/, que pide el CSS del regalo.
 * Todo lo demás exige cookie válida.
 */
export function esRutaLibre(ruta: string): boolean {
  return (
    ruta === "/acceso" ||
    ruta === "/acceso/" ||
    ruta === "/robots.txt" ||
    ruta.startsWith("/fuentes/")
  );
}

/**
 * Compara en tiempo constante, para no filtrar cuánto del secreto se acertó.
 * `timingSafeEqual` lanza excepción si los largos difieren, así que hay que cortar
 * antes: eso filtra el largo del secreto, nunca su contenido.
 */
export function coincideSecreto(
  candidato: string | null | undefined,
  secreto: string | undefined,
): boolean {
  if (!candidato || !secreto) return false;

  const a = Buffer.from(candidato, "utf8");
  const b = Buffer.from(secreto, "utf8");
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
