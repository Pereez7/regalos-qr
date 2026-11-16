import { getServiceClient } from "../src/lib/supabase.ts";
import { generarSlugUnico } from "../src/lib/slugs.ts";
import { parsearContenido } from "../src/lib/contenido/esquema.ts";
import { OCASIONES, slugsPorOcasion } from "../src/lib/ejemplos.ts";
import type { ContenidoV1 } from "../src/lib/contenido/tipos-bloque.ts";

// Crea un regalo de ejemplo publicado por ocasión, para que la landing pueda mostrar uno
// navegable de cada tipo (cumpleaños, aniversario, amistad, propuesta).
//
//   npm run seed:ejemplos
//
// IDEMPOTENCIA: el registro de qué regalo es el ejemplo de qué ocasión vive en la variable
// `EJEMPLOS_POR_OCASION`, no en la base. Es deliberado: el modelo de datos está congelado y
// el motor NO sabe de ocasiones (Principio II) —un regalo es un regalo, y la ocasión es una
// decisión comercial de la vidriera—. Si la variable ya nombra regalos publicados, el script
// no crea nada y lo dice.
//
// Al terminar imprime la línea para pegar en `.env` y en Vercel. No la escribe solo: una
// variable de entorno es configuración del despliegue, no algo que un script deba cambiar a
// espaldas de quien lo corre.

interface Semilla {
  ocasion: string;
  tema: "nocturno" | "papel" | "luminoso";
  contenido: ContenidoV1;
}

const haceAnios = (n: number): string =>
  new Date(Date.now() - n * 365.25 * 24 * 60 * 60 * 1000).toISOString();

const SEMILLAS: Semilla[] = [
  {
    ocasion: "aniversario",
    tema: "nocturno",
    contenido: {
      v: 1,
      receta: [
        { tipo: "portada", posicion: 0, nombreDestinatario: "Teté", subtitulo: "otro año más" },
        { tipo: "contador", posicion: 1, fechaInicio: haceAnios(7) },
        {
          tipo: "momento",
          posicion: 2,
          titulo: "La primera vez",
          texto: "Llegaste tarde y con una excusa malísima. Me reí y supe que iba a ser larga.",
          fecha: "2019-03-14",
        },
        {
          tipo: "momento",
          posicion: 3,
          titulo: "La casa chica",
          texto:
            "Dos sillas, una mesa que cojeaba y el mejor año que tuvimos. Nos faltaba todo y no nos faltaba nada.",
        },
        {
          tipo: "carta",
          posicion: 4,
          texto:
            "Siete años y todavía me acuerdo de cómo era la casa antes de que la llenaras. No te escribo para decirte que te quiero, eso ya lo sabés: te escribo para que lo tengas por escrito, el día que lo necesites.",
        },
        { tipo: "pregunta", posicion: 5, texto: "¿Otros siete?", respuesta: "Obvio" },
        { tipo: "cierre", posicion: 6, texto: "Feliz aniversario." },
      ],
    },
  },
  {
    ocasion: "cumpleanos",
    tema: "luminoso",
    contenido: {
      v: 1,
      receta: [
        { tipo: "portada", posicion: 0, nombreDestinatario: "Mateo", subtitulo: "treinta" },
        { tipo: "contador", posicion: 1, fechaInicio: haceAnios(30) },
        {
          tipo: "momento",
          posicion: 2,
          titulo: "El viaje sin plata",
          texto:
            "Dormimos en la terminal y volvimos con una historia que seguimos contando diez años después.",
        },
        {
          tipo: "momento",
          posicion: 3,
          titulo: "El día que te mudaste",
          texto: "Subimos ese sillón por la escalera porque no entraba en el ascensor. Nunca más.",
        },
        {
          tipo: "carta",
          posicion: 4,
          texto:
            "Treinta. Parecía lejísimos cuando teníamos quince y planeábamos cosas que no hicimos, y bastantes que sí. Que este año te traiga algo que no estés esperando.",
        },
        { tipo: "pregunta", posicion: 5, texto: "¿Repetimos el viaje?", respuesta: "Sin terminal" },
        { tipo: "cierre", posicion: 6, texto: "Feliz cumple." },
      ],
    },
  },
  {
    ocasion: "amistad",
    tema: "papel",
    contenido: {
      v: 1,
      receta: [
        { tipo: "portada", posicion: 0, nombreDestinatario: "Caro", subtitulo: "desde el colegio" },
        { tipo: "contador", posicion: 1, fechaInicio: haceAnios(18) },
        {
          tipo: "momento",
          posicion: 2,
          titulo: "El banco del fondo",
          texto: "Ahí empezó todo, copiándonos en una prueba de historia que las dos nos sacamos mal.",
        },
        {
          tipo: "carta",
          posicion: 5,
          texto:
            "Dieciocho años de amistad es más de lo que dura casi todo. Gracias por seguir contestando el teléfono.",
        },
        { tipo: "pregunta", posicion: 6, texto: "¿Nos vemos este mes?", respuesta: "Decime cuándo" },
        { tipo: "cierre", posicion: 7, texto: "Feliz día de la amistad." },
      ],
    },
  },
  {
    ocasion: "propuesta",
    tema: "nocturno",
    contenido: {
      v: 1,
      receta: [
        { tipo: "portada", posicion: 0, nombreDestinatario: "Lucía", subtitulo: "leé hasta el final" },
        { tipo: "contador", posicion: 1, fechaInicio: haceAnios(4) },
        {
          tipo: "momento",
          posicion: 2,
          titulo: "El balcón",
          texto: "Esa noche dijiste que no te imaginabas en otro lado. Yo tampoco, y no te lo dije.",
        },
        {
          tipo: "carta",
          posicion: 3,
          texto:
            "Ensayé esto como diez veces y ninguna me salió. Así que lo escribo, que es lo que mejor me sale, y te lo doy en la mano.",
        },
        { tipo: "pregunta", posicion: 4, texto: "¿Te casás conmigo?", respuesta: "Sí" },
        { tipo: "cierre", posicion: 5, texto: "Decime que sí." },
      ],
    },
  },
];

async function main() {
  const supabase = getServiceClient();
  const yaRegistrados = slugsPorOcasion();

  if (Object.keys(yaRegistrados).length > 0) {
    const slugs = Object.values(yaRegistrados);
    const { data } = await supabase
      .from("regalos")
      .select("slug")
      .in("slug", slugs)
      .eq("estado", "publicado");

    if ((data?.length ?? 0) === slugs.length) {
      console.log("los ejemplos ya existen y están publicados; no se creó nada:");
      for (const [ocasion, slug] of Object.entries(yaRegistrados)) {
        console.log(`  ${ocasion.padEnd(12)} /r/${slug}`);
      }
      return;
    }

    console.log("hay ejemplos registrados pero no todos existen publicados; se crean de nuevo");
  }

  const creados: Record<string, string> = {};

  for (const semilla of SEMILLAS) {
    // Si el contenido no valida, no se inserta nada: el ejemplo de la vidriera no puede ser
    // el primero en romper el contrato del motor.
    parsearContenido(semilla.contenido);

    const slug = await generarSlugUnico(supabase);

    const { data, error } = await supabase
      .from("regalos")
      .insert({
        slug,
        tema: semilla.tema,
        contenido: semilla.contenido,
        estado: "publicado",
        aprobado_en: new Date().toISOString(),
        vencimiento: null,
      })
      .select("id")
      .single();

    if (error || !data) throw error ?? new Error(`no se pudo crear el ejemplo ${semilla.ocasion}`);

    await supabase.from("slugs").update({ regalo_id: data.id }).eq("slug", slug);

    creados[semilla.ocasion] = slug;
    console.log(`  ${semilla.ocasion.padEnd(12)} /r/${slug}  (${semilla.tema})`);
  }

  const linea = OCASIONES.map(({ clave }) => `${clave}:${creados[clave]}`).join(",");

  console.log("\npegá esta línea en .env y cargala también en Vercel:\n");
  console.log(`EJEMPLOS_POR_OCASION=${linea}\n`);
  console.log("sin esa variable, la landing muestra las ocasiones como texto, sin enlace.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
