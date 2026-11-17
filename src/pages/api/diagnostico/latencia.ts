import type { APIRoute } from "astro";
import { getServiceClient } from "../../../lib/supabase.ts";
import { autorizadoPorCabecera } from "../../../lib/ops.ts";

export const prerender = false;

// Mide, desde adentro de la función, cuánto cuesta cada ida y vuelta a la base. Es la única
// forma de saber si la lentitud que se siente al guardar un paso es la red del comprador, el
// arranque de la función o la distancia a Supabase: desde afuera los tres se ven iguales.
//
// Protegido con `OPS_SECRET`: dice en qué región corre la función y cuánto tarda la base,
// que no es información para cualquiera.

export const GET: APIRoute = async ({ request }) => {
  if (!autorizadoPorCabecera(request)) return new Response(null, { status: 401 });

  const supabase = getServiceClient();
  // El constructor de consultas de supabase-js es "thenable" pero no es una Promise: se
  // envuelve para poder medirlo sin pelear con los tipos.
  const medir = async (nombre: string, fn: () => PromiseLike<unknown>) => {
    const empezo = performance.now();
    await fn();
    return { nombre, ms: Math.round(performance.now() - empezo) };
  };

  const marcas = [];

  // Consulta trivial: mide la ida y vuelta, no el trabajo de la base.
  marcas.push(await medir("select_trivial", () => supabase.from("slugs").select("slug").limit(1)));
  marcas.push(await medir("select_trivial_2", () => supabase.from("slugs").select("slug").limit(1)));

  // Una consulta con join, como la que hace cada página de la carga.
  marcas.push(
    await medir("pedido_con_regalo", () =>
      supabase.from("pedidos").select("id, regalos (estado)").limit(1),
    ),
  );

  return new Response(
    JSON.stringify(
      {
        region: process.env.VERCEL_REGION ?? "desconocida",
        marcas,
      },
      null,
      2,
    ),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
