// Interfaz del adaptador de correo (research.md #12). Misma forma que el adaptador de pago:
// un archivo por proveedor más una línea en registro.ts (Principio II).
//
// `consola` en desarrollo y simulación —permite recorrer la feature sin cuenta de correo
// (FR-028)—, `resend` en producción. El registro en la tabla `avisos` es el mismo con
// cualquiera de los dos: el requisito es del negocio, no del proveedor.

/** Los tres avisos de FR-026, y no hay un cuarto. */
export type TipoAviso = "comprobante" | "revision" | "aprobacion";

/**
 * Lo que el mensaje lleva adentro. Solo datos que el comprador dio o que el sistema generó
 * para él (FR-027): nunca nada deducido de otra fuente.
 */
export interface DatosAviso {
  /** El enlace que el comprador necesita: carga, revisión o regalo, según el tipo. */
  enlace: string;
  /** Nombre del destinatario del regalo, si ya se cargó. Solo para redactar el mensaje. */
  nombreDestinatario?: string;
}

/**
 * Un envío fallido **no lanza**: devuelve el motivo para que quede en `avisos.estado` y
 * `avisos.error`. Si lanzara, la falla de un aviso podría tumbar la ruta que la disparó, y
 * FR-029 exige lo contrario: la falla se registra y el pedido sigue su curso.
 */
export type ResultadoEnvio = { ok: true } | { ok: false; error: string };

export interface AdaptadorCorreo {
  /** Clave con la que se registra y con la que se guarda en `avisos.proveedor`. */
  clave: string;

  /**
   * Manda el aviso. El destinatario es **siempre una dirección de correo**: el celular tiene
   * un propósito declarado distinto y usarlo acá lo violaría (FR-035).
   */
  enviarAviso(
    tipo: TipoAviso,
    destinatario: string,
    datos: DatosAviso,
  ): Promise<ResultadoEnvio>;
}
