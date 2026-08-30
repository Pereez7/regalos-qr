// Lista blanca de dominios + resolución a URL de embed (research.md #21,
// contracts/regalo-contenido.schema.md regla 7). Un dominio fuera de esta lista se
// trata como bloque sin contenido significativo: `resolverEmbed` devuelve `null` y
// Cancion.astro no renderiza nada para ese bloque.

const DOMINIOS_PERMITIDOS = new Set([
  "open.spotify.com",
  "spotify.com",
  "youtube.com",
  "youtu.be",
  "www.youtube.com",
]);

const TIPOS_SPOTIFY_VALIDOS = new Set(["track", "album", "playlist", "episode"]);

export function resolverEmbed(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (!DOMINIOS_PERMITIDOS.has(host)) return null;

  if (host === "open.spotify.com" || host === "spotify.com") {
    return resolverSpotify(parsed);
  }

  return resolverYouTube(parsed, host);
}

function resolverSpotify(url: URL): string | null {
  const [tipo, id] = url.pathname.split("/").filter(Boolean);
  if (!tipo || !id || !TIPOS_SPOTIFY_VALIDOS.has(tipo)) return null;
  return `https://open.spotify.com/embed/${tipo}/${id}`;
}

// Traduce a youtube-nocookie.com para minimizar cookies de terceros (research.md #21).
function resolverYouTube(url: URL, host: string): string | null {
  let videoId: string | null = null;

  if (host === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else {
    videoId = url.searchParams.get("v");
    if (!videoId) {
      const partes = url.pathname.split("/").filter(Boolean);
      if (partes[0] === "embed" || partes[0] === "shorts") {
        videoId = partes[1] ?? null;
      }
    }
  }

  if (!videoId) return null;
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}
