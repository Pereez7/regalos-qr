import { test, expect } from "@playwright/test";
import { crearPedido, borrarPedidoDeTest } from "./utils/crear-pedido.ts";
import { guardarPaso, leerBorrador } from "./utils/cargar-historia.ts";

// Timeout propio: cada paso guardado es una ida y vuelta al Supabase remoto.
test.describe.configure({ timeout: 120_000 });

// FR-010 y SC-004: el comprador YA PAGÓ. Es el peor momento del producto para perder datos.
// Un paso = una petición guardada (research.md #8): quien cierra la pestaña ya tiene
// guardado todo lo anterior, sin una línea de JavaScript.

test("tres pasos cargados sobreviven a cerrar el navegador", async ({ browser, request }) => {
  const pedido = await crearPedido({ estado: "pagado" });

  // Primera sesión: tres pasos, cada uno su propia petición.
  const primera = await browser.newContext({ baseURL: "http://localhost:4321" });
  const pagina = await primera.newPage();

  await pagina.goto(`/contar/${pedido.id}/destinatario`);
  await pagina.fill("#nombre", "Ana");
  await pagina.check('input[name="tema"][value="papel"]');
  await pagina.click("button[type=submit]");
  await expect(pagina).toHaveURL(new RegExp(`/contar/${pedido.id}/momentos$`));

  await pagina.fill('textarea[name="momento_texto"] >> nth=0', "El día que nos conocimos.");
  await pagina.click("button[type=submit]");
  await expect(pagina).toHaveURL(new RegExp(`/contar/${pedido.id}/fotos$`));

  await pagina.goto(`/contar/${pedido.id}/carta`);
  await pagina.fill('textarea[name="carta_texto"]', "Una carta de prueba, con tildes y ñ.");
  await pagina.click("button[type=submit]");

  // Se cierra el navegador entero: no queda cookie, ni sesión, ni storage local.
  await primera.close();

  // Segunda sesión, horas después en la vida real: el mismo enlace y nada perdido.
  const segunda = await browser.newContext({ baseURL: "http://localhost:4321" });
  const otraPagina = await segunda.newPage();
  await otraPagina.goto(`/contar/${pedido.id}/destinatario`);
  await expect(otraPagina.locator("#nombre")).toHaveValue("Ana");
  await expect(otraPagina.locator('input[name="tema"][value="papel"]')).toBeChecked();

  await otraPagina.goto(`/contar/${pedido.id}/momentos`);
  await expect(otraPagina.locator('textarea[name="momento_texto"] >> nth=0')).toHaveValue(
    "El día que nos conocimos.",
  );

  await otraPagina.goto(`/contar/${pedido.id}/carta`);
  await expect(otraPagina.locator('textarea[name="carta_texto"]')).toHaveValue(
    "Una carta de prueba, con tildes y ñ.",
  );
  await segunda.close();

  // Y el documento guardado tiene las tres ramas, cada una escrita por su paso.
  const { borrador } = await leerBorrador(request, pedido.id);
  expect(borrador.destinatario.nombre).toBe("Ana");
  expect(borrador.tema).toBe("papel");
  expect(borrador.momentos).toHaveLength(1);
  expect(borrador.carta.texto).toContain("tildes");

  await borrarPedidoDeTest(pedido.id);
});

test("guardar un paso no pisa lo que guardó otro, ni 30 recargas lo duplican", async ({
  request,
}) => {
  const pedido = await crearPedido({ estado: "pagado" });

  await guardarPaso(request, pedido.id, "destinatario", { nombre: "Ana", tema: "nocturno" });
  await guardarPaso(request, pedido.id, "momentos", { momento_texto: "Un momento." });
  await guardarPaso(request, pedido.id, "carta", { carta_texto: "Una carta." });

  // Reenviar el formulario viejo del primer paso —una pestaña que quedó abierta— no puede
  // borrar los pasos posteriores: se escribe la rama, no el documento.
  await guardarPaso(request, pedido.id, "destinatario", { nombre: "Ana María", tema: "papel" });

  const despues = await leerBorrador(request, pedido.id);
  expect(despues.borrador.destinatario.nombre).toBe("Ana María");
  expect(despues.borrador.momentos).toHaveLength(1);
  expect(despues.borrador.carta.texto).toBe("Una carta.");

  // 30 recargas del mismo paso: el borrador no se corrompe ni se duplica.
  for (let i = 0; i < 30; i++) {
    await guardarPaso(request, pedido.id, "momentos", { momento_texto: "Un momento." });
  }

  const final = await leerBorrador(request, pedido.id);
  expect(final.borrador.momentos).toHaveLength(1);
  expect(final.borrador.carta.texto).toBe("Una carta.");
  expect(final.regaloId).toBeNull();

  await borrarPedidoDeTest(pedido.id);
});

test("la carga funciona completa con JavaScript deshabilitado", async ({ browser, request }) => {
  const pedido = await crearPedido({ estado: "pagado" });

  const contexto = await browser.newContext({
    baseURL: "http://localhost:4321",
    javaScriptEnabled: false,
  });
  const pagina = await contexto.newPage();

  await pagina.goto(`/contar/${pedido.id}/destinatario`);
  await pagina.fill("#nombre", "Sin JavaScript");
  await pagina.check('input[name="tema"][value="luminoso"]');
  await pagina.click("button[type=submit]");
  await expect(pagina).toHaveURL(new RegExp(`/contar/${pedido.id}/momentos$`));

  await pagina.goto(`/contar/${pedido.id}/cierre`);
  await pagina.fill('textarea[name="cierre_texto"]', "Fin.");
  await pagina.click("button[type=submit]");
  await expect(pagina).toHaveURL(new RegExp(`/contar/${pedido.id}/resumen$`));

  // Y el resumen, sin JavaScript, dice que ya se puede enviar.
  await expect(pagina.locator("[data-listo]")).toBeVisible();
  await contexto.close();

  const { borrador, faltantes } = await leerBorrador(request, pedido.id);
  expect(borrador.destinatario.nombre).toBe("Sin JavaScript");
  expect(borrador.cierre.texto).toBe("Fin.");
  expect(faltantes).toEqual([]);

  await borrarPedidoDeTest(pedido.id);
});

test("un pedido sin pagar no abre la carga, y un paso inexistente no escribe nada", async ({
  request,
}) => {
  const sinPagar = await crearPedido({ estado: "iniciado" });

  const respuesta = await guardarPaso(request, sinPagar.id, "destinatario", { nombre: "Ana" });
  expect(respuesta.status()).toBe(409);

  const pagado = await crearPedido({ estado: "pagado" });
  await guardarPaso(request, pagado.id, "destinatario", { nombre: "Ana" });

  const pasoInventado = await guardarPaso(request, pagado.id, "inventado", { nombre: "Otro" });
  expect(pasoInventado.status()).toBe(404);

  const { borrador } = await leerBorrador(request, pagado.id);
  expect(borrador.destinatario.nombre).toBe("Ana");

  await borrarPedidoDeTest(sinPagar.id);
  await borrarPedidoDeTest(pagado.id);
});

test("un campo por encima de su tope se rechaza con 422 y no toca el resto", async ({
  request,
}) => {
  const pedido = await crearPedido({ estado: "pagado" });
  await guardarPaso(request, pedido.id, "destinatario", { nombre: "Ana", tema: "papel" });

  const largo = "a".repeat(200);
  const respuesta = await guardarPaso(request, pedido.id, "destinatario", { nombre: largo });
  expect(respuesta.status()).toBe(422);
  expect(await respuesta.text()).toContain("nombre");

  const { borrador } = await leerBorrador(request, pedido.id);
  expect(borrador.destinatario.nombre).toBe("Ana");

  // Un tema fuera del enum tampoco es guardable: el check de `regalos.tema` no lo admitiría.
  const temaInvalido = await guardarPaso(request, pedido.id, "destinatario", {
    nombre: "Ana",
    tema: "neón",
  });
  expect(temaInvalido.status()).toBe(422);

  await borrarPedidoDeTest(pedido.id);
});
