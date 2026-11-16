import { getServiceClient } from "../src/lib/supabase.ts";
import { slugsPorOcasion } from "../src/lib/ejemplos.ts";

// Borra los datos de prueba acumulados por la suite y por los recorridos a mano (T075).
//
//   npm run limpiar:pruebas            → solo informa qué borraría (no toca nada)
//   npm run limpiar:pruebas -- --hacer → borra de verdad
//   npm run limpiar:pruebas -- --hacer --conservar-demo
//                                      → deja en pie el regalo de demo de la landing
//
// Qué se considera "de prueba": todo pedido cuyo correo termina en `.test` (el TLD reservado
// para pruebas, RFC 2606) y todo regalo que no tenga pedido asociado — los que crean los
// helpers de la feature 001 y los seeds.
//
// Las filas de `slugs` NO se borran nunca, ni acá ni en ningún otro lado: si un slug volviera
// al espacio disponible, un QR ya impreso podría abrir el regalo de otra persona
// (Principio VI, research.md #16). Quedan como lápidas, y el script las cuenta para que esa
// decisión quede por escrito en la salida y no como un detalle invisible.

const BUCKET = "fotos";

async function borrarPrefijo(prefijo: string): Promise<number> {
  const supabase = getServiceClient();
  const { data: archivos } = await supabase.storage.from(BUCKET).list(prefijo);
  if (!archivos || archivos.length === 0) return 0;

  await supabase.storage.from(BUCKET).remove(archivos.map((a) => `${prefijo}/${a.name}`));
  return archivos.length;
}

async function main() {
  const hacer = process.argv.includes("--hacer");
  const conservarDemo = process.argv.includes("--conservar-demo");
  const supabase = getServiceClient();

  const { data: pedidos } = await supabase.from("pedidos").select("id, email, regalo_id");
  const dePrueba = (pedidos ?? []).filter((p) => /\.test$/i.test((p.email as string) ?? ""));
  const reales = (pedidos ?? []).length - dePrueba.length;

  const { data: regalos } = await supabase.from("regalos").select("id, slug, estado, aprobado_en");
  const conPedido = new Set(
    (pedidos ?? []).map((p) => p.regalo_id as string | null).filter(Boolean) as string[],
  );

  // Un regalo sin pedido es un seed, una demo o un helper de test: nació sin venta detrás.
  let huerfanos = (regalos ?? []).filter((r) => !conPedido.has(r.id as string));

  // El ejemplo de la landing es el de `EJEMPLO_SLUG`; si no está configurado, el último
  // publicado, que es a lo que caía la landing antes de que el ejemplo fuera explícito.
  // Conservar el que de verdad se muestra importa: borrarlo deja la vidriera vacía.
  const elegido = process.env.EJEMPLO_SLUG;
  const demo =
    (elegido && huerfanos.find((r) => r.slug === elegido)) ||
    [...huerfanos]
      .filter((r) => r.estado === "publicado")
      .sort((a, b) => String(b.aprobado_en).localeCompare(String(a.aprobado_en)))[0];

  // Los ejemplos por ocasión tampoco tienen pedido —nacen de un seed, no de una venta—, así
  // que sin esto la limpieza se los llevaría y la landing se quedaría sin vidriera.
  const porOcasion = new Set(Object.values(slugsPorOcasion()));

  if (conservarDemo) {
    if (demo) huerfanos = huerfanos.filter((r) => r.id !== demo.id);
    huerfanos = huerfanos.filter((r) => !porOcasion.has(r.slug as string));
  }

  console.log(`pedidos de prueba (correo .test): ${dePrueba.length}`);
  console.log(`pedidos que NO se tocan:          ${reales}`);
  console.log(`regalos sin pedido asociado:      ${huerfanos.length}`);
  if (conservarDemo && demo) console.log(`regalo de demo conservado:        ${demo.slug}`);
  if (conservarDemo && porOcasion.size > 0) {
    console.log(`ejemplos por ocasión conservados: ${[...porOcasion].join(", ")}`);
  }

  if (!hacer) {
    console.log("\nmodo informe: no se borró nada. Agregá --hacer para ejecutarlo.");
    return;
  }

  let archivos = 0;

  for (const pedido of dePrueba) {
    archivos += await borrarPrefijo(`pedidos/${pedido.id}`);
    if (pedido.regalo_id) archivos += await borrarPrefijo(`regalos/${pedido.regalo_id}`);
    // El `on delete set null` suelta el pedido; el regalo se borra abajo si quedó huérfano.
    await supabase.from("pedidos").delete().eq("id", pedido.id);
  }

  for (const regalo of huerfanos) {
    archivos += await borrarPrefijo(`regalos/${regalo.id}`);
    await supabase.from("slugs").update({ regalo_id: null }).eq("slug", regalo.slug as string);
    await supabase.from("regalos").delete().eq("id", regalo.id);
  }

  // Los eventos de pago huérfanos no pertenecen a ningún pedido y no tienen datos personales,
  // pero son ruido de prueba en la cola operativa.
  const { data: eventos } = await supabase.from("eventos_pago").select("id").is("pedido_id", null);
  for (const evento of eventos ?? []) {
    await supabase.from("eventos_pago").delete().eq("id", evento.id);
  }

  const { count: lapidas } = await supabase
    .from("slugs")
    .select("slug", { count: "exact", head: true })
    .is("regalo_id", null);

  console.log(`\nborrados: ${dePrueba.length} pedidos, ${huerfanos.length} regalos, ${archivos} archivos`);
  console.log(`eventos de pago huérfanos borrados: ${(eventos ?? []).length}`);
  console.log(
    `\nfilas de slugs huérfanas a propósito: ${lapidas}. No se borran nunca: ese valor queda ` +
      "bloqueado para siempre, para que ningún QR impreso pueda abrir el regalo de otra persona.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
