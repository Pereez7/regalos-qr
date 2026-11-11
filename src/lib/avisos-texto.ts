import type { DatosAviso, TipoAviso } from "./correo/tipos.ts";

// El texto de los tres avisos de FR-026, en un solo lugar y sin HTML.
//
// FR-027: ningún aviso lleva datos que el comprador no haya provisto. Lo único que viaja acá
// es su propio enlace y, si ya lo cargó, el nombre de quien recibe el regalo.
//
// Vive fuera de `avisos.ts` para que el adaptador de Resend pueda usarlo sin arrastrar la
// capa de base de datos.

export interface Mensaje {
  asunto: string;
  cuerpo: string;
}

export function mensajeDe(tipo: TipoAviso, datos: DatosAviso): Mensaje {
  const para = datos.nombreDestinatario ? ` para ${datos.nombreDestinatario}` : "";

  switch (tipo) {
    case "comprobante":
      return {
        asunto: "Tu pedido está pagado — empezá a contar tu historia",
        cuerpo: [
          "Recibimos tu pago. Gracias.",
          "",
          "Este es el enlace de tu pedido, y es la única llave que necesitás: no hay cuenta",
          "ni contraseña. Guardalo, porque es al que vas a volver cada vez que quieras seguir",
          "cargando tu historia.",
          "",
          datos.enlace,
          "",
          "Podés cargarla de a poco, cerrar la pestaña y volver cuando quieras: lo que",
          "escribiste queda guardado.",
        ].join("\n"),
      };

    case "revision":
      return {
        asunto: `Tu regalo${para} ya está listo para que lo revises`,
        cuerpo: [
          "Tu historia ya es un regalo. Antes de que quede definitivo, miralo entero:",
          "",
          datos.enlace,
          "",
          "Desde ahí lo aprobás cuando estés conforme. Mientras no lo apruebes podés volver a",
          "tu carga y corregir todo lo que quieras, las veces que quieras: el enlace del",
          "regalo no cambia nunca.",
        ].join("\n"),
      };

    case "aprobacion":
      return {
        asunto: `Tu regalo${para} está aprobado`,
        cuerpo: [
          "Listo: aprobaste tu regalo y ya es definitivo.",
          "",
          datos.enlace,
          "",
          "Ese enlace es para siempre y no vence. Es el mismo que va dentro del código QR de",
          "la tarjeta, así que lo que imprimas hoy va a seguir abriendo este regalo mañana.",
        ].join("\n"),
      };
  }
}
