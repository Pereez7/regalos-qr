import { resolverEmbed } from "../contenido/embeds.ts";
import type { Bloque, Contenido, Foto } from "../contenido/tipos-bloque.ts";
import type { Borrador } from "./esquema.ts";

// La frontera del producto: de un lado el borrador, que admite estar incompleto; del otro,
// el contenido entregable que consume el motor de la feature 001.
//
// El motor no se modifica: esto solo escribe un documento que el motor ya sabe leer
// (FR-012, research.md #20). Se usan los ocho tipos de bloque que ya existen.
//
// Contrato: specs/002-compra-a-qr/contracts/api-enviar-historia.md

/**
 * Qué falta para poder enviar. **Función pura del borrador**: mismas entradas, mismo
 * resultado, sin estado y sin mensajes de un solo uso. Eso es lo que permite mostrar los
 * faltantes después de un redirect sin una línea de JavaScript — la página de resumen los
 * recalcula en cada visita en vez de depender de un error guardado (FR-011).
 *
 * Los faltantes se dicen en lenguaje del comprador, nunca en nombres de campo.
 */
export function faltantes(borrador: Borrador): string[] {
  const faltan: string[] = [];

  if (!borrador.tema) {
    faltan.push("Falta elegir el clima visual del regalo: nocturno, papel o luminoso.");
  }

  if (!borrador.destinatario?.nombre?.trim()) {
    faltan.push("Falta el nombre de quien recibe el regalo.");
  }

  // El mínimo lo fija research.md #21: tema + nombre + al menos un bloque de contenido. Es
  // deliberadamente bajo —el motor acepta recetas con cualquier cantidad de bloques—, pero
  // no puede ser vacío: un regalo sin un solo bloque es una página en blanco, y eso el
  // Principio I lo declara defecto bloqueante.
  if (bloquesDeContenido(borrador) === 0) {
    faltan.push(
      "Falta la historia: cargá al menos un momento, una carta, una foto, la canción, " +
        "una pregunta o unas palabras de cierre.",
    );
  }

  // Reglas sobre lo que SÍ está cargado. No son parte del mínimo: son condiciones de
  // entregable sobre cada bloque presente.
  const sinAlt = (borrador.fotos ?? []).filter((foto) => !foto.alt?.trim()).length;
  if (sinAlt > 0) {
    faltan.push(
      sinAlt === 1
        ? "Falta describir una de las fotos, para que alguien que no puede verla sepa qué muestra."
        : `Faltan las descripciones de ${sinAlt} fotos, para que alguien que no puede verlas sepa qué muestran.`,
    );
  }

  const url = borrador.cancion?.url?.trim();
  if (url && !resolverEmbed(url)) {
    // El motor omitiría ese bloque en silencio al renderizar, y el comprador recibiría un
    // regalo sin su canción sin que nadie se lo diga. Acá se dice.
    faltan.push("El enlace de la canción no es de Spotify ni de YouTube, así que no se podría escuchar.");
  }

  return faltan;
}

export function sePuedeEnviar(borrador: Borrador): boolean {
  return faltantes(borrador).length === 0;
}

function bloquesDeContenido(borrador: Borrador): number {
  const momentos = (borrador.momentos ?? []).filter((m) => m.texto?.trim()).length;
  const preguntas = (borrador.preguntas ?? []).filter((p) => p.texto?.trim()).length;
  const fotos = (borrador.fotos ?? []).length;
  const carta = borrador.carta?.texto?.trim() ? 1 : 0;
  const cancion = borrador.cancion?.url?.trim() ? 1 : 0;
  const cierre = borrador.cierre?.texto?.trim() ? 1 : 0;

  return momentos + preguntas + fotos + carta + cancion + cierre;
}

/**
 * Reescribe una ruta del prefijo del pedido al del regalo. El nombre aleatorio no cambia en
 * la mudanza (research.md #16). Una ruta que ya está en el destino se devuelve igual: la
 * operación tiene que ser idempotente, porque un reenvío la vuelve a recorrer.
 */
export function rutaEnRegalo(ruta: string, pedidoId: string, regaloId: string): string {
  const prefijoPedido = `pedidos/${pedidoId}/`;
  if (ruta.startsWith(prefijoPedido)) {
    return `regalos/${regaloId}/${ruta.slice(prefijoPedido.length)}`;
  }
  return ruta;
}

export interface OpcionesTraduccion {
  /**
   * Deja las rutas de las fotos como están, sin mudarlas al prefijo del regalo.
   *
   * Lo usa la vista previa de la carga: ahí el regalo todavía no nació, las fotos siguen
   * viviendo bajo el prefijo del pedido, y reescribirlas apuntaría a objetos que no existen.
   * En el envío —el único lugar donde esto se guarda— la mudanza sí ocurre.
   */
  conservarRutas?: boolean;
}

function fotoDeBloque(
  ruta: string,
  alt: string | undefined,
  ancho: number | undefined,
  alto: number | undefined,
  pedidoId: string,
  regaloId: string,
  conservarRutas = false,
): Foto {
  return {
    // `url` queda vacía a propósito: la dirección de acceso se firma en cada render y nunca
    // se persiste (FR-020, research.md #6). El campo existe porque el Principio VI prohíbe
    // eliminarlo, y conserva su significado para el contenido que sí lo usa.
    url: "",
    alt: alt?.trim() ?? "",
    ruta: conservarRutas ? ruta : rutaEnRegalo(ruta, pedidoId, regaloId),
    ...(ancho ? { ancho } : {}),
    ...(alto ? { alto } : {}),
  };
}

/**
 * Traduce el borrador a `{ v: 1, receta }`. `posicion` se asigna creciente en el orden fijo
 * del contrato. Un bloque sin contenido significativo **no se emite**: un paso que el
 * comprador dejó vacío no produce un bloque vacío en el regalo.
 *
 * `tema` no viaja acá: va a la columna `regalos.tema`. El tema es del regalo, no de la
 * receta.
 */
export function aContenido(
  borrador: Borrador,
  pedidoId: string,
  regaloId: string,
  opciones: OpcionesTraduccion = {},
): Contenido {
  const conservar = opciones.conservarRutas === true;
  const receta: Bloque[] = [];
  const posicion = () => receta.length;

  receta.push({
    tipo: "portada",
    posicion: posicion(),
    nombreDestinatario: borrador.destinatario?.nombre?.trim() ?? "",
    ...(borrador.destinatario?.subtitulo?.trim()
      ? { subtitulo: borrador.destinatario.subtitulo.trim() }
      : {}),
  });

  if (borrador.fechaInicio) {
    receta.push({ tipo: "contador", posicion: posicion(), fechaInicio: borrador.fechaInicio });
  }

  const fotos = borrador.fotos ?? [];
  const usadasEnMomentos = new Set<string>();

  for (const momento of borrador.momentos ?? []) {
    const texto = momento.texto?.trim();
    if (!texto) continue;

    const foto = momento.fotoRuta ? fotos.find((f) => f.ruta === momento.fotoRuta) : undefined;
    if (foto) usadasEnMomentos.add(foto.ruta);

    receta.push({
      tipo: "momento",
      posicion: posicion(),
      ...(momento.titulo?.trim() ? { titulo: momento.titulo.trim() } : {}),
      texto,
      ...(momento.fecha ? { fecha: momento.fecha } : {}),
      ...(foto
        ? {
            foto: fotoDeBloque(
              foto.ruta,
              foto.alt,
              foto.ancho,
              foto.alto,
              pedidoId,
              regaloId,
              conservar,
            ),
          }
        : {}),
    });
  }

  // La galería lleva las fotos que ningún momento usa, en el orden del borrador.
  const deGaleria = fotos.filter((foto) => !usadasEnMomentos.has(foto.ruta));
  if (deGaleria.length > 0) {
    receta.push({
      tipo: "galeria",
      posicion: posicion(),
      fotos: deGaleria.map((foto) =>
        fotoDeBloque(foto.ruta, foto.alt, foto.ancho, foto.alto, pedidoId, regaloId, conservar),
      ),
    });
  }

  const cancionUrl = borrador.cancion?.url?.trim();
  if (cancionUrl) {
    receta.push({
      tipo: "cancion",
      posicion: posicion(),
      url: cancionUrl,
      ...(borrador.cancion?.titulo?.trim() ? { titulo: borrador.cancion.titulo.trim() } : {}),
      ...(borrador.cancion?.artista?.trim() ? { artista: borrador.cancion.artista.trim() } : {}),
    });
  }

  const carta = borrador.carta?.texto?.trim();
  if (carta) {
    receta.push({ tipo: "carta", posicion: posicion(), texto: carta });
  }

  for (const pregunta of borrador.preguntas ?? []) {
    const texto = pregunta.texto?.trim();
    if (!texto) continue;

    receta.push({
      tipo: "pregunta",
      posicion: posicion(),
      texto,
      ...(pregunta.respuesta?.trim() ? { respuesta: pregunta.respuesta.trim() } : {}),
    });
  }

  const cierre = borrador.cierre?.texto?.trim();
  if (cierre) {
    receta.push({ tipo: "cierre", posicion: posicion(), texto: cierre });
  }

  return { v: 1, receta };
}
