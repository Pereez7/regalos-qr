import { createHmac, timingSafeEqual } from "node:crypto";
import { getServiceClient } from "../supabase.ts";
import type {
  AdaptadorPago,
  AvisoNormalizado,
  CobroIniciado,
  EstadoInformado,
  PedidoACobrar,
} from "./tipos.ts";

// Proveedor de cobro simulado (research.md #3, FR-007). Reproduce el comportamiento
// observable de un proveedor real —página de cobro propia, aviso servidor a servidor,
// firma HMAC sobre el cuerpo crudo— para que la venta completa se pueda recorrer sin
// cuenta en ningún proveedor, sin túnel y sin tarjeta de prueba.
//
// La firma no es decorativa: existe para que el camino de verificación se ejercite de
// verdad en simulación y no quede como código sin probar hasta el día que se conecte el
// proveedor real, que es exactamente donde no se quiere descubrir que está mal.
//
// Sus campos tienen nombres propios, distintos de la forma normalizada: traducir es el
// trabajo del adaptador, y un proveedor real tampoco va a hablar nuestro vocabulario.

export const CLAVE = "simulado";

/** Cabecera de firma de este proveedor. Otro proveedor usará otra. */
export const CABECERA_FIRMA = "x-firma";

/** Cuerpo tal como lo manda este proveedor. Es el contrato de su payload. */
export interface CuerpoAvisoSimulado {
  id_evento: string;
  id_pago: string;
  /** El id del pedido, como "referencia externa" del cobro. */
  referencia: string;
  monto_centavos: number;
  moneda: string;
  estado: string;
}

function secretoConfigurado(): boolean {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  return Boolean(env?.PAGO_SIMULADO_SECRETO ?? process.env.PAGO_SIMULADO_SECRETO);
}

function secreto(): string {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const valor = env?.PAGO_SIMULADO_SECRETO ?? process.env.PAGO_SIMULADO_SECRETO;
  if (!valor) {
    throw new Error("Falta PAGO_SIMULADO_SECRETO en el entorno");
  }
  return valor;
}

/** HMAC-SHA256 hex sobre el cuerpo crudo: los bytes que viajan, no el objeto. */
export function firmar(cuerpoCrudo: string): string {
  return createHmac("sha256", secreto()).update(cuerpoCrudo, "utf8").digest("hex");
}

/**
 * Serializa y firma en un solo paso. Lo usa la página de cobro simulado para emitir el
 * aviso: serializar dos veces —una para firmar y otra para enviar— es la forma clásica de
 * que la firma deje de validar por un espacio de diferencia.
 */
export function construirAviso(cuerpo: CuerpoAvisoSimulado): { cuerpo: string; firma: string } {
  const serializado = JSON.stringify(cuerpo);
  return { cuerpo: serializado, firma: firmar(serializado) };
}

function normalizarEstado(valor: unknown): EstadoInformado | null {
  if (valor === "aprobado" || valor === "rechazado" || valor === "pendiente") return valor;
  return null;
}

export const simulado: AdaptadorPago = {
  clave: CLAVE,

  async iniciarCobro(pedido: PedidoACobrar): Promise<CobroIniciado> {
    const supabase = getServiceClient();

    // La fila de `pagos` nace con el cobro y no con el aviso: así queda registrado por
    // cuánto se intentó cobrar incluso si el aviso nunca llega, que es justo el caso que el
    // Principio VII no quiere perder de vista (data-model.md, research.md #18).
    const { data, error } = await supabase
      .from("pagos")
      .insert({
        pedido_id: pedido.id,
        proveedor: CLAVE,
        monto_centavos: pedido.precio.centavos,
        moneda: pedido.precio.moneda,
      })
      .select("id")
      .single();

    if (error || !data) throw error ?? new Error("No se pudo registrar el cobro");

    // Página propia que imita al proveedor. El id del pedido va en la dirección porque es
    // la referencia del cobro, igual que el `external_reference` de un proveedor real.
    return { urlDeCobro: `/cobro-simulado/${pedido.id}`, pagoId: data.id as string };
  },

  verificarFirma(cuerpoCrudo: string, headers: Headers): boolean {
    const recibida = headers.get(CABECERA_FIRMA);
    if (!recibida) return false;

    // Sin secreto configurado no se puede verificar nada, y no verificar es no autenticar:
    // devuelve `false` —401— en vez de lanzar. En producción este proveedor puede no tener
    // su secreto cargado, y una petición suelta a su webhook no debe contestar 500.
    if (!secretoConfigurado()) return false;

    const esperada = firmar(cuerpoCrudo);

    // Comparación de tiempo constante, mismo criterio que `coincideSecreto` en
    // src/lib/acceso.ts. `timingSafeEqual` lanza si los largos difieren: cortar antes
    // filtra el largo de un hash de largo fijo conocido, nunca su contenido.
    const a = Buffer.from(recibida, "utf8");
    const b = Buffer.from(esperada, "utf8");
    if (a.length !== b.length) return false;

    return timingSafeEqual(a, b);
  },

  interpretarAviso(cuerpoCrudo: string): AvisoNormalizado | null {
    let crudo: unknown;
    try {
      crudo = JSON.parse(cuerpoCrudo);
    } catch {
      return null;
    }

    if (typeof crudo !== "object" || crudo === null) return null;
    const cuerpo = crudo as Partial<CuerpoAvisoSimulado>;

    const estado = normalizarEstado(cuerpo.estado);

    // Falta un campo o viene con otro tipo → `null`, y la ruta responde 400 sin registrar
    // evento: un evento sin `id_evento` no es idempotable.
    if (
      typeof cuerpo.id_evento !== "string" ||
      cuerpo.id_evento.length === 0 ||
      typeof cuerpo.id_pago !== "string" ||
      cuerpo.id_pago.length === 0 ||
      typeof cuerpo.referencia !== "string" ||
      cuerpo.referencia.length === 0 ||
      typeof cuerpo.monto_centavos !== "number" ||
      !Number.isInteger(cuerpo.monto_centavos) ||
      typeof cuerpo.moneda !== "string" ||
      estado === null
    ) {
      return null;
    }

    return {
      eventoId: cuerpo.id_evento,
      pagoId: cuerpo.id_pago,
      pedidoId: cuerpo.referencia,
      monto: cuerpo.monto_centavos,
      moneda: cuerpo.moneda,
      estado,
    };
  },
};
