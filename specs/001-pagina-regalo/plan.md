# Implementation Plan: Página de Regalo Personalizada

**Branch**: `001-pagina-regalo` | **Date**: 2026-08-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-pagina-regalo/spec.md`

## Summary

Servir, en `/r/[slug]`, la página pública de un regalo digital como la combinación de un
tema visual y una receta ordenada de bloques (portada, contador, momento, galería, canción,
carta, pregunta, cierre), renderizada 100% en servidor con Astro y sin framework de UI en el
cliente. La misma receta se sirve, antes de publicar, en un enlace de revisión distinto,
donde el comprador aprueba explícitamente antes de que el regalo pase a "publicado". Cada
apertura pública queda registrada; la primera apertura se marca una única vez de forma
atómica. El contenido de cada regalo viaja como JSON versionado (campo `v`), append-only en
sus campos y en sus tipos de bloque, y el slug de la URL nunca se reasigna, ni siquiera tras
un borrado.

## Technical Context

**Language/Version**: TypeScript 5.x sobre Astro 7 (Node.js 20 LTS en runtime serverless)

**Primary Dependencies**: Astro 7 (`output: "server"`), `@astrojs/vercel` (funciones
serverless Node, no Edge Runtime — ver research.md #1), `@supabase/supabase-js`, `zod`
(validación de esquema de contenido versionado), `resend` (emails, fuera del alcance de
render de esta feature pero comparte proyecto), `qrcode` + `sharp` (endpoint de tarjeta
imprimible, explícitamente fuera de alcance de esta feature), `@playwright/test` (dev
dependency)

**Storage**: Supabase Postgres (tablas `regalos`, `slugs`, `aperturas`); Supabase Storage
(bucket de fotos, rutas no adivinables)

**Testing**: Playwright, contra un build de preview, con emulación de red/CPU vía CDP para
los criterios medibles (LCP en 3G simulada, ancho 320–1440 px sin scroll horizontal,
contraste AA, render con imágenes bloqueadas)

**Target Platform**: Web, SSR en Vercel (Node serverless functions) al inicio, migrable a
Cloudflare Pages; consumo mayormente desde celular

**Project Type**: Web — proyecto único Astro (páginas SSR + rutas API en el mismo despliegue,
sin separación frontend/backend)

**Performance Goals**: Portada visible en <2,5 s en 3G simulada + gama baja (SC-001); JS de
la página `/r/[slug]` por debajo de 100 KB duro, objetivo real <20 KB (Reglas de Calidad,
Compuerta 5)

**Constraints**: Sin scroll horizontal entre 320–1440 px (FR-020, SC-002); contraste AA en
ambos temas (SC-006); `prefers-reduced-motion` respetado; sin HTML crudo del comprador
interpretado (FR-007); sin login para abrir el regalo ni para revisar (Principio I,
Assumptions); sin analítica de terceros en `/r/[slug]` (Principio V); ruta `/r/[slug]`
inmutable de por vida (Principio VI)

**Scale/Scope**: Una sola feature: renderizado del regalo, enlace de revisión + aprobación,
registro de apertura/primera apertura, expiración, borrado a pedido. 8 tipos de bloque al
lanzamiento. Sin panel de administración, sin cobro, sin carga de fotos, sin redacción con
IA (fuera de alcance, ver spec.md).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principio / regla | Estado | Cómo se cumple |
|---|---|---|---|
| I | El regalo abre primero | PASS | SSR puro, sin login; primer paint es la pantalla de apertura transversal del layout (FR-008, research.md #22), deliberadamente liviana (texto + fondo, sin fotos ni iframes), que cuenta como "primer contenido" para SC-001. Fallbacks de imagen/canción/conexión definidos en Edge Cases. Ver research.md #9. |
| II | Bloques, no plantillas | PASS | `src/bloques/` con un `.astro` por tipo + `registro.ts` (mapa tipo→componente). Agregar bloque = 1 archivo + 1 línea de registro. Ningún campo con nombre de ocasión en el motor; temas y bloques son genéricos. La pantalla de apertura es comportamiento del layout, no de un bloque (research.md #22), consistente con FR-005 (recetas sin `portada` siguen siendo válidas). |
| III | Nada se publica sin aprobación | PASS | `/revisar/[id]` renderiza el mismo layout que `/r/[slug]` a partir del mismo `contenido` JSON. `POST /api/regalos/[id]/aprobar` es la única vía para pasar a `publicado`, y exige `aprobado_en` no nulo antes de servir en `/r/[slug]`. |
| IV | La IA redacta, no inventa | N/A | Redacción asistida está fuera de alcance de esta feature (spec.md, Out of Scope). Sin superficie de IA que verificar acá. |
| V | Datos mínimos, borrado real | PASS, con nota | Fotos en rutas con UUID no listable; `vencimiento` nullable = permanente; `DELETE /api/regalos/[id]/eliminar` borra fila de regalo, fotos del bucket y aperturas asociadas (objetivo <72 h, ejecución inmediata); sin scripts de analítica propia en `/r/[slug]` ni en `/revisar/[id]`. El bloque `cancion` embebe Spotify/YouTube (research.md #21) — no es analítica nuestra, es el contenido que el comprador eligió, pero se documenta como tensión y se mitiga con carga diferida hasta el tap, `-nocookie` en YouTube, y dominio en lista blanca cerrada. |
| VI | Lo entregado es inmutable | PASS | `/r/[slug]` no cambia de forma. Tabla `slugs` independiente de `regalos`, nunca se borra una fila de `slugs` (Regalo VI, ítem 10 de Compuertas). `contenido.v` desde el primer registro (Compuerta 12). Bloques nuevos son archivos nuevos; ninguno se elimina (Compuerta 13). `compatibilidad-versiones.spec.ts` (ver research.md #17) es el único gate que hace esto *verificable*, no solo declarado: fija un `contenido.v=1` como fixture permanente que debe seguir renderizando igual para siempre, incluso cuando exista un esquema `v=2`. |
| — | JS budget (<100 KB duro, <20 KB objetivo) | PASS (a validar en Phase 1) | Cero hidratación de framework: los tres bloques interactivos (contador, canción, pregunta) usan `<script>` inline vanilla dentro de su propio `.astro`, sin runtime de React ni de islas. Ver research.md #9 para el desglose estimado. |

Sin violaciones que requieran la sección de Complexity Tracking.

**Re-chequeo post Phase 1** (tras research.md, data-model.md, contracts/): ningún artefacto de
diseño introdujo una violación nueva. En particular, la tabla `slugs` separada de `regalos`
(data-model.md) es lo que hace *verificable* la Compuerta 10 (no reasignación de slug tras
borrado), y el contrato `regalo-contenido.schema.md` es lo que hace verificables las
Compuertas 12 y 13 (versión desde el primer registro, ningún campo/tipo eliminado). Las 13
Compuertas de Aceptación quedan trazables a un artefacto concreto de este plan.

**Re-chequeo tras el ajuste a tres temas + tests de edge cases** (2026-08-30):

- **I. El regalo abre primero** — sin cambio de riesgo. `contenido-extremo.spec.ts` y
  `carta-larga.spec.ts` ahora hacen verificable en CI algo que antes solo estaba en el spec
  como texto: que el contenido sigue siendo legible en los casos límite reales (carta larga,
  emoji, foto extrema), no solo en el caso feliz.
- **II. Bloques, no plantillas** — sin cambio: pasar de dos a tres temas es un cambio de
  *valores* (`tema ∈ {...}`), no de forma; el motor sigue sin saber de ocasiones (research.md
  #13 documenta explícitamente por qué los nombres nocturno/papel/luminoso no son un escape
  a esa regla).
- **III. Nada se publica sin aprobación** — sin cambio, no tocado por este ajuste.
- **IV. La IA redacta, no inventa** — N/A, sigue fuera de alcance.
- **V. Datos mínimos, borrado real** — sin cambio.
- **VI. Lo entregado es inmutable** — reforzado: antes esta compuerta se declaraba cumplida
  por diseño; con `compatibilidad-versiones.spec.ts` (research.md #17) pasa a estar cubierta
  por un test que falla si alguien rompe `v: 1` al introducir una versión futura. Es el único
  principio que cambia de "cumplido por diseño" a "cumplido y verificado en CI" en esta
  vuelta.
- **JS budget** — sin cambio: los tests nuevos son Playwright (dev dependency, no viaja al
  cliente) y las reglas de encuadre/clamp (research.md #16, #18) se resuelven con CSS y unas
  pocas líneas dentro de los `<script>` ya presupuestados en `Galeria.astro` y
  `Contador.astro`, no agregan dependencias nuevas.

Sin violaciones nuevas; no aplica Complexity Tracking.

**Re-chequeo tras correcciones pre-implementación** (2026-08-30, cinco correcciones sobre
tasks.md):

- **I. El regalo abre primero** — reforzado, no debilitado: mover la pantalla de apertura al
  layout (research.md #22) la hace *más* liviana y consistente (nunca depende de que exista
  un bloque `portada`), y el embed de canción con carga diferida (research.md #21) asegura
  que ningún recurso de terceros pesado se cargue antes del tap, protegiendo el LCP en ambas
  mediciones (research.md #23).
- **II. Bloques, no plantillas** — reforzado: sacar la pantalla de apertura de `Portada.astro`
  corrige una inconsistencia real con FR-005 (una receta sin `portada` debía igual mostrar la
  pantalla de apertura, y con el diseño anterior no lo hacía). `momento` con foto opcional es
  un campo nuevo, no un tipo nuevo — sigue las reglas de evolución append-only.
- **III. Nada se publica sin aprobación** — sin cambio.
- **IV. La IA redacta, no inventa** — N/A, sin cambio.
- **V. Datos mínimos, borrado real** — es el principio más tensionado por esta vuelta: el
  embed de Spotify/YouTube en `cancion` introduce una dependencia de terceros que antes no
  existía (antes era audio propio en Storage). Se evaluó como PASS-con-nota porque (a) el
  Principio V prohíbe *analítica* que nosotros instrumentemos, no el contenido de terceros
  que el comprador eligió mostrar, y (b) el riesgo que sí aplicaría — carga de recursos de
  terceros en cada visita — se mitiga con carga diferida hasta el tap. La alternativa
  (alojar audio propio) fue descartada por ser un riesgo legal directo y mayor: la corrección
  cambia qué principio se tensiona (V, mitigable) a cambio de eliminar un riesgo fuera de la
  constitución (derechos de autor).
- **VI. Lo entregado es inmutable** — es el que más se beneficia de esta vuelta: sin la
  corrección 1, cualquier regalo compartido por WhatsApp/Instagram/iMessage/Facebook iba a
  registrar su "primera apertura" con un bot como si fuera el destinatario, y por ser un dato
  inmutable (Principio VI aplicado a datos, no solo a rutas) ese error no tenía corrección
  posible. `compatibilidad-versiones.spec.ts` (research.md #17) ahora también protege
  `momento.foto`: al ser un campo opcional agregado a un tipo existente, el fixture `v: 1` ya
  congelado no lo incluye, y el renderer debe seguir aceptándolo sin ese campo.
- **JS budget** — sin cambio de riesgo: el embed de canción no agrega peso a *nuestro* bundle
  (es un `<iframe>` insertado por una línea de script vanilla, no una librería de embed); el
  costo de red del reproductor en sí lo paga el destinatario solo si toca play, y no cuenta
  contra el presupuesto de la página del regalo (que se mide en la carga inicial).

Sin violaciones nuevas que requieran Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-pagina-regalo/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── regalo-contenido.schema.md
│   ├── api-aprobar.md
│   ├── api-eliminar.md
│   └── api-abrir.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── bloques/                        # Principio II: un componente por tipo de bloque
│   ├── Portada.astro               # Solo contenido de portada; la pantalla de apertura vive en RegaloLayout (research.md #22)
│   ├── Contador.astro              # <script> vanilla: cuenta desde/hasta fecha, tick en vivo, clamp en 0
│   ├── Momento.astro                # Texto + foto opcional (mismo framing que Galeria, research.md #20)
│   ├── Galeria.astro
│   ├── Cancion.astro               # <script> vanilla: embed diferido de Spotify/YouTube, sin audio propio (research.md #21)
│   ├── Carta.astro
│   ├── Pregunta.astro              # <script> vanilla: revelar respuesta on-tap
│   ├── Cierre.astro
│   └── registro.ts                 # Mapa tipo (string) → componente Astro
├── layouts/
│   └── RegaloLayout.astro          # Layout compartido por /r/[slug] y /revisar/[id]; noindex; pantalla de apertura transversal (research.md #22) que dispara POST /abrir en el tap
├── pages/
│   ├── r/
│   │   └── [slug].astro            # Ruta pública inmutable (Principio VI); NUNCA registra apertura (research.md #19)
│   ├── revisar/
│   │   └── [id].astro              # Enlace de revisión (Principio III), mismo render
│   ├── no-disponible.astro         # FR-002: código inválido, no publicado o vencido
│   └── api/
│       ├── abrir/
│       │   └── [slug].ts           # POST — único disparador de una apertura (research.md #19); en ruta propia porque Astro no admite [slug] y [id] como hermanos dinámicos bajo regalos/
│       └── regalos/
│           └── [id]/
│               ├── aprobar.ts      # POST — registra aprobado_en, pasa a "publicado"
│               └── eliminar.ts     # DELETE — borra regalo + fotos + aperturas (Principio V)
├── lib/
│   ├── supabase.ts                 # Cliente server-side (service role, nunca en el bundle del cliente)
│   ├── regalos.ts                  # Fetch + mapeo DB → vista; registrarApertura() atómico (invocado solo desde abrir.ts)
│   ├── slugs.ts                    # Alfabeto sin ambigüedad visual, generación y verificación en `slugs`
│   └── contenido/
│       ├── esquema.ts              # zod: contenido.v + receta[] append-only (Principio VI)
│       ├── tipos-bloque.ts         # Tipos TS por bloque (portada, contador, ...)
│       └── embeds.ts               # Lista blanca de dominios + resolución a URL de embed (research.md #21)
├── temas/
│   ├── tokens-nocturno.css         # Íntimo y oscuro (aniversarios, declaraciones), AA verificado
│   ├── tokens-papel.css            # Claro y analógico (propuestas, bodas), AA verificado
│   └── tokens-luminoso.css         # Alegre y con color (cumpleaños, amistad), AA verificado
└── styles/
    └── base.css                    # Reset + layout compartido, sin Tailwind/preprocesadores

supabase/
└── migrations/
    └── 0001_regalos.sql            # regalos, slugs, aperturas + índices/constraints

tests/
└── e2e/
    ├── lcp.spec.ts                     # SC-001 (pantalla de apertura) + SC-008 (primer bloque real post-tap), 3G + gama baja simulada
    ├── sin-scroll-horizontal.spec.ts   # SC-002 / FR-020: 320–1440 px
    ├── contraste-aa.spec.ts            # SC-006: nocturno, papel y luminoso
    ├── render-sin-imagenes.spec.ts     # SC-005: texto legible con imágenes bloqueadas
    ├── bloque-desconocido.spec.ts      # FR-006: tipo no reconocido se omite en silencio
    ├── revision-y-aprobacion.spec.ts   # US2: /revisar/[id] == /r/[slug]; aprobación explícita
    ├── primera-apertura.spec.ts        # US3 + Edge Case: aperturas simultáneas, recarga x30, GET con User-Agent de crawler NO registra apertura (research.md #19)
    ├── carta-larga.spec.ts             # Edge Case: carta ~4.000 caracteres, se lee completa sin romper diseño
    ├── contenido-extremo.spec.ts       # Edge Cases: nombre con emoji/acentos, carta vacía omitida, foto cuadrada/vertical sin deformar
    ├── fecha-futura.spec.ts            # Edge Case: contador con fechaInicio futura, clamp en 0, nunca negativo
    └── compatibilidad-versiones.spec.ts # Principio VI: contenido.v=1 renderiza igual con esquema actual en v>1
```

**Structure Decision**: Proyecto único Astro (variante del Option 1: Single project). No hay
separación frontend/backend porque Astro sirve páginas SSR y rutas API desde el mismo
despliegue serverless; no se usa el layout de "Web application" (Option 2) porque no existe
un backend independiente ni un cliente SPA — la interactividad vive en `<script>` por bloque,
no en una app de frontend separada. `src/bloques/` es el único punto de extensión exigido por
el Principio II; todo lo demás en `src/` es andamiaje de soporte.

## Complexity Tracking

*Sin violaciones a la constitución. Sección no aplica.*
