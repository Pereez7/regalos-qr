import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { crearPedido } from "./utils/crear-pedido.ts";
import { clienteDeTest } from "./utils/crear-regalo.ts";

// Timeout propio: estos tests hacen muchas idas y vueltas contra el Supabase remoto (crear
// pedidos, 12 entregas del mismo aviso, verificar filas), y cada una paga la latencia de red.
// El default de 30 s alcanza para la feature 001, que es casi todo render local.
test.describe.configure({ timeout: 120_000 });

// FR-003 y FR-031: el id del pedido es la única credencial, y conocer la propia no da
// acceso a ninguna otra. Nada enumerable, nada secuencial, sin índice por correo.

test("el enlace de un pedido no da acceso al estado de otro", async ({ page }) => {
  const supabase = clienteDeTest();
  const mio = await crearPedido({ estado: "pagado", email: "mio@ejemplo.test" });
  const ajeno = await crearPedido({ estado: "iniciado", email: "ajeno@ejemplo.test" });

  const respuestaMia = await page.goto(`/gracias/${mio.id}`);
  expect(respuestaMia!.status()).toBe(200);

  const html = await page.content();
  // Veo lo mío...
  expect(html).toContain(mio.email);
  // ...y nada del ajeno: ni su correo, ni su id, ni su estado.
  expect(html).not.toContain(ajeno.email);
  expect(html).not.toContain(ajeno.id);

  await supabase.from("pedidos").delete().eq("id", mio.id);
  await supabase.from("pedidos").delete().eq("id", ajeno.id);
});

test("un id de pedido inexistente o manipulado no revela nada", async ({ page }) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido({ estado: "pagado" });

  // Un UUID válido que no es de nadie.
  const inexistente = await page.goto(`/gracias/${randomUUID()}`);
  expect(inexistente!.status()).toBe(404);

  // El id propio con un carácter cambiado: sigue siendo un UUID bien formado.
  const ultimo = pedido.id.slice(-1);
  const manipulado = pedido.id.slice(0, -1) + (ultimo === "a" ? "b" : "a");
  const respuestaManipulada = await page.goto(`/gracias/${manipulado}`);
  expect(respuestaManipulada!.status()).toBe(404);

  // Algo que no tiene forma de UUID: 404, no un error del servidor.
  const basura = await page.goto("/gracias/no-soy-un-uuid");
  expect(basura!.status()).toBe(404);

  await supabase.from("pedidos").delete().eq("id", pedido.id);
});

test("el token de baja no sirve como credencial del pedido, ni al revés", async ({ page }) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido({ estado: "pagado", celular: "+5491100000000" });

  // El token viaja dentro de mensajes publicitarios: si abriera el pedido, cada mensaje
  // sería una filtración de la credencial (research.md #13).
  expect(pedido.tokenBaja).not.toBe(pedido.id);
  const conToken = await page.goto(`/gracias/${pedido.tokenBaja}`);
  expect(conToken!.status()).toBe(404);

  await supabase.from("pedidos").delete().eq("id", pedido.id);
});
