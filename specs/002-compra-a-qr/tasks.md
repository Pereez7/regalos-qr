# Tasks: De la Compra al QR

**Input**: Design documents from `/specs/002-compra-a-qr/`

**Prerequisites**: plan.md, spec.md, research.md (23 decisiones), data-model.md, contracts/ (10), quickstart.md

**Tests**: incluidos. La decisión 19 de research.md fija la estrategia, y las Compuertas de
Aceptación de la constitución exigen verificación, no declaración. La simulación de venta es un
test (`venta-completa.spec.ts`), no un documento.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede correr en paralelo (archivos distintos, sin dependencias pendientes)
- **[Story]**: a qué historia pertenece (US1, US2, US3, US4)
- Cada tarea lleva su ruta de archivo exacta

## Path Conventions

Proyecto único Astro, igual que la feature 001: `src/`, `tests/`, `scripts/`, `supabase/` en la
raíz del repositorio.

## Perímetro del cambio sobre la feature 001

Esta feature toca **exactamente cuatro** archivos existentes (research.md #20). Cualquier otro
archivo de la 001 que aparezca modificado es un error de alcance:

| Archivo | Qué se le hace |
|---|---|
| `src/lib/contenido/esquema.ts` | se agrega `foto.ruta` opcional |
| `src/lib/contenido/tipos-bloque.ts` | se agrega `foto.ruta` opcional |
| `src/lib/regalos.ts` | resuelve `ruta` a dirección firmada |
| `src/pages/api/regalos/[id]/aprobar.ts` | emite el aviso de aprobación |

**Gate del perímetro**: los 28 tests de la feature 001 (26 llamadas a `test()`;
`contraste-aa.spec.ts` genera uno por tema). Si alguno rompe, el cambio salió de lo acordado.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: infraestructura y configuración que todo lo demás necesita

- [ ] T001 Escribir `supabase/migrations/0002_pedidos.sql` con las cuatro tablas de data-model.md
      (`pedidos`, `pagos`, `eventos_pago`, `avisos`), sus `check`, sus índices, la FK
      `pedidos.regalo_id → regalos.id` con `on delete set null` y la unicidad de
      `(proveedor, evento_id)`. No tocar las tablas de la 001.
- [ ] T002 [P] Declarar el bucket `fotos` con `public = false` en `supabase/config.toml`, para que
      su estado no dependa de correr un script (research.md #15).
- [ ] T003 [P] Agregar a `.env.example` las variables nuevas con sus comentarios en español:
      `PAGO_PROVEEDOR`, `PAGO_SIMULADO_SECRETO` (nombre canónico, singular),
      `CORREO_PROVEEDOR`, `RESEND_API_KEY`, `PRECIO`, `MONEDA`.
- [ ] T004 [P] Crear `tests/e2e/utils/crear-pedido.ts`: helper que inserta pedidos en estados
      `iniciado` y `pagado` con borrador arbitrario, al mismo estilo que
      `tests/e2e/utils/crear-regalo.ts`.
- [ ] T005 [P] Crear `tests/e2e/utils/firmar-aviso.ts`: helper que firma un cuerpo JSON con
      HMAC-SHA256 y `PAGO_SIMULADO_SECRETO`, para que los tests manden avisos auténticos.
- [ ] T006 Aplicar la migración y verificar contra la base que `regalos`, `slugs` y `aperturas`
      no cambiaron ni una columna.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: lo que bloquea a TODAS las historias. Sin esto no se puede empezar ninguna.

- [ ] T007 [P] Crear `src/lib/config.ts`: lectura de `PRECIO`, `MONEDA` y `SITIO_URL` con el
      patrón `import.meta.env.X ?? process.env.X`, obligatorio para que el valor se lea en
      runtime y no quede horneado en el bundle (research.md #18).
- [ ] T008 [P] Crear `src/lib/pagos/tipos.ts`: interfaz `iniciarCobro(pedido)` /
      `interpretarAviso(request)` según contracts/api-iniciar-compra.md y
      contracts/api-webhook-pago.md.
- [ ] T009 [P] Crear `src/lib/correo/tipos.ts`: interfaz `enviarAviso(tipo, destinatario, datos)`
      según research.md #12.
- [ ] T010 Crear `src/lib/pagos/registro.ts` y `src/lib/correo/registro.ts`: mapa proveedor →
      adaptador, mismo patrón que `src/bloques/registro.ts` (Principio II).
- [ ] T011 [P] Crear `src/lib/pedidos.ts`: alta en estado `iniciado`, transiciones de estado,
      lectura por id, y las consultas de la cola operativa (pagados sin regalo, iniciados nunca
      pagados, avisos fallidos).
- [ ] T012 [P] Crear `src/lib/ops.ts`: compuerta derivada de `OPS_SECRET` para `/pedidos` y para
      las rutas de operación. **Independiente de `MODO_INTERNO`**: ese flag se apaga el día que
      la landing se abre al público, y la cola muestra correos de compradores (research.md #14).
- [ ] T013 Agregar `foto.ruta` como campo **opcional** al objeto `foto` en
      `src/lib/contenido/esquema.ts` y `src/lib/contenido/tipos-bloque.ts`, sin tocar `foto.url`
      (research.md #7, Principio VI).
- [ ] T014 Verificar que `tests/e2e/compatibilidad-versiones.spec.ts` sigue en verde con el
      fixture dorado `tests/fixtures/contenido-v1.json` **sin modificar**: es la prueba de que el
      agregado fue aditivo.

**Checkpoint**: adaptadores registrables, pedidos consultables, esquema extendido sin romper el
fixture dorado.

---

## Phase 3: User Story 1 - El visitante entiende la propuesta y paga (Priority: P1)

**Goal**: de un visitante que no sabe qué se vende a un pedido pagado y registrado.

**Independent Test**: abrir la landing, recorrer un ejemplo, pagar en simulación, y verificar que
quedó un pedido pagado accesible por su propio enlace.

### Tests for User Story 1

- [ ] T015 [P] [US1] `tests/e2e/pago-idempotente.spec.ts` — el mismo aviso entregado 10 veces y 2
      veces en simultáneo deja un solo pedido pagado y un solo efecto derivado (FR-004, SC-006).
- [ ] T016 [P] [US1] En el mismo archivo, un aviso con firma inválida se rechaza con 401 y **no
      deja fila** en `eventos_pago`: si la dejara, cualquiera podría envenenar la clave de
      idempotencia con un `evento_id` inventado y el aviso legítimo se descartaría como duplicado
      (FR-005, research.md #2).
- [ ] T017 [P] [US1] En el mismo archivo, los códigos por content-type: `application/json` pasa
      sin `Origin`; `x-www-form-urlencoded`, `text/plain` y la ausencia de content-type reciben
      **403 del framework** antes del manejador; `application/xml` recibe **415** del manejador.
      Son dos capas distintas y el test no debe confundirlas (research.md #1).
- [ ] T018 [P] [US1] En el mismo archivo, un aviso cuyo pedido no existe responde 404, queda
      registrado con `resultado = 'sin_pedido'` y no altera nada (research.md #2).
- [ ] T019 [P] [US1] `tests/e2e/pedido-ajeno.spec.ts` — el enlace de un pedido no da acceso a
      otro: ni a su estado, ni a su borrador, ni a su regalo (FR-031).

### Implementation for User Story 1

- [ ] T020 [P] [US1] Crear `src/lib/pagos/simulado.ts`: genera la URL de cobro simulado y firma
      sus avisos con HMAC-SHA256 y `PAGO_SIMULADO_SECRETO`, para que el camino de verificación de
      firma se ejercite de verdad en simulación (research.md #3).
- [ ] T021 [US1] Crear `src/pages/comprar.astro` — `POST`: crea el pedido en estado `iniciado`
      **antes** de redirigir al cobro, guardando el monto cotizado y la moneda
      (contracts/api-iniciar-compra.md, research.md #4).
- [ ] T022 [US1] Crear `src/pages/api/pagos/webhook/[proveedor].ts` — acepta solo
      `application/json`; **verifica la firma primero**, después inserta en `eventos_pago`, y solo
      si la inserción tuvo éxito aplica el efecto sobre el pedido; duplicado responde 200 y nunca
      409, para no provocar reintentos infinitos (contracts/api-webhook-pago.md).
- [ ] T023 [US1] En el mismo manejador, aplicar la decisión 23 ante discrepancia de monto: vale el
      monto que informa el proveedor, se guardan los dos, el pago no se bloquea y el caso queda
      marcado para la cola.
- [ ] T024 [P] [US1] Crear `src/pages/index.astro` — landing: qué es el regalo, al menos un
      ejemplo real navegable, el precio leído en runtime, y una sola acción de compra (FR-001).
- [ ] T025 [P] [US1] Crear `src/pages/gracias/[pedido].astro` — muestra el **estado real** del
      pedido (pagado o pendiente de pago, nunca "todo salió bien" si no lo está) y el enlace de
      carga (FR-002, escenario de aceptación 4 de US1).
- [ ] T026 [US1] Crear `src/pages/pedidos.astro` — cola operativa detrás de la compuerta de
      `src/lib/ops.ts`: pagados sin regalo, iniciados nunca pagados, avisos fallidos, eventos
      `sin_pedido` y discrepancias de monto (FR-008, research.md #14).
- [ ] T027 [P] [US1] `tests/e2e/cola-operativa.spec.ts` — un pedido pagado sin regalo aparece en
      la cola; sin la credencial de `OPS_SECRET`, la página no se sirve (FR-008, SC-007).

**Checkpoint**: se puede cobrar. Todavía no hay regalo.

---

## Phase 4: User Story 2 - El comprador carga su historia sin miedo a perderla (Priority: P1)

**Goal**: de un pedido pagado a un regalo en revisión con su enlace, sin perder nada en el camino.

**Independent Test**: partir de un pedido pagado, cargar una historia completa en varias sesiones
cerrando la pestaña entre pasos, enviarla, y verificar que el regalo se ve en su enlace de
revisión con exactamente lo cargado.

### Tests for User Story 2

- [ ] T028 [P] [US2] `tests/e2e/borrador-autoguardado.spec.ts` — cargar tres pasos, cerrar el
      contexto del navegador, volver al mismo enlace y encontrar todo lo cargado (FR-010,
      SC-004).
- [ ] T029 [P] [US2] En el mismo archivo, 30 recargas no corrompen ni duplican el borrador, y no
      nacen regalos repetidos (caso límite del spec).
- [ ] T030 [P] [US2] En el mismo archivo, la carga funciona **con JavaScript deshabilitado**: cada
      paso guarda al enviarse (research.md #8, Principio I).
- [ ] T031 [P] [US2] `tests/e2e/envio-unico.spec.ts` — dos envíos simultáneos producen **un solo
      regalo con un solo slug**. El reclamo atómico sobre el pedido es lo que lo garantiza; la
      restricción única es red de contención, no la defensa (FR-021, research.md #9).
- [ ] T032 [P] [US2] En el mismo archivo, tres correcciones sucesivas reemplazan el contenido y
      **nunca** cambian el slug ni la fila de `slugs` (FR-015, Principio VI).
- [ ] T033 [P] [US2] En el mismo archivo, intentar modificar la historia de un regalo ya publicado
      se rechaza (FR-016).
- [ ] T034 [P] [US2] `tests/e2e/fotos-privadas.spec.ts` — el original subido **no queda
      almacenado**, la versión guardada pesa menos de 600 KB y no conserva metadatos de ubicación
      (FR-038, FR-039, SC-013, SC-015).
- [ ] T035 [P] [US2] En el mismo archivo, la ubicación de una foto no es accesible para quien no
      está viendo el regalo al que pertenece (FR-020, SC-011).
- [ ] T036 [P] [US2] En el mismo archivo, una foto quitada antes de enviar no queda almacenada
      (FR-019).
- [ ] T037 [P] [US2] `tests/e2e/minimo-envio.spec.ts` — una historia sin ningún bloque de
      contenido no se puede enviar y el sistema dice exactamente qué falta; con tema, nombre y un
      solo bloque, se envía (FR-011, research.md #21).
- [ ] T038 [P] [US2] `tests/e2e/carga-escape-html.spec.ts` — texto con etiquetas HTML se guarda y
      se muestra literal, en la carga y en el regalo resultante (FR-017).

### Implementation for User Story 2

- [ ] T039 [P] [US2] Crear `src/lib/borrador/esquema.ts` — zod del borrador según
      contracts/borrador.schema.md: admite incompleto, con su propio contrato de validación,
      distinto del esquema de contenido del motor (research.md #8).
- [ ] T040 [US2] Crear `src/lib/borrador/a-contenido.ts` — traducción borrador → `{ v: 1, receta[] }`
      usando solo los ocho tipos de bloque existentes, con la validación de completitud de la
      decisión 21 (FR-012).
- [ ] T041 [P] [US2] Crear `src/lib/fotos.ts` — reducción con `sharp` al tamaño que la página
      necesita, eliminación de metadatos, y firma por lote con `createSignedUrls`
      (contracts/api-fotos.md, research.md #5, #6).
- [ ] T042 [US2] Modificar `src/lib/regalos.ts` — resolver `foto.ruta` a dirección firmada **antes**
      de entregar el contenido, de modo que los componentes de bloque sigan recibiendo `foto.url`
      ya resuelto y no se toquen (research.md #6, #20).
- [ ] T043 [US2] Crear `src/pages/api/pedidos/[id]/borrador.ts` — guarda un paso por petición y lo
      recupera; rechaza paso inválido y pedido no pagado (contracts/api-borrador.md).
- [ ] T044 [US2] Crear `src/pages/api/pedidos/[id]/fotos.ts` — subir y quitar. Tope de 10 MB con
      JavaScript (la foto se reduce antes de salir del dispositivo) y de 4 MB sin JavaScript, que
      es el límite real de la plataforma; el formulario lo explica en vez de fallar sin mensaje
      (research.md #5).
- [ ] T045 [US2] Crear `src/pages/contar/[pedido]/[paso].astro` — un `<form>` por paso que guarda y
      redirige al siguiente; funciona completo sin JavaScript (FR-009, FR-010).
- [ ] T046 [P] [US2] Agregar a esa página la reducción de foto en el navegador con canvas vanilla,
      como mejora opcional sobre el camino que ya funciona sin JavaScript. No toca el presupuesto
      de `/r/[slug]` (research.md #5, #17).
- [ ] T047 [US2] Crear `src/pages/api/pedidos/[id]/enviar.ts` — **reclamo atómico** sobre el pedido
      antes de crear el regalo; el que gana crea, el que pierde devuelve el existente. Después del
      reclamo, mueve las fotos de `pedidos/{id}/` a `regalos/{regalo_id}/`, que es el prefijo que
      el borrado de la 001 ya barre (contracts/api-enviar-historia.md, research.md #9, #16).
- [ ] T048 [US2] Crear `src/pages/api/pedidos/[id]/eliminar.ts` — `DELETE` con `OPS_SECRET`:
      borra el pedido, su borrador, sus fotos en **los dos** prefijos, sus pagos, sus avisos, su
      contacto, su consentimiento y el regalo asociado. **Nunca** borra la fila de `slugs`
      (FR-030, contracts/api-eliminar-pedido.md, research.md #16).
- [ ] T049 [P] [US2] Crear `src/pages/baja/[token].astro` — baja publicitaria por token propio,
      distinto del id del pedido para que un mensaje publicitario no filtre la credencial del
      pedido. Pone el celular en nulo, el consentimiento en falso y fecha la baja (FR-036,
      research.md #13).
- [ ] T050 [P] [US2] `tests/e2e/celular-opcional.spec.ts` — la compra se completa sin dar celular
      en el 100% de los intentos (SC-016), y la baja **borra** el número en vez de marcarlo
      (FR-036).

**Checkpoint**: ya se puede vender. Falta solo resolver la impresión a mano.

---

## Phase 5: User Story 3 - El QR y la tarjeta lista para imprimir (Priority: P2)

**Goal**: de un regalo publicado a un archivo listo para llevar a la imprenta.

**Independent Test**: tomar un regalo publicado, generar su QR y su tarjeta, escanear el QR con un
celular y verificar que abre el regalo correcto.

### Tests for User Story 3

- [ ] T051 [P] [US3] `tests/e2e/qr-compuerta.spec.ts` — con `SITIO_URL` apuntando a `vercel.app`,
      a `localhost` o a una IP, la emisión de un QR vendible **falla en 10 de 10 intentos**
      (FR-024, SC-009, Compuerta de Aceptación 16).
- [ ] T052 [P] [US3] En el mismo archivo, un regalo no aprobado no puede emitir QR (FR-025).
- [ ] T053 [P] [US3] En el mismo archivo, la emisión marcada como simulación sí procede, y la
      tarjeta resultante lleva la palabra estampada **sobre la imagen**, no solo en el nombre del
      archivo: un archivo se renombra o se reenvía sin su nombre, una marca impresa no se pierde
      (research.md #11).

### Implementation for User Story 3

- [ ] T054 [US3] Crear `src/lib/qr.ts` — generación con `qrcode` apuntando a `SITIO_URL + /r/ + slug`,
      y la compuerta que se niega a emitir si el host no es un dominio propio
      (contracts/qr-y-tarjeta.md).
- [ ] T055 [US3] En el mismo módulo, composición de la tarjeta con `sharp`: el QR, el texto mínimo
      para que quien la recibe entienda que debe escanearlo, y la marca de simulación cuando
      corresponda (FR-023).
- [ ] T056 [US3] Crear `scripts/generar-qr.ts` y el script npm `qr` en `package.json`
      (`tsx --env-file=.env scripts/generar-qr.ts`), con el patrón de `seed:regalo-demo`.
- [ ] T057 [US3] Registrar la emisión en `pedidos.qr_emitido_en` y `pedidos.qr_simulacion`: sin
      esto no queda rastro de qué soporte físico salió, cuándo, ni si lo impreso era una tarjeta
      de simulación (research.md #22).
- [ ] T058 [US3] Verificación manual de SC-008: imprimir la tarjeta al tamaño previsto y escanear
      10 de 10 veces desde un celular de gama baja con luz de interior. No automatizable
      (research.md #19).

**Checkpoint**: entrega completa, con el soporte físico resuelto.

---

## Phase 6: User Story 4 - El comprador recibe avisos en su correo (Priority: P3)

**Goal**: los tres avisos salen solos, con el enlace correcto dentro.

**Independent Test**: recorrer una compra completa en simulación y verificar que cada uno de los
tres avisos se emitió una sola vez, con su enlace.

### Tests for User Story 4

- [ ] T059 [P] [US4] `tests/e2e/avisos.spec.ts` — los tres avisos (comprobante, revisión,
      aprobación) se emiten una sola vez cada uno, con el enlace correcto (FR-026).
- [ ] T060 [P] [US4] En el mismo archivo, una falla de envío no bloquea ni pierde el pedido, y
      queda registrada con su estado para poder reintentarse (FR-029).

### Implementation for User Story 4

- [ ] T061 [P] [US4] Crear `src/lib/correo/consola.ts` — proveedor de desarrollo y simulación, que
      permite recorrer la feature sin cuenta de correo (FR-028).
- [ ] T062 [P] [US4] Crear `src/lib/correo/resend.ts` — proveedor de producción detrás de la misma
      interfaz.
- [ ] T063 [US4] Crear `src/lib/avisos.ts` — emisión, registro en la tabla `avisos` con su estado
      cualquiera sea el proveedor, y reencolado manual (research.md #12).
- [ ] T064 [US4] Emitir el comprobante de compra al quedar pagado el pedido, desde
      `src/pages/api/pagos/webhook/[proveedor].ts`.
- [ ] T065 [US4] Emitir el aviso de revisión al nacer el regalo, desde
      `src/pages/api/pedidos/[id]/enviar.ts`.
- [ ] T066 [US4] Modificar `src/pages/api/regalos/[id]/aprobar.ts` para emitir el aviso de
      aprobación. Es el **único** punto del sistema que se entera de que la aprobación ocurrió, y
      por eso entra al perímetro de los cuatro archivos tocados. El cambio es aditivo: no altera
      la transición de estado ni la respuesta del endpoint (research.md #20).
- [ ] T067 [US4] Verificar que `tests/e2e/revision-y-aprobacion.spec.ts` de la feature 001 sigue en
      verde: es el gate de que el agregado a `aprobar.ts` no cambió su comportamiento.
- [ ] T068 [US4] Agregar a `src/pages/pedidos.astro` el botón de reintento de cada aviso fallido
      (research.md #12).

**Checkpoint**: recorrido completo y pulido.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T069 `tests/e2e/venta-completa.spec.ts` — el recorrido entero en un solo test: landing →
      cobro simulado → carga en varias sesiones → envío → revisión → aprobación → regalo público
      → QR generado. Es la prueba de que la feature está terminada (SC-005, research.md #19).
- [ ] T070 [P] `tests/e2e/sin-scroll-horizontal-002.spec.ts` — cero scroll horizontal entre 320 y
      1440 px en landing, gracias, cada paso de la carga, baja y cola (FR-032, SC-010).
- [ ] T071 [P] Verificar que `tests/e2e/presupuesto-js.spec.ts` sigue en verde: `/r/[slug]` no
      recibió ni un byte nuevo de JavaScript (Reglas de Calidad, research.md #17).
- [ ] T072 [P] Verificar que `tests/e2e/lcp.spec.ts` sigue en verde con las fotos firmadas: la
      firma por lote agrega una ida y vuelta al render. Si rompe el presupuesto de 2,5 s, la
      mitigación es firmar con vigencia amplia y apoyarse en la caché del navegador, **nunca**
      volver al bucket público (research.md #6).
- [ ] T073 Correr la suite completa y confirmar **28 tests de la feature 001 en verde** más los
      nuevos. Un solo test roto de la 001 significa que el cambio salió del perímetro de cuatro
      archivos.
- [ ] T074 Ejecutar la validación manual completa de `quickstart.md`: los cinco escenarios, las
      nueve verificaciones de lo que se rompe en silencio, y los cuatro criterios sin gate
      automatizado (SC-001, SC-002, SC-003, SC-008).
- [ ] T075 Borrar los regalos y pedidos de prueba del proyecto Supabase antes de cualquier venta
      real, y dejar constancia de qué filas de `slugs` quedaron huérfanas a propósito.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** → sin dependencias. T001 bloquea T006; T002–T005 son paralelos entre sí.
- **Foundational (Phase 2)** → requiere Phase 1 completa. Bloquea todas las historias.
- **US1 (Phase 3)** → requiere Phase 2. Independiente de US2, US3 y US4.
- **US2 (Phase 4)** → requiere Phase 2. Necesita de US1 solo un pedido pagado, que el helper
  `crear-pedido.ts` (T004) provee sin implementar US1.
- **US3 (Phase 5)** → requiere Phase 2 y un regalo publicado, que el helper `crear-regalo.ts` de
  la feature 001 ya provee. No depende de US1 ni de US2.
- **US4 (Phase 6)** → requiere Phase 2. T064 depende de T022 (US1) y T065 de T047 (US2); el resto
  es independiente.
- **Polish (Phase 7)** → requiere todo lo anterior, salvo T070–T072 que pueden correr antes.

### Dentro de cada historia

Tests primero, después esquemas y bibliotecas, después rutas y páginas. En US2 el orden es
rígido: T039 (esquema) → T040 (traducción) → T047 (envío), porque cada una consume la anterior.

### Parallel Opportunities

```bash
# Phase 1: todo menos T001 y T006
T002, T003, T004, T005

# Phase 2: las interfaces y los módulos sin dependencias entre sí
T007, T008, T009, T011, T012

# Phase 3: los cinco tests de US1 en paralelo
T015, T016, T017, T018, T019

# Phase 4: los once tests de US2 en paralelo
T028..T038

# US1, US2 y US3 se pueden desarrollar en paralelo por personas distintas,
# porque las tres arrancan desde helpers de test y no desde la historia anterior.
```

---

## Implementation Strategy

### MVP: US1 + US2

Con el pago registrado y la carga de la historia funcionando **ya se puede vender**: el QR y la
tarjeta se resuelven a mano para las primeras unidades (generando el código con el script en modo
simulación, o incluso enviando el enlace por mensaje), y los avisos se mandan a mano. Son ~20
minutos de trabajo manual por venta, perfectamente rentable abajo de unas 20 ventas por mes.

US3 elimina la parte más tediosa de ese trabajo manual. US4 elimina el resto.

### Entrega incremental

1. Phase 1 + Phase 2 → nada visible todavía, pero todo lo demás depende de esto.
2. + US1 → se puede cobrar. Validable solo.
3. + US2 → **se puede vender**. Primer punto en que el producto existe de punta a punta.
4. + US3 → la entrega del soporte físico deja de ser artesanal.
5. + US4 → el recorrido se completa sin intervención.

### Antes de la primera venta real

Cinco ítems que **no** son código y que ninguna tarea de arriba resuelve: comprar el dominio,
apuntar `SITIO_URL` a él, apagar `MODO_INTERNO`, conectar un proveedor de pago real escribiendo un
solo archivo en `src/lib/pagos/`, y ejecutar T075. Hasta que el primero esté hecho, la Compuerta
de Aceptación 16 impide por diseño emitir un QR vendible.
