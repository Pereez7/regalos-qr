import { randomBytes } from "node:crypto";
import { getServiceClient } from "./supabase.ts";

// La unidad comercial. Server-only: toda lectura filtra por `pedidos.id`, que es la única
// credencial del comprador (FR-003, FR-031).
//
// El alfabeto propio del `token_baja` vive acá y no en la migración, igual que los slugs en
// src/lib/slugs.ts (data-model.md, convenciones heredadas de la 001).

// Una sola literal, no una concatenación: supabase-js deriva el tipo de la fila del texto
// del `select`, y un `"a" + "b"` se ensancha a `string` y le arruina la inferencia.
const COLUMNAS = "id, estado, email, celular, consentimiento_publicidad, consentimiento_en, baja_publicidad_en, token_baja, borrador, regalo_id, creado_en, pagado_en, actualizado_en, qr_emitido_en, qr_simulacion";

/** Las mismas columnas más el estado del regalo asociado, para la cola operativa. */
const COLUMNAS_CON_REGALO = "id, estado, email, celular, consentimiento_publicidad, consentimiento_en, baja_publicidad_en, token_baja, borrador, regalo_id, creado_en, pagado_en, actualizado_en, qr_emitido_en, qr_simulacion, regalos (estado, slug)";

export interface Pedido {
  id: string;
  estado: "iniciado" | "pagado";
  email: string;
  celular: string | null;
  consentimientoPublicidad: boolean;
  consentimientoEn: string | null;
  bajaPublicidadEn: string | null;
  tokenBaja: string;
  /** El borrador crudo. Lo valida src/lib/borrador/esquema.ts, no esta capa. */
  borrador: unknown;
  regaloId: string | null;
  creadoEn: string;
  pagadoEn: string | null;
  actualizadoEn: string;
  qrEmitidoEn: string | null;
  qrSimulacion: boolean;
}

interface FilaPedido {
  id: string;
  estado: "iniciado" | "pagado";
  email: string;
  celular: string | null;
  consentimiento_publicidad: boolean;
  consentimiento_en: string | null;
  baja_publicidad_en: string | null;
  token_baja: string;
  borrador: unknown;
  regalo_id: string | null;
  creado_en: string;
  pagado_en: string | null;
  actualizado_en: string;
  qr_emitido_en: string | null;
  qr_simulacion: boolean;
}

function mapear(fila: FilaPedido): Pedido {
  return {
    id: fila.id,
    estado: fila.estado,
    email: fila.email,
    celular: fila.celular,
    consentimientoPublicidad: fila.consentimiento_publicidad,
    consentimientoEn: fila.consentimiento_en,
    bajaPublicidadEn: fila.baja_publicidad_en,
    tokenBaja: fila.token_baja,
    borrador: fila.borrador,
    regaloId: fila.regalo_id,
    creadoEn: fila.creado_en,
    pagadoEn: fila.pagado_en,
    actualizadoEn: fila.actualizado_en,
    qrEmitidoEn: fila.qr_emitido_en,
    qrSimulacion: fila.qr_simulacion,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 32 caracteres hexadecimales (128 bits) para la baja publicitaria. **Distinto del id del
 * pedido y sin relación derivable con él**: el enlace de baja viaja dentro de mensajes
 * publicitarios, el canal más propenso a reenvíos y capturas, y si fuera el id cada mensaje
 * sería una filtración de la credencial que da acceso a la historia entera (research.md #13).
 */
export function generarTokenBaja(): string {
  return randomBytes(16).toString("hex");
}

export interface DatosNuevoPedido {
  email: string;
  /** Solo se guarda junto con el consentimiento. Sin él, se descarta sin avisar. */
  celular?: string | null;
  /** `true` únicamente si la casilla llegó presente: nunca se deduce del dato (FR-035). */
  consentimientoPublicidad?: boolean;
}

/**
 * Alta en estado `iniciado`. Se llama **antes** de redirigir al cobro, para que el aviso de
 * pago siempre encuentre un pedido esperando (research.md #4, Principio VII).
 *
 * El celular sin consentimiento **no se guarda** y la compra sigue igual: el número se
 * descarta acá, y además el `check celular_requiere_consentimiento` de la tabla lo hace
 * imposible aunque este código se equivoque (FR-035).
 */
export async function crearPedido(datos: DatosNuevoPedido): Promise<Pedido> {
  const supabase = getServiceClient();

  const conConsentimiento = datos.consentimientoPublicidad === true;
  const celular = conConsentimiento && datos.celular ? datos.celular : null;

  const { data, error } = await supabase
    .from("pedidos")
    .insert({
      email: datos.email,
      celular,
      consentimiento_publicidad: conConsentimiento,
      // Un consentimiento sin fecha es un consentimiento que no se puede demostrar
      // (research.md #13).
      consentimiento_en: conConsentimiento ? new Date().toISOString() : null,
      // Se genera SIEMPRE, con celular o sin él: la columna es `not null unique`.
      token_baja: generarTokenBaja(),
      borrador: { v: 1 },
    })
    .select(COLUMNAS)
    .single();

  if (error || !data) throw error ?? new Error("No se pudo crear el pedido");

  return mapear(data as FilaPedido);
}

/**
 * Lectura por la única credencial que existe. Un id con forma que no es de UUID devuelve
 * `null` sin consultar: Postgres respondería con un error de sintaxis y la ruta tiene que
 * ver un 404, no un 500.
 */
export async function obtenerPedido(id: string): Promise<Pedido | null> {
  if (!UUID.test(id)) return null;

  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("pedidos")
    .select(COLUMNAS)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  return mapear(data as FilaPedido);
}

/** Igual que `obtenerPedido`, por el token de la baja publicitaria (FR-036). */
export async function obtenerPedidoPorTokenBaja(token: string): Promise<Pedido | null> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("pedidos")
    .select(COLUMNAS)
    .eq("token_baja", token)
    .maybeSingle();

  if (error || !data) return null;

  return mapear(data as FilaPedido);
}

/**
 * `iniciado → pagado`, la única transición que existe, e **irreversible**: no hay función que
 * baje de estado, y no es un olvido (data-model.md, Principio VII).
 *
 * UPDATE condicional, misma técnica atómica que la aprobación y la primera apertura de la
 * 001: devuelve `true` solo para el llamado que de verdad cambió la fila. Dos avisos
 * simultáneos del mismo pago no pueden ganar los dos, así que la acción derivada —el
 * comprobante— se dispara una sola vez (FR-004, SC-006).
 */
export async function marcarPagado(id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;

  const supabase = getServiceClient();

  const { data } = await supabase
    .from("pedidos")
    .update({ estado: "pagado", pagado_en: new Date().toISOString() })
    .eq("id", id)
    .eq("estado", "iniciado")
    .select("id")
    .maybeSingle();

  return data != null;
}

/**
 * Reclamo atómico del regalo **antes** de crearlo no se puede hacer acá —el id del regalo
 * todavía no existe—, así que esta función es la segunda mitad: escribe el regalo recién
 * creado solo si el pedido no tenía uno. `false` significa que otro envío llegó primero y
 * quien perdió debe deshacer el regalo que acababa de crear (FR-021, research.md #9).
 */
export async function reclamarRegalo(pedidoId: string, regaloId: string): Promise<boolean> {
  if (!UUID.test(pedidoId)) return false;

  const supabase = getServiceClient();

  const { data } = await supabase
    .from("pedidos")
    .update({ regalo_id: regaloId, actualizado_en: new Date().toISOString() })
    .eq("id", pedidoId)
    .is("regalo_id", null)
    .select("id")
    .maybeSingle();

  return data != null;
}

// --- Cola operativa (FR-008, research.md #14) ---
//
// Las tres consultas que la cola necesita, más las dos que hacen visible lo que llegó
// torcido. El volumen de esta etapa es de decenas de filas, así que lo que PostgREST no
// expresa en un solo filtro se termina de filtrar en memoria: una consulta clara y barata
// vale más que una expresión imposible de leer (el día que el volumen lo justifique, esto es
// una vista en la base).

export interface PedidoEnCola extends Pedido {
  /** Estado del regalo asociado, si ya nació. */
  estadoRegalo: "en_revision" | "publicado" | null;
  slugRegalo: string | null;
}

/**
 * "Pagado sin regalo entregado" se **computa**, no se guarda como estado: un estado duplicado
 * se desincroniza, una consulta no (data-model.md). Incluye el pedido sin regalo y el que
 * tiene uno todavía en revisión.
 */
export async function pedidosPagadosSinRegalo(): Promise<PedidoEnCola[]> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("pedidos")
    .select(COLUMNAS_CON_REGALO)
    .eq("estado", "pagado")
    .order("creado_en", { ascending: false });

  if (error || !data) return [];

  type FilaConRegalo = FilaPedido & { regalos: { estado: string; slug: string } | null };

  return (data as unknown as FilaConRegalo[])
    .map((fila) => ({
      ...mapear(fila),
      estadoRegalo: (fila.regalos?.estado ?? null) as PedidoEnCola["estadoRegalo"],
      slugRegalo: fila.regalos?.slug ?? null,
    }))
    .filter((pedido) => pedido.estadoRegalo !== "publicado");
}

/**
 * Intentos abandonados: basura inofensiva y visible. Aparecen como abandonados, nunca como
 * venta (research.md #4).
 */
export async function pedidosIniciadosNuncaPagados(): Promise<Pedido[]> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("pedidos")
    .select(COLUMNAS)
    .eq("estado", "iniciado")
    .order("creado_en", { ascending: false });

  if (error || !data) return [];

  return (data as FilaPedido[]).map(mapear);
}

export interface AvisoEnCola {
  id: string;
  pedidoId: string;
  tipo: "comprobante" | "revision" | "aprobacion";
  destinatario: string;
  proveedor: string;
  estado: "pendiente" | "enviado" | "fallido";
  intentos: number;
  error: string | null;
  creadoEn: string;
}

/**
 * Lo que falta mandar y lo que falló. Apoyado en el índice parcial
 * `avisos_no_enviados_idx`, que es lo que hace barata esta consulta. El reintento es manual
 * desde la cola: FR-029 pide que la falla quede registrada para poder reintentarse, no que el
 * sistema reintente solo (research.md #12).
 */
export async function avisosPendientesOFallidos(): Promise<AvisoEnCola[]> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("avisos")
    .select("id, pedido_id, tipo, destinatario, proveedor, estado, intentos, error, creado_en")
    .neq("estado", "enviado")
    .order("creado_en", { ascending: false });

  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map((fila) => ({
    id: fila.id as string,
    pedidoId: fila.pedido_id as string,
    tipo: fila.tipo as AvisoEnCola["tipo"],
    destinatario: fila.destinatario as string,
    proveedor: fila.proveedor as string,
    estado: fila.estado as AvisoEnCola["estado"],
    intentos: fila.intentos as number,
    error: (fila.error as string | null) ?? null,
    creadoEn: fila.creado_en as string,
  }));
}

export interface EventoSinPedido {
  id: string;
  proveedor: string;
  eventoId: string;
  estadoInformado: string;
  recibidoEn: string;
}

/**
 * Avisos con firma válida cuyo pedido no existe. Por research.md #4 esto no debería ocurrir
 * nunca —el pedido nace antes de ir a pagar—, así que cada fila acá es un error real: otro
 * entorno, un pedido borrado, o un aviso apócrifo con firma válida. No hay reparación
 * automática: queda a la vista y alguien lo mira (research.md #2).
 */
export async function eventosSinPedido(): Promise<EventoSinPedido[]> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("eventos_pago")
    .select("id, proveedor, evento_id, estado_informado, recibido_en")
    .eq("resultado", "sin_pedido")
    .order("recibido_en", { ascending: false });

  if (error || !data) return [];

  return (data as Record<string, unknown>[]).map((fila) => ({
    id: fila.id as string,
    proveedor: fila.proveedor as string,
    eventoId: fila.evento_id as string,
    estadoInformado: fila.estado_informado as string,
    recibidoEn: fila.recibido_en as string,
  }));
}

export interface DiscrepanciaDeMonto {
  pagoId: string;
  pedidoId: string;
  montoCotizadoCentavos: number;
  montoInformadoCentavos: number;
  moneda: string;
  actualizadoEn: string;
}

/**
 * Pagos donde el monto informado por el proveedor difiere del cotizado. No bloquean nada: el
 * comprador recibe lo que pagó y el negocio se entera (research.md #23). Qué se hace con la
 * diferencia —reintegrar, cobrar el resto o dejarla pasar— es una decisión comercial, no del
 * sistema.
 */
export async function discrepanciasDeMonto(): Promise<DiscrepanciaDeMonto[]> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("pagos")
    .select("id, pedido_id, monto_centavos, monto_informado_centavos, moneda, actualizado_en")
    .not("monto_informado_centavos", "is", null)
    .order("actualizado_en", { ascending: false });

  if (error || !data) return [];

  return (data as Record<string, unknown>[])
    .filter((fila) => fila.monto_informado_centavos !== fila.monto_centavos)
    .map((fila) => ({
      pagoId: fila.id as string,
      pedidoId: fila.pedido_id as string,
      montoCotizadoCentavos: fila.monto_centavos as number,
      montoInformadoCentavos: fila.monto_informado_centavos as number,
      moneda: fila.moneda as string,
      actualizadoEn: fila.actualizado_en as string,
    }));
}
