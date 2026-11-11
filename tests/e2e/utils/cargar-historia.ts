import type { APIRequestContext, APIResponse } from "@playwright/test";

// Guarda pasos del borrador como lo haría el formulario de la página: urlencoded, con
// `paso` y los campos planos de ese paso, contra la misma ruta.
//
// La cabecera `Origin` va a propósito: estos formularios SÍ están protegidos por el
// `checkOrigin` de Astro, y research.md #1 lo deja intacto justamente para ellos. Sin
// `Origin` el framework responde 403 — que es el comportamiento correcto, no un estorbo.

const ORIGEN = "http://localhost:4321";

export function cuerpoDeFormulario(campos: Record<string, string | string[]>): string {
  const cuerpo = new URLSearchParams();
  for (const [clave, valor] of Object.entries(campos)) {
    if (Array.isArray(valor)) for (const uno of valor) cuerpo.append(clave, uno);
    else cuerpo.append(clave, valor);
  }
  return cuerpo.toString();
}

export async function postFormulario(
  request: APIRequestContext,
  ruta: string,
  campos: Record<string, string | string[]>,
): Promise<APIResponse> {
  return request.post(ruta, {
    data: cuerpoDeFormulario(campos),
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGEN },
    maxRedirects: 0,
  });
}

export async function guardarPaso(
  request: APIRequestContext,
  pedidoId: string,
  paso: string,
  campos: Record<string, string | string[]> = {},
): Promise<APIResponse> {
  return postFormulario(request, `/api/pedidos/${pedidoId}/borrador`, { paso, ...campos });
}

export async function enviarHistoria(
  request: APIRequestContext,
  pedidoId: string,
): Promise<APIResponse> {
  return postFormulario(request, `/api/pedidos/${pedidoId}/enviar`, {});
}

/** Historia mínima enviable: tema + nombre + un bloque de contenido (research.md #21). */
export async function cargarMinimo(request: APIRequestContext, pedidoId: string) {
  await guardarPaso(request, pedidoId, "destinatario", { nombre: "Ana", tema: "nocturno" });
  await guardarPaso(request, pedidoId, "carta", { carta_texto: "Te quiero." });
}

export interface LecturaBorrador {
  estado: string;
  regaloId: string | null;
  estadoRegalo: string | null;
  borrador: Record<string, any>;
  faltantes: string[];
}

export async function leerBorrador(
  request: APIRequestContext,
  pedidoId: string,
): Promise<LecturaBorrador> {
  const respuesta = await request.get(`/api/pedidos/${pedidoId}/borrador`);
  return (await respuesta.json()) as LecturaBorrador;
}
