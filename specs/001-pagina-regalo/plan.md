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
| I | El regalo abre primero | PASS | SSR puro, sin login; primer paint es la portada (pantalla de apertura, FR-008), que ya cuenta como "primer contenido" para SC-001 — no es un interstitial ajeno al producto, es el bloque `portada`. Fallbacks de imagen/canción/conexión definidos en Edge Cases. Ver research.md #9. |
| II | Bloques, no plantillas | PASS | `src/bloques/` con un `.astro` por tipo + `registro.ts` (mapa tipo→componente). Agregar bloque = 1 archivo + 1 línea de registro. Ningún campo con nombre de ocasión en el motor; temas y bloques son genéricos. |
| III | Nada se publica sin aprobación | PASS | `/revisar/[id]` renderiza el mismo layout que `/r/[slug]` a partir del mismo `contenido` JSON. `POST /api/regalos/[id]/aprobar` es la única vía para pasar a `publicado`, y exige `aprobado_en` no nulo antes de servir en `/r/[slug]`. |
| IV | La IA redacta, no inventa | N/A | Redacción asistida está fuera de alcance de esta feature (spec.md, Out of Scope). Sin superficie de IA que verificar acá. |
| V | Datos mínimos, borrado real | PASS | Fotos en rutas con UUID no listable; `vencimiento` nullable = permanente; `DELETE /api/regalos/[id]/eliminar` borra fila de regalo, fotos del bucket y aperturas asociadas (objetivo <72 h, ejecución inmediata); sin scripts de analítica de terceros en `/r/[slug]` ni en `/revisar/[id]`. |
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
│   └── api-eliminar.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── bloques/                        # Principio II: un componente por tipo de bloque
│   ├── Portada.astro
│   ├── Contador.astro              # <script> vanilla: cuenta desde/hasta fecha, tick en vivo
│   ├── Momento.astro
│   ├── Galeria.astro
│   ├── Cancion.astro               # <script> vanilla: play/pause explícito, sin autoplay
│   ├── Carta.astro
│   ├── Pregunta.astro              # <script> vanilla: revelar respuesta on-tap
│   ├── Cierre.astro
│   └── registro.ts                 # Mapa tipo (string) → componente Astro
├── layouts/
│   └── RegaloLayout.astro          # Layout compartido por /r/[slug] y /revisar/[id]; noindex
├── pages/
│   ├── r/
│   │   └── [slug].astro            # Ruta pública inmutable (Principio VI)
│   ├── revisar/
│   │   └── [id].astro              # Enlace de revisión (Principio III), mismo render
│   ├── no-disponible.astro         # FR-002: código inválido, no publicado o vencido
│   └── api/
│       └── regalos/
│           └── [id]/
│               ├── aprobar.ts      # POST — registra aprobado_en, pasa a "publicado"
│               └── eliminar.ts     # DELETE — borra regalo + fotos + aperturas (Principio V)
├── lib/
│   ├── supabase.ts                 # Cliente server-side (service role, nunca en el bundle del cliente)
│   ├── regalos.ts                  # Fetch + mapeo DB → vista; registro de apertura atómico
│   ├── slugs.ts                    # Alfabeto sin ambigüedad visual, generación y verificación en `slugs`
│   └── contenido/
│       ├── esquema.ts              # zod: contenido.v + receta[] append-only (Principio VI)
│       └── tipos-bloque.ts         # Tipos TS por bloque (portada, contador, ...)
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
    ├── lcp-portada.spec.ts             # SC-001: portada visible <2,5 s, 3G + gama baja simulada
    ├── sin-scroll-horizontal.spec.ts   # SC-002 / FR-020: 320–1440 px
    ├── contraste-aa.spec.ts            # SC-006: nocturno, papel y luminoso
    ├── render-sin-imagenes.spec.ts     # SC-005: texto legible con imágenes bloqueadas
    ├── bloque-desconocido.spec.ts      # FR-006: tipo no reconocido se omite en silencio
    ├── revision-y-aprobacion.spec.ts   # US2: /revisar/[id] == /r/[slug]; aprobación explícita
    ├── primera-apertura.spec.ts        # US3 + Edge Case: aperturas simultáneas, recarga x30
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
