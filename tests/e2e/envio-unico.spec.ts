import { test, expect } from "@playwright/test";
import { crearPedido, borrarPedidoDeTest } from "./utils/crear-pedido.ts";
import { clienteDeTest } from "./utils/crear-regalo.ts";
import { cargarMinimo, enviarHistoria, guardarPaso, leerBorrador } from "./utils/cargar-historia.ts";

test.describe.configure({ timeout: 120_000 });

// FR-021, FR-014, FR-015, FR-016 y Principio VI. Lo que impide el doble regalo es el
// reclamo atómico sobre el pedido antes de crearlo; la restricción única es la red de
// contención, no la defensa (research.md #9).

test("dos envíos simultáneos producen un solo regalo con un solo slug", async ({ request }) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido({ estado: "pagado" });
  await cargarMinimo(request, pedido.id);

  // Doble clic, literalmente a la vez.
  const [a, b] = await Promise.all([
    enviarHistoria(request, pedido.id),
    enviarHistoria(request, pedido.id),
  ]);

  // Los dos ven el camino feliz: el que pierde la carrera devuelve el regalo que sí quedó.
  for (const respuesta of [a, b]) {
    expect(respuesta.status()).toBe(303);
    expect(respuesta.headers()["location"]).toBe(`/contar/${pedido.id}/enviado`);
  }

  const { regaloId, estadoRegalo } = await leerBorrador(request, pedido.id);
  expect(regaloId).not.toBeNull();
  expect(estadoRegalo).toBe("en_revision");

  // Un solo regalo para ese pedido, y ningún regalo huérfano con el contenido duplicado.
  const { count: regalosDelPedido } = await supabase
    .from("pedidos")
    .select("regalo_id", { count: "exact", head: true })
    .eq("id", pedido.id)
    .not("regalo_id", "is", null);
  expect(regalosDelPedido).toBe(1);

  const { data: regalo } = await supabase
    .from("regalos")
    .select("id, slug, estado, aprobado_en")
    .eq("id", regaloId!)
    .single();
  expect(regalo!.estado).toBe("en_revision");
  expect(regalo!.aprobado_en).toBeNull();

  // El slug del perdedor, si lo hubo, quedó como lápida: su fila existe y no apunta a nada.
  // Nunca se borra, porque un QR impreso con ese valor no se actualiza jamás.
  const { data: slug } = await supabase
    .from("slugs")
    .select("slug, regalo_id")
    .eq("slug", regalo!.slug)
    .single();
  expect(slug!.regalo_id).toBe(regaloId);

  await borrarPedidoDeTest(pedido.id);
});

test("tres correcciones reemplazan el contenido y nunca cambian el slug", async ({ request }) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido({ estado: "pagado" });
  await cargarMinimo(request, pedido.id);

  await enviarHistoria(request, pedido.id);
  const { regaloId } = await leerBorrador(request, pedido.id);

  const { data: original } = await supabase
    .from("regalos")
    .select("slug, contenido")
    .eq("id", regaloId!)
    .single();

  for (const texto of ["Primera corrección.", "Segunda corrección.", "Tercera corrección."]) {
    await guardarPaso(request, pedido.id, "carta", { carta_texto: texto });
    const respuesta = await enviarHistoria(request, pedido.id);
    expect(respuesta.status()).toBe(303);
    expect(respuesta.headers()["location"]).toBe(`/contar/${pedido.id}/enviado`);
  }

  const { data: despues } = await supabase
    .from("regalos")
    .select("id, slug, contenido, estado")
    .eq("id", regaloId!)
    .single();

  // El contenido cambió...
  expect(JSON.stringify(despues!.contenido)).toContain("Tercera corrección");
  expect(JSON.stringify(despues!.contenido)).not.toContain("Te quiero");
  // ...y el enlace público, no. Ni el regalo, ni su slug, ni la fila de `slugs`.
  expect(despues!.slug).toBe(original!.slug);
  expect(despues!.id).toBe(regaloId);
  expect(despues!.estado).toBe("en_revision");

  const { count: filas } = await supabase
    .from("slugs")
    .select("slug", { count: "exact", head: true })
    .eq("regalo_id", regaloId!);
  expect(filas).toBe(1);

  await borrarPedidoDeTest(pedido.id);
});

test("un regalo ya publicado no admite correcciones", async ({ request }) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido({ estado: "pagado" });
  await cargarMinimo(request, pedido.id);
  await enviarHistoria(request, pedido.id);

  const { regaloId } = await leerBorrador(request, pedido.id);

  // El comprador aprueba: a partir de acá lo entregado es inmutable (Principio VI).
  await supabase
    .from("regalos")
    .update({ estado: "publicado", aprobado_en: new Date().toISOString() })
    .eq("id", regaloId!);

  const guardado = await guardarPaso(request, pedido.id, "carta", { carta_texto: "Tarde." });
  expect(guardado.status()).toBe(409);

  const envio = await enviarHistoria(request, pedido.id);
  expect(envio.status()).toBe(409);

  const { data: regalo } = await supabase
    .from("regalos")
    .select("contenido")
    .eq("id", regaloId!)
    .single();
  expect(JSON.stringify(regalo!.contenido)).toContain("Te quiero");
  expect(JSON.stringify(regalo!.contenido)).not.toContain("Tarde");

  await borrarPedidoDeTest(pedido.id);
});

test("la historia enviada llega al regalo con los ocho tipos de bloque del motor", async ({
  request,
  page,
}) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido({ estado: "pagado" });

  await guardarPaso(request, pedido.id, "destinatario", {
    nombre: "Ana",
    subtitulo: "para vos",
    tema: "nocturno",
    fecha_inicio: "2024-02-14",
  });
  await guardarPaso(request, pedido.id, "momentos", {
    momento_titulo: "Primer viaje",
    momento_texto: "El día que nos escapamos.",
    momento_fecha: "2024-06-01",
  });
  await guardarPaso(request, pedido.id, "cancion", {
    cancion_url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    cancion_titulo: "Una canción",
  });
  await guardarPaso(request, pedido.id, "carta", { carta_texto: "Una carta entera." });
  await guardarPaso(request, pedido.id, "preguntas", {
    pregunta_texto: "¿Te casás conmigo?",
    pregunta_respuesta: "Sí",
  });
  await guardarPaso(request, pedido.id, "cierre", { cierre_texto: "Fin." });

  expect((await leerBorrador(request, pedido.id)).faltantes).toEqual([]);
  await enviarHistoria(request, pedido.id);

  const { regaloId } = await leerBorrador(request, pedido.id);
  const { data: regalo } = await supabase
    .from("regalos")
    .select("slug, tema, contenido")
    .eq("id", regaloId!)
    .single();

  const contenido = regalo!.contenido as { v: number; receta: { tipo: string }[] };
  expect(contenido.v).toBe(1);
  // El tema va a la columna del regalo, no a la receta.
  expect(regalo!.tema).toBe("nocturno");
  expect(JSON.stringify(contenido)).not.toContain('"tema"');

  expect(contenido.receta.map((b) => b.tipo)).toEqual([
    "portada",
    "contador",
    "momento",
    "cancion",
    "carta",
    "pregunta",
    "cierre",
  ]);

  // Y el motor de la feature 001 lo renderiza sin saber de dónde vino.
  await supabase
    .from("regalos")
    .update({ estado: "publicado", aprobado_en: new Date().toISOString() })
    .eq("id", regaloId!);

  await page.goto(`/r/${regalo!.slug}`);
  await expect(page.locator("body")).toContainText("Ana");

  await borrarPedidoDeTest(pedido.id);
});
