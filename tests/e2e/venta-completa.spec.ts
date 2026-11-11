import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { emitirQr } from "../../src/lib/qr.ts";
import { clienteDeTest } from "./utils/crear-regalo.ts";
import { borrarPedidoDeTest } from "./utils/crear-pedido.ts";
import { fotoDePrueba } from "./utils/foto-de-prueba.ts";

test.describe.configure({ timeout: 300_000 });

// SC-005 y research.md #19: el recorrido entero en un solo test, de la landing al QR.
//
// La simulación de venta tiene que ser un test y no un documento. Un checklist manual se
// rompe en silencio; un test falla. Es el mismo razonamiento que llevó a
// `compatibilidad-versiones.spec.ts` en la feature 001.
//
// La carga de la historia se hace en CONTEXTOS DE NAVEGADOR DISTINTOS, uno por tramo, para
// que el test pruebe lo que promete: que el comprador puede cerrar todo y volver después sin
// haber perdido nada (FR-010, SC-004).

const ORIGEN = "http://localhost:4321";

test("de la landing al QR: el recorrido completo de una venta", async ({ browser }) => {
  const supabase = clienteDeTest();
  const correo = `venta-${randomBytes(4).toString("hex")}@ejemplo.test`;
  let pedidoId = "";

  // ── 1 · El visitante llega, entiende qué se vende y compra ──────────────────────────
  {
    const contexto = await browser.newContext({ baseURL: ORIGEN });
    const pagina = await contexto.newPage();

    await pagina.goto("/");
    // FR-001: el precio, el ejemplo navegable y una sola acción de compra.
    await expect(pagina.locator("[data-precio]")).toBeVisible();
    await expect(pagina.locator("[data-ejemplo]")).toBeVisible();
    await expect(pagina.locator("[data-form-comprar]")).toHaveCount(1);

    await pagina.fill("#email", correo);
    await pagina.click("[data-form-comprar] button[type=submit]");

    // Sale hacia el cobro, con el pedido ya creado: el aviso de pago siempre va a encontrar
    // un pedido esperando (research.md #4). A dónde sale depende del proveedor configurado,
    // y el test recorre EL QUE ESTÉ PUESTO en vez de forzar uno: si mañana se cambia a otro,
    // este test prueba la venta real y no una simulación que ya nadie usa.
    await expect(pagina).toHaveURL(/\/(cobro-simulado|pagar)\/[0-9a-f-]{36}$/);
    pedidoId = pagina.url().split("/").pop()!;
    const conQr = pagina.url().includes("/pagar/");

    const { data: pedido } = await supabase
      .from("pedidos")
      .select("estado, email")
      .eq("id", pedidoId)
      .single();
    expect(pedido!.estado).toBe("iniciado");
    expect(pedido!.email).toBe(correo);

    // ── 2 · Paga ──────────────────────────────────────────────────────────────────────
    if (conQr) {
      // Cobro con QR: el comprador paga desde la app de su banco y declara su comprobante.
      // Declarar no lo deja pagado —eso lo decide el negocio al ver la transferencia—, así
      // que el pedido sigue pendiente hasta que alguien confirma desde la cola.
      await expect(pagina.locator("img")).toBeVisible();
      await pagina.fill("#comprobante", `TRX-${randomBytes(4).toString("hex")}`);
      await pagina.click("[data-form-comprobante] button");
      await expect(pagina.locator("[data-declarado]")).toBeVisible();

      const { data: sinConfirmar } = await supabase
        .from("pedidos")
        .select("estado")
        .eq("id", pedidoId)
        .single();
      expect(sinConfirmar!.estado).toBe("iniciado");

      const cola = await contexto.newPage();
      await cola.goto(`/pedidos?clave=${encodeURIComponent(process.env.OPS_SECRET!)}`);
      await cola.click(`[data-por-confirmar="${pedidoId}"] [data-confirmar]`);
      await cola.close();
    } else {
      await pagina.click("[data-pagar]");
    }

    await pagina.goto(`/gracias/${pedidoId}`);
    await expect(pagina.locator('[data-estado="pagado"]')).toBeVisible();
    await expect(pagina.locator("[data-enlace-carga]")).toBeVisible();

    await contexto.close();
  }

  // ── 3 · Cuenta su historia en tres sesiones distintas ───────────────────────────────
  {
    const contexto = await browser.newContext({ baseURL: ORIGEN });
    const pagina = await contexto.newPage();

    await pagina.goto(`/contar/${pedidoId}/destinatario`);
    await pagina.fill("#nombre", "Ana");
    await pagina.fill("#subtitulo", "para vos");
    await pagina.check('input[name="tema"][value="nocturno"]');
    await pagina.fill("#fecha_inicio", "2024-02-14");
    await pagina.click("button[type=submit]");
    await expect(pagina).toHaveURL(new RegExp(`/contar/${pedidoId}/momentos$`));

    await contexto.close(); // cierra todo y se va
  }

  {
    const contexto = await browser.newContext({ baseURL: ORIGEN });
    const pagina = await contexto.newPage();

    // Vuelve al mismo enlace y encuentra lo de antes.
    await pagina.goto(`/contar/${pedidoId}/destinatario`);
    await expect(pagina.locator("#nombre")).toHaveValue("Ana");

    await pagina.goto(`/contar/${pedidoId}/momentos`);
    await pagina.fill('input[name="momento_titulo"] >> nth=0', "Primer viaje");
    await pagina.fill('textarea[name="momento_texto"] >> nth=0', "El día que nos escapamos.");
    await pagina.click("button[type=submit]");
    await expect(pagina).toHaveURL(new RegExp(`/contar/${pedidoId}/fotos$`));

    // Sube una foto, que es el tramo que más partes toca: sharp, el bucket y el borrador.
    await pagina.setInputFiles("#foto", {
      name: "recuerdo.jpg",
      mimeType: "image/jpeg",
      buffer: await fotoDePrueba({ ancho: 1800, alto: 1200, conUbicacion: true }),
    });
    await pagina.fill("#alt", "Los dos en el aeropuerto");
    await pagina.click("[data-form-subir] button[type=submit]");
    await expect(pagina.locator("fieldset.foto")).toHaveCount(1);

    await contexto.close();
  }

  {
    const contexto = await browser.newContext({ baseURL: ORIGEN });
    const pagina = await contexto.newPage();

    await pagina.goto(`/contar/${pedidoId}/cancion`);
    await pagina.fill(
      "#cancion_url",
      "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
    );
    await pagina.fill("#cancion_titulo", "La nuestra");
    await pagina.click("button[type=submit]");

    await pagina.fill("#carta_texto", "Todo lo que quiero decirte cabe en esta carta.");
    await pagina.click("button[type=submit]");

    await pagina.fill('input[name="pregunta_texto"] >> nth=0', "¿Te casás conmigo?");
    await pagina.fill('input[name="pregunta_respuesta"] >> nth=0', "Sí");
    await pagina.click("button[type=submit]");

    await pagina.fill("#cierre_texto", "Fin.");
    await pagina.click("button[type=submit]");

    // ── 4 · Envía ─────────────────────────────────────────────────────────────────────
    await expect(pagina).toHaveURL(new RegExp(`/contar/${pedidoId}/resumen$`));
    await expect(pagina.locator("[data-listo]")).toBeVisible();

    await pagina.click("[data-form-enviar] button");
    await expect(pagina).toHaveURL(new RegExp(`/contar/${pedidoId}/enviado$`));
    await expect(pagina.locator("[data-enlace-revision]")).toBeVisible();

    await contexto.close();
  }

  const { data: conRegalo } = await supabase
    .from("pedidos")
    .select("regalo_id")
    .eq("id", pedidoId)
    .single();
  const regaloId = conRegalo!.regalo_id as string;
  expect(regaloId).not.toBeNull();

  const { data: regalo } = await supabase
    .from("regalos")
    .select("slug, tema, estado, contenido")
    .eq("id", regaloId)
    .single();

  // El regalo nace en revisión, con el tema en su columna y los bloques del motor.
  expect(regalo!.estado).toBe("en_revision");
  expect(regalo!.tema).toBe("nocturno");
  const receta = (regalo!.contenido as { receta: { tipo: string }[] }).receta;
  expect(receta.map((b) => b.tipo)).toEqual([
    "portada",
    "contador",
    "momento",
    "galeria",
    "cancion",
    "carta",
    "pregunta",
    "cierre",
  ]);

  // La foto se mudó al prefijo del regalo, que es el que el borrado de la 001 barre.
  expect(JSON.stringify(regalo!.contenido)).toContain(`regalos/${regaloId}/`);

  // ── 5 · Revisa y aprueba ────────────────────────────────────────────────────────────
  {
    const contexto = await browser.newContext({ baseURL: ORIGEN });
    const pagina = await contexto.newPage();

    await pagina.goto(`/revisar/${regaloId}`);
    // La vista previa se comporta igual que el regalo real, pantalla de apertura incluida:
    // el comprador ve exactamente lo que va a ver quien lo reciba.
    await pagina.locator("[data-pantalla-apertura]").click();
    await expect(pagina.locator("body")).toContainText("Ana");
    await pagina.locator('[data-form-aprobar] button[type="submit"]').click();

    await expect(pagina.locator("[data-estado-publicado]")).toBeVisible();
    await contexto.close();
  }

  // ── 6 · El destinatario abre el regalo ──────────────────────────────────────────────
  {
    const contexto = await browser.newContext({ baseURL: ORIGEN });
    const pagina = await contexto.newPage();

    await pagina.goto(`/r/${regalo!.slug}`);
    await pagina.locator("[data-pantalla-apertura]").click();
    await expect(pagina.locator("body")).toContainText("Todo lo que quiero decirte");

    // La foto se sirve con firma, resuelta en el render y muerta con él.
    const src = await pagina.locator("img").first().getAttribute("src");
    expect(src).toContain("/storage/v1/object/sign/");

    await contexto.close();
  }

  // ── 7 · Los tres avisos salieron, uno de cada tipo ──────────────────────────────────
  const { data: avisos } = await supabase
    .from("avisos")
    .select("tipo, estado")
    .eq("pedido_id", pedidoId);
  expect(avisos!.map((a) => a.tipo).sort()).toEqual(["aprobacion", "comprobante", "revision"]);
  for (const aviso of avisos!) expect(aviso.estado).toBe("enviado");

  // ── 8 · El QR y la tarjeta ──────────────────────────────────────────────────────────
  const sitioOriginal = process.env.SITIO_URL;
  process.env.SITIO_URL = "https://regalos.bo";

  const emision = await emitirQr(regalo!.slug);
  expect(emision.destino).toBe(`https://regalos.bo/r/${regalo!.slug}`);
  expect(emision.simulacion).toBe(false);

  const tarjeta = emision.archivos.find((a) => a.nombre.startsWith("tarjeta-"))!;
  const meta = await sharp(tarjeta.bytes).metadata();
  expect(meta.width).toBe(1181);
  expect(meta.height).toBe(1772);

  // Y la emisión quedó registrada en el pedido: qué soporte salió y cuándo.
  const { data: tras } = await supabase
    .from("pedidos")
    .select("qr_emitido_en, qr_simulacion")
    .eq("id", pedidoId)
    .single();
  expect(tras!.qr_emitido_en).not.toBeNull();
  expect(tras!.qr_simulacion).toBe(false);

  if (sitioOriginal === undefined) delete process.env.SITIO_URL;
  else process.env.SITIO_URL = sitioOriginal;

  // ── 9 · La cola operativa queda limpia para este pedido ─────────────────────────────
  {
    const contexto = await browser.newContext({ baseURL: ORIGEN });
    const pagina = await contexto.newPage();

    await pagina.goto(`/pedidos?clave=${encodeURIComponent(process.env.OPS_SECRET!)}`);
    // Pagado y entregado: no es un pendiente de nadie.
    await expect(pagina.locator(`[data-pedido="${pedidoId}"]`)).toHaveCount(0);
    await contexto.close();
  }

  await borrarPedidoDeTest(pedidoId);
});
