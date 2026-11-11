import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getServiceClient } from "../supabase.ts";
import type {
  AdaptadorPago,
  AvisoNormalizado,
  CobroIniciado,
  EstadoInformado,
  PedidoACobrar,
} from "./tipos.ts";

// Cobro con QR interbancario boliviano y confirmación manual (research.md #24).
//
// El comprador ve el QR de la cuenta del negocio, paga desde la app de su banco y declara el
// pago con su número de comprobante. El negocio lo confirma desde la cola operativa, mirando
// su app del banco.
//
// Lo importante del diseño: la confirmación manual NO es un camino paralelo. Emite el mismo
// aviso firmado contra `POST /api/pagos/webhook/qr-manual` que emitiría un proveedor con API,
// así que la idempotencia por `(proveedor, evento_id)`, el registro del evento antes de toda
// acción derivada y el comprobante por correo siguen siendo exactamente los mismos. Confirmar
// dos veces deja un solo pedido pagado.
//
// El día que se contrate un proveedor con API, es otro archivo en esta carpeta y una línea en
// el registro: ni las rutas ni el modelo de datos se enteran (Principio II).

export const CLAVE = "qr-manual";

/** Cabecera de firma de este proveedor. */
export const CABECERA_FIRMA = "x-firma-qr";

/** Cuerpo del aviso que emite la confirmación operativa. */
export interface CuerpoAvisoQr {
  evento: string;
  comprobante: string;
  pedido: string;
  monto_centavos: number;
  moneda: string;
  estado: string;
}

function secreto(): string {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const valor = env?.PAGO_QR_SECRETO ?? process.env.PAGO_QR_SECRETO;
  if (!valor) throw new Error("Falta PAGO_QR_SECRETO en el entorno");
  return valor;
}

export function firmar(cuerpoCrudo: string): string {
  return createHmac("sha256", secreto()).update(cuerpoCrudo, "utf8").digest("hex");
}

/** Serializa y firma en un solo paso, para que la firma sea sobre los bytes que viajan. */
export function construirAviso(cuerpo: CuerpoAvisoQr): { cuerpo: string; firma: string } {
  const serializado = JSON.stringify(cuerpo);
  return { cuerpo: serializado, firma: firmar(serializado) };
}

/** Identificador del evento de confirmación. Uno por confirmación, no por pedido. */
export function nuevoEventoId(): string {
  return `conf_${randomBytes(8).toString("hex")}`;
}

function normalizarEstado(valor: unknown): EstadoInformado | null {
  if (valor === "aprobado" || valor === "rechazado" || valor === "pendiente") return valor;
  return null;
}

export const qrManual: AdaptadorPago = {
  clave: CLAVE,

  async iniciarCobro(pedido: PedidoACobrar): Promise<CobroIniciado> {
    const supabase = getServiceClient();

    // La fila nace con el cobro y no con el aviso, igual que con cualquier proveedor: queda
    // registrado por cuánto se intentó cobrar aunque el comprador nunca llegue a pagar.
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

    // La "dirección de cobro" es una página propia con el QR: no hay proveedor externo al
    // que redirigir, pero el flujo del comprador es el mismo.
    return { urlDeCobro: `/pagar/${pedido.id}`, pagoId: data.id as string };
  },

  verificarFirma(cuerpoCrudo: string, headers: Headers): boolean {
    const recibida = headers.get(CABECERA_FIRMA);
    if (!recibida) return false;

    const a = Buffer.from(recibida, "utf8");
    const b = Buffer.from(firmar(cuerpoCrudo), "utf8");
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
    const cuerpo = crudo as Partial<CuerpoAvisoQr>;
    const estado = normalizarEstado(cuerpo.estado);

    if (
      typeof cuerpo.evento !== "string" ||
      cuerpo.evento.length === 0 ||
      typeof cuerpo.comprobante !== "string" ||
      cuerpo.comprobante.length === 0 ||
      typeof cuerpo.pedido !== "string" ||
      cuerpo.pedido.length === 0 ||
      typeof cuerpo.monto_centavos !== "number" ||
      !Number.isInteger(cuerpo.monto_centavos) ||
      typeof cuerpo.moneda !== "string" ||
      estado === null
    ) {
      return null;
    }

    return {
      eventoId: cuerpo.evento,
      // El "identificador del pago en el proveedor" es, acá, el comprobante de la
      // transferencia: es lo único que identifica el movimiento del lado del banco.
      pagoId: cuerpo.comprobante,
      pedidoId: cuerpo.pedido,
      monto: cuerpo.monto_centavos,
      moneda: cuerpo.moneda,
      estado,
    };
  },
};
