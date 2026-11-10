import { defineMiddleware } from "astro:middleware";
import {
  COOKIE_ACCESO,
  coincideSecreto,
  esRutaLibre,
  modoInternoActivo,
  secretoInterno,
} from "./lib/acceso.ts";

// Compuerta de acceso del deploy interno (ver src/lib/acceso.ts).
//
// Con el modo interno apagado este middleware es completamente transparente: devuelve
// `next()` antes de mirar la ruta, las cookies o el entorno. Es lo que permite que el
// regalo siga abriendo sin login ni interstitial (Principio I) y que la suite de
// Playwright —que corre sin MODO_INTERNO— no vea ninguna diferencia.
//
// Con el modo interno encendido, lo que falta cookie válida contesta 404 y no 401:
// un 401 delataría que detrás del dominio hay algo. 404 es indistinguible de una ruta
// que no existe.
export const onRequest = defineMiddleware((contexto, next) => {
  if (!modoInternoActivo()) return next();

  if (esRutaLibre(contexto.url.pathname)) return next();

  // Fail-closed: con el modo interno encendido y sin secreto configurado no se abre
  // nada. Un error de configuración nunca puede terminar en un sitio abierto.
  const secreto = secretoInterno();
  if (!secreto) return new Response(null, { status: 404 });

  const cookie = contexto.cookies.get(COOKIE_ACCESO)?.value;
  if (!coincideSecreto(cookie, secreto)) return new Response(null, { status: 404 });

  return next();
});
