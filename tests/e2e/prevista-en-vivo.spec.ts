import { test, expect } from "@playwright/test";
import { crearPedido, borrarPedidoDeTest } from "./utils/crear-pedido.ts";
import { guardarPaso } from "./utils/cargar-historia.ts";

test.describe.configure({ timeout: 120_000 });

// La vista previa dibuja con LOS MISMOS componentes del motor que el regalo real. Lo que
// estos tests cuidan es justamente eso: que no haya un segundo render que pueda divergir, y
// que lo que se ve mientras se carga sea lo que se va a entregar (Principio VI).

test("la vista previa muestra el regalo con los bloques del motor", async ({ page, request }) => {
  const pedido = await crearPedido({ estado: "pagado" });

  await guardarPaso(request, pedido.id, "destinatario", {
    nombre: "Ana",
    subtitulo: "para vos",
    tema: "nocturno",
    fecha_inicio: "2024-02-14",
  });
  await guardarPaso(request, pedido.id, "carta", { carta_texto: "Una carta de prueba." });

  await page.goto(`/contar/${pedido.id}/carta`);

  const prevista = page.locator("[data-prevista]");
  await expect(prevista).toHaveCount(1);

  // Son los bloques del motor, no una maqueta: el marcado es el mismo que sirve /r/[slug].
  await expect(prevista.locator('[data-bloque="portada"] h1')).toHaveText("Ana");
  await expect(prevista.locator('[data-bloque="contador"]')).toHaveCount(1);
  await expect(prevista.locator('[data-bloque="carta"]')).toContainText("Una carta de prueba.");

  // Y el clima visual elegido es el que se aplica.
  await expect(prevista).toHaveAttribute("data-tema", "nocturno");

  await borrarPedidoDeTest(pedido.id);
});

test("escribir actualiza la vista previa antes de guardar", async ({ page, request }) => {
  const pedido = await crearPedido({ estado: "pagado" });
  await guardarPaso(request, pedido.id, "destinatario", { nombre: "Ana", tema: "papel" });

  await page.goto(`/contar/${pedido.id}/destinatario`);
  await page.fill("#nombre", "Valentina");

  await expect(page.locator('[data-prevista] [data-bloque="portada"] h1')).toHaveText(
    "Valentina",
  );
  await expect(page.locator("[data-nombre-prevista]")).toContainText("Valentina");

  // Pero NO se guardó: escribir no es guardar, y al volver sin enviar el formulario el
  // borrador sigue como estaba.
  await page.goto(`/contar/${pedido.id}/destinatario`);
  await expect(page.locator("#nombre")).toHaveValue("Ana");

  await borrarPedidoDeTest(pedido.id);
});

test("sin JavaScript la vista previa se ve igual: la dibuja el servidor", async ({
  browser,
  request,
}) => {
  const pedido = await crearPedido({ estado: "pagado" });
  await guardarPaso(request, pedido.id, "destinatario", { nombre: "Ana", tema: "luminoso" });
  await guardarPaso(request, pedido.id, "cierre", { cierre_texto: "Fin." });

  const contexto = await browser.newContext({
    baseURL: "http://localhost:4321",
    javaScriptEnabled: false,
  });
  const pagina = await contexto.newPage();
  await pagina.goto(`/contar/${pedido.id}/cierre`);

  await expect(pagina.locator('[data-prevista] [data-bloque="portada"] h1')).toHaveText("Ana");
  await expect(pagina.locator('[data-prevista] [data-bloque="cierre"]')).toContainText("Fin.");

  await contexto.close();
  await borrarPedidoDeTest(pedido.id);
});

test("la vista en grande es la misma, sin el formulario al lado", async ({ page, request }) => {
  const pedido = await crearPedido({ estado: "pagado" });
  await guardarPaso(request, pedido.id, "destinatario", { nombre: "Ana", tema: "papel" });
  await guardarPaso(request, pedido.id, "carta", { carta_texto: "Una carta." });

  await page.goto(`/contar/${pedido.id}/prevista`);

  await expect(page.locator('[data-prevista] [data-bloque="portada"] h1')).toHaveText("Ana");
  await expect(page.locator('[data-prevista] [data-bloque="carta"]')).toContainText("Una carta.");
  // Es solo para mirar: no hay nada que completar acá.
  await expect(page.locator("[data-form-enviar]")).toHaveCount(0);

  await borrarPedidoDeTest(pedido.id);
});

test("un pedido sin pagar no tiene vista previa que mostrar", async ({ page }) => {
  const pedido = await crearPedido({ estado: "iniciado" });

  await page.goto(`/contar/${pedido.id}/destinatario`);
  await expect(page.locator("[data-prevista]")).toHaveCount(0);

  await borrarPedidoDeTest(pedido.id);
});
