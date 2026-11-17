import QRCode from "qrcode";
import sharp from "sharp";
import type { OverlayOptions } from "sharp";
import { sitioUrl } from "./config.ts";
import { getServiceClient } from "./supabase.ts";

// Generador del QR y de la tarjeta imprimible.
//
// NINGUNA ruta HTTP llega hasta acá, y es deliberado: una compuerta que se puede alcanzar por
// HTTP es una compuerta que alguien va a alcanzar por HTTP el día de apuro. La única entrada
// es `npm run qr -- <slug>` (contracts/qr-y-tarjeta.md, research.md #11).
//
// Un QR impreso no se actualiza nunca. Si apunta al deploy interno, el regalo muere el día
// que cambie el dominio, y ese error no tiene corrección posible (Principio VI).

/** 100 × 150 mm a 300 ppp. El spec no fija medidas; estas son las del contrato. */
const TARJETA_ANCHO = 1181;
const TARJETA_ALTO = 1772;

/** Lado del QR en la tarjeta: ~50 mm a 300 ppp, bastante más que el mínimo de 30 mm. */
const QR_LADO = 591;

/** Corrección de errores Q: tolera manchas y dobleces del papel (SC-008). */
const CORRECCION = "Q" as const;

/** Zona de silencio, en módulos. Sin ella, muchos lectores no enganchan. */
const MARGEN_MODULOS = 4;

/**
 * `true` si la dirección pública del sitio ya es un dominio propio del negocio.
 *
 * Lo usan las páginas para ofrecer la descarga de la tarjeta solo cuando de verdad va a
 * funcionar: un botón que siempre falla es peor que no tener botón.
 */
export function hayDominioPropio(): boolean {
  const base = sitioUrl();
  if (!base) return false;

  try {
    return hostDeSimulacion(new URL(base).toString()) === null;
  } catch {
    return false;
  }
}

export class EmisionNegada extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "EmisionNegada";
  }
}

/**
 * Devuelve el host si la dirección es de un deploy de simulación, o `null` si es un dominio
 * propio.
 *
 * El criterio es "no es un deploy de simulación", no una lista de dominios permitidos:
 * mantener una lista era la alternativa rechazada en research.md #11.
 */
export function hostDeSimulacion(url: string): string | null {
  let direccion: URL;
  try {
    direccion = new URL(url);
  } catch {
    return null;
  }

  const host = direccion.hostname.toLowerCase();

  const esIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[");
  const esLocal = host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
  const esVercel = host === "vercel.app" || host.endsWith(".vercel.app");

  return esIp || esLocal || esVercel ? host : null;
}

interface FilaRegalo {
  id: string;
  slug: string;
  estado: string;
  aprobado_en: string | null;
  vencimiento: string | null;
}

export interface OpcionesEmision {
  /** Bandera explícita. Ausente = se pretende emitir un QR vendible. */
  simulacion?: boolean;
  formato?: "png" | "svg";
}

export interface ArchivoEmitido {
  nombre: string;
  bytes: Buffer;
}

export interface Emision {
  slug: string;
  destino: string;
  simulacion: boolean;
  archivos: ArchivoEmitido[];
}

/**
 * Emite el QR y la tarjeta. Lanza `EmisionNegada` sin escribir un solo byte si la compuerta
 * no pasa: nunca hay salida parcial.
 *
 * El orden de las comprobaciones es el del contrato, y todas ocurren antes de generar nada.
 */
export async function emitirQr(slug: string, opciones: OpcionesEmision = {}): Promise<Emision> {
  const base = sitioUrl();

  // 1. Sin dirección pública no hay destino posible.
  if (!base) {
    throw new EmisionNegada(
      "SITIO_URL no está configurada. Sin dirección pública no hay destino para el QR.",
    );
  }

  let destinoBase: URL;
  try {
    destinoBase = new URL(base);
  } catch {
    throw new EmisionNegada(`SITIO_URL no es una dirección válida: "${base}".`);
  }

  // 2. Host de simulación. La bandera solo puede DEGRADAR la salida, nunca habilitarla.
  const simulado = hostDeSimulacion(destinoBase.toString());
  if (simulado && !opciones.simulacion) {
    throw new EmisionNegada(
      `La dirección pública del sitio es "${simulado}", que todavía no es un dominio propio ` +
        "del negocio: el QR no se emite. Un QR impreso no se actualiza nunca, así que uno " +
        "que apunte acá moriría el día que cambie el dominio. Para probar, volvé a correr " +
        "con --simulacion y la tarjeta sale marcada.",
    );
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("regalos")
    .select("id, slug, estado, aprobado_en, vencimiento")
    .eq("slug", slug)
    .maybeSingle();

  // 3. El regalo tiene que existir y estar aprobado por su comprador.
  if (error || !data) throw new EmisionNegada(`No existe ningún regalo con el slug "${slug}".`);

  const regalo = data as FilaRegalo;

  if (regalo.estado !== "publicado" || !regalo.aprobado_en) {
    throw new EmisionNegada(
      `El regalo "${slug}" todavía está en revisión: su comprador no lo aprobó. No existe QR ` +
        "antes de la aprobación.",
    );
  }

  // 4. Vigencia. Los regalos nacen permanentes, así que esto solo salta si alguien fijó una
  // expiración a mano.
  if (regalo.vencimiento && new Date(regalo.vencimiento) <= new Date()) {
    throw new EmisionNegada(
      `El regalo "${slug}" venció el ${regalo.vencimiento}: su QR abriría una página no disponible.`,
    );
  }

  // Destino: exactamente SITIO_URL + /r/ + slug. Sin parámetros de seguimiento, sin
  // redirecciones intermedias, sin acortadores y sin servicios de QR de terceros: si
  // desaparecen, mueren todos los regalos vendidos (Compuerta 11).
  const destino = `${base.replace(/\/+$/, "")}/r/${slug}`;
  const marcada = Boolean(opciones.simulacion);
  const sufijo = marcada ? "-simulacion" : "";

  const qrPng = await QRCode.toBuffer(destino, {
    errorCorrectionLevel: CORRECCION,
    margin: MARGEN_MODULOS,
    width: QR_LADO,
    color: { dark: "#000000", light: "#FFFFFF" },
  });

  const archivos: ArchivoEmitido[] = [{ nombre: `qr-${slug}${sufijo}.png`, bytes: qrPng }];

  if (opciones.formato === "svg") {
    const svg = await QRCode.toString(destino, {
      type: "svg",
      errorCorrectionLevel: CORRECCION,
      margin: MARGEN_MODULOS,
    });
    archivos.push({ nombre: `qr-${slug}${sufijo}.svg`, bytes: Buffer.from(svg, "utf8") });
  }

  archivos.push({
    nombre: `tarjeta-${slug}${sufijo}.png`,
    bytes: await componerTarjeta(qrPng, destino, marcada),
  });

  // El registro va DESPUÉS de que los archivos están generados: una compuerta que se niega no
  // deja rastro de emisión porque no hubo emisión (research.md #22).
  await registrarEmision(regalo.id, marcada);

  return { slug, destino, simulacion: marcada, archivos };
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Compone la tarjeta: el QR centrado con su zona de silencio, el texto mínimo para que quien
 * la recibe entienda que hay que escanearlo, y la dirección en texto legible como alternativa
 * si la cámara falla (FR-023).
 *
 * El alfabeto del slug ya viene sin 0, O, 1, l ni I justamente para que se pueda tipear desde
 * una tarjeta impresa sin ambigüedad (feature 001).
 */
async function componerTarjeta(
  qrPng: Buffer,
  destino: string,
  marcada: boolean,
): Promise<Buffer> {
  const qrY = Math.round((TARJETA_ALTO - QR_LADO) / 2) - 60;

  // Negro sobre blanco, sin logo encima y sin degradados: lo que mejor sobrevive al papel.
  const texto = `
    <svg width="${TARJETA_ANCHO}" height="${TARJETA_ALTO}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#FFFFFF"/>
      <text x="50%" y="300" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
            font-size="64" fill="#1A1A1A">Tenés un regalo esperándote</text>
      <text x="50%" y="390" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
            font-size="40" fill="#555555">Escaneá este código con la cámara de tu celular</text>
      <text x="50%" y="${qrY + QR_LADO + 130}" text-anchor="middle"
            font-family="Helvetica, Arial, sans-serif" font-size="36" fill="#555555">
        O entrá a
      </text>
      <text x="50%" y="${qrY + QR_LADO + 190}" text-anchor="middle"
            font-family="Helvetica, Arial, sans-serif" font-size="40" fill="#1A1A1A">
        ${escapar(destino)}
      </text>
    </svg>`;

  const capas: OverlayOptions[] = [{ input: Buffer.from(texto, "utf8"), top: 0, left: 0 }];

  if (marcada) {
    // La marca va SOBRE la imagen, cruzada y grande: un archivo se renombra o se reenvía sin
    // su nombre, una marca impresa sobre la tarjeta no se pierde (research.md #11). El sufijo
    // del nombre es una comodidad; esto es la garantía.
    const marca = `
      <svg width="${TARJETA_ANCHO}" height="${TARJETA_ALTO}" xmlns="http://www.w3.org/2000/svg">
        <g transform="rotate(-8 ${TARJETA_ANCHO / 2} 1500)">
          <text x="50%" y="1500" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
                font-size="150" font-weight="bold" fill="#D4231B" fill-opacity="0.5"
                stroke="#D4231B" stroke-opacity="0.55" stroke-width="3">SIMULACIÓN</text>
        </g>
        <text x="50%" y="${TARJETA_ALTO - 70}" text-anchor="middle"
              font-family="Helvetica, Arial, sans-serif" font-size="38" fill="#D4231B">
          Tarjeta de simulación — no entregar a un comprador
        </text>
      </svg>`;

    capas.push({ input: Buffer.from(marca, "utf8"), top: 0, left: 0 });
  }

  // El QR va ÚLTIMO, encima de la marca, y la marca cruza la tarjeta por debajo del código.
  // Las dos cosas a la vez: la palabra ocupa el ancho entero —no se puede recortar sin
  // mutilar la tarjeta— y el código queda limpio. Una tarjeta de simulación que no se puede
  // escanear no sirve para probar el recorrido, que es exactamente para lo que existe; lo
  // que research.md #11 exige es que la marca viaje dentro de la imagen, no que arruine el
  // código.
  capas.push({ input: qrPng, top: qrY, left: Math.round((TARJETA_ANCHO - QR_LADO) / 2) });

  return sharp({
    create: {
      width: TARJETA_ANCHO,
      height: TARJETA_ALTO,
      channels: 3,
      background: "#FFFFFF",
    },
  })
    .composite(capas)
    .png()
    .toBuffer();
}

/**
 * Deja constancia de qué soporte físico salió, cuándo, y si lo impreso era de simulación
 * (research.md #22). Una reemisión sobrescribe: lo que interesa es qué salió último.
 *
 * Un regalo **sin pedido** —un seed, una demo, un regalo creado a mano— se emite igual y no
 * registra nada. La ausencia de registro no es un error: el motor no sabe de pedidos y esta
 * compuerta no inventa uno (Principio II).
 */
async function registrarEmision(regaloId: string, simulacion: boolean): Promise<void> {
  const supabase = getServiceClient();

  await supabase
    .from("pedidos")
    .update({ qr_emitido_en: new Date().toISOString(), qr_simulacion: simulacion })
    .eq("regalo_id", regaloId);
}
