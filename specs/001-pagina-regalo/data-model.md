# Phase 1 Data Model: Página de Regalo Personalizada

Deriva de las Key Entities de spec.md (Regalo, Bloque, Apertura) y de las decisiones de
research.md #3–#5 y #14.

## Regalo

Tabla `regalos` (Postgres / Supabase).

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `uuid` PK, default `gen_random_uuid()` | También sirve como token de `/revisar/[id]` (research.md #7) |
| `slug` | `text` | FK única a `slugs.slug`; inmutable una vez asignada (Principio VI) |
| `tema` | `text` | `'nocturno'` \| `'papel'` \| `'luminoso'` al lanzamiento (research.md #13); nuevos temas se agregan por valor, nunca se quita uno existente |
| `contenido` | `jsonb` | `{ v: number, receta: Bloque[] }` — ver sección Bloque; ver contracts/regalo-contenido.schema.md |
| `estado` | `text` | `'en_revision'` \| `'publicado'`; solo avanza vía `aprobar.ts` (FR-013) |
| `aprobado_en` | `timestamptz`, null | Se setea una sola vez, junto con el cambio de `estado` (FR-013) |
| `vencimiento` | `timestamptz`, null | `null` = vigencia permanente (FR-016, Principio V) |
| `primera_apertura_en` | `timestamptz`, null | Set atómico, ver research.md #5 (FR-015) |
| `created_at` | `timestamptz`, default `now()` | |

**Reglas de validación**:
- `contenido.v` DEBE existir y ser ≥1 desde la primera fila insertada (Compuerta 12).
- `estado` solo puede pasar de `'en_revision'` a `'publicado'`, nunca al revés, y solo cuando
  `aprobado_en IS NOT NULL` (FR-013, Principio III).
- Un regalo es servible en `/r/[slug]` (FR-002) solo si: existe, `estado = 'publicado'`, y
  (`vencimiento IS NULL` o `vencimiento > now()`).

**Transiciones de estado**:

```text
en_revision --(POST /api/regalos/[id]/aprobar, registra aprobado_en)--> publicado
```

No hay transición de vuelta a `en_revision` ni transición a un tercer estado: el borrado
(FR-018) elimina la fila entera, no es una transición de `estado`.

## Slug

Tabla `slugs` — independiente de `regalos`, nunca se borra una fila (research.md #4,
Principio VI ítem 10).

| Campo | Tipo | Reglas |
|---|---|---|
| `slug` | `text` PK | 8 caracteres, alfabeto `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (research.md #3) |
| `regalo_id` | `uuid`, null, FK a `regalos.id` | `NULL` si el regalo fue borrado o el slug aún no se asignó; nunca se reasigna a otro regalo tras quedar en `NULL` |
| `creado_en` | `timestamptz`, default `now()` | |

## Bloque (dentro de `regalos.contenido.receta[]`, no es tabla propia)

No normalizado en SQL: vive como elemento de array dentro del JSONB `contenido` (research.md
#14), para que agregar un tipo de bloque no requiera migración de esquema SQL.

Forma común a todo bloque:

| Campo | Tipo | Reglas |
|---|---|---|
| `tipo` | `string` | Uno de los tipos reconocidos (ver tabla siguiente) o un tipo futuro/desconocido, que se omite en render (FR-006) |
| `posicion` | `number` | Orden dentro de la receta (FR-003); la receta se renderiza ordenada por este campo |
| *(campos propios del tipo)* | — | Ver por tipo abajo; todos validados por `zod`, todos opcionales-desde-su-versión salvo los marcados requeridos |

Tipos al lanzamiento (FR-004) y sus datos propios:

| Tipo | Datos propios |
|---|---|
| `portada` | `nombreDestinatario` (string, requerido), `subtitulo?` (string) |
| `contador` | `fechaInicio` (datetime, requerido) — puede ser futura (Edge Case: cuenta regresiva en vez de transcurrido); en vivo, el valor mostrado se clampea a 0 en el cruce, nunca negativo (research.md #18) |
| `momento` | `titulo?` (string), `texto` (string, requerido), `fecha?` (date) |
| `galeria` | `fotos: Foto[]` — `Foto = { url: string, alt: string (requerido), ancho?: number, alto?: number }`; encuadre con `object-fit: contain`, nunca recorta (research.md #16) |
| `cancion` | `url` (string, requerido), `titulo?` (string), `artista?` (string) |
| `carta` | `texto` (string, requerido; hasta ~4000 caracteres, Edge Case) |
| `pregunta` | `texto` (string, requerido), `respuesta?` (string) |
| `cierre` | `texto?` (string) |

**Reglas de evolución (Principio VI, Compuertas 12–13)**:
- Un campo nuevo en un tipo existente se agrega como opcional; el renderer de una receta vieja
  (sin ese campo) sigue funcionando sin cambios.
- Ningún campo de esta tabla se renombra ni se elimina una vez emitida una versión con él.
- Un tipo de bloque nuevo (p. ej. `momento` v2) es un tipo nuevo en el registro
  (`src/bloques/registro.ts`) y en el esquema `zod`; el tipo anterior sigue soportado para
  siempre.
- Un bloque `carta` o `momento` sin contenido significativo (Edge Case: carta vacía) se omite
  en el render igual que un tipo desconocido — no es un error de validación, es una condición
  de render.
- Todo texto de bloque se escapa como texto plano al renderizar (FR-007); ninguna etiqueta
  HTML dentro de `texto`, `titulo`, etc. se interpreta.

## Apertura

Tabla `aperturas`.

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `uuid` PK, default `gen_random_uuid()` | |
| `regalo_id` | `uuid` FK a `regalos.id`, `on delete cascade` | Se borra en cascada al borrar el regalo (FR-018, Principio V) |
| `ocurrido_en` | `timestamptz`, default `now()` | |
| `es_primera` | `boolean` | `true` únicamente en la fila cuya inserción coincidió con el `UPDATE ... WHERE primera_apertura_en IS NULL` exitoso (research.md #5) |

**Reglas**: cada GET a `/r/[slug]` sobre un regalo servible inserta una fila (FR-014); ninguna
inserción posterior modifica `regalos.primera_apertura_en` (FR-015); 30 recargas producen 30
filas y ningún cambio en la primera apertura (Edge Case).

## Relaciones

```text
slugs (1) ── (0..1) regalos      # regalos.slug -> slugs.slug; slugs sobrevive al borrado de regalos
regalos (1) ── (0..n) aperturas  # on delete cascade
regalos.contenido.receta[]        # array embebido, no relación SQL
```
