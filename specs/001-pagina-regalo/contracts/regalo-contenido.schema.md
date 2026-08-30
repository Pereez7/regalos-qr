# Contrato: `regalos.contenido` (JSON versionado)

Este es el contrato central del motor (Principio II + VI). Todo lo demás en esta feature lee
o escribe este documento. Fuente de verdad de implementación: `src/lib/contenido/esquema.ts`
(zod) + `src/lib/contenido/tipos-bloque.ts` (TS).

## Forma v1

```jsonc
{
  "v": 1,
  "receta": [
    { "tipo": "portada", "posicion": 0, "nombreDestinatario": "Ana", "subtitulo": "para vos" },
    { "tipo": "contador", "posicion": 1, "fechaInicio": "2024-02-14T00:00:00Z" },
    { "tipo": "momento", "posicion": 2, "titulo": "Primer viaje", "texto": "...", "fecha": "2024-06-01",
      "foto": { "url": "https://.../regalos/<id>/<uuid>.jpg", "alt": "Los dos en el aeropuerto" } },
    { "tipo": "galeria", "posicion": 3, "fotos": [
      { "url": "https://.../regalos/<id>/<uuid>.jpg", "alt": "Los dos en la playa" }
    ] },
    { "tipo": "cancion", "posicion": 4, "url": "https://open.spotify.com/track/XXXX", "titulo": "...", "artista": "..." },
    { "tipo": "carta", "posicion": 5, "texto": "..." },
    { "tipo": "pregunta", "posicion": 6, "texto": "¿Te casás conmigo?", "respuesta": "Sí" },
    { "tipo": "cierre", "posicion": 7, "texto": "Fin" }
  ]
}
```

## Reglas del contrato (obligatorias, no negociables — Principio VI)

1. `v` es requerido en todo documento, desde el primer registro que se haya guardado.
2. Un campo que exista en una versión emitida de un tipo de bloque **nunca** se renombra ni se
   elimina. Solo se agregan campos nuevos, siempre opcionales, para no romper recetas ya
   guardadas.
3. Un tipo de bloque emitido (los ocho de la tabla siguiente, y cualquiera que se agregue
   después) **nunca** se elimina del registro. Un tipo "v2" es un tipo nuevo (p. ej.
   `momento` y, si hiciera falta, `momento-extendido`), no un reemplazo in-place.
4. El renderer DEBE ignorar en silencio cualquier `tipo` no presente en
   `src/bloques/registro.ts` (FR-006) — incluye tipos de una versión de la app más nueva que
   el regalo, y tipos mal escritos.
5. Todo string de este documento se renderiza como texto plano escapado; ninguna etiqueta HTML
   dentro de un valor se interpreta (FR-007).
6. `posicion` determina el orden de render; no hay orden implícito por posición en el array.
7. `cancion.url` DEBE resolver a uno de los dominios de la lista blanca (`open.spotify.com`,
   `spotify.com`, `youtube.com`, `youtu.be`, `www.youtube.com` — ver research.md #21 y
   `src/lib/contenido/embeds.ts`). El sistema NO aloja archivos de audio propios: el bloque
   siempre renderiza un embed del proveedor original, cargado solo tras un tap explícito, sin
   parámetro de autoplay. Un `url` fuera de la lista blanca se trata como bloque sin contenido
   significativo y se omite (misma regla que una carta vacía).

## Tipos de bloque v1 (FR-004)

| `tipo` | Campos requeridos | Campos opcionales |
|---|---|---|
| `portada` | `nombreDestinatario` | `subtitulo` |
| `contador` | `fechaInicio` (ISO datetime; puede ser futura) | — |
| `momento` | `texto` | `titulo`, `fecha`, `foto` (mismo tipo `Foto` que `galeria`) |
| `galeria` | `fotos: Foto[]` (mínimo 0 elementos) | — |
| `cancion` | `url` (link de Spotify o YouTube, ver regla 7) | `titulo`, `artista` |
| `carta` | `texto` | — |
| `pregunta` | `texto` | `respuesta` |
| `cierre` | — | `texto` |

`Foto = { url: string, alt: string, ancho?: number, alto?: number }` — `alt` es requerido
(Reglas de Calidad: "texto alternativo en toda imagen").

## Compatibilidad hacia adelante

Un consumidor de `contenido` (el renderer de `/r/[slug]` o `/revisar/[id]`) DEBE poder leer
cualquier documento con `v <= v_actual_del_renderer` sin fallar. Si en el futuro aparece
`v: 2` con reglas distintas de nivel superior (no de un tipo de bloque, sino del documento en
sí), el renderer decide por `v` qué reglas aplicar; nunca se reinterpreta un documento `v: 1`
con reglas de `v: 2`.
