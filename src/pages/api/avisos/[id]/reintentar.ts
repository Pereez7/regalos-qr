import type { APIRoute } from "astro";
import { COOKIE_OPS, autorizadoPorCabecera, sesionOpsValida } from "../../../../lib/ops.ts";
import { reintentarAviso } from "../../../../lib/avisos.ts";

export const prerender = false;

// Reencolado manual de un aviso fallido (FR-029, research.md #12).
//
// Es manual a propósito: FR-029 pide que la falla quede registrada para PODER reintentarse,
// no que el sistema reintente solo. Con el volumen de esta etapa, un reintento automático es
// infraestructura que no se puede ejercitar a mano y que puede duplicar mensajes.

export const POST: APIRoute = async ({ params, request, cookies, redirect }) => {
  const desdeLaCola = sesionOpsValida(cookies.get(COOKIE_OPS)?.value);
  if (!desdeLaCola && !autorizadoPorCabecera(request)) {
    return new Response(null, { status: 401 });
  }

  const resultado = await reintentarAviso(params.id ?? "");

  if (!resultado.ok) {
    return new Response(resultado.motivo ?? "no se pudo reintentar", {
      status: 409,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  if (desdeLaCola) return redirect("/pedidos", 303);
  return new Response(null, { status: 204 });
};
