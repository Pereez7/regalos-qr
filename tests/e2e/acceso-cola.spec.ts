import { test, expect } from "@playwright/test";

test.describe.configure({ timeout: 120_000 });

// La puerta de la cola operativa. Lo que se cuida acá no es la comodidad de entrar: es que
// la credencial que abre los datos de los compradores no quede dando vueltas.

test("la clave correcta deja entrar, y la cookie no es el secreto", async ({ page, context }) => {
  // Sin credencial, la cola no existe para nadie.
  const sinNada = await page.goto("/pedidos");
  expect(sinNada!.status()).toBe(404);

  await page.goto("/acceso-cola");
  await page.fill("#clave", process.env.OPS_SECRET!);
  await page.click("[data-form-acceso] button");

  await expect(page).toHaveURL(/\/pedidos$/);
  await expect(page.locator("h1")).toContainText("Cola operativa");

  // Y después entra sin la clave en la dirección: la cookie ya está puesta.
  const conCookie = await page.goto("/pedidos");
  expect(conCookie!.status()).toBe(200);

  const cookies = await context.cookies();
  const cookie = cookies.find((c) => c.name === "acceso_ops")!;

  // Lo guardado es un token DERIVADO: una cookie filtrada no entrega la credencial con la
  // que se borran pedidos por API.
  expect(cookie.value).not.toBe(process.env.OPS_SECRET);
  expect(cookie.httpOnly).toBe(true);
  // 30 días, no la sesión del navegador.
  expect(cookie.expires).toBeGreaterThan(Date.now() / 1000 + 29 * 24 * 60 * 60);

  // Y el secreto sigue sirviendo para la API, que no usa cookies.
  const porApi = await page.request.delete(
    "/api/pedidos/00000000-0000-0000-0000-000000000000/eliminar",
    {
      headers: {
        Authorization: `Bearer ${process.env.OPS_SECRET}`,
        "Content-Type": "application/json",
      },
    },
  );
  expect(porApi.status()).toBe(404); // autenticó; ese pedido no existe
});

test("una clave incorrecta no abre nada y lo dice", async ({ page, context }) => {
  const respuesta = await page.goto("/acceso-cola");
  expect(respuesta!.status()).toBe(200);

  await page.fill("#clave", "no-es-la-clave");
  await page.click("[data-form-acceso] button");

  await expect(page.locator("[data-error]")).toBeVisible();
  await expect(page).toHaveURL(/\/acceso-cola$/);

  expect((await context.cookies()).some((c) => c.name === "acceso_ops")).toBe(false);

  const cola = await page.goto("/pedidos");
  expect(cola!.status()).toBe(404);
});

test("salir cierra la sesión en ese navegador", async ({ page, context }) => {
  await page.goto("/acceso-cola");
  await page.fill("#clave", process.env.OPS_SECRET!);
  await page.click("[data-form-acceso] button");
  await expect(page).toHaveURL(/\/pedidos$/);

  await page.click("[data-salir]");
  await expect(page).toHaveURL(/\/acceso-cola$/);

  expect((await context.cookies()).some((c) => c.name === "acceso_ops")).toBe(false);

  const cola = await page.goto("/pedidos");
  expect(cola!.status()).toBe(404);
});

test("salir es POST: un GET no saca a nadie de la cola", async ({ page, context }) => {
  await page.goto("/acceso-cola");
  await page.fill("#clave", process.env.OPS_SECRET!);
  await page.click("[data-form-acceso] button");

  // Un precargador de enlaces hace GET. Si eso cerrara la sesión, el navegador podría
  // sacarte de la cola por adelantar una página.
  await page.goto("/salir-cola");
  await expect(page).toHaveURL(/\/pedidos$/);

  expect((await context.cookies()).some((c) => c.name === "acceso_ops")).toBe(true);
});
