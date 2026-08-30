import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Contenido } from "../../../src/lib/contenido/tipos-bloque.ts";

const ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function slugAleatorio(): string {
  const bytes = randomBytes(8);
  let slug = "";
  for (let i = 0; i < 8; i++) slug += ALFABETO[bytes[i] % ALFABETO.length];
  return slug;
}

function cliente() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY para los tests e2e");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface RegaloDeTest {
  id: string;
  slug: string;
}

interface Opciones {
  tema?: "nocturno" | "papel" | "luminoso";
  estado?: "en_revision" | "publicado";
  vencimiento?: string | null;
}

// Inserta un regalo directamente en Supabase (sin pasar por revisión/aprobación) para
// que cada test controle su propio contenido. Por defecto queda publicado y servible.
export async function crearRegalo(
  contenido: Contenido,
  opciones: Opciones = {},
): Promise<RegaloDeTest> {
  const supabase = cliente();
  const slug = slugAleatorio();

  const { error: slugError } = await supabase.from("slugs").insert({ slug });
  if (slugError) throw slugError;

  const estado = opciones.estado ?? "publicado";
  const { data, error } = await supabase
    .from("regalos")
    .insert({
      slug,
      tema: opciones.tema ?? "nocturno",
      contenido,
      estado,
      aprobado_en: estado === "publicado" ? new Date().toISOString() : null,
      vencimiento: opciones.vencimiento ?? null,
    })
    .select("id, slug")
    .single();

  if (error || !data) throw error ?? new Error("No se pudo crear el regalo de test");

  const { error: updateError } = await supabase
    .from("slugs")
    .update({ regalo_id: data.id })
    .eq("slug", slug);
  if (updateError) throw updateError;

  return data as RegaloDeTest;
}

export function clienteDeTest() {
  return cliente();
}
