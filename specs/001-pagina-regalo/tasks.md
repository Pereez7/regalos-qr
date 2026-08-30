---

description: "Task list for Página de Regalo Personalizada"
---

# Tasks: Página de Regalo Personalizada

**Input**: Design documents from `/specs/001-pagina-regalo/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: incluidos. `plan.md` y `quickstart.md` ya enumeran los 11 specs de Playwright como
el gate de "terminado" de esta feature (junto con las Compuertas de Aceptación de la
constitución), así que no son opcionales para este proyecto.

**Organization**: tareas agrupadas por historia de usuario (spec.md) para permitir
implementación y prueba independiente de cada una.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede ejecutarse en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: US1, US2 o US3 — solo en las fases 3+
- Cada tarea incluye la ruta de archivo exacta

## Path Conventions

Proyecto único Astro (ver plan.md → Structure Decision): `src/`, `tests/`, `supabase/` en la
raíz del repo. No hay separación frontend/backend.

## Cambios de esta revisión (previos a implementar)

Esta versión de `tasks.md` incorpora 5 correcciones sobre la versión anterior, todas
propagadas también a `plan.md`, `research.md`, `data-model.md`, `contracts/` y `spec.md`:

1. **Registro de apertura movido a una acción humana explícita** — ya no ocurre en el `GET`
   de `/r/[slug]` (evitaba que los crawlers de vista previa de WhatsApp/Instagram/iMessage/
   Facebook marcaran la "primera apertura" antes que el destinatario, un dato irreversible).
   Ahora vive en `POST /api/abrir/[slug]`, llamado desde el tap en la pantalla de apertura.
2. **Bloque `momento` gana `foto?: Foto`** — el bloque más usado del producto ahora puede
   llevar una foto con el mismo tratamiento de encuadre que `galeria`.
3. **Bloque `cancion` pasa a embed de terceros** (Spotify/YouTube vía `<iframe>` diferido,
   lista blanca de dominios) — ya no aloja audio propio, por riesgo legal de derechos de
   autor.
4. **`lcp.spec.ts`** (renombrado desde `lcp-portada.spec.ts`) mide dos tiempos: la pantalla
   de apertura (SC-001) y, tras el tap, el primer bloque real de contenido (SC-008, nuevo).
5. **La pantalla de apertura vive en `RegaloLayout.astro`**, no en `Portada.astro` — es
   comportamiento transversal que debe funcionar con o sin bloque `portada` en la receta.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: inicialización del proyecto y herramientas compartidas de desarrollo/test.

- [ ] T001 Inicializar proyecto Astro 7 + TypeScript: `package.json`, `astro.config.mjs` con
      `output: "server"` y adaptador `@astrojs/vercel` (Node serverless, no Edge — research.md
      #1), `tsconfig.json` en modo estricto
- [ ] T002 [P] Instalar dependencias de runtime y dev: `@supabase/supabase-js`, `zod`,
      `resend`, `qrcode`, `sharp`, `@playwright/test` (dev), en `package.json`
- [ ] T003 [P] Crear `supabase/config.toml` para desarrollo local y `.env.example` con
      `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPS_SECRET` (research.md #9)
- [ ] T004 [P] Configurar `playwright.config.ts` apuntando a `npm run build && npm run
      preview` (no al dev server), per quickstart.md
- [ ] T005 [P] Crear helper de throttling CDP en `tests/e2e/utils/network-throttle.ts`
      (`Network.emulateNetworkConditions` perfil "Slow 3G" + `Emulation.setCPUThrottlingRate`
      rate 4), reutilizado por las dos mediciones de `lcp.spec.ts` (research.md #12, #23)
- [ ] T006 [P] Crear script de seed `scripts/seed-regalo-demo.ts`: inserta un regalo
      `en_revision` con receta que incluye los 8 tipos de bloque — incluyendo un `momento` con
      `foto` y un `cancion` con una URL real de `open.spotify.com` o `youtube.com` — imprime
      `id` y `slug` (quickstart.md → Setup)
- [ ] T007 Crear estructura de carpetas vacías per plan.md → Project Structure:
      `src/bloques/`, `src/layouts/`, `src/pages/r/`, `src/pages/revisar/`,
      `src/pages/api/abrir/`, `src/pages/api/regalos/[id]/`, `src/lib/`,
      `src/lib/contenido/`, `src/temas/`, `src/styles/`, `supabase/migrations/`, `tests/e2e/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: motor compartido que toda historia de usuario necesita — esquema de datos,
cliente de Supabase, generación de slugs, contrato de contenido versionado, lista blanca de
embeds, tokens de tema y CSS base.

**⚠️ CRITICAL**: ninguna historia de usuario puede empezar hasta que esta fase esté completa.

- [ ] T008 Escribir migración `supabase/migrations/0001_regalos.sql`: tablas `slugs`
      (`slug` PK, `regalo_id` nullable FK, `creado_en`), `regalos` (`id` PK, `slug` FK única,
      `tema`, `contenido` jsonb, `estado` con constraint `en_revision`/`publicado`,
      `aprobado_en`, `vencimiento`, `primera_apertura_en`, `created_at`), `aperturas`
      (`id` PK, `regalo_id` FK `on delete cascade`, `ocurrido_en`, `es_primera`) — per
      data-model.md
- [ ] T009 [P] Implementar cliente Supabase server-only (service role, nunca en bundle de
      cliente) en `src/lib/supabase.ts`
- [ ] T010 [P] Implementar generación de slug en `src/lib/slugs.ts`: alfabeto
      `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`, 8 caracteres, bytes aleatorios criptográficos,
      `INSERT ... ON CONFLICT DO NOTHING` con reintento en `slugs` (research.md #3, #4)
- [ ] T011 [P] Implementar esquemas `zod` y tipos TS del contenido versionado v1 en
      `src/lib/contenido/esquema.ts` (`{ v: 1, receta: Bloque[] }`, dispatch por `v`) y
      `src/lib/contenido/tipos-bloque.ts` (portada, contador, momento con `foto?: Foto`,
      galeria, cancion, carta, pregunta, cierre) — per contracts/regalo-contenido.schema.md
- [ ] T012 [P] Implementar `src/lib/contenido/embeds.ts`: lista blanca de dominios
      (`open.spotify.com`, `spotify.com`, `youtube.com`, `youtu.be`, `www.youtube.com`) y
      `resolverEmbed(url)` que valida el dominio y devuelve la URL de embed (YouTube vía
      `www.youtube-nocookie.com`; Spotify vía su URL de embed estándar), o `null` si el
      dominio no está permitido — per research.md #21
- [ ] T013 [P] Crear `src/styles/base.css`: reset, `max-width: 100vw` / `overflow-x: hidden`
      a nivel layout (FR-020), baseline `prefers-reduced-motion`, foco visible global
- [ ] T014 [P] Crear `src/temas/tokens-nocturno.css` — custom properties del tema íntimo y
      oscuro, pares fondo/texto verificados AA (research.md #13)
- [ ] T015 [P] Crear `src/temas/tokens-papel.css` — custom properties del tema claro y
      analógico, pares fondo/texto verificados AA (research.md #13)
- [ ] T016 [P] Crear `src/temas/tokens-luminoso.css` — custom properties del tema alegre y
      con color, pares fondo/texto verificados AA (research.md #13)
- [ ] T017 Implementar `src/lib/regalos.ts`: `obtenerRegaloPublicado(slug)` (valida
      `estado='publicado'` y no vencido, FR-002/017), `obtenerRegaloParaRevision(id)` (sin
      filtro de estado, FR-012), ambas validan `contenido` con `esquema.ts`; y
      `registrarApertura(regaloId)` con la UPDATE atómica `SET primera_apertura_en = now()
      WHERE primera_apertura_en IS NULL` + insert en `aperturas` (research.md #5) — **esta
      última función no se invoca desde ningún `GET`, solo desde `POST /api/abrir/[slug]`**
      (research.md #19) — depende de T008, T009, T011

**Checkpoint**: motor listo — esquema de datos, slugs, validación de contenido, embeds y
temas disponibles para cualquier historia.

---

## Phase 3: User Story 1 - El destinatario escanea el QR y ve su historia (Priority: P1) 🎯 MVP

**Goal**: servir `/r/[slug]` como tema + receta de bloques renderizada en servidor, con
pantalla de apertura transversal (no atada a ningún bloque), degradación ante fallas, omisión
silenciosa de bloques no reconocidos, y registro de apertura disparado únicamente por la
acción humana de tocar la pantalla de apertura — nunca por el `GET` en sí.

**Independent Test**: publicar un regalo con una receta de bloques y abrir su enlace público
desde un celular: la página abre, muestra la pantalla de apertura, y tras tocarla permite
recorrer el resto de los bloques sin errores (spec.md → User Story 1).

### Tests for User Story 1 ⚠️

> Escribir estos tests primero; deben fallar antes de la implementación.

- [ ] T018 [P] [US1] `tests/e2e/carta-larga.spec.ts` — carta de ~4.000 caracteres se muestra
      completa, sin scroll horizontal (Edge Case)
- [ ] T019 [P] [US1] `tests/e2e/contenido-extremo.spec.ts` — nombre con emoji/acentos
      verbatim, carta vacía omitida, foto cuadrada y vertical muy alargada (en `galeria` y en
      la `foto` de `momento`) sin recorte que pierda sentido (Edge Cases, research.md #16,
      #20)
- [ ] T020 [P] [US1] `tests/e2e/fecha-futura.spec.ts` — `fechaInicio` futura: contador cuenta
      regresiva y nunca negativo en el cruce (Edge Case, research.md #18)
- [ ] T021 [P] [US1] `tests/e2e/bloque-desconocido.spec.ts` — tipo no reconocido se omite en
      silencio, resto de la página normal (FR-006); incluye un `cancion` con dominio fuera de
      la lista blanca, que debe omitirse igual (research.md #21)
- [ ] T022 [P] [US1] `tests/e2e/render-sin-imagenes.spec.ts` — con imágenes bloqueadas, 100%
      del texto sigue legible (SC-005)
- [ ] T023 [P] [US1] `tests/e2e/sin-scroll-horizontal.spec.ts` — anchos 320–1440 px, cero
      scroll horizontal en ningún bloque (SC-002, FR-020)
- [ ] T024 [P] [US1] `tests/e2e/lcp.spec.ts` — dos mediciones bajo 3G simulada + gama baja
      (`tests/e2e/utils/network-throttle.ts`): (1) pantalla de apertura visible <2,5 s
      (SC-001); (2) tras simular el tap, primer bloque real de la receta visible <2,5 s
      adicionales (SC-008, research.md #23)

### Implementation for User Story 1

- [ ] T025 [P] [US1] Crear `src/bloques/Portada.astro` — solo contenido de portada:
      `nombreDestinatario` (requerido, se escapa como texto plano), `subtitulo?`; **sin**
      lógica de pantalla de apertura, que vive en el layout (research.md #22)
- [ ] T026 [P] [US1] Crear `src/bloques/Contador.astro` — `fechaInicio`; `<script>` vanilla
      con `setInterval`, tick en vivo (FR-009), cuenta regresiva si `fechaInicio` es futura, y
      clamp a `0` en el cruce (nunca negativo, research.md #18)
- [ ] T027 [P] [US1] Crear `src/bloques/Momento.astro` — `titulo?`, `texto` (requerido, se
      omite si está vacío), `fecha?`, `foto?` con `alt` requerido y el mismo encuadre
      `object-fit: contain` que `Galeria.astro` (research.md #20)
- [ ] T028 [P] [US1] Crear `src/bloques/Galeria.astro` — `fotos: Foto[]`, cada `<img>` con
      `alt` requerido y `object-fit: contain` dentro de un contenedor con `aspect-ratio`
      reservado desde `ancho`/`alto` si vienen, sin recorte destructivo (research.md #16)
- [ ] T029 [P] [US1] Crear `src/bloques/Cancion.astro` — usa `resolverEmbed(url)` de
      `src/lib/contenido/embeds.ts` (T012); si devuelve `null`, el bloque no renderiza nada
      (research.md #21); si es válido, muestra un botón/carátula y un `<script>` vanilla que
      recién inserta el `<iframe>` (sin parámetro de autoplay) en el DOM al tocar — cero
      requests a Spotify/YouTube antes del tap
- [ ] T030 [P] [US1] Crear `src/bloques/Carta.astro` — `texto` (requerido); layout que se
      adapta en alto a textos largos (~4.000 caracteres) sin romper el diseño; se omite si el
      texto está vacío
- [ ] T031 [P] [US1] Crear `src/bloques/Pregunta.astro` — `texto`, `respuesta?`; `<script>`
      vanilla que alterna `aria-expanded` para revelar la respuesta al tocar
- [ ] T032 [P] [US1] Crear `src/bloques/Cierre.astro` — `texto?`
- [ ] T033 [US1] Crear `src/bloques/registro.ts` — `Record<string, Componente>` mapeando los 8
      `tipo` a sus componentes; cualquier `tipo` ausente del mapa se resuelve a `undefined`
      (FR-006, research.md #15) — depende de T025–T032
- [ ] T034 [US1] Crear `src/layouts/RegaloLayout.astro` — recibe `tema` + `receta`, aplica el
      archivo de tokens correspondiente, renderiza la **pantalla de apertura transversal**
      (FR-008): busca el primer bloque `tipo: "portada"` en `receta` para tomar
      `nombreDestinatario` (si no hay, usa un texto genérico), y en el tap dispara `POST
      /api/abrir/[slug]` en modo *fire-and-forget* (`keepalive: true`, sin bloquear la
      revelación del contenido) antes de iterar `receta` ordenada por `posicion` resolviendo
      cada bloque vía `registro.ts` (omitiendo silenciosamente los no reconocidos); agrega
      `<meta name="robots" content="noindex">` — depende de T033, T014–T016
- [ ] T035 [P] [US1] Crear `src/pages/no-disponible.astro` — página de "no disponible" sin
      detalles técnicos, para código inexistente, no publicado o vencido (FR-002)
- [ ] T036 [P] [US1] Crear `src/pages/api/abrir/[slug].ts` — `POST`: resuelve `slug` a un
      regalo servible vía `obtenerRegaloPublicado`; si no existe/no publicado/vencido →
      `404`; si es servible, llama `registrarApertura(regalo.id)` (T017) y responde `204` —
      única ruta de todo el sistema que puede marcar una apertura (FR-014, research.md #19,
      contracts/api-abrir.md) — depende de T017
- [ ] T037 [US1] Crear `src/pages/r/[slug].astro` — ruta pública inmutable: llama
      `obtenerRegaloPublicado(slug)`; si no existe/no publicado/vencido, renderiza
      `no-disponible.astro`; si sirve, renderiza `RegaloLayout` — **sin llamar a
      `registrarApertura` ni a `/api/abrir` desde el servidor**; el registro ocurre solo por
      el tap del cliente contra T036 (FR-002, FR-014, FR-017) — depende de T017, T034, T035

**Checkpoint**: User Story 1 completa y probable de forma independiente — este es el MVP.

---

## Phase 4: User Story 2 - El comprador revisa y aprueba la página antes de que exista el QR (Priority: P2)

**Goal**: enlace de revisión que muestra exactamente el mismo render que verá el destinatario,
y una aprobación explícita como única vía hacia "publicado".

**Independent Test**: generar un regalo `en_revision`, abrir su enlace de revisión (distinto
del público), confirmar que muestra el contenido exacto y que el estado no avanza a
"publicado" hasta registrar una aprobación explícita (spec.md → User Story 2).

### Tests for User Story 2 ⚠️

- [ ] T038 [P] [US2] `tests/e2e/revision-y-aprobacion.spec.ts` — `/revisar/[id]` renderiza
      igual que `/r/[slug]` publicado (incluida la pantalla de apertura); `/r/[slug]` da "no
      disponible" mientras no hay aprobación; tras aprobar, ambos coinciden y `aprobado_en`
      queda fijo (US2, Acceptance Scenarios 1–4)

### Implementation for User Story 2

- [ ] T039 [US2] Crear `src/pages/revisar/[id].astro` — llama
      `obtenerRegaloParaRevision(id)`, renderiza el mismo `RegaloLayout` que `/r/[slug]`
      (FR-012), y muestra un `<form method="POST" action="/api/regalos/[id]/aprobar">` con el
      botón "Aprobar" cuando `estado === 'en_revision'` (research.md #8) — depende de T034,
      T017
- [ ] T040 [US2] Crear `src/pages/api/regalos/[id]/aprobar.ts` — `POST`: si `estado !==
      'en_revision'` no modifica nada y redirige 303; si es `'en_revision'`, ejecuta `UPDATE
      regalos SET aprobado_en = now(), estado = 'publicado' WHERE id = $1 AND estado =
      'en_revision'` y redirige 303 a `/revisar/[id]` (FR-013, contracts/api-aprobar.md) —
      depende de T009
- [ ] T041 [US2] En `src/pages/revisar/[id].astro`, agregar el estado post-aprobación: cuando
      `estado === 'publicado'`, mostrar la fecha de `aprobado_en` en vez del formulario
      (Acceptance Scenario 3 de US2) — depende de T039, T040

**Checkpoint**: User Stories 1 y 2 funcionan de forma independiente.

---

## Phase 5: User Story 3 - El comprador se entera de la primera apertura (Priority: P3)

**Goal**: el comprador puede ver, en el enlace de su regalo, si ya fue abierto y cuándo — con
la garantía de que ese dato solo se marcó por una acción humana real, nunca por un crawler.

**Independent Test**: abrir por primera vez (con un tap real) el enlace público de un regalo
publicado y verificar que queda registrada una única fecha/hora de "primera apertura",
visible para el comprador, que no se sobrescribe en aperturas posteriores ni la dispara un
acceso automatizado (spec.md → User Story 3).

### Tests for User Story 3 ⚠️

- [ ] T042 [P] [US3] `tests/e2e/primera-apertura.spec.ts` — primera apertura registra
      `primera_apertura_en` solo tras `POST /api/abrir/[slug]`; dos llamadas simultáneas a ese
      endpoint producen una única marca (research.md #5); 30 ciclos de recarga+tap no la
      modifican ni degradan el rendimiento (Edge Cases); y — la corrección de esta ronda — un
      `GET` a `/r/[slug]` con `User-Agent` de crawler (WhatsApp/Instagram/iMessage/Facebook)
      NO registra apertura bajo ninguna circunstancia (research.md #19) — depende de T036,
      T037 para tener ambas rutas construidas

### Implementation for User Story 3

- [ ] T043 [US3] En `src/pages/revisar/[id].astro`, mostrar `primera_apertura_en` cuando no es
      `null` ("ya fue abierto, el [fecha/hora]") sin disparar ningún aviso automático (FR-019)
      — depende de T039; el registro atómico en sí ya lo entrega T017/T036

**Checkpoint**: las tres historias de usuario funcionan de forma independiente.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: garantías que atraviesan varias historias — versionado del contenido, contraste
en los tres temas, y la capacidad de borrado a pedido.

- [ ] T044 [P] Crear fixture dorado `tests/fixtures/contenido-v1.json` — documento `{ v: 1,
      receta: [...] }` con un ejemplo de cada uno de los 8 tipos de bloque, incluyendo un
      `momento` con `foto` y un `cancion` con URL de Spotify; una vez creado, no se vuelve a
      editar (research.md #17)
- [ ] T045 [P] `tests/e2e/compatibilidad-versiones.spec.ts` — renderiza
      `tests/fixtures/contenido-v1.json` contra el esquema/registro actuales y verifica que el
      resultado no cambia; test de regresión permanente para el Principio VI (research.md
      #17) — depende de T044, T033, T034
- [ ] T046 [P] `tests/e2e/contraste-aa.spec.ts` — calcula el ratio de contraste WCAG de cada
      par fondo/texto en `tokens-nocturno.css`, `tokens-papel.css` y `tokens-luminoso.css`
      contra el umbral AA (SC-006) — depende de T014, T015, T016
- [ ] T047 Crear `src/pages/api/regalos/[id]/eliminar.ts` — `DELETE` protegido por
      `Authorization: Bearer <OPS_SECRET>`; borra los objetos de Storage bajo
      `regalos/{id}/`, borra la fila de `regalos` (cascada a `aperturas`), y pone
      `slugs.regalo_id = NULL` sin borrar la fila de `slugs` (FR-018, Principio V,
      contracts/api-eliminar.md) — depende de T009
- [ ] T048 Ejecutar la validación completa de `quickstart.md`: los 3 escenarios manuales (US1,
      US2, US3, incluida la verificación de crawler del Escenario 3) contra `supabase start` +
      `npm run seed:regalo-demo`, y `npx playwright test` en verde contra el build de
      producción (`npm run build && npm run preview`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias — puede empezar de inmediato
- **Foundational (Phase 2)**: depende de Setup — BLOQUEA todas las historias de usuario
- **User Story 1 (Phase 3)**: depende de Foundational
- **User Story 2 (Phase 4)**: depende de Foundational; reutiliza `RegaloLayout.astro` y
  `regalos.ts` construidos en User Story 1 (T034, T017) — no puede empezar antes de que esos
  dos archivos existan, aunque el resto de US1 no sea prerrequisito funcional
- **User Story 3 (Phase 5)**: depende de Foundational, de `src/pages/revisar/[id].astro`
  (T039, de US2), y de que existan tanto `/api/abrir/[slug]` (T036) como `/r/[slug]` (T037)
  de US1 — el test de crawler (T042) necesita ambas rutas para contrastar GET vs POST
- **Polish (Phase 6)**: depende de que existan los 8 bloques y el registro (T025–T033, de
  US1) para T045, y de los tokens de tema (T014–T016) para T046; T047 solo depende de
  Foundational

### User Story Dependencies

- **US1 (P1)**: solo depende de Foundational — completamente independiente
- **US2 (P2)**: depende de Foundational + reutiliza `RegaloLayout.astro`/`regalos.ts` de US1
  (dependencia de archivo, no de que US1 esté "terminada" como historia)
- **US3 (P3)**: depende de Foundational + reutiliza `revisar/[id].astro` de US2 y
  `abrir/[slug].ts` + `r/[slug].astro` de US1

### Within Each User Story

- Tests antes que implementación (deben fallar primero)
- Bloques (modelos de contenido) antes que `registro.ts`
- `registro.ts` antes que `RegaloLayout.astro`
- `RegaloLayout.astro` antes que las páginas que lo consumen (`r/[slug].astro`,
  `revisar/[id].astro`)
- `regalos.ts` (`registrarApertura`) antes que `api/abrir/[slug].ts`; `api/abrir/[slug].ts` es
  independiente de `r/[slug].astro` (archivos distintos, sin import mutuo) pero ambos deben
  existir para que T042 tenga sentido

### Parallel Opportunities

- Todas las tareas [P] de Setup (T002–T006) en paralelo
- Todas las tareas [P] de Foundational (T009–T016) en paralelo, tras T008
- Los 7 tests de US1 (T018–T024) en paralelo entre sí
- Los 8 componentes de bloque de US1 (T025–T032) en paralelo entre sí
- T035 (`no-disponible.astro`) y T036 (`api/abrir/[slug].ts`) en paralelo entre sí y respecto
  de T025–T032
- T038 (test de US2) puede escribirse en paralelo a T018–T024 aunque su implementación (T039)
  espere a T034
- T044, T046, T047 en paralelo entre sí en Polish

---

## Parallel Example: User Story 1

```bash
# Los 7 tests de User Story 1, en paralelo:
Task: "tests/e2e/carta-larga.spec.ts"
Task: "tests/e2e/contenido-extremo.spec.ts"
Task: "tests/e2e/fecha-futura.spec.ts"
Task: "tests/e2e/bloque-desconocido.spec.ts"
Task: "tests/e2e/render-sin-imagenes.spec.ts"
Task: "tests/e2e/sin-scroll-horizontal.spec.ts"
Task: "tests/e2e/lcp.spec.ts"

# Los 8 bloques de User Story 1, en paralelo:
Task: "src/bloques/Portada.astro"
Task: "src/bloques/Contador.astro"
Task: "src/bloques/Momento.astro"
Task: "src/bloques/Galeria.astro"
Task: "src/bloques/Cancion.astro"
Task: "src/bloques/Carta.astro"
Task: "src/bloques/Pregunta.astro"
Task: "src/bloques/Cierre.astro"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar Fase 1: Setup
2. Completar Fase 2: Foundational (bloquea todo lo demás)
3. Completar Fase 3: User Story 1
4. **Parar y validar**: correr los 7 tests de US1 + Escenario 1 de quickstart.md contra un
   build de producción — prestando especial atención a que ningún `POST /api/abrir/[slug]` se
   dispare antes del tap
5. Con esto ya hay un regalo publicable y visible de punta a punta — el producto en sí

### Incremental Delivery

1. Setup + Foundational → motor listo
2. + User Story 1 → probar de forma independiente → MVP
3. + User Story 2 → probar de forma independiente (revisión/aprobación)
4. + User Story 3 → probar de forma independiente (primera apertura visible, y a prueba de
   crawlers)
5. + Polish → versionado verificado, tres temas en AA, borrado a pedido

Cada historia se apoya en archivos concretos de la anterior (ver Dependencies), pero cada
`Checkpoint` es un estado íntegro y demostrable por sí solo.
