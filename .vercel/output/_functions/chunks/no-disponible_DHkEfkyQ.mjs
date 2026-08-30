import { t as __exportAll } from "./rolldown-runtime_D7D4PA-g.mjs";
import { d as renderTemplate, p as renderHead } from "./server_CdMmoqFQ.mjs";
import { t as createComponent } from "./compiler_CXM3DY8z.mjs";
//#region src/pages/no-disponible.astro
var no_disponible_exports = /* @__PURE__ */ __exportAll({
	default: () => $$NoDisponible,
	file: () => $$file,
	url: () => $$url
});
var $$NoDisponible = createComponent(($$result, $$props, $$slots) => {
	return renderTemplate`<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>No disponible</title>${renderHead($$result)}</head><body><main style="min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:0.5rem; padding:2rem; text-align:center;"><p style="font-size:1.25rem;">Este regalo no está disponible.</p><p>El enlace puede no existir, estar pendiente de aprobación o haber vencido.</p></main></body></html>`;
}, "/Users/macbook/dev/regalos-qr/src/pages/no-disponible.astro", void 0);
var $$file = "/Users/macbook/dev/regalos-qr/src/pages/no-disponible.astro";
var $$url = "/no-disponible";
//#endregion
export { no_disponible_exports as n, $$NoDisponible as t };
