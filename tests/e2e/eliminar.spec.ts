import { test, expect } from "@playwright/test";
import { crearRegalo, clienteDeTest } from "./utils/crear-regalo.ts";

const BUCKET = "fotos";

// FR-018 / Constitution Compuerta 9: "borrado verificado en base y storage". Asegura que el
// bucket exista (el upload de fotos en sí queda fuera de alcance de esta feature,
// research.md #6) para poder verificar que el borrado también alcanza al Storage.
async function asegurarBucket() {
  const supabase = clienteDeTest();
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
  // 409 = ya existe: no es un error para este propósito.
  if (error && !/already exists|duplicate/i.test(error.message)) throw error;
}

test.describe("DELETE /api/regalos/[id]/eliminar", () => {
  test("borra la fila del regalo, sus fotos en Storage y sus aperturas, sin liberar el slug", async ({
    request,
    baseURL,
  }) => {
    await asegurarBucket();
    const opsSecret = process.env.OPS_SECRET;
    if (!opsSecret) test.skip(true, "Falta OPS_SECRET en el entorno de test");

    const { id, slug } = await crearRegalo({
      v: 1,
      receta: [{ tipo: "cierre", posicion: 0, texto: "Fin" }],
    });

    const supabase = clienteDeTest();

    // Objeto de prueba en Storage bajo la ruta que usa eliminar.ts (regalos/{id}/...).
    const ruta = `regalos/${id}/foto-de-test.txt`;
    const { error: subidaError } = await supabase.storage
      .from(BUCKET)
      .upload(ruta, Buffer.from("contenido de prueba"), { contentType: "text/plain" });
    expect(subidaError, "subida del objeto de prueba").toBeNull();

    // Al menos una apertura, para verificar que el `on delete cascade` la alcanza (FR-018).
    await supabase.from("aperturas").insert({ regalo_id: id, es_primera: true });

    const respuesta = await request.delete(`/api/regalos/${id}/eliminar`, {
      headers: { Authorization: `Bearer ${opsSecret}`, origin: baseURL! },
    });
    expect(respuesta.status()).toBe(204);

    const { data: regaloRestante } = await supabase
      .from("regalos")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    expect(regaloRestante, "fila de regalos borrada").toBeNull();

    const { data: aperturasRestantes } = await supabase
      .from("aperturas")
      .select("id")
      .eq("regalo_id", id);
    expect(aperturasRestantes ?? [], "aperturas borradas por cascada").toHaveLength(0);

    const { data: archivosRestantes } = await supabase.storage
      .from(BUCKET)
      .list(`regalos/${id}`);
    expect(archivosRestantes ?? [], "objetos de Storage borrados").toHaveLength(0);

    // El slug queda bloqueado para siempre (Principio VI): la fila sigue existiendo, sin
    // regalo asociado.
    const { data: slugRestante } = await supabase
      .from("slugs")
      .select("slug, regalo_id")
      .eq("slug", slug)
      .maybeSingle();
    expect(slugRestante).not.toBeNull();
    expect(slugRestante?.regalo_id).toBeNull();
  });

  test("sin Authorization correcto, responde 401 y no borra nada", async ({ request, baseURL }) => {
    const { id } = await crearRegalo({
      v: 1,
      receta: [{ tipo: "cierre", posicion: 0, texto: "Fin" }],
    });

    const respuesta = await request.delete(`/api/regalos/${id}/eliminar`, {
      headers: { Authorization: "Bearer secreto-incorrecto", origin: baseURL! },
    });
    expect(respuesta.status()).toBe(401);

    const supabase = clienteDeTest();
    const { data: regalo } = await supabase.from("regalos").select("id").eq("id", id).maybeSingle();
    expect(regalo).not.toBeNull();
  });

  test("id inexistente responde 404", async ({ request, baseURL }) => {
    const opsSecret = process.env.OPS_SECRET;
    if (!opsSecret) test.skip(true, "Falta OPS_SECRET en el entorno de test");

    const respuesta = await request.delete(
      `/api/regalos/00000000-0000-0000-0000-000000000000/eliminar`,
      { headers: { Authorization: `Bearer ${opsSecret}`, origin: baseURL! } },
    );
    expect(respuesta.status()).toBe(404);
  });
});
