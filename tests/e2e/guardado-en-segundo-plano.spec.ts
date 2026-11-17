import { test, expect } from "@playwright/test";
import { crearPedido, borrarPedidoDeTest } from "./utils/crear-pedido.ts";
import { leerBorrador } from "./utils/cargar-historia.ts";

test.describe.configure({ timeout: 120_000 });

// El paso se guarda solo mientras la persona escribe, para que apretar "Guardar y seguir" no
// tenga nada que esperar. Lo que estos tests cuidan es que la velocidad no se pague con
// datos perdidos: el atajo rápido solo existe cuando ya está todo guardado.

test("lo escrito se guarda solo, sin apretar nada", async ({ page, request }) => {
  const pedido = await crearPedido({ estado: "pagado" });

  await page.goto(`/contar/${pedido.id}/carta`);
  await page.fill("#carta_texto", "Esto se guarda sin que yo apriete nada.");

  // El rótulo lo cuenta, para que nadie tenga que adivinar si su texto está a salvo.
  await expect(page.locator("[data-estado-guardado]")).toHaveText("Guardando…", {
    timeout: 4000,
  });
  await expect(page.locator("[data-estado-guardado]")).toHaveText("Guardado", {
    timeout: 10_000,
  });

  const { borrador } = await leerBorrador(request, pedido.id);
  expect(borrador.carta.texto).toBe("Esto se guarda sin que yo apriete nada.");

  await borrarPedidoDeTest(pedido.id);
});

test("con todo guardado, pasar de paso no vuelve a guardar", async ({ page }) => {
  const pedido = await crearPedido({ estado: "pagado" });

  await page.goto(`/contar/${pedido.id}/carta`);
  await page.fill("#carta_texto", "Una carta.");
  await expect(page.locator("[data-estado-guardado]")).toHaveText("Guardado", {
    timeout: 10_000,
  });

  // A partir de acá, apretar el botón no debería mandar NINGÚN guardado más: ya está hecho.
  let guardadosDeMas = 0;
  page.on("request", (peticion) => {
    if (peticion.method() === "POST" && peticion.url().includes("/borrador")) guardadosDeMas++;
  });

  await page.click("button[type=submit]");
  await expect(page).toHaveURL(new RegExp(`/contar/${pedido.id}/preguntas$`));
  expect(guardadosDeMas).toBe(0);

  await borrarPedidoDeTest(pedido.id);
});

test("si todavía no se guardó, el formulario viaja como siempre y no se pierde nada", async ({
  page,
  request,
}) => {
  const pedido = await crearPedido({ estado: "pagado" });

  await page.goto(`/contar/${pedido.id}/cierre`);
  await page.fill("#cierre_texto", "Escribo y aprieto en el acto.");

  // Sin esperar al guardado automático: el clic inmediato tiene que seguir el camino de
  // siempre —una navegación que el navegador no puede cancelar— en vez del atajo.
  await page.click("button[type=submit]");
  await expect(page).toHaveURL(new RegExp(`/contar/${pedido.id}/resumen$`));

  const { borrador } = await leerBorrador(request, pedido.id);
  expect(borrador.cierre.texto).toBe("Escribo y aprieto en el acto.");

  await borrarPedidoDeTest(pedido.id);
});

test("sin JavaScript no hay guardado automático, pero no se pierde nada", async ({
  browser,
  request,
}) => {
  const pedido = await crearPedido({ estado: "pagado" });

  const contexto = await browser.newContext({
    baseURL: "http://localhost:4321",
    javaScriptEnabled: false,
  });
  const pagina = await contexto.newPage();

  await pagina.goto(`/contar/${pedido.id}/carta`);
  await pagina.fill("#carta_texto", "Sin JavaScript también se guarda.");
  await pagina.click("button[type=submit]");
  await expect(pagina).toHaveURL(new RegExp(`/contar/${pedido.id}/preguntas$`));

  const { borrador } = await leerBorrador(request, pedido.id);
  expect(borrador.carta.texto).toBe("Sin JavaScript también se guarda.");

  await contexto.close();
  await borrarPedidoDeTest(pedido.id);
});
