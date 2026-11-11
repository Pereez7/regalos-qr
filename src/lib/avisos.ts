import { getServiceClient } from "./supabase.ts";
import { proveedorCorreo, sitioUrl } from "./config.ts";
import { obtenerAdaptadorCorreo } from "./correo/registro.ts";
import type { DatosAviso, TipoAviso } from "./correo/tipos.ts";

// Emisión y registro de los tres avisos de FR-026.
//
// Dos reglas que gobiernan todo este archivo:
//
//   1. **Nunca lanza.** Una falla de envío no puede tumbar la ruta que la disparó —el
//      webhook de pago, el envío de la historia, la aprobación—. La falla se registra y el
//      pedido sigue su curso (FR-029).
//   2. **El registro es independiente del proveedor.** Se escribe igual con `consola` que
//      con `resend`, porque el requisito es del negocio y no del proveedor (research.md #12).
//      Eso es lo que hace verificable FR-029 en el entorno de simulación.

/** 23505 = unique_violation sobre `(pedido_id, tipo)`: ese aviso ya se emitió. */
const UNIQUE_VIOLATION = "23505";

export interface PedidoAvisable {
  id: string;
  email: string;
}

/**
 * El enlace que lleva cada aviso adentro. Función pura y único lugar donde se arma: si el
 * enlace de un correo fuera mal, sería acá y en ningún otro lado.
 *
 * Sin `SITIO_URL` devuelve la ruta relativa. No es un enlace útil en un correo, y es
 * deliberado que se vea así en vez de inventar un dominio: el problema es de configuración y
 * tiene que notarse (research.md #18).
 */
export function enlaceDeAviso(
  tipo: TipoAviso,
  ids: { pedidoId: string; regaloId?: string | null },
): string {
  const base = sitioUrl() ?? "";

  switch (tipo) {
    case "comprobante":
      return `${base}/contar/${ids.pedidoId}/destinatario`;
    case "revision":
      return `${base}/revisar/${ids.regaloId ?? ""}`;
    case "aprobacion":
      return `${base}/revisar/${ids.regaloId ?? ""}`;
  }
}

/**
 * Emite un aviso una sola vez.
 *
 * La restricción `unique (pedido_id, tipo)` es lo que hace cumplir "una sola vez" (FR-026), y
 * tiene un efecto de producto buscado: FR-014 permite corregir y reenviar la historia sin
 * límite, y sin esta restricción cada reenvío le llenaría la casilla al comprador con otro
 * "tu regalo está listo".
 *
 * La fila se inserta ANTES de intentar el envío: el registro es la intención de avisar, no el
 * resultado de la red. Si el envío falla, la fila queda en `fallido` con su motivo, lista
 * para reintentarse desde la cola operativa.
 */
export async function emitirAviso(
  tipo: TipoAviso,
  pedido: PedidoAvisable,
  datos: DatosAviso,
): Promise<void> {
  try {
    const supabase = getServiceClient();
    const clave = proveedorCorreo();

    const { data: fila, error } = await supabase
      .from("avisos")
      .insert({
        pedido_id: pedido.id,
        tipo,
        destinatario: pedido.email,
        proveedor: clave,
        estado: "pendiente",
      })
      .select("id")
      .single();

    // Ya se había emitido: no se manda de nuevo y no es un error.
    if (error?.code === UNIQUE_VIOLATION) return;
    if (error || !fila) return;

    await intentarEnvio(fila.id as string, tipo, pedido.email, clave, datos);
  } catch {
    // Ni siquiera un fallo inesperado de la base puede propagarse: el pago ya ocurrió y el
    // regalo ya existe. Un aviso no emitido es recuperable; una ruta caída, no.
  }
}

async function intentarEnvio(
  avisoId: string,
  tipo: TipoAviso,
  destinatario: string,
  clave: string,
  datos: DatosAviso,
): Promise<void> {
  const supabase = getServiceClient();
  const adaptador = obtenerAdaptadorCorreo(clave);

  const resultado = adaptador
    ? await adaptador.enviarAviso(tipo, destinatario, datos)
    : ({ ok: false, error: `no hay adaptador de correo "${clave}" registrado` } as const);

  const { data: actual } = await supabase
    .from("avisos")
    .select("intentos")
    .eq("id", avisoId)
    .maybeSingle();

  const intentos = ((actual?.intentos as number | undefined) ?? 0) + 1;

  await supabase
    .from("avisos")
    .update(
      resultado.ok
        ? { estado: "enviado", enviado_en: new Date().toISOString(), intentos, error: null }
        : { estado: "fallido", error: resultado.error.slice(0, 300), intentos },
    )
    .eq("id", avisoId);
}

export interface ResultadoReintento {
  ok: boolean;
  motivo?: string;
}

/**
 * Reencola un aviso fallido. Es manual, desde la cola operativa: FR-029 pide que la falla
 * quede registrada **para poder reintentarse**, no que el sistema reintente solo. Con el
 * volumen de esta etapa, un reintento automático es infraestructura que no se puede
 * ejercitar a mano y que puede duplicar mensajes (research.md #12).
 *
 * Reintentar es un UPDATE sobre la misma fila que incrementa `intentos`: el registro del
 * aviso es la intención de avisar, no cada intento de red.
 */
export async function reintentarAviso(avisoId: string): Promise<ResultadoReintento> {
  const supabase = getServiceClient();

  const { data: aviso } = await supabase
    .from("avisos")
    .select("id, pedido_id, tipo, destinatario, estado, proveedor, pedidos (regalo_id)")
    .eq("id", avisoId)
    .maybeSingle();

  if (!aviso) return { ok: false, motivo: "ese aviso no existe" };
  if (aviso.estado === "enviado") return { ok: false, motivo: "ese aviso ya se había enviado" };

  const tipo = aviso.tipo as TipoAviso;
  // PostgREST tipa el recurso embebido como lista aunque la relación sea de a uno; el cast
  // pasa por `unknown` porque las dos formas no se superponen.
  const embebido = (aviso as unknown as { pedidos: { regalo_id: string | null } | null }).pedidos;
  const regaloId = embebido?.regalo_id ?? null;

  await intentarEnvio(
    aviso.id as string,
    tipo,
    aviso.destinatario as string,
    // Se reintenta con el proveedor configurado HOY, no con el de la fila: si el aviso falló
    // porque el proveedor estaba mal configurado, reintentarlo con el mismo no tiene sentido.
    proveedorCorreo(),
    { enlace: enlaceDeAviso(tipo, { pedidoId: aviso.pedido_id as string, regaloId }) },
  );

  return { ok: true };
}
