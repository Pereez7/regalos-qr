// Configuración de negocio leída del entorno. Server-only.
//
// `import.meta.env` resuelve lo que había al COMPILAR; `process.env`, lo que hay al
// EJECUTAR. Se leen los dos, en ese orden, por el mismo motivo que en src/lib/supabase.ts y
// src/lib/acceso.ts: escrito solo como `import.meta.env.X`, Vite hornea el valor en el
// bundle y cambiar el precio exigiría reconstruir y redesplegar (research.md #18).

function leer(nombre: string): string | undefined {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  const valor = env?.[nombre] ?? process.env[nombre];
  return valor ? valor : undefined;
}

export interface Precio {
  /** Unidades mínimas de la moneda, entero. Nunca coma flotante: es dinero. */
  centavos: number;
  /** Código ISO de 3 letras mayúsculas, como lo exige el check de `pagos.moneda`. */
  moneda: string;
}

/**
 * Precio vigente **en este instante**. Lo devuelve para congelarlo en la fila de `pagos` al
 * iniciar el cobro: a partir de ahí, un cambio de precio no reescribe la historia de lo ya
 * vendido (research.md #18).
 *
 * Falla fuerte si falta o no es válido. Un precio ausente no se reemplaza por un default: un
 * cobro por un monto inventado es peor que una página que no carga (Principio VII).
 */
export function precioVigente(): Precio {
  const crudo = leer("PRECIO");
  const moneda = leer("MONEDA");

  if (!crudo || !moneda) {
    throw new Error("Faltan PRECIO / MONEDA en el entorno");
  }

  // Entero estricto: "19.99" es un error de configuración, no 1999 centavos. Adivinarlo sería
  // elegir por el negocio cuánto cobrar.
  if (!/^\d+$/.test(crudo)) {
    throw new Error(`PRECIO debe ser un entero en centavos, sin separadores: recibido "${crudo}"`);
  }

  const centavos = Number(crudo);
  if (centavos <= 0) {
    throw new Error(`PRECIO debe ser mayor que cero: recibido "${crudo}"`);
  }

  if (!/^[A-Z]{3}$/.test(moneda)) {
    throw new Error(`MONEDA debe ser un código ISO de 3 letras mayúsculas: recibido "${moneda}"`);
  }

  return { centavos, moneda };
}

/**
 * URL base pública del sitio, sin barra final. Es la que se arma dentro del QR.
 *
 * `undefined` si no está configurada, y quien la use decide qué hacer: la compuerta del QR
 * se niega a emitir (FR-024, research.md #11), mientras que un enlace dentro de un aviso
 * puede degradar sin romper el pedido. No se inventa un default: un QR impreso con el
 * dominio equivocado no se corrige nunca (Principio VI).
 */
export function sitioUrl(): string | undefined {
  const valor = leer("SITIO_URL");
  return valor ? valor.replace(/\/+$/, "") : undefined;
}

/** Clave del proveedor de cobro activo (src/lib/pagos/registro.ts). */
export function proveedorPago(): string {
  return leer("PAGO_PROVEEDOR") ?? "simulado";
}

/** Clave del proveedor de correo activo (src/lib/correo/registro.ts). */
export function proveedorCorreo(): string {
  return leer("CORREO_PROVEEDOR") ?? "consola";
}

/**
 * Formato humano del precio, para mostrar. No participa de ningún cobro: los montos se
 * mueven siempre en centavos enteros, y esta función solo existe para la pantalla.
 *
 * `es-BO` fijo: el producto se vende en Bolivia (research.md #24), y con esa combinación
 * `Intl` escribe "Bs 100", que es como se escribe un precio ahí. El locale sale de la
 * configuración y no de la cabecera del navegador: el precio que ve el comprador no puede
 * depender de cómo tenga configurado el teléfono.
 */
export function formatearPrecio({ centavos, moneda }: Precio): string {
  try {
    return new Intl.NumberFormat("es-BO", {
      style: "currency",
      currency: moneda,
      // Los centavos solo se muestran si el precio los tiene: "$ 12.000", no "$ 12.000,00".
      minimumFractionDigits: centavos % 100 === 0 ? 0 : 2,
    }).format(centavos / 100);
  } catch {
    // Un código de moneda que Intl no conoce no puede romper la landing (Principio I).
    return `${(centavos / 100).toFixed(2)} ${moneda}`;
  }
}

export interface DatosQr {
  /** Imagen del QR de cobro: ruta bajo `public/` o dirección completa. */
  imagen: string;
  /** A nombre de quién figura la cuenta, para que el comprador reconozca el destino. */
  titular: string | undefined;
  /** Banco de la cuenta, por el mismo motivo. */
  banco: string | undefined;
}

/**
 * Datos del QR de cobro (research.md #24). El QR es el de la cuenta del negocio y no cambia
 * entre pedidos: es una imagen, no un dato generado. Cuando se contrate un proveedor con API,
 * el QR pasa a generarse por pedido y esto deja de usarse.
 *
 * `imagen` vacía significa que el cobro por QR no está configurado, y la página lo dice en
 * vez de mostrar un hueco.
 */
export function datosQr(): DatosQr {
  return {
    imagen: leer("QR_PAGO_IMAGEN") ?? "",
    titular: leer("QR_PAGO_TITULAR"),
    banco: leer("QR_PAGO_BANCO"),
  };
}
