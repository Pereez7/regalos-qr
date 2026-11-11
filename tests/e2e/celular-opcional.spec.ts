import { test, expect } from "@playwright/test";
import { crearPedido, borrarPedidoDeTest } from "./utils/crear-pedido.ts";
import { clienteDeTest } from "./utils/crear-regalo.ts";
import { postFormulario } from "./utils/cargar-historia.ts";

test.describe.configure({ timeout: 120_000 });

// FR-035, FR-036, SC-016 y la excepción publicitaria acotada del Principio V
// (constitución v1.3.0, Compuerta 17).

test("la compra se completa sin dar celular, diez de diez veces", async ({ request }) => {
  const supabase = clienteDeTest();
  const creados: string[] = [];

  for (let i = 0; i < 10; i++) {
    const respuesta = await postFormulario(request, "/comprar", {
      email: `sin-celular-${i}@ejemplo.test`,
    });
    expect(respuesta.status()).toBe(303);
    const id = respuesta.headers()["location"].split("/").pop()!;
    creados.push(id);
  }

  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("id, celular, consentimiento_publicidad, consentimiento_en, token_baja")
    .in("id", creados);

  expect(pedidos).toHaveLength(10);
  for (const pedido of pedidos!) {
    expect(pedido.celular).toBeNull();
    expect(pedido.consentimiento_publicidad).toBe(false);
    expect(pedido.consentimiento_en).toBeNull();
    // El token de baja existe igual, con celular o sin él.
    expect((pedido.token_baja as string)).toHaveLength(32);
  }

  for (const id of creados) await borrarPedidoDeTest(id);
});

test("el celular sin la casilla marcada no se guarda, y con la casilla sí", async ({
  request,
}) => {
  const supabase = clienteDeTest();

  const sin = await postFormulario(request, "/comprar", {
    email: "sin-consentimiento@ejemplo.test",
    celular: "+5491111111111",
  });
  const con = await postFormulario(request, "/comprar", {
    email: "con-consentimiento@ejemplo.test",
    celular: "+5492222222222",
    consentimiento_publicidad: "si",
  });

  const idSin = sin.headers()["location"].split("/").pop()!;
  const idCon = con.headers()["location"].split("/").pop()!;

  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("id, celular, consentimiento_publicidad, consentimiento_en")
    .in("id", [idSin, idCon]);

  const pedidoSin = pedidos!.find((p) => p.id === idSin)!;
  const pedidoCon = pedidos!.find((p) => p.id === idCon)!;

  // El consentimiento nunca se deduce de la presencia del número.
  expect(pedidoSin.celular).toBeNull();
  expect(pedidoSin.consentimiento_publicidad).toBe(false);

  expect(pedidoCon.celular).toBe("+5492222222222");
  expect(pedidoCon.consentimiento_publicidad).toBe(true);
  expect(pedidoCon.consentimiento_en).not.toBeNull();

  await borrarPedidoDeTest(idSin);
  await borrarPedidoDeTest(idCon);
});

test("la baja borra el número en vez de marcarlo, y es idempotente", async ({ page }) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido({ estado: "pagado", celular: "+5493333333333" });

  // El token no da acceso al pedido, y la página no muestra el número ni el correo.
  await page.goto(`/baja/${pedido.tokenBaja}`);
  const html = await page.content();
  expect(html).not.toContain("+5493333333333");
  expect(html).not.toContain(pedido.email);

  await page.click("[data-form-baja] button");
  await expect(page.locator("[data-confirmado]")).toBeVisible();

  const { data: despues } = await supabase
    .from("pedidos")
    .select("celular, consentimiento_publicidad, consentimiento_en, baja_publicidad_en")
    .eq("id", pedido.id)
    .single();

  // Borrado, no marcado: no existe ninguna columna donde marcarlo.
  expect(despues!.celular).toBeNull();
  expect(despues!.consentimiento_publicidad).toBe(false);
  // La fecha del consentimiento se conserva: demuestra que existió y, sin número, no
  // identifica a nadie. La de la baja queda como constancia de que se honró.
  expect(despues!.consentimiento_en).not.toBeNull();
  expect(despues!.baja_publicidad_en).not.toBeNull();

  // Repetirla deja el mismo estado y responde igual.
  await page.reload();
  await expect(page.locator("[data-confirmado]")).toBeVisible();

  // Y el pedido sigue en pie: la baja es de la publicidad, no del pedido.
  const { data: sigue } = await supabase
    .from("pedidos")
    .select("id, email, estado")
    .eq("id", pedido.id)
    .single();
  expect(sigue!.estado).toBe("pagado");

  await borrarPedidoDeTest(pedido.id);
});

test("un token de baja inexistente responde 404", async ({ page }) => {
  const respuesta = await page.goto("/baja/00000000000000000000000000000000");
  expect(respuesta!.status()).toBe(404);
});
