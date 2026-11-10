import { getServiceClient } from "../src/lib/supabase.ts";

// Deja el bucket de fotos en estado privado, de forma idempotente.
//
// Principio V ("Datos mínimos, borrado real"): las fotos DEBEN alojarse en rutas no
// adivinables y no indexadas. Un bucket público permite leer cualquier objeto con solo
// conocer su ruta, así que el bucket vive privado y la lectura se resuelve con URLs
// firmadas. Este script existe porque los tests e2e lo crearon público contra el proyecto
// real y hay que cerrarlo.
//
// Se puede correr tantas veces como se quiera: si ya está privado, no toca nada.

const BUCKET = "fotos";

async function main() {
  const supabase = getServiceClient();

  const { data: bucket, error: consultaError } = await supabase.storage.getBucket(BUCKET);

  // "not found" no es un error acá: significa que hay que crearlo.
  const noExiste =
    !bucket && (!consultaError || /not found|does not exist/i.test(consultaError.message));

  if (consultaError && !noExiste) {
    throw consultaError;
  }

  if (noExiste) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
    if (error) throw error;
    console.log(`bucket "${BUCKET}": no existía — creado como privado`);
    return;
  }

  if (bucket!.public) {
    const { error } = await supabase.storage.updateBucket(BUCKET, { public: false });
    if (error) throw error;
    console.log(`bucket "${BUCKET}": existía público — pasado a privado`);
    return;
  }

  console.log(`bucket "${BUCKET}": ya era privado — sin cambios`);
}

main().catch((err) => {
  console.error(`no se pudo asegurar el bucket "${BUCKET}" como privado`);
  console.error(err);
  process.exit(1);
});
