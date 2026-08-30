import type { APIRoute } from "astro";
import { obtenerRegaloPublicado, registrarApertura } from "../../../lib/regalos.ts";

export const prerender = false;

// Único disparador de una apertura en todo el sistema (FR-014, research.md #19,
// contracts/api-abrir.md). Nunca se invoca desde el GET de /r/[slug].
export const POST: APIRoute = async ({ params }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response(null, { status: 404 });
  }

  const regalo = await obtenerRegaloPublicado(slug);
  if (!regalo) {
    return new Response(null, { status: 404 });
  }

  await registrarApertura(regalo.id);

  return new Response(null, { status: 204 });
};
