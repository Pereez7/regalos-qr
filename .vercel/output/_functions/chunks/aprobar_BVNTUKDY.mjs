import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { t as getServiceClient } from "./supabase_C_lKgyhh.mjs";
//#region src/pages/api/regalos/[id]/aprobar.ts
var aprobar_exports = /* @__PURE__ */ __exportAll({
	POST: () => POST,
	prerender: () => false
});
var POST = async ({ params, redirect }) => {
	const id = params.id;
	if (!id) return redirect("/no-disponible", 303);
	const supabase = getServiceClient();
	const { data: existente } = await supabase.from("regalos").select("id, estado").eq("id", id).maybeSingle();
	if (!existente) return redirect("/no-disponible", 303);
	if (existente.estado === "en_revision") await supabase.from("regalos").update({
		aprobado_en: (/* @__PURE__ */ new Date()).toISOString(),
		estado: "publicado"
	}).eq("id", id).eq("estado", "en_revision");
	return redirect(`/revisar/${id}`, 303);
};
//#endregion
//#region \0virtual:astro:page:src/pages/api/regalos/[id]/aprobar@_@ts
var page = () => aprobar_exports;
//#endregion
export { page };
