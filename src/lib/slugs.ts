import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Sin 0/O/1/l/I: elimina ambigüedad visual en una tarjeta impresa (research.md #3).
const ALFABETO = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const LONGITUD = 8;
const MAX_INTENTOS = 10;

function generarCandidato(): string {
  const bytes = randomBytes(LONGITUD);
  let slug = "";
  for (let i = 0; i < LONGITUD; i++) {
    slug += ALFABETO[bytes[i] % ALFABETO.length];
  }
  return slug;
}

// Reserva un slug único insertándolo en `slugs` antes de que exista el regalo
// (research.md #3, #4). Reintenta ante colisión de PK.
export async function generarSlugUnico(supabase: SupabaseClient): Promise<string> {
  for (let intento = 0; intento < MAX_INTENTOS; intento++) {
    const candidato = generarCandidato();
    const { error } = await supabase
      .from("slugs")
      .insert({ slug: candidato })
      .select("slug")
      .single();

    if (!error) return candidato;

    // 23505 = unique_violation (colisión de slug): reintentar con un nuevo candidato.
    if (error.code !== "23505") throw error;
  }

  throw new Error(`No se pudo generar un slug único tras ${MAX_INTENTOS} intentos`);
}
