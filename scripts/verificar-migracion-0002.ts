// Verificación de la migración 0002 contra la base (tasks.md T006).
//
// Dos preguntas, y la segunda importa más que la primera:
//   1. ¿Existen las cuatro tablas nuevas con sus columnas?
//   2. ¿`regalos`, `slugs` y `aperturas` siguen EXACTAMENTE como las dejó 0001?
//
// La feature 002 se comprometió a no tocar el esquema de la 001 (research.md #10, #20). Una
// columna de más, de menos o renombrada ahí es un cambio fuera del perímetro acordado, y el
// Principio VI lo prohíbe. Por eso las listas de abajo están congeladas a mano desde
// supabase/migrations/0001_regalos.sql: si la base se desvía, este script falla.
//
// Lee el esquema por la especificación OpenAPI que PostgREST publica en /rest/v1/, así que no
// necesita contraseña de base: alcanza con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.

const COLUMNAS_001: Record<string, string[]> = {
  slugs: ["slug", "regalo_id", "creado_en"],
  regalos: [
    "id",
    "slug",
    "tema",
    "contenido",
    "estado",
    "aprobado_en",
    "vencimiento",
    "primera_apertura_en",
    "created_at",
  ],
  aperturas: ["id", "regalo_id", "ocurrido_en", "es_primera"],
};

const COLUMNAS_002: Record<string, string[]> = {
  pedidos: [
    "id",
    "estado",
    "email",
    "celular",
    "consentimiento_publicidad",
    "consentimiento_en",
    "baja_publicidad_en",
    "token_baja",
    "borrador",
    "regalo_id",
    "creado_en",
    "pagado_en",
    "actualizado_en",
    "qr_emitido_en",
    "qr_simulacion",
  ],
  pagos: [
    "id",
    "pedido_id",
    "proveedor",
    "pago_id_proveedor",
    "monto_centavos",
    "moneda",
    "monto_informado_centavos",
    "estado",
    "creado_en",
    "actualizado_en",
  ],
  eventos_pago: [
    "id",
    "proveedor",
    "evento_id",
    "pedido_id",
    "pago_id",
    "estado_informado",
    "resultado",
    "recibido_en",
  ],
  avisos: [
    "id",
    "pedido_id",
    "tipo",
    "destinatario",
    "proveedor",
    "estado",
    "intentos",
    "error",
    "creado_en",
    "enviado_en",
  ],
};

interface Esquema {
  definitions?: Record<string, { properties?: Record<string, unknown> }>;
}

async function leerEsquema(): Promise<Esquema> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno");
  }

  const respuesta = await fetch(`${url.replace(/\/+$/, "")}/rest/v1/`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/openapi+json" },
  });

  if (!respuesta.ok) {
    throw new Error(`No se pudo leer el esquema: ${respuesta.status} ${respuesta.statusText}`);
  }

  return (await respuesta.json()) as Esquema;
}

function columnasDe(esquema: Esquema, tabla: string): string[] | null {
  const propiedades = esquema.definitions?.[tabla]?.properties;
  return propiedades ? Object.keys(propiedades) : null;
}

function comparar(
  titulo: string,
  esperadas: Record<string, string[]>,
  esquema: Esquema,
  exacto: boolean,
): string[] {
  const problemas: string[] = [];

  for (const [tabla, columnas] of Object.entries(esperadas)) {
    const reales = columnasDe(esquema, tabla);

    if (!reales) {
      problemas.push(`${titulo}: la tabla "${tabla}" no existe o no es visible`);
      continue;
    }

    const faltan = columnas.filter((columna) => !reales.includes(columna));
    const sobran = reales.filter((columna) => !columnas.includes(columna));

    if (faltan.length > 0) problemas.push(`${tabla}: faltan columnas → ${faltan.join(", ")}`);
    // Para las tablas de la 001, una columna de más también es un problema: significa que
    // esta feature tocó lo que se comprometió a no tocar.
    if (exacto && sobran.length > 0) {
      problemas.push(`${tabla}: columnas de más → ${sobran.join(", ")} (perímetro violado)`);
    }

    if (faltan.length === 0 && (!exacto || sobran.length === 0)) {
      console.log(`  ok  ${tabla} (${reales.length} columnas)`);
    }
  }

  return problemas;
}

async function main() {
  const esquema = await leerEsquema();

  console.log("Tablas de la feature 002 (deben existir):");
  const problemas002 = comparar("002", COLUMNAS_002, esquema, false);

  console.log("\nTablas de la feature 001 (deben estar intactas):");
  const problemas001 = comparar("001", COLUMNAS_001, esquema, true);

  const problemas = [...problemas002, ...problemas001];

  if (problemas.length > 0) {
    console.error("\nLa base NO está en el estado que la feature 002 espera:");
    for (const problema of problemas) console.error(`  - ${problema}`);
    process.exit(1);
  }

  console.log("\nMigración 0002 aplicada y esquema de la 001 intacto.");
}

main().catch((err) => {
  console.error("no se pudo verificar la migración 0002");
  console.error(err);
  process.exit(1);
});
