import { createInterface } from "node:readline";
import { hashearPassword, verificarPassword } from "../src/lib/ops.ts";

// Genera el `OPS_PASSWORD_HASH` de una contraseña nueva para entrar a /admin.
//
//   npm run ops:clave -- <usuario>
//
// Pide la contraseña dos veces sin mostrarla y escribe en pantalla las dos líneas que van en
// `.env` y en Vercel. La contraseña en sí no se guarda en ningún lado: ni en el archivo, ni
// en el historial del shell —por eso se pide por teclado y no por argumento—, ni en la
// salida del script.
//
// Después de cambiarla, todas las sesiones abiertas se caen: la cookie va firmada con una
// clave derivada del hash. Eso es a propósito (ver src/lib/ops.ts).

const lectura = createInterface({ input: process.stdin, output: process.stdout });

// Corta el eco por completo: readline no expone una opción para esconder lo tipeado, y
// `_writeToOutput` —interno, pero estable desde hace años— es el único punto donde se puede.
// Las etiquetas las escribimos nosotros con `process.stdout.write`, que no pasa por acá.
(lectura as unknown as { _writeToOutput: (texto: string) => void })._writeToOutput = () => {};

// Las líneas se toman del evento `line` y no de `rl.question`. Con la entrada por tubería
// —como la corre un test— las dos líneas llegan en el mismo chunk: `question` atiende la
// primera y la segunda se emite antes de que haya alguien registrado para escucharla, así que
// la segunda pregunta espera para siempre. Esta cola no pierde nada.
const yaLeidas: string[] = [];
const enEspera: ((linea: string) => void)[] = [];
lectura.on("line", (linea) => {
  const quien = enEspera.shift();
  if (quien) quien(linea);
  else yaLeidas.push(linea);
});

/** Lee una línea del teclado sin ecoarla, para que la contraseña no quede en la pantalla. */
function preguntarOculto(etiqueta: string): Promise<string> {
  process.stdout.write(etiqueta);
  return new Promise((resolver) => {
    const entregar = (linea: string) => {
      process.stdout.write("\n");
      resolver(linea);
    };
    const lista = yaLeidas.shift();
    if (lista !== undefined) entregar(lista);
    else enEspera.push(entregar);
  });
}

/** Corta el script dejando la terminal usable: sin cerrar readline el proceso queda vivo. */
function abortar(mensaje: string): never {
  lectura.close();
  console.error(`${mensaje}\n`);
  process.exit(1);
}

const usuario = process.argv[2];

const password = await preguntarOculto("Contraseña nueva: ");

// Un piso bajo a propósito. Lo que encarece adivinar no es el largo acá: es scrypt, que
// cuesta ~37 ms por intento en el servidor. Contra una contraseña mixta de este largo, la
// fuerza bruta en línea no es una preocupación real; el riesgo que queda —alguien quemando
// CPU con intentos— se arregla con una regla de rate limit en el WAF, no con dos caracteres
// más.
if (password.length < 10) abortar("Muy corta. Usá al menos 10 caracteres.");

const otraVez = await preguntarOculto("Repetila: ");
if (password !== otraVez) abortar("No coinciden. No se generó nada.");

lectura.close();

const hash = hashearPassword(password);

// Verificación de cordura antes de imprimir: si el hash recién generado no validara su propia
// contraseña, estarías a punto de pegar en producción una credencial con la que no se entra.
if (!verificarPassword(password, hash)) {
  console.error("El hash generado no se verifica contra su propia contraseña. No lo uses.\n");
  process.exit(1);
}

console.log("Pegá estas dos líneas en .env (y las mismas en Vercel):\n");
console.log(`OPS_USUARIO=${usuario ?? "<el usuario que vas a escribir en /admin>"}`);
console.log(`OPS_PASSWORD_HASH=${hash}`);
console.log(`
En Vercel, sin que la contraseña pase por el shell:

  vercel env rm OPS_PASSWORD_HASH production --yes
  printf '%s' '${hash}' | vercel env add OPS_PASSWORD_HASH production
  vercel --prod

Cambiar el hash cierra todas las sesiones abiertas, en todos los teléfonos.`);
