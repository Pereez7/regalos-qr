import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { Client } from "pg";

// Aplica las migraciones de supabase/migrations/ contra la base, en orden y una sola vez.
//
// Existe porque el CLI de Supabase no tiene acceso a este proyecto y aplicar SQL a mano en
// el panel no deja rastro de qué se aplicó ni cuándo. Acá el rastro es una tabla.
//
//   npm run migrar              → aplica las pendientes
//   npm run migrar -- --estado  → lista qué está aplicado y qué falta, sin tocar nada
//   npm run migrar -- --marcar 0001_regalos.sql
//                               → registra una migración como aplicada SIN ejecutarla,
//                                 para las que ya se corrieron a mano antes de este script
//
// Necesita `DATABASE_URL` en el entorno: Dashboard → Project Settings → Database →
// Connection string. Lleva la contraseña de la base, así que vive en .env y nunca en git.

const DIRECTORIO = "supabase/migrations";

const REGISTRO = `
  create table if not exists migraciones (
    nombre text primary key,
    huella text not null,
    aplicada_en timestamptz not null default now()
  );
`;

function huellaDe(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex").slice(0, 16);
}

function archivos(): string[] {
  return readdirSync(DIRECTORIO)
    .filter((nombre) => nombre.endsWith(".sql"))
    .sort();
}

function leer(nombre: string): string {
  return readFileSync(path.join(DIRECTORIO, nombre), "utf8");
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Falta DATABASE_URL en el entorno (Dashboard → Project Settings → Database → Connection string)",
    );
  }

  const cliente = new Client({ connectionString: url });
  await cliente.connect();

  try {
    await cliente.query(REGISTRO);

    const { rows } = await cliente.query<{ nombre: string; huella: string }>(
      "select nombre, huella from migraciones",
    );
    const aplicadas = new Map(rows.map((fila) => [fila.nombre, fila.huella]));

    const argumentos = process.argv.slice(2);

    if (argumentos.includes("--estado")) {
      for (const nombre of archivos()) {
        const registrada = aplicadas.get(nombre);
        const huella = huellaDe(leer(nombre));
        const estado = !registrada
          ? "PENDIENTE"
          : registrada === huella
            ? "aplicada"
            : "aplicada, pero el archivo cambió desde entonces";
        console.log(`  ${estado.padEnd(44)} ${nombre}`);
      }
      return;
    }

    const indiceMarcar = argumentos.indexOf("--marcar");
    if (indiceMarcar !== -1) {
      const nombre = argumentos[indiceMarcar + 1];
      if (!nombre) throw new Error("--marcar necesita el nombre del archivo");

      await cliente.query(
        "insert into migraciones (nombre, huella) values ($1, $2) on conflict (nombre) do update set huella = excluded.huella",
        [nombre, huellaDe(leer(nombre))],
      );
      console.log(`marcada como aplicada (sin ejecutarla): ${nombre}`);
      return;
    }

    const pendientes = archivos().filter((nombre) => !aplicadas.has(nombre));

    if (pendientes.length === 0) {
      console.log("no hay migraciones pendientes");
      return;
    }

    for (const nombre of pendientes) {
      const sql = leer(nombre);
      process.stdout.write(`aplicando ${nombre}… `);

      // Una transacción por migración: o entra entera o no entra. Una migración a medias es
      // peor que ninguna, porque nadie sabe en qué estado quedó el esquema.
      await cliente.query("begin");
      try {
        await cliente.query(sql);
        await cliente.query("insert into migraciones (nombre, huella) values ($1, $2)", [
          nombre,
          huellaDe(sql),
        ]);
        await cliente.query("commit");
        console.log("ok");
      } catch (error) {
        await cliente.query("rollback");
        console.log("FALLÓ — nada de esta migración quedó aplicado");
        throw error;
      }
    }
  } finally {
    await cliente.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
