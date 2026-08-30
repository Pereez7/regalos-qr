# Quickstart: validar la página de regalo end-to-end

Guía de ejecución para probar la feature de punta a punta (US1, US2, US3). No repite el
contrato de datos (ver [data-model.md](./data-model.md)) ni el de las rutas
(ver [contracts/](./contracts/)) — solo los pasos para correrlo y confirmar que funciona.

## Prerrequisitos

- Node.js 20 LTS
- Supabase CLI (`supabase start` para Postgres + Storage local)
- Variables de entorno: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPS_SECRET` (ver
  contracts/api-eliminar.md)

## Setup

```bash
npm install
supabase start
supabase db push          # aplica supabase/migrations/0001_regalos.sql
npm run seed:regalo-demo  # inserta un regalo 'en_revision' con receta de los 8 tipos de bloque
```

El script de seed debe imprimir el `id` (UUID) y el `slug` generado del regalo demo.

## Escenario 1 — US1: el destinatario ve la historia

```bash
npm run dev
```

1. Abrir `http://localhost:4321/r/<slug>` (el regalo del seed sigue en `en_revision`: debe
   dar `/no-disponible`, confirmando FR-002 antes de aprobar).
2. Aprobar el regalo (ver Escenario 2) y volver a abrir `/r/<slug>`.
3. **Esperado**: pantalla de apertura (FR-008), transversal al layout — aparece aunque el
   seed no tenga bloque `portada` (research.md #22).
4. Antes de tocar la pantalla de apertura, verificar en la pestaña Network que **no** se
   disparó ningún `POST /api/abrir/<slug>` — solo debe dispararse al tocar (research.md #19).
5. Tocar la pantalla de apertura → **esperado**: se revela el contenido, se recorren en orden
   los bloques del seed (incluyendo `momento` con foto), y recién ahí se ve el `POST
   /api/abrir/<slug>` en Network.
6. En el bloque `cancion`, verificar que no hay ningún `<iframe>` en el DOM hasta tocarlo, y
   que al tocarlo carga el embed de Spotify/YouTube sin autoplay (research.md #21).
7. Bloquear imágenes en DevTools → recargar → tocar la pantalla de apertura → **esperado**:
   todo el texto sigue siendo legible (SC-005).
8. Editar el seed para incluir un `tipo: "bloque-inventado"` en la receta → recargar →
   **esperado**: ese elemento no aparece, el resto de la página se ve normal, sin errores en
   pantalla (FR-006).
9. Probar `http://localhost:4321/r/codigo-que-no-existe` → **esperado**: página de
   "no disponible", nunca un stack trace (FR-002).

## Escenario 2 — US2: revisión y aprobación

1. Abrir `http://localhost:4321/revisar/<id>` (con el regalo aún en `en_revision`).
2. **Esperado**: mismo contenido, mismos bloques, mismo orden que se vería en `/r/<slug>` una
   vez publicado (FR-012).
3. Confirmar que `/r/<slug>` sigue dando "no disponible" mientras no se aprobó (FR-002 +
   Principio III).
4. Click en "Aprobar" (el `<form>` de `contracts/api-aprobar.md`).
5. **Esperado**: redirect a `/revisar/<id>` mostrando fecha de aprobación; `/r/<slug>` ahora
   sirve el contenido público, idéntico al aprobado (FR-013, Acceptance Scenario 4 de US2).

## Escenario 3 — US3: primera apertura

1. Con el regalo ya publicado y sin aperturas previas, hacer `curl` a `GET /r/<slug>` con un
   `User-Agent` de crawler (p. ej. `curl -A "WhatsApp/2.23.20.0" http://localhost:4321/r/<slug>`)
   → **esperado**: la página responde igual, pero `primera_apertura_en` sigue en `null` — el
   `GET` nunca registra apertura, sea cual sea el `User-Agent` (research.md #19).
2. Abrir `/r/<slug>` en un navegador y tocar la pantalla de apertura (así se dispara el `POST
   /api/abrir/<slug>`).
3. Consultar en la base (o en el endpoint/página de estado del comprador) que
   `primera_apertura_en` quedó seteada recién ahora.
4. Recargar `/r/<slug>` y tocar la pantalla de apertura varias veces (script de prueba: 30
   ciclos de recarga + tap) → **esperado**: `primera_apertura_en` no cambia; se siguen
   sumando filas en `aperturas`.
5. Disparar dos `POST /api/abrir/<slug>` concurrentes contra un regalo publicado sin apertura
   previa (`curl` en paralelo o `Promise.all` de dos `fetch`) → **esperado**: una sola fila de
   `aperturas` con `es_primera = true`.

## Verificación automatizada (criterios medibles)

```bash
npm run build && npm run preview   # build de producción, no dev server
npx playwright test
```

Cubre, contra el build de preview:

| Test | Criterio |
|---|---|
| `lcp.spec.ts` | SC-001: pantalla de apertura <2,5 s; SC-008: primer bloque real <2,5 s tras el tap (research.md #23), ambas en 3G simulada + gama baja |
| `sin-scroll-horizontal.spec.ts` | SC-002/FR-020: 320–1440 px, cero scroll horizontal |
| `contraste-aa.spec.ts` | SC-006: AA en nocturno, papel y luminoso |
| `render-sin-imagenes.spec.ts` | SC-005: texto legible con imágenes bloqueadas |
| `bloque-desconocido.spec.ts` | FR-006 |
| `revision-y-aprobacion.spec.ts` | US2 completo |
| `primera-apertura.spec.ts` | US3 + Edge Cases de concurrencia y recarga x30 + `GET` con `User-Agent` de crawler NO registra apertura (research.md #19) |
| `carta-larga.spec.ts` | Edge Case: carta ~4.000 caracteres, completa, sin romper el diseño |
| `contenido-extremo.spec.ts` | Edge Cases: emoji/acentos tal cual, carta vacía omitida, foto cuadrada/vertical sin deformar ni perder sentido |
| `fecha-futura.spec.ts` | Edge Case: contador con `fechaInicio` futura, nunca negativo, clamp en 0 (research.md #18) |
| `compatibilidad-versiones.spec.ts` | Principio VI: fixture `contenido.v=1` sigue renderizando igual con el esquema actual (research.md #17) |

**Éxito** = los 11 specs en verde contra el build de producción. Este es el gate de
"terminado" para esta feature, junto con las Compuertas de Aceptación de la constitución.
