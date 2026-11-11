import type { AdaptadorCorreo, DatosAviso, ResultadoEnvio, TipoAviso } from "./tipos.ts";

// Proveedor de desarrollo y simulación (research.md #12, FR-028): escribe el aviso por
// salida estándar en vez de mandarlo.
//
// Existe para que la feature se pueda recorrer entera sin cuenta en ningún proveedor de
// correo, igual que el proveedor de pago simulado. Y para que FR-029 sea verificable: el
// registro en la tabla `avisos` se escribe igual con este proveedor que con Resend, porque
// el requisito es del negocio y no del proveedor.

export const CLAVE = "consola";

export const consola: AdaptadorCorreo = {
  clave: CLAVE,

  async enviarAviso(
    tipo: TipoAviso,
    destinatario: string,
    datos: DatosAviso,
  ): Promise<ResultadoEnvio> {
    // Una dirección sin forma de correo no se "manda igual": se informa como falla, para que
    // quede en la tabla con su motivo y se pueda reintentar (FR-029).
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinatario)) {
      return { ok: false, error: `destinatario sin forma de correo: "${destinatario}"` };
    }

    console.log(
      [
        "",
        "──────────── aviso (proveedor: consola) ────────────",
        `para:    ${destinatario}`,
        `tipo:    ${tipo}`,
        `enlace:  ${datos.enlace}`,
        ...(datos.nombreDestinatario ? [`regalo:  para ${datos.nombreDestinatario}`] : []),
        "────────────────────────────────────────────────────",
      ].join("\n"),
    );

    return { ok: true };
  },
};
