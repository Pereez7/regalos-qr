import { test, expect } from "@playwright/test";
import sharp from "sharp";
import { crearPedido, borrarPedidoDeTest } from "./utils/crear-pedido.ts";
import { clienteDeTest } from "./utils/crear-regalo.ts";
import { fotoDePrueba, noEsUnaImagen } from "./utils/foto-de-prueba.ts";
import {
  cargarMinimo,
  enviarHistoria,
  leerBorrador,
  postFormulario,
} from "./utils/cargar-historia.ts";

test.describe.configure({ timeout: 180_000 });

// FR-018, FR-019, FR-020, FR-037, FR-038, FR-039 · SC-011, SC-013, SC-015.
// El bucket es privado y la dirección de acceso se firma en cada render: nunca se guarda.

const ORIGEN = "http://localhost:4321";

async function subirFoto(
  request: import("@playwright/test").APIRequestContext,
  pedidoId: string,
  archivo: Buffer,
  nombre = "foto.jpg",
  tipo = "image/jpeg",
  alt = "Los dos en la playa",
) {
  return request.post(`/api/pedidos/${pedidoId}/fotos`, {
    multipart: {
      accion: "subir",
      alt,
      foto: { name: nombre, mimeType: tipo, buffer: archivo },
    },
    headers: { Origin: ORIGEN },
    maxRedirects: 0,
  });
}

test("la foto se guarda reducida, liviana y sin metadatos; el original no queda", async ({
  request,
}) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido({ estado: "pagado" });

  const original = await fotoDePrueba({ ancho: 3000, alto: 2000, conUbicacion: true });
  // El original trae lo que trae una foto de celular: dimensiones grandes y metadatos.
  const metaOriginal = await sharp(original).metadata();
  expect(metaOriginal.width).toBe(3000);
  expect(metaOriginal.exif).toBeDefined();

  const respuesta = await subirFoto(request, pedido.id, original);
  expect(respuesta.status()).toBe(303);

  const { borrador } = await leerBorrador(request, pedido.id);
  expect(borrador.fotos).toHaveLength(1);
  const ruta = borrador.fotos[0].ruta as string;
  expect(ruta.startsWith(`pedidos/${pedido.id}/`)).toBe(true);
  // El nombre no se deriva del archivo subido: es aleatorio (FR-020).
  expect(ruta).not.toContain("foto.jpg");

  const { data: descarga } = await supabase.storage.from("fotos").download(ruta);
  const guardada = Buffer.from(await descarga!.arrayBuffer());
  const meta = await sharp(guardada).metadata();

  // Reducida: el lado mayor se acota al tamaño que la página necesita (FR-037).
  expect(meta.format).toBe("webp");
  expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(1600);
  // Sin metadatos, incluida la ubicación (FR-039, SC-015).
  expect(meta.exif).toBeUndefined();
  // Una fracción del original, y por debajo del máximo de SC-013.
  expect(guardada.length).toBeLessThan(600 * 1024);
  expect(guardada.length).toBeLessThan(original.length);

  // El original no está almacenado en ninguna parte: hay un solo objeto, y es el reducido.
  const { data: objetos } = await supabase.storage.from("fotos").list(`pedidos/${pedido.id}`);
  expect(objetos).toHaveLength(1);
  expect(borrador.fotos[0].ancho).toBe(meta.width);

  await borrarPedidoDeTest(pedido.id);
});

test("una foto que ya viene chica no se agranda, y lo que no es imagen se rechaza", async ({
  request,
}) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido({ estado: "pagado" });

  const chica = await fotoDePrueba({ ancho: 400, alto: 300 });
  expect((await subirFoto(request, pedido.id, chica, "chica.jpg")).status()).toBe(303);

  const { borrador } = await leerBorrador(request, pedido.id);
  const { data: descarga } = await supabase.storage
    .from("fotos")
    .download(borrador.fotos[0].ruta as string);
  const meta = await sharp(Buffer.from(await descarga!.arrayBuffer())).metadata();
  expect(meta.width).toBe(400);
  expect(meta.height).toBe(300);

  // `sharp` es la autoridad final: no se confía en el content-type ni en la extensión.
  const impostor = await request.post(`/api/pedidos/${pedido.id}/fotos`, {
    multipart: {
      accion: "subir",
      foto: { name: "trampa.jpg", mimeType: "image/jpeg", buffer: noEsUnaImagen() },
    },
    headers: { Origin: ORIGEN },
    maxRedirects: 0,
  });
  expect(impostor.status()).toBe(415);

  // Y el resto del borrador queda intacto (FR-018, Escenario 8 de la US2).
  const despues = await leerBorrador(request, pedido.id);
  expect(despues.borrador.fotos).toHaveLength(1);

  await borrarPedidoDeTest(pedido.id);
});

test("una foto quitada antes de enviar no queda almacenada", async ({ request }) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido({ estado: "pagado" });

  await subirFoto(request, pedido.id, await fotoDePrueba({ ancho: 800, alto: 600 }));
  const { borrador } = await leerBorrador(request, pedido.id);
  const ruta = borrador.fotos[0].ruta as string;

  const quitada = await postFormulario(request, `/api/pedidos/${pedido.id}/fotos`, {
    accion: "quitar",
    ruta,
  });
  expect(quitada.status()).toBe(303);

  // Fuera del borrador y fuera del bucket, en el momento de quitarla y no al enviar.
  const despues = await leerBorrador(request, pedido.id);
  expect(despues.borrador.fotos).toHaveLength(0);

  const { data: objetos } = await supabase.storage.from("fotos").list(`pedidos/${pedido.id}`);
  expect(objetos ?? []).toHaveLength(0);

  // Una ruta que no es de este pedido no se puede quitar (FR-031).
  const ajena = await postFormulario(request, `/api/pedidos/${pedido.id}/fotos`, {
    accion: "quitar",
    ruta: "pedidos/00000000-0000-0000-0000-000000000000/inventada.webp",
  });
  expect(ajena.status()).toBe(404);

  await borrarPedidoDeTest(pedido.id);
});

test("la foto no es accesible para quien no está viendo el regalo", async ({ request, page }) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido({ estado: "pagado" });

  await cargarMinimo(request, pedido.id);
  await subirFoto(request, pedido.id, await fotoDePrueba({ ancho: 1200, alto: 900 }));
  await enviarHistoria(request, pedido.id);

  const { regaloId, borrador } = await leerBorrador(request, pedido.id);
  const ruta = borrador.fotos[0].ruta as string;

  // Al enviar, las fotos se mudan al prefijo del regalo, que es el que el borrado de la
  // feature 001 ya barre (research.md #16).
  expect(ruta.startsWith(`regalos/${regaloId}/`)).toBe(true);
  const { data: enPedido } = await supabase.storage.from("fotos").list(`pedidos/${pedido.id}`);
  expect(enPedido ?? []).toHaveLength(0);

  // El contenido del regalo guarda la ruta, no una dirección: no hay dirección permanente.
  const { data: regalo } = await supabase
    .from("regalos")
    .select("slug, contenido")
    .eq("id", regaloId!)
    .single();
  const serializado = JSON.stringify(regalo!.contenido);
  expect(serializado).toContain(ruta);
  expect(serializado).not.toContain("token=");
  expect(serializado).not.toContain("/storage/v1/object/sign/");

  // La dirección pública del objeto no sirve: el bucket es privado (FR-020, SC-011).
  const publica = `${process.env.SUPABASE_URL}/storage/v1/object/public/fotos/${ruta}`;
  const sinPermiso = await request.get(publica);
  expect(sinPermiso.ok()).toBe(false);

  // Pero quien mira el regalo la ve: la firma se resuelve en el render y muere con él.
  await supabase
    .from("regalos")
    .update({ estado: "publicado", aprobado_en: new Date().toISOString() })
    .eq("id", regaloId!);

  await page.goto(`/r/${regalo!.slug}`);
  const src = await page.locator("img").first().getAttribute("src");
  expect(src).toContain("/storage/v1/object/sign/");

  const conFirma = await request.get(src!);
  expect(conFirma.ok()).toBe(true);

  await borrarPedidoDeTest(pedido.id);
});

test("borrar el pedido barre las fotos de los dos prefijos", async ({ request }) => {
  const supabase = clienteDeTest();
  const pedido = await crearPedido({ estado: "pagado" });

  await cargarMinimo(request, pedido.id);
  await subirFoto(request, pedido.id, await fotoDePrueba({ ancho: 900, alto: 900 }));
  await enviarHistoria(request, pedido.id);

  // Una foto agregada después del envío nace ya en el prefijo del regalo.
  await subirFoto(request, pedido.id, await fotoDePrueba({ ancho: 900, alto: 900 }));
  const { regaloId, borrador } = await leerBorrador(request, pedido.id);
  expect(borrador.fotos).toHaveLength(2);
  for (const foto of borrador.fotos) {
    expect((foto.ruta as string).startsWith(`regalos/${regaloId}/`)).toBe(true);
  }

  const { data: regalo } = await supabase
    .from("regalos")
    .select("slug")
    .eq("id", regaloId!)
    .single();

  // Sin el secreto de servidor no se borra nada: la credencial no es el id del pedido.
  const sinSecreto = await request.delete(`/api/pedidos/${pedido.id}/eliminar`, {
    headers: { Origin: ORIGEN },
  });
  expect(sinSecreto.status()).toBe(401);

  // Y una petición sin `Origin` ni content-type la corta el framework ANTES del manejador,
  // con 403, aunque traiga el secreto correcto. Es el mismo comportamiento que ya tiene la
  // ruta de borrado de la feature 001 (research.md #1): un operador que llame con curl tiene
  // que mandar `-H 'Content-Type: application/json'` o el `Origin` del sitio.
  const sinOrigen = await request.delete(`/api/pedidos/${pedido.id}/eliminar`, {
    headers: { Authorization: `Bearer ${process.env.OPS_SECRET}` },
  });
  expect(sinOrigen.status()).toBe(403);

  const borrado = await request.delete(`/api/pedidos/${pedido.id}/eliminar`, {
    headers: {
      Authorization: `Bearer ${process.env.OPS_SECRET}`,
      "Content-Type": "application/json",
    },
  });
  expect(borrado.status()).toBe(204);

  const { data: pedidoBorrado } = await supabase
    .from("pedidos")
    .select("id")
    .eq("id", pedido.id)
    .maybeSingle();
  expect(pedidoBorrado).toBeNull();

  const { data: regaloBorrado } = await supabase
    .from("regalos")
    .select("id")
    .eq("id", regaloId!)
    .maybeSingle();
  expect(regaloBorrado).toBeNull();

  const { data: objetos } = await supabase.storage.from("fotos").list(`regalos/${regaloId}`);
  expect(objetos ?? []).toHaveLength(0);

  // La fila de `slugs` sobrevive huérfana: ese valor no se reasigna jamás (Principio VI).
  const { data: slug } = await supabase
    .from("slugs")
    .select("slug, regalo_id")
    .eq("slug", regalo!.slug)
    .maybeSingle();
  expect(slug).not.toBeNull();
  expect(slug!.regalo_id).toBeNull();

  // Repetir el borrado responde 404 y no es un error de la operación.
  const otraVez = await request.delete(`/api/pedidos/${pedido.id}/eliminar`, {
    headers: {
      Authorization: `Bearer ${process.env.OPS_SECRET}`,
      "Content-Type": "application/json",
    },
  });
  expect(otraVez.status()).toBe(404);
});
