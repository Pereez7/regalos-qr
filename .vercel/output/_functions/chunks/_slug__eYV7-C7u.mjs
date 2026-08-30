import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { n as obtenerRegaloPublicado, r as registrarApertura } from "./regalos_BELoyhLn.mjs";
//#region src/pages/api/abrir/[slug].ts
var _slug__exports = /* @__PURE__ */ __exportAll({
	POST: () => POST,
	prerender: () => false
});
var POST = async ({ params }) => {
	const slug = params.slug;
	if (!slug) return new Response(null, { status: 404 });
	const regalo = await obtenerRegaloPublicado(slug);
	if (!regalo) return new Response(null, { status: 404 });
	await registrarApertura(regalo.id);
	return new Response(null, { status: 204 });
};
//#endregion
//#region \0virtual:astro:page:src/pages/api/abrir/[slug]@_@ts
var page = () => _slug__exports;
//#endregion
export { page };
