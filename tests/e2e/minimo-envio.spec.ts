import { test, expect } from "@playwright/test";
import { crearPedido, borrarPedidoDeTest } from "./utils/crear-pedido.ts";
import { clienteDeTest } from "./utils/crear-regalo.ts";
import { enviarHistoria, guardarPaso, leerBorrador } from "./utils/cargar-historia.ts";

test.describe.configure({ timeout: 120_000 });

// FR-011 y research.md #21: el mínimo es tema + nombre del destinatario + al menos un
// bloque de contenido. Deliberadamente bajo —el motor acepta recetas con cualquier cantidad
// de bloques— pero nunca vacío: un regalo sin un solo bloque es una página en blanco, y eso
// el Principio I lo declara defecto bloqueante.

test("una historia vacía no se puede enviar y el sistema dice qué falta", async ({
  request,
  page,
}) => {
  const pedido = await crearPedido({ estado: "pagado" });

  const vacio = await leerBorrador(request, pedido.id);
  expect(vacio.faltantes).toHaveLength(3);
  // En lenguaje del comprador, nunca en nombres de campo.
  expect(vacio.faltantes.join(" ")).toContain("nombre de quien recibe");
  expect(vacio.faltantes.join(" ")).not.toContain("destinatario.nombre");

  const envio = await enviarHistoria(request, pedido.id);
  expect(envio.status()).toBe(303);
  expect(envio.headers()["location"]).toBe(`/contar/${pedido.id}/resumen`);
  expect((await leerBorrador(request, pedido.id)).regaloId).toBeNull();

  // Y la página de resumen los recalcula en cada visita, sin mensaje de un solo uso.
  await page.goto(`/contar/${pedido.id}/resumen`);
  await expect(page.locator("[data-faltantes] li")).toHaveCount(3);
  await page.reload();
  await expect(page.locator("[data-faltantes] li")).toHaveCount(3);

  await borrarPedidoDeTest(pedido.id);
});

test("con tema, nombre y un solo bloque la historia se envía", async ({ request }) => {
  const pedido = await crearPedido({ estado: "pagado" });

  await guardarPaso(request, pedido.id, "destinatario", { nombre: "Ana", tema: "papel" });
  // Falta el bloque de contenido: sigue sin poder enviarse.
  expect((await leerBorrador(request, pedido.id)).faltantes).toHaveLength(1);

  // Un cierre solo alcanza. No hace falta ni un momento, ni fotos, ni canción.
  await guardarPaso(request, pedido.id, "cierre", { cierre_texto: "Fin." });
  expect((await leerBorrador(request, pedido.id)).faltantes).toEqual([]);

  const envio = await enviarHistoria(request, pedido.id);
  expect(envio.headers()["location"]).toBe(`/contar/${pedido.id}/enviado`);
  expect((await leerBorrador(request, pedido.id)).regaloId).not.toBeNull();

  await borrarPedidoDeTest(pedido.id);
});

test("una canción fuera de la lista blanca es un faltante, no un bloque que desaparece", async ({
  request,
}) => {
  const pedido = await crearPedido({ estado: "pagado" });

  await guardarPaso(request, pedido.id, "destinatario", { nombre: "Ana", tema: "papel" });
  await guardarPaso(request, pedido.id, "carta", { carta_texto: "Una carta." });
  await guardarPaso(request, pedido.id, "cancion", {
    cancion_url: "https://ejemplo.test/una-cancion.mp3",
  });

  // El motor la omitiría en silencio al renderizar, y el comprador recibiría un regalo sin
  // su canción sin que nadie se lo diga. Acá se dice.
  const { faltantes } = await leerBorrador(request, pedido.id);
  expect(faltantes.join(" ")).toContain("canción");
  expect((await enviarHistoria(request, pedido.id)).headers()["location"]).toBe(
    `/contar/${pedido.id}/resumen`,
  );

  await guardarPaso(request, pedido.id, "cancion", {
    cancion_url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
  });
  expect((await leerBorrador(request, pedido.id)).faltantes).toEqual([]);

  await borrarPedidoDeTest(pedido.id);
});

test("un regalo nunca nace publicado ni con faltantes", async ({ request }) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido({ estado: "pagado" });

  await guardarPaso(request, pedido.id, "destinatario", { nombre: "Ana", tema: "luminoso" });
  await guardarPaso(request, pedido.id, "carta", { carta_texto: "Una carta." });
  await enviarHistoria(request, pedido.id);

  const { regaloId } = await leerBorrador(request, pedido.id);
  const { data: regalo } = await supabase
    .from("regalos")
    .select("estado, aprobado_en, vencimiento")
    .eq("id", regaloId!)
    .single();

  expect(regalo!.estado).toBe("en_revision");
  expect(regalo!.aprobado_en).toBeNull();
  // Los regalos nacen con vigencia permanente (Assumptions).
  expect(regalo!.vencimiento).toBeNull();

  await borrarPedidoDeTest(pedido.id);
});
