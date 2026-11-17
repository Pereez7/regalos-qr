import { test, expect } from "@playwright/test";

test.describe.configure({ timeout: 120_000 });

// La puerta del panel de pedidos. Lo que se cuida acá no es la comodidad de entrar: es que la
// credencial que abre los datos de los compradores no quede dando vueltas, y que la sesión
// dure una jornada y no un mes.

// Repetido a mano y no importado de src/lib/ops.ts: ese módulo lee `import.meta.env`, que
// no existe en el runtime con el que Playwright corre los tests. Si cambia allá, este número
// tiene que cambiar acá —y el test que lo usa es justamente el que vigila el plazo.
const DURACION_SESION_OPS = 12 * 60 * 60;

const USUARIO = process.env.OPS_USUARIO!;
const PASSWORD = process.env.OPS_PASSWORD!;

async function entrar(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/admin");
  await page.fill("#usuario", USUARIO);
  await page.fill("#password", PASSWORD);
  await page.click("[data-form-acceso] button");
}

test("usuario y contraseña correctos dejan entrar, y la cookie no es la credencial", async ({
  page,
  context,
}) => {
  // Sin credencial, la cola no existe para nadie.
  const sinNada = await page.goto("/pedidos");
  expect(sinNada!.status()).toBe(404);

  await entrar(page);

  await expect(page).toHaveURL(/\/pedidos$/);
  await expect(page.locator("h1")).toContainText("Cola operativa");

  // Y después entra sin escribir nada: la sesión ya está puesta.
  const conCookie = await page.goto("/pedidos");
  expect(conCookie!.status()).toBe(200);

  const cookie = (await context.cookies()).find((c) => c.name === "acceso_ops")!;

  // La cookie es un vencimiento firmado: no lleva adentro la contraseña, ni su hash, ni el
  // secreto de la API. Una filtrada —de un navegador prestado, de una captura— no entrega
  // ninguna credencial.
  expect(cookie.value).not.toContain(PASSWORD);
  expect(cookie.value).not.toContain(process.env.OPS_SECRET!);
  expect(cookie.value).not.toContain(process.env.OPS_PASSWORD_HASH!);
  expect(cookie.httpOnly).toBe(true);

  // 12 horas, no 30 días: el plazo es el de una jornada de trabajo.
  const segundos = cookie.expires - Date.now() / 1000;
  expect(segundos).toBeGreaterThan(DURACION_SESION_OPS - 300);
  expect(segundos).toBeLessThan(DURACION_SESION_OPS + 300);

  // Y el secreto de servidor sigue sirviendo para la API, que no llena formularios.
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

test("la contraseña equivocada no abre nada y lo dice", async ({ page, context }) => {
  const respuesta = await page.goto("/admin");
  expect(respuesta!.status()).toBe(200);

  await page.fill("#usuario", USUARIO);
  await page.fill("#password", "no-es-la-contrasena");
  await page.click("[data-form-acceso] button");

  await expect(page.locator("[data-error]")).toBeVisible();
  await expect(page).toHaveURL(/\/admin$/);

  expect((await context.cookies()).some((c) => c.name === "acceso_ops")).toBe(false);

  const cola = await page.goto("/pedidos");
  expect(cola!.status()).toBe(404);
});

test("el usuario equivocado recibe el mismo mensaje que la contraseña equivocada", async ({
  page,
}) => {
  // Mismo texto a propósito: decir cuál de los dos campos falló le regala la mitad del
  // trabajo a quien esté probando combinaciones.
  await page.goto("/admin");
  await page.fill("#usuario", "otro-usuario");
  await page.fill("#password", PASSWORD);
  await page.click("[data-form-acceso] button");
  const porUsuario = await page.locator("[data-error]").innerText();

  await page.goto("/admin");
  await page.fill("#usuario", USUARIO);
  await page.fill("#password", "otra-contrasena");
  await page.click("[data-form-acceso] button");
  const porPassword = await page.locator("[data-error]").innerText();

  expect(porUsuario).toBe(porPassword);
});

test("una cookie manipulada no estira la sesión", async ({ page, context }) => {
  await entrar(page);
  const original = (await context.cookies()).find((c) => c.name === "acceso_ops")!;

  // El plazo lo decide el servidor: va firmado. Estirarlo a mano rompe la firma.
  const [version, vence, firma] = original.value.split(".");
  const estirado = `${version}.${Number(vence) + 365 * 24 * 60 * 60}.${firma}`;

  await context.clearCookies();
  await context.addCookies([{ ...original, value: estirado }]);

  const cola = await page.goto("/pedidos");
  expect(cola!.status()).toBe(404);
});

test("una sesión vencida no entra", async ({ page, context }) => {
  await entrar(page);
  const original = (await context.cookies()).find((c) => c.name === "acceso_ops")!;

  // Firma legítima, pero emitida para un vencimiento que ya pasó: la que tendría el
  // navegador de alguien que no toca la cola desde ayer.
  const [version, , firma] = original.value.split(".");
  await context.clearCookies();
  await context.addCookies([
    {
      ...original,
      value: `${version}.${Math.floor(Date.now() / 1000) - 60}.${firma}`,
    },
  ]);

  const cola = await page.goto("/pedidos");
  expect(cola!.status()).toBe(404);
});

test("cada visita a la cola renueva el plazo", async ({ page, context }) => {
  await entrar(page);
  const primera = (await context.cookies()).find((c) => c.name === "acceso_ops")!;

  // Un segundo de espera alcanza: el vencimiento se cuenta en segundos, así que si la
  // renovación no ocurriera, la cookie seguiría siendo exactamente la misma cadena.
  await page.waitForTimeout(1500);
  await page.goto("/pedidos");

  const segunda = (await context.cookies()).find((c) => c.name === "acceso_ops")!;
  expect(segunda.value).not.toBe(primera.value);
  expect(segunda.expires).toBeGreaterThan(primera.expires);
});

test("salir cierra la sesión en ese navegador", async ({ page, context }) => {
  await entrar(page);
  await expect(page).toHaveURL(/\/pedidos$/);

  await page.click("[data-salir]");
  await expect(page).toHaveURL(/\/admin$/);

  expect((await context.cookies()).some((c) => c.name === "acceso_ops")).toBe(false);

  const cola = await page.goto("/pedidos");
  expect(cola!.status()).toBe(404);
});

test("salir es POST: un GET no saca a nadie de la cola", async ({ page, context }) => {
  await entrar(page);

  // Un precargador de enlaces hace GET. Si eso cerrara la sesión, el navegador podría
  // sacarte de la cola por adelantar una página.
  await page.goto("/salir-cola");
  await expect(page).toHaveURL(/\/pedidos$/);

  expect((await context.cookies()).some((c) => c.name === "acceso_ops")).toBe(true);
});

test("la dirección vieja sigue llevando a la puerta", async ({ page }) => {
  // `/acceso-cola` quedó en marcadores y en el historial de teléfonos de cuando el
  // formulario vivía ahí.
  await page.goto("/acceso-cola");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator("#usuario")).toBeVisible();
});
