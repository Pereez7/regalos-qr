import { S as createAstro, a as Fragment, b as unescapeHTML, c as renderSlot, d as renderTemplate, f as maybeRenderHead, h as createRenderInstruction, i as renderComponent, m as addAttribute, p as renderHead } from "./server_CdMmoqFQ.mjs";
import { t as createComponent } from "./compiler_CXM3DY8z.mjs";
import "./no-disponible_DHkEfkyQ.mjs";
//#region node_modules/astro/dist/runtime/server/render/script.js
async function renderScript(result, id) {
	const inlined = result.inlinedScripts.get(id);
	let content = "";
	if (inlined != null) {
		if (inlined) content = `<script type="module">${inlined}<\/script>`;
	} else {
		const resolved = await result.resolve(id);
		content = `<script type="module" src="${result.userAssetsBase ? (result.base === "/" ? "" : result.base) + result.userAssetsBase : ""}${resolved}"><\/script>`;
	}
	return createRenderInstruction({
		type: "script",
		id,
		content
	});
}
//#endregion
//#region src/temas/tokens-nocturno.css?raw
var tokens_nocturno_default = "/* Tema \"nocturno\": íntimo y oscuro (research.md #13). Pares verificados AA — ver\n   contraste-aa.spec.ts, que recalcula estos ratios en CI. */\n:root {\n  --color-fondo: #14121b;\n  --color-texto: #f3eefb;\n  --color-superficie: #221e2e;\n  --color-texto-sobre-superficie: #f3eefb;\n  --color-acento: #c9a6ff;\n  --color-texto-sobre-acento: #1b1424;\n  --color-foco: #c9a6ff;\n}\n";
//#endregion
//#region src/temas/tokens-papel.css?raw
var tokens_papel_default = "/* Tema \"papel\": claro y analógico (research.md #13). Pares verificados AA — ver\n   contraste-aa.spec.ts, que recalcula estos ratios en CI. */\n:root {\n  --color-fondo: #fbf8f1;\n  --color-texto: #2b2620;\n  --color-superficie: #efe9dc;\n  --color-texto-sobre-superficie: #2b2620;\n  --color-acento: #8a5a2b;\n  --color-texto-sobre-acento: #fbf8f1;\n  --color-foco: #8a5a2b;\n}\n";
//#endregion
//#region src/temas/tokens-luminoso.css?raw
var tokens_luminoso_default = "/* Tema \"luminoso\": alegre y con color (research.md #13). Pares verificados AA — ver\n   contraste-aa.spec.ts, que recalcula estos ratios en CI. */\n:root {\n  --color-fondo: #fff9f0;\n  --color-texto: #241a0a;\n  --color-superficie: #ffefd6;\n  --color-texto-sobre-superficie: #241a0a;\n  --color-acento: #b33e0a;\n  --color-texto-sobre-acento: #ffffff;\n  --color-foco: #b33e0a;\n}\n";
//#endregion
//#region src/bloques/Portada.astro
createAstro("https://astro.build");
var $$Portada = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Portada;
	const { nombreDestinatario, subtitulo } = Astro.props;
	return renderTemplate`${maybeRenderHead($$result)}<section data-bloque="portada"><h1>${nombreDestinatario}</h1>${subtitulo && renderTemplate`<p>${subtitulo}</p>`}</section>`;
}, "/Users/macbook/dev/regalos-qr/src/bloques/Portada.astro", void 0);
//#endregion
//#region src/bloques/Contador.astro
createAstro("https://astro.build");
var $$Contador = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Contador;
	const { fechaInicio } = Astro.props;
	return renderTemplate`${maybeRenderHead($$result)}<section data-bloque="contador"${addAttribute(fechaInicio, "data-fecha-inicio")}><p data-contador-valor data-segundos="0">—</p></section>${renderScript($$result, "/Users/macbook/dev/regalos-qr/src/bloques/Contador.astro?astro&type=script&index=0&lang.ts")}`;
}, "/Users/macbook/dev/regalos-qr/src/bloques/Contador.astro", void 0);
//#endregion
//#region src/bloques/Momento.astro
createAstro("https://astro.build");
var $$Momento = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Momento;
	const { titulo, texto, fecha, foto } = Astro.props;
	const tieneContenido = typeof texto === "string" && texto.trim().length > 0;
	const aspectRatio = foto?.ancho && foto?.alto ? `${foto.ancho} / ${foto.alto}` : void 0;
	return renderTemplate`${tieneContenido && renderTemplate`${maybeRenderHead($$result)}<section data-bloque="momento">${titulo && renderTemplate`<h2>${titulo}</h2>`}${foto && renderTemplate`<div class="foto-marco"${addAttribute(aspectRatio ? { aspectRatio } : void 0, "style")}><img${addAttribute(foto.url, "src")}${addAttribute(foto.alt, "alt")} loading="lazy"></div>`}<p>${texto}</p>${fecha && renderTemplate`<time${addAttribute(fecha, "datetime")}>${fecha}</time>`}</section>`}`;
}, "/Users/macbook/dev/regalos-qr/src/bloques/Momento.astro", void 0);
//#endregion
//#region src/bloques/Galeria.astro
createAstro("https://astro.build");
var $$Galeria = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Galeria;
	const { fotos } = Astro.props;
	return renderTemplate`${fotos && fotos.length > 0 && renderTemplate`${maybeRenderHead($$result)}<section data-bloque="galeria">${fotos.map((foto) => {
		const aspectRatio = foto.ancho && foto.alto ? `${foto.ancho} / ${foto.alto}` : void 0;
		return renderTemplate`<div class="foto-marco"${addAttribute(aspectRatio ? { aspectRatio } : void 0, "style")}><img${addAttribute(foto.url, "src")}${addAttribute(foto.alt, "alt")} loading="lazy"></div>`;
	})}</section>`}`;
}, "/Users/macbook/dev/regalos-qr/src/bloques/Galeria.astro", void 0);
//#endregion
//#region src/lib/contenido/embeds.ts
var DOMINIOS_PERMITIDOS = /* @__PURE__ */ new Set([
	"open.spotify.com",
	"spotify.com",
	"youtube.com",
	"youtu.be",
	"www.youtube.com"
]);
var TIPOS_SPOTIFY_VALIDOS = /* @__PURE__ */ new Set([
	"track",
	"album",
	"playlist",
	"episode"
]);
function resolverEmbed(url) {
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	const host = parsed.hostname.toLowerCase();
	if (!DOMINIOS_PERMITIDOS.has(host)) return null;
	if (host === "open.spotify.com" || host === "spotify.com") return resolverSpotify(parsed);
	return resolverYouTube(parsed, host);
}
function resolverSpotify(url) {
	const [tipo, id] = url.pathname.split("/").filter(Boolean);
	if (!tipo || !id || !TIPOS_SPOTIFY_VALIDOS.has(tipo)) return null;
	return `https://open.spotify.com/embed/${tipo}/${id}`;
}
function resolverYouTube(url, host) {
	let videoId = null;
	if (host === "youtu.be") videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
	else {
		videoId = url.searchParams.get("v");
		if (!videoId) {
			const partes = url.pathname.split("/").filter(Boolean);
			if (partes[0] === "embed" || partes[0] === "shorts") videoId = partes[1] ?? null;
		}
	}
	if (!videoId) return null;
	return `https://www.youtube-nocookie.com/embed/${videoId}`;
}
//#endregion
//#region src/bloques/Cancion.astro
createAstro("https://astro.build");
var $$Cancion = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Cancion;
	const { url, titulo, artista } = Astro.props;
	const embed = resolverEmbed(url);
	return renderTemplate`${embed && renderTemplate`${maybeRenderHead($$result)}<section data-bloque="cancion"${addAttribute(embed, "data-embed-url")}><button type="button" data-boton-cancion>${titulo ? `▶ ${titulo}` : "▶ Escuchar"}${artista && renderTemplate`<span>${artista}</span>`}</button><div data-contenedor-embed></div></section>`}${renderScript($$result, "/Users/macbook/dev/regalos-qr/src/bloques/Cancion.astro?astro&type=script&index=0&lang.ts")}`;
}, "/Users/macbook/dev/regalos-qr/src/bloques/Cancion.astro", void 0);
//#endregion
//#region src/bloques/Carta.astro
createAstro("https://astro.build");
var $$Carta = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Carta;
	const { texto } = Astro.props;
	const tieneContenido = typeof texto === "string" && texto.trim().length > 0;
	return renderTemplate`${tieneContenido && renderTemplate`${maybeRenderHead($$result)}<section data-bloque="carta"><p>${texto}</p></section>`}`;
}, "/Users/macbook/dev/regalos-qr/src/bloques/Carta.astro", void 0);
//#endregion
//#region src/bloques/Pregunta.astro
createAstro("https://astro.build");
var $$Pregunta = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Pregunta;
	const { texto, respuesta } = Astro.props;
	return renderTemplate`${maybeRenderHead($$result)}<section data-bloque="pregunta"><p>${texto}</p>${respuesta && renderTemplate`${renderComponent($$result, "Fragment", Fragment, {}, { "default": ($$result) => renderTemplate`<button type="button" data-boton-pregunta aria-expanded="false">Ver respuesta</button><p data-respuesta hidden>${respuesta}</p>` })}`}</section>${renderScript($$result, "/Users/macbook/dev/regalos-qr/src/bloques/Pregunta.astro?astro&type=script&index=0&lang.ts")}`;
}, "/Users/macbook/dev/regalos-qr/src/bloques/Pregunta.astro", void 0);
//#endregion
//#region src/bloques/Cierre.astro
createAstro("https://astro.build");
var $$Cierre = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$Cierre;
	const { texto } = Astro.props;
	return renderTemplate`${texto && renderTemplate`${maybeRenderHead($$result)}<section data-bloque="cierre"><p>${texto}</p></section>`}`;
}, "/Users/macbook/dev/regalos-qr/src/bloques/Cierre.astro", void 0);
//#endregion
//#region src/bloques/registro.ts
var registro = {
	portada: $$Portada,
	contador: $$Contador,
	momento: $$Momento,
	galeria: $$Galeria,
	cancion: $$Cancion,
	carta: $$Carta,
	pregunta: $$Pregunta,
	cierre: $$Cierre
};
//#endregion
//#region src/layouts/RegaloLayout.astro
createAstro("https://astro.build");
var $$RegaloLayout = createComponent(($$result, $$props, $$slots) => {
	const Astro = $$result.createAstro($$props, $$slots);
	Astro.self = $$RegaloLayout;
	const { tema, contenido, slug } = Astro.props;
	const temasDisponibles = {
		nocturno: tokens_nocturno_default,
		papel: tokens_papel_default,
		luminoso: tokens_luminoso_default
	};
	const cssTema = temasDisponibles[tema] ?? temasDisponibles.nocturno;
	const primerPortada = contenido.receta.find((b) => b.tipo === "portada");
	const nombreDestinatario = typeof primerPortada?.nombreDestinatario === "string" ? primerPortada.nombreDestinatario : null;
	const recetaOrdenada = [...contenido.receta].sort((a, b) => a.posicion - b.posicion);
	return renderTemplate`<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Un regalo para vos</title><style>${unescapeHTML(cssTema)}</style>${renderHead($$result)}</head><body><button type="button" id="pantalla-apertura" data-pantalla-apertura${addAttribute(slug ?? "", "data-slug")}><p>${nombreDestinatario ? `Tenés un regalo, ${nombreDestinatario}` : "Tenés un regalo"}</p><span class="boton-abrir">Tocá para abrir</span></button><main id="contenido" data-contenido hidden>${recetaOrdenada.map((bloque) => {
		const Componente = registro[bloque.tipo];
		return Componente ? renderTemplate`${renderComponent($$result, "Componente", Componente, { ...bloque })}` : null;
	})}</main>${renderSlot($$result, $$slots["default"])}${renderScript($$result, "/Users/macbook/dev/regalos-qr/src/layouts/RegaloLayout.astro?astro&type=script&index=0&lang.ts")}</body></html>`;
}, "/Users/macbook/dev/regalos-qr/src/layouts/RegaloLayout.astro", void 0);
//#endregion
export { $$RegaloLayout as t };
