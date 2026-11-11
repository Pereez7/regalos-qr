import { test, expect } from "@playwright/test";
import QRCode from "qrcode";
import sharp from "sharp";
import { EmisionNegada, emitirQr, hostDeSimulacion } from "../../src/lib/qr.ts";
import { crearRegalo, clienteDeTest } from "./utils/crear-regalo.ts";
import { crearPedido, borrarPedidoDeTest } from "./utils/crear-pedido.ts";

test.describe.configure({ timeout: 120_000 });

// FR-024, FR-025, SC-009 y la Compuerta de Aceptación 16.
//
// Un QR impreso no se actualiza nunca. Si apunta al deploy interno, el regalo muere el día
// que cambie el dominio, y ese error no tiene corrección posible (Principio VI). Por eso la
// compuerta no advierte: se niega.

const CONTENIDO = {
  v: 1 as const,
  receta: [{ tipo: "portada", posicion: 0, nombreDestinatario: "Ana" }],
};

const DOMINIO_PROPIO = "https://regalos.example";

const original = process.env.SITIO_URL;

test.afterEach(() => {
  if (original === undefined) delete process.env.SITIO_URL;
  else process.env.SITIO_URL = original;
});

test("con una dirección de simulación, la emisión vendible falla en 10 de 10 intentos", async () => {
  const regalo = await crearRegalo(CONTENIDO, { estado: "publicado" });

  for (const direccion of [
    "https://regalos-qr-nine.vercel.app",
    "https://otro-deploy.vercel.app",
    "http://localhost:4321",
    "http://127.0.0.1:4321",
    "http://192.168.1.17:4321",
    "https://10.0.7.201",
    "http://mi-mac.local:4321",
    "https://regalos-qr-nine.vercel.app/",
    "http://localhost",
    "https://203.0.113.9:8080",
  ]) {
    process.env.SITIO_URL = direccion;

    await expect(emitirQr(regalo.slug), direccion).rejects.toThrow(EmisionNegada);
  }

  // Y el mensaje nombra el host encontrado, en vez de un "error de configuración" genérico.
  process.env.SITIO_URL = "https://regalos-qr-nine.vercel.app";
  await expect(emitirQr(regalo.slug)).rejects.toThrow(/vercel\.app/);

  await limpiarRegalo(regalo.id, regalo.slug);
});

test("sin SITIO_URL, o con una que no es una dirección, tampoco se emite", async () => {
  const regalo = await crearRegalo(CONTENIDO, { estado: "publicado" });

  delete process.env.SITIO_URL;
  await expect(emitirQr(regalo.slug)).rejects.toThrow(/SITIO_URL/);

  process.env.SITIO_URL = "no-soy-una-url";
  await expect(emitirQr(regalo.slug)).rejects.toThrow(EmisionNegada);

  await limpiarRegalo(regalo.id, regalo.slug);
});

test("un regalo que su comprador no aprobó no tiene QR", async () => {
  process.env.SITIO_URL = DOMINIO_PROPIO;

  const enRevision = await crearRegalo(CONTENIDO, { estado: "en_revision" });
  await expect(emitirQr(enRevision.slug)).rejects.toThrow(/revisión/);

  // Ni siquiera marcándolo como simulación: la bandera degrada la salida, no abre compuertas.
  await expect(emitirQr(enRevision.slug, { simulacion: true })).rejects.toThrow(EmisionNegada);

  // Un slug que no es de nadie tampoco.
  await expect(emitirQr("NOEXISTE")).rejects.toThrow(EmisionNegada);

  // Un regalo vencido abriría una página no disponible.
  const vencido = await crearRegalo(CONTENIDO, {
    estado: "publicado",
    vencimiento: new Date(Date.now() - 86_400_000).toISOString(),
  });
  await expect(emitirQr(vencido.slug)).rejects.toThrow(/venció/);

  await limpiarRegalo(enRevision.id, enRevision.slug);
  await limpiarRegalo(vencido.id, vencido.slug);
});

test("con dominio propio emite, y el QR apunta exactamente al enlace del regalo", async () => {
  process.env.SITIO_URL = DOMINIO_PROPIO;
  const regalo = await crearRegalo(CONTENIDO, { estado: "publicado" });

  const emision = await emitirQr(regalo.slug);

  expect(emision.destino).toBe(`${DOMINIO_PROPIO}/r/${regalo.slug}`);
  expect(emision.simulacion).toBe(false);

  // Sin acortadores, sin parámetros de seguimiento, sin servicios de terceros: si
  // desaparecen, mueren todos los regalos vendidos (Compuerta 11).
  expect(emision.destino).not.toContain("?");
  expect(emision.destino.startsWith(DOMINIO_PROPIO)).toBe(true);

  // Que el código diga lo que tiene que decir se verifica regenerándolo con los mismos
  // parámetros: mismo contenido y misma corrección de errores producen los mismos bytes.
  const esperado = await QRCode.toBuffer(`${DOMINIO_PROPIO}/r/${regalo.slug}`, {
    errorCorrectionLevel: "Q",
    margin: 4,
    width: 591,
    color: { dark: "#000000", light: "#FFFFFF" },
  });
  const qr = emision.archivos.find((a) => a.nombre.startsWith("qr-"))!;
  expect(qr.bytes.equals(esperado)).toBe(true);
  expect(qr.nombre).toBe(`qr-${regalo.slug}.png`);

  // La tarjeta sale en el tamaño de impresión del contrato: 100 × 150 mm a 300 ppp.
  const tarjeta = emision.archivos.find((a) => a.nombre.startsWith("tarjeta-"))!;
  const meta = await sharp(tarjeta.bytes).metadata();
  expect(meta.width).toBe(1181);
  expect(meta.height).toBe(1772);
  expect(tarjeta.nombre).not.toContain("simulacion");

  await limpiarRegalo(regalo.id, regalo.slug);
});

test("la emisión de simulación procede y la marca viaja dentro de la imagen", async () => {
  const regalo = await crearRegalo(CONTENIDO, { estado: "publicado" });

  process.env.SITIO_URL = DOMINIO_PROPIO;
  const limpia = await emitirQr(regalo.slug);

  // Sobre un deploy de simulación, con la bandera, sí emite.
  process.env.SITIO_URL = "https://regalos-qr-nine.vercel.app";
  const marcada = await emitirQr(regalo.slug, { simulacion: true });

  expect(marcada.simulacion).toBe(true);
  // El sufijo del nombre es la comodidad...
  for (const archivo of marcada.archivos) expect(archivo.nombre).toContain("-simulacion");

  // ...y la marca sobre la imagen es la garantía: un archivo se renombra o se reenvía sin su
  // nombre. La tarjeta marcada tiene píxeles rojos que la limpia no tiene, y es distinta aun
  // comparando contra la misma tarjeta generada sin marca.
  const tarjetaMarcada = marcada.archivos.find((a) => a.nombre.startsWith("tarjeta-"))!;
  const tarjetaLimpia = limpia.archivos.find((a) => a.nombre.startsWith("tarjeta-"))!;
  expect(tarjetaMarcada.bytes.equals(tarjetaLimpia.bytes)).toBe(false);

  const { dominant } = await sharp(tarjetaMarcada.bytes).stats();
  const estadisticas = await sharp(tarjetaMarcada.bytes).stats();
  const rojoMedio = estadisticas.channels[0].mean;
  const azulMedio = estadisticas.channels[2].mean;
  // La marca es roja: el canal rojo queda por encima del azul. En la tarjeta limpia, que es
  // negro sobre blanco, los tres canales son iguales.
  expect(rojoMedio).toBeGreaterThan(azulMedio);
  expect(dominant).toBeDefined();

  const limpiaStats = await sharp(tarjetaLimpia.bytes).stats();
  expect(limpiaStats.channels[0].mean).toBeCloseTo(limpiaStats.channels[2].mean, 1);

  await limpiarRegalo(regalo.id, regalo.slug);
});

test("la emisión queda registrada en el pedido, y un regalo sin pedido se emite igual", async () => {
  const supabase = clienteDeTest();
  process.env.SITIO_URL = DOMINIO_PROPIO;

  // Regalo con pedido: queda constancia de qué soporte salió y si era de simulación.
  const regalo = await crearRegalo(CONTENIDO, { estado: "publicado" });
  const pedido = await crearPedido({ estado: "pagado", regaloId: regalo.id });

  await emitirQr(regalo.slug);

  const { data: tras } = await supabase
    .from("pedidos")
    .select("qr_emitido_en, qr_simulacion")
    .eq("id", pedido.id)
    .single();
  expect(tras!.qr_emitido_en).not.toBeNull();
  expect(tras!.qr_simulacion).toBe(false);

  // Una reemisión marcada sobrescribe: lo que interesa es qué salió último.
  await emitirQr(regalo.slug, { simulacion: true });
  const { data: despues } = await supabase
    .from("pedidos")
    .select("qr_emitido_en, qr_simulacion")
    .eq("id", pedido.id)
    .single();
  expect(despues!.qr_simulacion).toBe(true);
  expect(despues!.qr_emitido_en).not.toBe(tras!.qr_emitido_en);

  // Un seed o una demo no tienen pedido: se emiten igual y no registran nada. La ausencia de
  // registro no es un error (Principio II).
  const sinPedido = await crearRegalo(CONTENIDO, { estado: "publicado" });
  const emision = await emitirQr(sinPedido.slug);
  expect(emision.archivos).toHaveLength(2);

  await borrarPedidoDeTest(pedido.id);
  await limpiarRegalo(sinPedido.id, sinPedido.slug);
});

test("el detector de hosts de simulación distingue dominio propio de deploy interno", () => {
  for (const simulado of [
    "https://algo.vercel.app",
    "https://vercel.app",
    "http://localhost:3000",
    "http://127.0.0.1",
    "https://192.168.0.1",
    "http://equipo.local",
  ]) {
    expect(hostDeSimulacion(simulado), simulado).not.toBeNull();
  }

  for (const propio of [
    "https://regalos.bo",
    "https://www.regalos.bo",
    "https://regalos.com.bo/",
    "https://sub.dominio.propio.net",
  ]) {
    expect(hostDeSimulacion(propio), propio).toBeNull();
  }
});

async function limpiarRegalo(id: string, slug: string): Promise<void> {
  const supabase = clienteDeTest();
  await supabase.from("slugs").update({ regalo_id: null }).eq("slug", slug);
  await supabase.from("regalos").delete().eq("id", id);
}
