# Contrato: `POST /api/abrir/[slug]`

> Nota de ruteo: vive bajo `/api/abrir/[slug]`, no bajo `/api/regalos/[slug]/abrir`, porque
> Astro no permite nombres de segmento dinámico distintos (`[slug]` vs `[id]`) al mismo nivel
> de directorio que `api/regalos/[id]/aprobar.ts` y `api/regalos/[id]/eliminar.ts`.

Implementa FR-014/FR-015 (Apertura) con la restricción crítica de research.md #19: el `GET`
que sirve `/r/[slug]` **nunca** registra una apertura. Este endpoint es el único disparador,
y solo se llama por una acción humana explícita — el tap en la pantalla de apertura de
`RegaloLayout.astro` (research.md #22).

## Request

- **Método**: `POST`
- **Path param**: `slug` — el mismo slug de la URL pública
- **Body**: ninguno
- **Auth**: ninguna — mismo modelo que el resto de las rutas públicas de esta feature; el
  `slug` ya identifica el regalo
- **Invocación**: `fetch('/api/abrir/' + slug, { method: 'POST', keepalive:
  true })` desde el `<script>` de la pantalla de apertura, disparado en el evento de tap, en
  paralelo a revelar el contenido en el cliente — **no bloqueante**: el contenido se muestra
  aunque el POST falle, se demore, o el destinatario esté sin conexión (Principio I; Edge
  Case de escaneo sin conexión)

## Comportamiento

1. Busca el regalo por `slug` en la tabla `slugs` → `regalos`.
2. Si no existe, no está `publicado`, o está vencido → `404` (no hay nada que registrar; el
   `GET` a esa misma URL ya está mostrando "no disponible").
3. Si es servible → ejecuta la misma UPDATE atómica de research.md #5:
   `UPDATE regalos SET primera_apertura_en = now() WHERE id = $1 AND primera_apertura_en IS
   NULL`, e inserta una fila en `aperturas` (`es_primera = true` si la UPDATE afectó una fila,
   `false` en caso contrario).
4. Responde `204` en ambos casos (primera apertura o apertura repetida) — el cliente no
   necesita distinguirlos, ya reveló el contenido de forma optimista.

## Response

- `204 No Content` → apertura registrada (primera o repetida).
- `404` → `slug` no corresponde a un regalo servible.

## Invariantes garantizados

- Ningún `GET` a `/r/[slug]` ni a ninguna otra ruta de esta feature registra una apertura —
  es el único invariante que hace verificable research.md #19 (crawlers de vista previa no
  cuentan).
- `primera_apertura_en` se setea como máximo una vez por regalo, sin importar cuántas veces se
  llame este endpoint en paralelo (misma garantía atómica que research.md #5).
