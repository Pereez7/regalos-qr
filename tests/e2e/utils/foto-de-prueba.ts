import sharp from "sharp";

// Fotos sintéticas para los tests de carga. Se generan en el momento, con ruido, para que
// el compresor no las reduzca a nada y el peso medido signifique algo.

interface Opciones {
  ancho?: number;
  alto?: number;
  /** Mete metadatos EXIF, incluida la ubicación, para verificar que se eliminan (FR-039). */
  conUbicacion?: boolean;
}

function ruido(ancho: number, alto: number): Buffer {
  const pixeles = Buffer.alloc(ancho * alto * 3);
  for (let i = 0; i < pixeles.length; i++) pixeles[i] = Math.floor(Math.random() * 256);
  return pixeles;
}

/**
 * Ruido chico escalado al tamaño pedido. El ruido puro a tamaño completo no se comprime y
 * produce un JPEG de 10 MB que ninguna cámara genera: la foto quedaría por encima del tope
 * de subida y el test estaría midiendo el tope, no la reducción. Escalado, el archivo pesa
 * lo que pesa una foto de celular de verdad y sigue teniendo las dimensiones grandes.
 */
async function lienzo(ancho: number, alto: number): Promise<Buffer> {
  const semillaAncho = Math.max(8, Math.round(ancho / 40));
  const semillaAlto = Math.max(8, Math.round(alto / 40));

  return sharp(ruido(semillaAncho, semillaAlto), {
    raw: { width: semillaAncho, height: semillaAlto, channels: 3 },
  })
    .resize(ancho, alto, { kernel: "cubic" })
    .toFormat("png")
    .toBuffer();
}

export async function fotoDePrueba(opciones: Opciones = {}): Promise<Buffer> {
  const ancho = opciones.ancho ?? 3000;
  const alto = opciones.alto ?? 2000;

  let imagen = sharp(await lienzo(ancho, alto));

  if (opciones.conUbicacion) {
    // El bloque GPS es justamente el que FR-039 obliga a eliminar. Los tipos de sharp no lo
    // declaran, pero la biblioteca lo escribe igual, así que el cast es sobre el tipo y no
    // sobre el comportamiento: el test después verifica que la foto guardada no lo tiene.
    const exif = {
      IFD0: { Make: "Marca de prueba", Model: "Modelo de prueba" },
      GPS: { GPSLatitudeRef: "S", GPSLongitudeRef: "W" },
    } as Parameters<typeof imagen.withExif>[0];

    imagen = imagen.withExif(exif);
  }

  return imagen.jpeg({ quality: 92 }).toBuffer();
}

/** Un archivo que no es una imagen, para el camino de rechazo (FR-018). */
export function noEsUnaImagen(): Buffer {
  return Buffer.from("esto es un archivo de texto, no una foto\n".repeat(50), "utf8");
}
