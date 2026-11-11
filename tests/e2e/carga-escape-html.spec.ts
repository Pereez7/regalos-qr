import { test, expect } from "@playwright/test";
import { crearPedido, borrarPedidoDeTest } from "./utils/crear-pedido.ts";
import { clienteDeTest } from "./utils/crear-regalo.ts";
import { enviarHistoria, guardarPaso, leerBorrador } from "./utils/cargar-historia.ts";

test.describe.configure({ timeout: 120_000 });

// FR-017: todo texto del comprador se guarda y se muestra como texto literal, en la carga y
// en el regalo. El escape es del renderer; al guardar no se sanea ni se recorta nada.

const PELIGROSO = '<script>alert("x")</script> & <b>negrita</b>';

test("texto con etiquetas HTML se guarda literal y se muestra literal", async ({
  request,
  page,
}) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido({ estado: "pagado" });

  await guardarPaso(request, pedido.id, "destinatario", { nombre: PELIGROSO, tema: "papel" });
  await guardarPaso(request, pedido.id, "carta", { carta_texto: `Querida ${PELIGROSO}` });

  // Guardado tal cual: ni etiquetas eliminadas, ni entidades escapadas en la base.
  const { borrador } = await leerBorrador(request, pedido.id);
  expect(borrador.destinatario.nombre).toBe(PELIGROSO);
  expect(borrador.carta.texto).toContain("<b>negrita</b>");

  // Y en la propia carga se ve como texto, no interpretado.
  await page.goto(`/contar/${pedido.id}/carta`);
  await expect(page.locator('textarea[name="carta_texto"]')).toHaveValue(
    `Querida ${PELIGROSO}`,
  );
  expect(await page.locator("b").count()).toBe(0);

  await enviarHistoria(request, pedido.id);
  const { regaloId } = await leerBorrador(request, pedido.id);

  await supabase
    .from("regalos")
    .update({ estado: "publicado", aprobado_en: new Date().toISOString() })
    .eq("id", regaloId!);

  const { data: regalo } = await supabase
    .from("regalos")
    .select("slug")
    .eq("id", regaloId!)
    .single();

  let huboAlerta = false;
  page.on("dialog", async (dialogo) => {
    huboAlerta = true;
    await dialogo.dismiss();
  });

  await page.goto(`/r/${regalo!.slug}`);
  await expect(page.locator("body")).toContainText("<b>negrita</b>");
  expect(huboAlerta).toBe(false);
  expect(await page.locator("body b").count()).toBe(0);

  await borrarPedidoDeTest(pedido.id);
});

test("una carta larga y un nombre con emoji llegan enteros al regalo", async ({ request }) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido({ estado: "pagado" });

  const carta = "Te quiero. ".repeat(360).trim();
  expect(carta.length).toBeGreaterThan(3900);

  await guardarPaso(request, pedido.id, "destinatario", { nombre: "Ana 🌙✨", tema: "nocturno" });
  await guardarPaso(request, pedido.id, "carta", { carta_texto: carta });
  await enviarHistoria(request, pedido.id);

  const { regaloId } = await leerBorrador(request, pedido.id);
  const { data: regalo } = await supabase
    .from("regalos")
    .select("contenido")
    .eq("id", regaloId!)
    .single();

  const contenido = regalo!.contenido as {
    receta: { tipo: string; texto?: string; nombreDestinatario?: string }[];
  };
  const portada = contenido.receta.find((b) => b.tipo === "portada");
  const bloqueCarta = contenido.receta.find((b) => b.tipo === "carta");

  expect(portada!.nombreDestinatario).toBe("Ana 🌙✨");
  // Sin recortes: la carta llega completa, carácter por carácter.
  expect(bloqueCarta!.texto).toBe(carta);

  await borrarPedidoDeTest(pedido.id);
});
