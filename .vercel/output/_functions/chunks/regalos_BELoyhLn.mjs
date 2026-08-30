import { t as getServiceClient } from "./supabase_C_lKgyhh.mjs";
import { z } from "zod";
//#region src/lib/contenido/esquema.ts
var foto = z.object({
	url: z.string(),
	alt: z.string(),
	ancho: z.number().optional(),
	alto: z.number().optional()
});
var base = { posicion: z.number() };
var bloquePortada = z.object({
	...base,
	tipo: z.literal("portada"),
	nombreDestinatario: z.string(),
	subtitulo: z.string().optional()
});
var bloqueContador = z.object({
	...base,
	tipo: z.literal("contador"),
	fechaInicio: z.string()
});
var bloqueMomento = z.object({
	...base,
	tipo: z.literal("momento"),
	titulo: z.string().optional(),
	texto: z.string(),
	fecha: z.string().optional(),
	foto: foto.optional()
});
var bloqueGaleria = z.object({
	...base,
	tipo: z.literal("galeria"),
	fotos: z.array(foto)
});
var bloqueCancion = z.object({
	...base,
	tipo: z.literal("cancion"),
	url: z.string(),
	titulo: z.string().optional(),
	artista: z.string().optional()
});
var bloqueCarta = z.object({
	...base,
	tipo: z.literal("carta"),
	texto: z.string()
});
var bloquePregunta = z.object({
	...base,
	tipo: z.literal("pregunta"),
	texto: z.string(),
	respuesta: z.string().optional()
});
var bloqueCierre = z.object({
	...base,
	tipo: z.literal("cierre"),
	texto: z.string().optional()
});
var bloqueDesconocido = z.looseObject({
	...base,
	tipo: z.string()
});
var bloque = z.union([
	bloquePortada,
	bloqueContador,
	bloqueMomento,
	bloqueGaleria,
	bloqueCancion,
	bloqueCarta,
	bloquePregunta,
	bloqueCierre,
	bloqueDesconocido
]);
var contenidoV1 = z.object({
	v: z.literal(1),
	receta: z.array(bloque)
});
function parsearContenido(json) {
	const version = json?.v;
	if (version === 1) return contenidoV1.parse(json);
	throw new Error(`Versión de contenido no soportada: ${JSON.stringify(version)}`);
}
//#endregion
//#region src/lib/regalos.ts
var COLUMNAS = "id, slug, tema, contenido, estado, aprobado_en, vencimiento, primera_apertura_en";
function mapear(fila) {
	return {
		id: fila.id,
		slug: fila.slug,
		tema: fila.tema,
		contenido: parsearContenido(fila.contenido),
		estado: fila.estado,
		aprobadoEn: fila.aprobado_en,
		vencimiento: fila.vencimiento,
		primeraAperturaEn: fila.primera_apertura_en
	};
}
async function obtenerRegaloPublicado(slug) {
	const supabase = getServiceClient();
	const ahora = (/* @__PURE__ */ new Date()).toISOString();
	const { data, error } = await supabase.from("regalos").select(COLUMNAS).eq("slug", slug).eq("estado", "publicado").or(`vencimiento.is.null,vencimiento.gt.${ahora}`).maybeSingle();
	if (error || !data) return null;
	return mapear(data);
}
async function obtenerRegaloParaRevision(id) {
	const { data, error } = await getServiceClient().from("regalos").select(COLUMNAS).eq("id", id).maybeSingle();
	if (error || !data) return null;
	return mapear(data);
}
async function registrarApertura(regaloId) {
	const supabase = getServiceClient();
	const { data: fila } = await supabase.from("regalos").update({ primera_apertura_en: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", regaloId).is("primera_apertura_en", null).select("id").maybeSingle();
	const esPrimera = fila != null;
	await supabase.from("aperturas").insert({
		regalo_id: regaloId,
		es_primera: esPrimera
	});
}
//#endregion
export { obtenerRegaloPublicado as n, registrarApertura as r, obtenerRegaloParaRevision as t };
