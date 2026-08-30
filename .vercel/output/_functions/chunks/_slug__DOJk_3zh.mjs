import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { S as createAstro, d as renderTemplate, i as renderComponent } from "./server_CdMmoqFQ.mjs";
import { t as createComponent } from "./compiler_CXM3DY8z.mjs";
import { t as $$RegaloLayout } from "./RegaloLayout_Do1FJ60e.mjs";
import { n as obtenerRegaloPublicado } from "./regalos_BELoyhLn.mjs";
import { t as $$NoDisponible } from "./no-disponible_DHkEfkyQ.mjs";
//#region src/pages/r/[slug].astro
var _slug__exports = /* @__PURE__ */ __exportAll({
	default: () => $$Slug,
	file: () => $$file,
	prerender: () => false,
	url: () => $$url
});
createAstro("https://astro.build");
var $$Slug = createComponent(async ($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Slug;
	const { slug } = Astro.params;
	const regalo = slug ? await obtenerRegaloPublicado(slug) : null;
	return renderTemplate`${regalo ? renderTemplate`${renderComponent($$result, "RegaloLayout", $$RegaloLayout, {
		"tema": regalo.tema,
		"contenido": regalo.contenido,
		"slug": regalo.slug
	})}` : renderTemplate`${renderComponent($$result, "NoDisponible", $$NoDisponible, {})}`}`;
}, "/Users/macbook/dev/regalos-qr/src/pages/r/[slug].astro", void 0);
var $$file = "/Users/macbook/dev/regalos-qr/src/pages/r/[slug].astro";
var $$url = "/r/[slug]";
//#endregion
//#region \0virtual:astro:page:src/pages/r/[slug]@_@astro
var page = () => _slug__exports;
//#endregion
export { page };
