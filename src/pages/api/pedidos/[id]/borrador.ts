import type { APIRoute } from "astro";
import {
  cargaCerrada,
  guardarRamas,
  obtenerPedidoConRegalo,
} from "../../../../lib/pedidos.ts";
import {
  SIGUIENTE,
  esPaso,
  parsearBorrador,
  validarRama,
  type Borrador,
  type FotoBorrador,
  type Paso,
} from "../../../../lib/borrador/esquema.ts";
import { faltantes } from "../../../../lib/borrador/a-contenido.ts";

export const prerender = false;

// Contrato: specs/002-compra-a-qr/contracts/api-borrador.md
//
// Un paso = una petición guardada (research.md #8). Cada paso del formulario es un <form>
// que postea, guarda su propia rama y redirige al siguiente. Eso es autoguardado real sin
// una línea de JavaScript: quien cierra la pestaña ya tiene guardado todo lo anterior.
//
// El borrador NUNCA rechaza un guardado por estar incompleto. El único motivo de rechazo es
// que el valor no sea guardable: excede su tope (422) o el paso no existe (404). La
// completitud se exige en un solo punto del sistema, el envío (FR-011).

/** Recorta espacios y nada más: un nombre con emoji o una carta de 4.000 caracteres se
 * guardan tal cual, sin sanear ni escapar HTML. El escape es del renderer (FR-017). */
function texto(valor: FormDataEntryValue | null): string {
  return (valor ?? "").toString().trim();
}

function textos(formulario: FormData, campo: string): string[] {
  return formulario.getAll(campo).map((v) => v.toString().trim());
}

/** Las listas repetidas se emparejan POR POSICIÓN: el primer título con el primer texto. */
function enPosicion(listas: string[][], indice: number): string[] {
  return listas.map((lista) => lista[indice] ?? "");
}

function largoMaximo(listas: string[][]): number {
  return listas.reduce((max, lista) => Math.max(max, lista.length), 0);
}

function ramasDelPaso(
  paso: Paso,
  formulario: FormData,
  actual: Borrador,
): { ramas: Record<string, unknown>; borrar: string[] } {
  switch (paso) {
    case "destinatario": {
      const tema = texto(formulario.get("tema"));
      const fechaInicio = texto(formulario.get("fecha_inicio"));
      const nombre = texto(formulario.get("nombre"));
      const subtitulo = texto(formulario.get("subtitulo"));

      return {
        ramas: {
          destinatario: {
            ...(nombre ? { nombre } : {}),
            ...(subtitulo ? { subtitulo } : {}),
          },
          ...(tema ? { tema } : {}),
          ...(fechaInicio ? { fechaInicio } : {}),
        },
        // Un campo que el comprador vació se saca del documento. Dejarlo como `null` no es
        // lo mismo que ausente: el esquema del borrador admite ausencia, no `null`.
        borrar: [...(tema ? [] : ["tema"]), ...(fechaInicio ? [] : ["fechaInicio"])],
      };
    }

    case "momentos": {
      const titulos = textos(formulario, "momento_titulo");
      const textosMomento = textos(formulario, "momento_texto");
      const fechas = textos(formulario, "momento_fecha");
      const previos = actual.momentos ?? [];

      const momentos = [];
      for (let i = 0; i < largoMaximo([titulos, textosMomento, fechas]); i++) {
        const [titulo, cuerpo, fecha] = enPosicion([titulos, textosMomento, fechas], i);
        // Una tripleta enteramente vacía se descarta en vez de guardar un momento en blanco.
        if (!titulo && !cuerpo && !fecha) continue;

        momentos.push({
          ...(titulo ? { titulo } : {}),
          ...(cuerpo ? { texto: cuerpo } : {}),
          ...(fecha ? { fecha } : {}),
          // La foto del momento se asigna en el paso `fotos`: este paso no la toca, pero
          // tampoco puede perderla.
          ...(previos[i]?.fotoRuta ? { fotoRuta: previos[i].fotoRuta } : {}),
        });
      }

      return { ramas: { momentos }, borrar: [] };
    }

    case "fotos": {
      // Este paso no sube ni quita archivos (eso es api-fotos.md): guarda el texto
      // alternativo de cada foto ya subida, su orden, y a qué momento pertenece.
      const rutas = textos(formulario, "foto_ruta");
      const alts = textos(formulario, "foto_alt");
      const delMomento = textos(formulario, "momento_foto");
      const fotosActuales = actual.fotos ?? [];

      const ordenadas: FotoBorrador[] = [];
      for (let i = 0; i < rutas.length; i++) {
        // Una ruta que no está en el borrador se ignora: nadie agrega fotos por este paso.
        const foto = fotosActuales.find((f) => f.ruta === rutas[i]);
        if (!foto) continue;
        const alt = alts[i] ?? "";
        ordenadas.push({ ...foto, ...(alt ? { alt } : {}) });
      }

      // Una foto del borrador ausente de la lista se conserva al final: un formulario mal
      // formado nunca pierde una foto que sigue en el bucket.
      for (const foto of fotosActuales) {
        if (!ordenadas.some((f) => f.ruta === foto.ruta)) ordenadas.push(foto);
      }

      const momentos = (actual.momentos ?? []).map((momento, i) => {
        const ruta = delMomento[i] ?? "";
        const existe = ordenadas.some((f) => f.ruta === ruta);
        const { fotoRuta: _, ...resto } = momento;
        return existe ? { ...resto, fotoRuta: ruta } : resto;
      });

      return { ramas: { fotos: ordenadas, momentos }, borrar: [] };
    }

    case "cancion": {
      const url = texto(formulario.get("cancion_url"));
      const titulo = texto(formulario.get("cancion_titulo"));
      const artista = texto(formulario.get("cancion_artista"));

      return {
        ramas: {
          cancion: {
            ...(url ? { url } : {}),
            ...(titulo ? { titulo } : {}),
            ...(artista ? { artista } : {}),
          },
        },
        borrar: [],
      };
    }

    case "carta": {
      const cuerpo = texto(formulario.get("carta_texto"));
      return { ramas: { carta: cuerpo ? { texto: cuerpo } : {} }, borrar: [] };
    }

    case "preguntas": {
      const textosPregunta = textos(formulario, "pregunta_texto");
      const respuestas = textos(formulario, "pregunta_respuesta");

      const preguntas = [];
      for (let i = 0; i < largoMaximo([textosPregunta, respuestas]); i++) {
        const [cuerpo, respuesta] = enPosicion([textosPregunta, respuestas], i);
        if (!cuerpo && !respuesta) continue;
        preguntas.push({
          ...(cuerpo ? { texto: cuerpo } : {}),
          ...(respuesta ? { respuesta } : {}),
        });
      }

      return { ramas: { preguntas }, borrar: [] };
    }

    case "cierre": {
      const cuerpo = texto(formulario.get("cierre_texto"));
      return { ramas: { cierre: cuerpo ? { texto: cuerpo } : {} }, borrar: [] };
    }
  }
}

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const id = params.id ?? "";
  const pedido = await obtenerPedidoConRegalo(id);
  // Nunca se distingue entre "no existe" y "no es tuyo": es lo que hace cumplible FR-031
  // sin filtrar la existencia de pedidos ajenos.
  if (!pedido) return new Response(null, { status: 404 });

  const formulario = await request.formData();
  const paso = texto(formulario.get("paso"));
  if (!esPaso(paso)) return new Response(null, { status: 404 });

  const cerrada = cargaCerrada(pedido);
  if (cerrada) {
    return new Response(
      cerrada === "no_pagado"
        ? "Este pedido todavía está pendiente de pago, así que la carga no está abierta."
        : "El regalo ya fue aprobado y publicado: lo entregado no se modifica.",
      { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  }

  const actual = parsearBorrador(pedido.borrador);
  const { ramas, borrar } = ramasDelPaso(paso, formulario, actual);

  const invalida = validarRama(paso, ramas);
  if (invalida) {
    return new Response(`No se pudo guardar: "${invalida.campo}" ${invalida.motivo}.`, {
      status: 422,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const guardado = await guardarRamas(id, paso, ramas, borrar);
  if (!guardado) return new Response(null, { status: 500 });

  return redirect(`/contar/${id}/${SIGUIENTE[paso]}`, 303);
};

export const GET: APIRoute = async ({ params }) => {
  const pedido = await obtenerPedidoConRegalo(params.id ?? "");
  if (!pedido) return new Response(null, { status: 404 });

  const borrador = parsearBorrador(pedido.borrador);

  // `faltantes` es la MISMA función pura que usa el envío. No se guarda en ninguna parte:
  // se recalcula en cada lectura, que es lo que permite mostrar qué falta sin JavaScript y
  // sin mensajes de un solo uso (FR-011).
  //
  // Nunca se devuelve el token de baja, ni el celular, ni direcciones de acceso a las fotos:
  // solo rutas de storage, que no sirven sin firma (FR-020).
  return new Response(
    JSON.stringify({
      estado: pedido.estado,
      regaloId: pedido.regaloId,
      estadoRegalo: pedido.estadoRegalo,
      borrador,
      faltantes: faltantes(borrador),
    }),
    { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } },
  );
};
