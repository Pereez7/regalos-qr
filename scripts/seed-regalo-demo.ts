import { getServiceClient } from "../src/lib/supabase.ts";
import { generarSlugUnico } from "../src/lib/slugs.ts";
import type { ContenidoV1 } from "../src/lib/contenido/tipos-bloque.ts";

const contenido: ContenidoV1 = {
  v: 1,
  receta: [
    { tipo: "portada", posicion: 0, nombreDestinatario: "Ana", subtitulo: "para vos" },
    { tipo: "contador", posicion: 1, fechaInicio: "2024-02-14T00:00:00Z" },
    {
      tipo: "momento",
      posicion: 2,
      titulo: "Primer viaje",
      texto: "El día que nos escapamos sin avisarle a nadie.",
      fecha: "2024-06-01",
      foto: {
        url: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee",
        alt: "Los dos en el aeropuerto",
      },
    },
    {
      tipo: "galeria",
      posicion: 3,
      fotos: [
        {
          url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e",
          alt: "Los dos en la playa",
        },
      ],
    },
    {
      tipo: "cancion",
      posicion: 4,
      url: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
      titulo: "Never Gonna Give You Up",
      artista: "Rick Astley",
    },
    {
      tipo: "carta",
      posicion: 5,
      texto: "Todo lo que quiero decirte cabe y no cabe en esta carta.",
    },
    { tipo: "pregunta", posicion: 6, texto: "¿Te casás conmigo?", respuesta: "Sí" },
    { tipo: "cierre", posicion: 7, texto: "Fin (por ahora)" },
  ],
};

async function main() {
  const supabase = getServiceClient();
  const slug = await generarSlugUnico(supabase);

  const { data, error } = await supabase
    .from("regalos")
    .insert({
      slug,
      tema: "nocturno",
      contenido,
      estado: "en_revision",
    })
    .select("id, slug")
    .single();

  if (error || !data) {
    throw error ?? new Error("No se pudo insertar el regalo de demo");
  }

  const { error: slugError } = await supabase
    .from("slugs")
    .update({ regalo_id: data.id })
    .eq("slug", slug);

  if (slugError) {
    throw slugError;
  }

  console.log(`id: ${data.id}`);
  console.log(`slug: ${data.slug}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
