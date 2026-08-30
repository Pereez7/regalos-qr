import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { t as getServiceClient } from "./supabase_C_lKgyhh.mjs";
//#region src/pages/api/regalos/[id]/eliminar.ts
var eliminar_exports = /* @__PURE__ */ __exportAll({
	DELETE: () => DELETE,
	prerender: () => false
});
var BUCKET = "fotos";
var DELETE = async ({ params, request }) => {
	const opsSecret = process.env.OPS_SECRET;
	const auth = request.headers.get("authorization");
	if (!opsSecret || auth !== `Bearer ${opsSecret}`) return new Response(null, { status: 401 });
	const id = params.id;
	if (!id) return new Response(null, { status: 404 });
	const supabase = getServiceClient();
	const { data: regalo } = await supabase.from("regalos").select("id, slug").eq("id", id).maybeSingle();
	if (!regalo) return new Response(null, { status: 404 });
	const { data: archivos } = await supabase.storage.from(BUCKET).list(`regalos/${id}`);
	if (archivos && archivos.length > 0) {
		const rutas = archivos.map((archivo) => `regalos/${id}/${archivo.name}`);
		await supabase.storage.from(BUCKET).remove(rutas);
	}
	await supabase.from("regalos").delete().eq("id", id);
	await supabase.from("slugs").update({ regalo_id: null }).eq("slug", regalo.slug);
	return new Response(null, { status: 204 });
};
//#endregion
//#region \0virtual:astro:page:src/pages/api/regalos/[id]/eliminar@_@ts
var page = () => eliminar_exports;
//#endregion
export { page };
