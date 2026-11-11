import { Resend } from "resend";
import type { AdaptadorCorreo, DatosAviso, ResultadoEnvio, TipoAviso } from "./tipos.ts";
import { mensajeDe } from "../avisos-texto.ts";

// Proveedor de producción, detrás de la misma interfaz que `consola` (research.md #12).
//
// Server-only. Una falla de envío NO lanza: devuelve el motivo para que quede en
// `avisos.estado` y `avisos.error`. Si lanzara, la falla de un correo podría tumbar la ruta
// que la disparó —el webhook de pago, por ejemplo— y FR-029 exige lo contrario: el aviso
// falla, se registra, y el pedido sigue su curso.

export const CLAVE = "resend";

function configuracion(): { clave: string; remitente: string } | null {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const clave = env?.RESEND_API_KEY ?? process.env.RESEND_API_KEY;
  const remitente = env?.CORREO_REMITENTE ?? process.env.CORREO_REMITENTE;

  if (!clave || !remitente) return null;
  return { clave, remitente };
}

export const resend: AdaptadorCorreo = {
  clave: CLAVE,

  async enviarAviso(
    tipo: TipoAviso,
    destinatario: string,
    datos: DatosAviso,
  ): Promise<ResultadoEnvio> {
    const config = configuracion();
    if (!config) {
      return { ok: false, error: "faltan RESEND_API_KEY o CORREO_REMITENTE en el entorno" };
    }

    const { asunto, cuerpo } = mensajeDe(tipo, datos);

    try {
      const cliente = new Resend(config.clave);
      const { error } = await cliente.emails.send({
        from: config.remitente,
        to: destinatario,
        subject: asunto,
        text: cuerpo,
      });

      if (error) return { ok: false, error: `${error.name}: ${error.message}`.slice(0, 300) };

      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: (error instanceof Error ? error.message : String(error)).slice(0, 300),
      };
    }
  },
};
