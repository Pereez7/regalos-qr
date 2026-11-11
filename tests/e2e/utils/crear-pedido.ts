import { randomBytes } from "node:crypto";
import { clienteDeTest } from "./crear-regalo.ts";

// Inserta pedidos directamente en Supabase, al mismo estilo que crear-regalo.ts: cada test
// controla su propio punto de partida sin tener que recorrer la compra.
//
// Es lo que hace que US2, US3 y US4 se puedan desarrollar y probar sin que US1 exista
// todavía (tasks.md, Dependencies & Execution Order).

export interface PedidoDeTest {
  id: string;
  email: string;
  tokenBaja: string;
}

interface Opciones {
  /** `iniciado` (nace así) o `pagado`. No hay otra transición (data-model.md). */
  estado?: "iniciado" | "pagado";
  email?: string;
  /** Solo se guarda con consentimiento: el check de la tabla lo hace cumplir (FR-035). */
  celular?: string;
  /** Borrador arbitrario. Por defecto, el documento recién nacido: `{ v: 1 }`. */
  borrador?: Record<string, unknown>;
  regaloId?: string | null;
}

function emailAleatorio(): string {
  return `prueba-${randomBytes(6).toString("hex")}@ejemplo.test`;
}

// Mismo formato que src/lib/pedidos.ts: 32 hex (128 bits), sin relación derivable con el id
// del pedido (research.md #13).
function tokenBajaAleatorio(): string {
  return randomBytes(16).toString("hex");
}

export async function crearPedido(opciones: Opciones = {}): Promise<PedidoDeTest> {
  const supabase = clienteDeTest();

  const estado = opciones.estado ?? "iniciado";
  const email = opciones.email ?? emailAleatorio();
  const tokenBaja = tokenBajaAleatorio();
  const ahora = new Date().toISOString();

  const { data, error } = await supabase
    .from("pedidos")
    .insert({
      estado,
      email,
      // El celular viaja con su consentimiento y su fecha, o no viaja: la tabla no admite
      // el estado intermedio (constraint celular_requiere_consentimiento).
      celular: opciones.celular ?? null,
      consentimiento_publicidad: opciones.celular ? true : false,
      consentimiento_en: opciones.celular ? ahora : null,
      token_baja: tokenBaja,
      borrador: opciones.borrador ?? { v: 1 },
      regalo_id: opciones.regaloId ?? null,
      // `pagado` sin `pagado_en` lo rechaza la base (constraint pagado_en_requiere_pagado).
      pagado_en: estado === "pagado" ? ahora : null,
    })
    .select("id, email, token_baja")
    .single();

  if (error || !data) throw error ?? new Error("No se pudo crear el pedido de test");

  return { id: data.id as string, email: data.email as string, tokenBaja: data.token_baja as string };
}

export interface PagoDeTest {
  id: string;
}

interface OpcionesPago {
  proveedor?: string;
  montoCentavos?: number;
  moneda?: string;
  estado?: "pendiente" | "aprobado" | "rechazado";
  pagoIdProveedor?: string | null;
}

// La fila de `pagos` nace con el cobro y no con el aviso (data-model.md): un test que parte
// de un pedido listo para recibir un aviso necesita su cobro `pendiente` ya creado.
export async function crearPago(
  pedidoId: string,
  opciones: OpcionesPago = {},
): Promise<PagoDeTest> {
  const supabase = clienteDeTest();

  const { data, error } = await supabase
    .from("pagos")
    .insert({
      pedido_id: pedidoId,
      proveedor: opciones.proveedor ?? "simulado",
      monto_centavos: opciones.montoCentavos ?? 1000,
      moneda: opciones.moneda ?? "USD",
      estado: opciones.estado ?? "pendiente",
      pago_id_proveedor: opciones.pagoIdProveedor ?? null,
    })
    .select("id")
    .single();

  if (error || !data) throw error ?? new Error("No se pudo crear el pago de test");

  return { id: data.id as string };
}

/**
 * Limpieza de test: borra el pedido, su regalo y sus fotos en los dos prefijos, dejando la
 * fila de `slugs` huérfana a propósito — ese valor no se reasigna nunca (Principio VI).
 *
 * Va por la base y no por `DELETE /api/pedidos/[id]/eliminar` para que una falla del
 * endpoint no se disfrace de test que limpia bien. Ese endpoint tiene su propio test.
 */
export async function borrarPedidoDeTest(pedidoId: string): Promise<void> {
  const supabase = clienteDeTest();

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("regalo_id")
    .eq("id", pedidoId)
    .maybeSingle();

  const regaloId = pedido?.regalo_id as string | null | undefined;

  for (const prefijo of [`pedidos/${pedidoId}`, ...(regaloId ? [`regalos/${regaloId}`] : [])]) {
    const { data: archivos } = await supabase.storage.from("fotos").list(prefijo);
    if (archivos && archivos.length > 0) {
      await supabase.storage.from("fotos").remove(archivos.map((a) => `${prefijo}/${a.name}`));
    }
  }

  if (regaloId) {
    const { data: regalo } = await supabase
      .from("regalos")
      .select("slug")
      .eq("id", regaloId)
      .maybeSingle();
    if (regalo) {
      await supabase.from("slugs").update({ regalo_id: null }).eq("slug", regalo.slug);
      await supabase.from("regalos").delete().eq("id", regaloId);
    }
  }

  await supabase.from("pedidos").delete().eq("id", pedidoId);
}
