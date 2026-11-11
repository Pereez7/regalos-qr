import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { EmisionNegada, emitirQr } from "../src/lib/qr.ts";

// Única entrada al generador de QR (contracts/qr-y-tarjeta.md):
//
//   npm run qr -- <slug>                 → QR vendible; se niega si el sitio no tiene dominio propio
//   npm run qr -- <slug> --simulacion    → emite marcado, para probar sin dominio
//   npm run qr -- <slug> --svg           → agrega el QR en SVG además del PNG
//   npm run qr -- <slug> --salida ruta/  → dónde escribir (por defecto, qr/<slug>/)
//
// No hay ruta HTTP equivalente, y no es un olvido: una compuerta alcanzable por HTTP es una
// compuerta que alguien va a alcanzar por HTTP el día de apuro (research.md #11).

function argumentoCon(nombre: string): string | undefined {
  const indice = process.argv.indexOf(nombre);
  return indice === -1 ? undefined : process.argv[indice + 1];
}

async function main() {
  const [slug] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

  if (!slug) {
    console.error("Falta el slug. Uso: npm run qr -- <slug> [--simulacion] [--svg]");
    process.exit(1);
  }

  const simulacion = process.argv.includes("--simulacion");
  const formato = process.argv.includes("--svg") ? ("svg" as const) : ("png" as const);
  const salida = argumentoCon("--salida") ?? path.join("qr", slug);

  const emision = await emitirQr(slug, { simulacion, formato });

  mkdirSync(salida, { recursive: true });
  for (const archivo of emision.archivos) {
    writeFileSync(path.join(salida, archivo.nombre), archivo.bytes);
    console.log(`  ${path.join(salida, archivo.nombre)}`);
  }

  console.log(`\ndestino del QR: ${emision.destino}`);

  if (emision.simulacion) {
    console.log(
      "\nMARCADA COMO SIMULACIÓN. La palabra está estampada sobre la tarjeta, no solo en el\n" +
        "nombre del archivo. No la entregues a un comprador.",
    );
  }
}

main().catch((error) => {
  if (error instanceof EmisionNegada) {
    // Una compuerta que se niega no es una falla del programa: es el programa haciendo su
    // trabajo. Pero sale con código distinto de cero, para que nadie siga de largo.
    console.error(`\nNo se emitió el QR.\n\n${error.message}\n`);
    process.exit(2);
  }

  console.error(error);
  process.exit(1);
});
