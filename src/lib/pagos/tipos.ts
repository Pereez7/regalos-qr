import type { Precio } from "../config.ts";

// Interfaz del adaptador de pago (research.md #3, contracts/api-iniciar-compra.md,
// contracts/api-webhook-pago.md). Un proveedor nuevo es un archivo nuevo en esta carpeta más
// una línea en registro.ts — nunca un cambio en las rutas ni en el modelo (Principio II).
//
// Server-only: estos módulos leen secretos del entorno.

/** Lo que el adaptador necesita saber del pedido para cobrarlo. */
export interface PedidoACobrar {
  /** El pedido ya existe cuando se llama a `iniciarCobro` (research.md #4). */
  id: string;
  email: string;
  /** Precio congelado en este instante: el que se guarda en la fila de `pagos`. */
  precio: Precio;
}

export interface CobroIniciado {
  /** Dirección a la que se redirige al comprador con un 303. */
  urlDeCobro: string;
  /** Fila de `pagos` creada en estado `pendiente`. */
  pagoId: string;
}

/** Lo que el proveedor dice del pago, ya normalizado. No hay un cuarto valor posible. */
export type EstadoInformado = "aprobado" | "rechazado" | "pendiente";

/**
 * Forma normalizada del aviso. Es deliberadamente angosta: **no hay ningún campo donde un
 * dato de tarjeta pueda entrar** (FR-006), y el cuerpo crudo no se propaga ni se guarda.
 */
export interface AvisoNormalizado {
  /** Identificador del EVENTO en el proveedor. Es la clave de idempotencia (FR-004). */
  eventoId: string;
  /** Identificador del PAGO en el proveedor. Dos avisos del mismo pago comparten este valor. */
  pagoId: string;
  pedidoId: string;
  /** Monto informado, en unidades mínimas de la moneda. Entero. */
  monto: number;
  moneda: string;
  estado: EstadoInformado;
}

export interface AdaptadorPago {
  /** Clave con la que se registra y con la que llega en `/api/pagos/webhook/[proveedor]`. */
  clave: string;

  /**
   * Inserta la fila de `pagos` en `pendiente` con el monto y la moneda **del momento** y
   * devuelve la dirección de cobro. Recibe el pedido ya creado, con su id
   * (contracts/api-iniciar-compra.md, research.md #4, #18).
   */
  iniciarCobro(pedido: PedidoACobrar): Promise<CobroIniciado>;

  /**
   * Verifica la autenticidad del aviso sobre el **cuerpo crudo**, en comparación de tiempo
   * constante. Cada proveedor firma y nombra su cabecera distinto, así que la verificación
   * vive acá y no en la ruta.
   *
   * NUNCA mira `Origin`, la IP ni ninguna otra señal de procedencia: la protección de un
   * webhook es su firma (FR-005, Principio VII).
   */
  verificarFirma(cuerpoCrudo: string, headers: Headers): boolean;

  /**
   * Traduce el payload del proveedor a la forma normalizada. `null` si el cuerpo es ilegible
   * o le falta alguno de los campos necesarios → la ruta responde 400 y **no** registra
   * evento: un evento sin `eventoId` no es idempotable.
   *
   * Recibe el cuerpo **crudo como texto**, no el `Request` que nombra research.md #3: la ruta
   * tiene que leer esos bytes una sola vez para verificar la firma, y el cuerpo de un
   * `Request` no se lee dos veces. La firma es sobre los bytes recibidos, así que son esos
   * mismos los que se interpretan.
   */
  interpretarAviso(cuerpoCrudo: string): AvisoNormalizado | null;
}
