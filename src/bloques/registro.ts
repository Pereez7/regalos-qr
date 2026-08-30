import Portada from "./Portada.astro";
import Contador from "./Contador.astro";
import Momento from "./Momento.astro";
import Galeria from "./Galeria.astro";
import Cancion from "./Cancion.astro";
import Carta from "./Carta.astro";
import Pregunta from "./Pregunta.astro";
import Cierre from "./Cierre.astro";

// Mapa tipo -> componente (Principio II). Un `tipo` ausente de este mapa se resuelve
// a `undefined` y RegaloLayout lo omite en silencio (FR-006). Agregar un bloque nuevo
// es un archivo nuevo + una línea acá, nada más.
export const registro: Record<string, any> = {
  portada: Portada,
  contador: Contador,
  momento: Momento,
  galeria: Galeria,
  cancion: Cancion,
  carta: Carta,
  pregunta: Pregunta,
  cierre: Cierre,
};
