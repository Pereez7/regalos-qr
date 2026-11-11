import { test, expect } from "@playwright/test";

test.describe.configure({ timeout: 120_000 });

// La landing tiene JavaScript desde que entró Motion One para los revelados. Lo que este
// test cuida es que ese JavaScript sea una MEJORA y no un requisito: sin él, la página
// tiene que verse entera y poder comprarse igual.
//
// El riesgo concreto es conocido y clásico: ocultar con CSS lo que después revela el
// script. Si alguna vez alguien mueve ese `opacity: 0` del script al CSS, este test falla.

test("sin JavaScript, la landing se ve entera y se puede comprar", async ({ browser }) => {
  const contexto = await browser.newContext({
    baseURL: "http://localhost:4321",
    javaScriptEnabled: false,
  });
  const pagina = await contexto.newPage();

  await pagina.goto("/");

  // Todo lo que el script anima tiene que estar visible igual.
  const secciones = pagina.locator(".entra");
  const cuantas = await secciones.count();
  expect(cuantas).toBeGreaterThan(5);

  for (let i = 0; i < cuantas; i++) {
    await expect(secciones.nth(i)).toBeVisible();
    const opacidad = await secciones.nth(i).evaluate((el) => getComputedStyle(el).opacity);
    expect(opacidad, `sección ${i}`).toBe("1");
  }

  // Y el formulario sigue funcionando: es un <form> plano.
  await expect(pagina.locator("[data-form-comprar]")).toBeVisible();
  await expect(pagina.locator("[data-precio]")).toBeVisible();

  await pagina.fill("#email", "sin-js@ejemplo.test");
  await pagina.click("[data-form-comprar] button[type=submit]");
  await expect(pagina).toHaveURL(/\/(pagar|cobro-simulado)\/[0-9a-f-]{36}$/);

  await contexto.close();
});
