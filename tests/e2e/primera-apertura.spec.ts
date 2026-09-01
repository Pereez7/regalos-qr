import { test, expect } from "@playwright/test";
import { crearRegalo, clienteDeTest } from "./utils/crear-regalo.ts";

const RECETA_MINIMA = { v: 1 as const, receta: [{ tipo: "cierre" as const, posicion: 0, texto: "Fin" }] };

test("un GET a /r/[slug] con User-Agent de crawler no registra apertura", async ({ request }) => {
  const { slug } = await crearRegalo(RECETA_MINIMA);

  const res = await request.get(`/r/${slug}`, {
    headers: { "User-Agent": "WhatsApp/2.23.20.0" },
  });
  expect(res.ok()).toBeTruthy();

  const supabase = clienteDeTest();
  const { data } = await supabase
    .from("regalos")
    .select("primera_apertura_en")
    .eq("slug", slug)
    .single();
  expect(data?.primera_apertura_en).toBeNull();
});

test("POST /api/abrir/[slug] concurrentes producen una única marca de primera apertura", async ({
  request,
  baseURL,
}) => {
  const { id, slug } = await crearRegalo(RECETA_MINIMA);

  // Astro rechaza con 403 los POST sin `Origin` same-site (security.checkOrigin,
  // protección real contra CSRF) — a diferencia del fetch() same-origin del navegador,
  // request.post() no lo manda solo.
  const headers = { origin: baseURL! };
  const [r1, r2] = await Promise.all([
    request.post(`/api/abrir/${slug}`, { headers }),
    request.post(`/api/abrir/${slug}`, { headers }),
  ]);
  expect(r1.status()).toBe(204);
  expect(r2.status()).toBe(204);

  const supabase = clienteDeTest();
  const { data: regalo } = await supabase
    .from("regalos")
    .select("primera_apertura_en")
    .eq("id", id)
    .single();
  expect(regalo?.primera_apertura_en).not.toBeNull();

  const { data: aperturas } = await supabase
    .from("aperturas")
    .select("es_primera")
    .eq("regalo_id", id);
  expect(aperturas).toHaveLength(2);
  expect((aperturas ?? []).filter((a) => a.es_primera)).toHaveLength(1);
});

test("30 ciclos de recarga + tap no modifican la primera apertura ya registrada", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const { id, slug } = await crearRegalo(RECETA_MINIMA);

  await page.goto(`/r/${slug}`);
  await page.locator("[data-pantalla-apertura]").click();
  // La secuencia del sobre (sello, tarjeta, corazones, reveal) dura 1450ms
  // antes de disparar el POST /api/abrir (src/lib/corazones.js); margen extra
  // para la carrera fire-and-forget bajo ejecución paralela.
  await page.waitForTimeout(2500);

  const supabase = clienteDeTest();
  const { data: primero } = await supabase
    .from("regalos")
    .select("primera_apertura_en")
    .eq("id", id)
    .single();
  expect(primero?.primera_apertura_en).not.toBeNull();
  const marcaOriginal = primero?.primera_apertura_en;

  for (let i = 0; i < 30; i++) {
    await page.goto(`/r/${slug}`);
    await page.locator("[data-pantalla-apertura]").click();
  }

  const { data: final } = await supabase
    .from("regalos")
    .select("primera_apertura_en")
    .eq("id", id)
    .single();
  expect(final?.primera_apertura_en).toBe(marcaOriginal);
});
