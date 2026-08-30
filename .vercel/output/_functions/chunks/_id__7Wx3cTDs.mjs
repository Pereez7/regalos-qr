import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { S as createAstro, d as renderTemplate, f as maybeRenderHead, i as renderComponent, m as addAttribute } from "./server_CdMmoqFQ.mjs";
import { t as createComponent } from "./compiler_CXM3DY8z.mjs";
import { t as $$RegaloLayout } from "./RegaloLayout_Do1FJ60e.mjs";
import { t as obtenerRegaloParaRevision } from "./regalos_BELoyhLn.mjs";
import { t as $$NoDisponible } from "./no-disponible_DHkEfkyQ.mjs";
//#region src/pages/revisar/[id].astro
var _id__exports = /* @__PURE__ */ __exportAll({
	default: () => $$Id,
	file: () => $$file,
	prerender: () => false,
	url: () => $$url
});
createAstro("https://astro.build");
var $$Id = createComponent(async ($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Id;
	const { id } = Astro.params;
	const regalo = id ? await obtenerRegaloParaRevision(id) : null;
	return renderTemplate`${regalo ? renderTemplate`${renderComponent($$result, "RegaloLayout", $$RegaloLayout, {
		"tema": regalo.tema,
		"contenido": regalo.contenido,
		"slug": null,
		"data-astro-cid-xgjxelw6": true
	}, { "default": ($$result) => renderTemplate`${maybeRenderHead($$result)}<div data-panel-revision data-astro-cid-xgjxelw6>${regalo.estado === "en_revision" ? renderTemplate`<form method="POST"${addAttribute(`/api/regalos/${regalo.id}/aprobar`, "action")} data-form-aprobar data-astro-cid-xgjxelw6><button type="submit" data-astro-cid-xgjxelw6>Aprobar</button></form>` : renderTemplate`<p data-estado-publicado data-astro-cid-xgjxelw6>Aprobado el ${regalo.aprobadoEn}${regalo.primeraAperturaEn && renderTemplate`<span data-primera-apertura data-astro-cid-xgjxelw6>${" "}— ya fue abierto, el ${regalo.primeraAperturaEn}</span>`}</p>`}</div>` })}` : renderTemplate`${renderComponent($$result, "NoDisponible", $$NoDisponible, { "data-astro-cid-xgjxelw6": true })}`}`;
}, "/Users/macbook/dev/regalos-qr/src/pages/revisar/[id].astro", void 0);
var $$file = "/Users/macbook/dev/regalos-qr/src/pages/revisar/[id].astro";
var $$url = "/revisar/[id]";
//#endregion
//#region \0virtual:astro:page:src/pages/revisar/[id]@_@astro
var page = () => _id__exports;
//#endregion
export { page };
