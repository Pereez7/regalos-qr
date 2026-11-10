# Phase 1 Data Model: De la Compra al QR

Deriva de las Key Entities de [spec.md](./spec.md) (Pedido, Pago, Borrador, Foto, Tarjeta,
Aviso) y de las decisiones de [research.md](./research.md) #2, #4, #6–#10, #12, #13, #16, #18,
#21 y #22.

Cuatro tablas nuevas —`pedidos`, `pagos`, `eventos_pago`, `avisos`— sobre el esquema de la
feature 001, que **no se modifica**: `regalos`, `slugs` y `aperturas` quedan exactamente como
las dejó `supabase/migrations/0001_regalos.sql` (research.md #10). Lo único que cambia del
contrato de datos existente es un campo opcional nuevo en el objeto `foto` del contenido
(research.md #7), descrito en su propia sección más abajo.

Convenciones heredadas de la feature 001 y mantenidas acá sin excepción:

- Toda clave primaria es `uuid` con `default gen_random_uuid()`.
- Todo instante es `timestamptz`; `null` significa "todavía no ocurrió", nunca "cero".
- El conjunto cerrado de valores de un campo de estado se hace cumplir con un `check`, no con
  una validación de aplicación.
- La generación de identificadores con alfabeto propio vive en código
  (`src/lib/slugs.ts` en la 001, `src/lib/pedidos.ts` en esta), no en la migración.
- RLS queda deshabilitado: la app accede exclusivamente con la service role, server-only
  (`src/lib/supabase.ts`). Las tablas nuevas necesitan sus `grant` explícitos, igual que las de
  la 001.

---

## Pedido

Tabla `pedidos`. Es la unidad comercial y la única entidad que conoce el dinero (spec, Key
Entities).

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `uuid` PK, default `gen_random_uuid()` | Es la credencial del pedido: la única que el comprador necesita, sin cuenta ni contraseña (FR-003). Mismo criterio que la 001 usa para `/revisar/[id]` (001 research.md #7): 122 bits de aleatoriedad, no enumerable, no derivable del correo ni del momento de compra |
| `estado` | `text`, default `'iniciado'` | `'iniciado'` \| `'pagado'`. Ver Transiciones de estado |
| `email` | `text`, not null | Obligatorio: es la vía de entrega de los enlaces (FR-034). Único dato personal que el producto necesita para funcionar |
| `celular` | `text`, null | Opcional, solo con fin publicitario (FR-035). `null` es el valor normal y el que deja la baja (FR-036) |
| `consentimiento_publicidad` | `boolean`, not null, default `false` | Nunca pre-aceptado: el default es `false` en la base, no solo en el formulario (FR-035) |
| `consentimiento_en` | `timestamptz`, null | Fecha en que el comprador dio el consentimiento. Es lo que permite demostrar más adelante que existió (research.md #13) |
| `baja_publicidad_en` | `timestamptz`, null | Fecha en que el comprador se dio de baja. Se conserva aunque el número ya no exista: es la constancia de que la baja se honró, y no es un dato personal, porque sin número no identifica a nadie (research.md #13) |
| `token_baja` | `text`, not null, unique | Token no adivinable propio de la baja publicitaria, 32 caracteres hexadecimales (128 bits), generado en `src/lib/pedidos.ts`. **Distinto de `id`** y sin relación derivable con él (research.md #13) |
| `borrador` | `jsonb`, not null, default `'{"v":1}'` | La historia en construcción. Admite estar incompleto (FR-011). Ver sección Borrador |
| `regalo_id` | `uuid`, null, unique, FK a `regalos.id` `on delete set null` | `null` hasta el primer envío de la historia. Lo que impide el segundo regalo de un doble envío es el **reclamo atómico** previo a crearlo (`UPDATE … WHERE regalo_id IS NULL`); la unicidad es la red de contención (FR-021, research.md #9) |
| `creado_en` | `timestamptz`, not null, default `now()` | |
| `pagado_en` | `timestamptz`, null | Se setea una sola vez, junto con el cambio de `estado` |
| `actualizado_en` | `timestamptz`, not null, default `now()` | Se toca en cada guardado de paso. Es lo que permite ordenar la cola operativa por antigüedad real de abandono (FR-008) |
| `qr_emitido_en` | `timestamptz`, null | Cuándo se emitió el QR y la tarjeta de este pedido. `null` = todavía no se emitió ninguna. Lo escribe el generador, después de producir los archivos (research.md #22) |
| `qr_simulacion` | `boolean`, not null, default `false` | `true` si la última emisión salió **marcada como simulación**. Es lo que permite saber, meses después, si lo que se imprimió era una tarjeta de simulación (research.md #22) |

**Restricciones**:

```sql
-- Mismo patrón que `aprobado_en_requiere_publicado` de la 001: el instante del hecho y el
-- estado que lo declara no pueden desincronizarse.
constraint pagado_en_requiere_pagado check (
  (estado = 'pagado' and pagado_en is not null) or estado = 'iniciado'
),

-- FR-035: "NO DEBE guardarlo sin ese consentimiento", hecho cumplir por la tabla y no por el
-- manejador del formulario. Un bug de aplicación no puede dejar un número sin su
-- consentimiento y su fecha.
constraint celular_requiere_consentimiento check (
  celular is null or (consentimiento_publicidad and consentimiento_en is not null)
),

constraint email_no_vacio check (length(trim(email)) > 2 and position('@' in email) > 1),

-- research.md #22, mismo patrón que `pagado_en_requiere_pagado`: la marca de simulación no
-- puede existir sin la emisión que la produjo.
constraint qr_simulacion_requiere_emision check (
  qr_emitido_en is not null or qr_simulacion = false
)
```

La restricción inversa —consentimiento en `true` sin celular— **sí** se admite: es el estado en
que queda un pedido tras la baja si se decide conservar la marca, y un consentimiento sin dato
asociado no guarda nada de nadie. Prohibirla obligaría a elegir un orden de escritura entre dos
campos del mismo `UPDATE` sin ganar ninguna garantía.

**Índices**:

| Índice | Para qué |
|---|---|
| `pedidos_pkey` on `(id)` | Acceso por credencial. Es el único camino de lectura del comprador (FR-003, FR-031) |
| `pedidos_regalo_id_key` unique on `(regalo_id)` | FR-021. Postgres admite múltiples `null` en un índice único, así que los pedidos sin regalo conviven sin conflicto |
| `pedidos_token_baja_key` unique on `(token_baja)` | Acceso a `/baja/[token]` (FR-036) |
| `pedidos_estado_creado_en_idx` on `(estado, creado_en desc)` | Cola operativa: pagados sin regalo e iniciados que nunca se pagaron (FR-008, research.md #14) |

**No** hay índice por `email`, y es deliberado: ningún flujo busca un pedido por correo —el
enlace es la única credencial (FR-003)— y un índice por correo es exactamente la estructura que
convierte una base de pedidos en una lista de direcciones consultable.

**El registro de emisión del QR son dos columnas y no una tabla** (research.md #22). Un pedido
corresponde a un único regalo (Assumptions de la feature 001) y por lo tanto a una única
tarjeta, así que no hay cardinalidad que normalizar. Una tabla de emisiones solo haría falta el
día que se reimprima una tarjeta perdida, y ese día el dato que hay que agregar es otro. Las dos
columnas las escribe el generador ([`contracts/qr-y-tarjeta.md`](./contracts/qr-y-tarjeta.md))
y una reemisión las sobrescribe: lo que interesa es qué soporte salió último. Un regalo sin
pedido —un seed o una demo— se emite igual y no registra nada: el motor no sabe de pedidos
(Principio II).

**Nada de dinero vive en esta tabla** más allá de `estado`. El monto y la moneda están en
`pagos`, con los que se cobró en ese momento, para que un cambio de precio no reescriba la
historia de lo ya vendido (research.md #18).

### Transiciones de estado del pedido

```text
(no existe) --(POST /comprar, antes de redirigir al cobro)--> iniciado
iniciado    --(aviso de pago verificado y aplicado)----------> pagado      [IRREVERSIBLE]
```

Eso es todo. Dos estados, una sola transición, y ninguna vuelta atrás.

- **`iniciado` es el estado de nacimiento, no un estado intermedio opcional.** El pedido se crea
  con su `id` ya asignado **antes** de redirigir al cobro (research.md #4), porque el Principio
  VII exige que el pago quede registrado antes de cualquier acción derivada, y eso solo es
  posible si hay una fila esperando cuando llega el aviso. Un pedido `iniciado` que nunca se
  paga es basura inofensiva: aparece en la cola como abandonado, nunca como venta.
- **`iniciado → pagado` es irreversible.** No existe transición `pagado → iniciado` ni ninguna
  que baje de estado, y no es un olvido: es el Principio VII escrito en el modelo. Un pedido que
  volviera a "pendiente de pago" después de haber cobrado es, literalmente, dinero cobrado que
  el sistema deja de reconocer; el comprador pagó y el pedido dice que no. Un reverso, un
  contracargo o una devolución —fuera de alcance de esta feature— se registrarían como un
  **estado nuevo del pago** en `pagos.estado`, nunca como un retroceso del pedido.
- **No hay un tercer estado de pedido** (`enviado`, `entregado`, `publicado`). Sería una segunda
  fuente de verdad sobre algo que `regalos.estado` ya dice, y la aprobación es de la feature 001
  y no se reimplementa (Principio III). "Pedido pagado sin regalo entregado" se **computa**:
  `estado = 'pagado' and (regalo_id is null or regalos.estado <> 'publicado')`. Un estado
  duplicado se desincroniza; una consulta no.
- **La emisión del QR tampoco es un estado.** `qr_emitido_en` y `qr_simulacion` son columnas
  de hecho, no de estado: registran algo que ya pasó y no habilitan ni bloquean ninguna
  transición del pedido. Lo que impide una emisión indebida es la compuerta del generador
  (research.md #11), no un valor de esta tabla. "Pagado, publicado y sin QR emitido" se
  **computa**, igual que "pagado sin regalo entregado" (FR-008, research.md #22).
- **El borrado no es una transición.** Borrar un pedido elimina la fila entera (FR-030), igual
  que en la 001 el borrado de un regalo elimina la fila y no es un valor de `estado`.
- **Lo que el comprador ve es el estado real, siempre.** `/gracias/[pedido]` muestra `iniciado`
  como "pendiente de pago" y nunca una pantalla de éxito, porque no hay ningún estado
  intermedio optimista que pudiera mostrarse por error (FR-002, US1 escenario 4).

---

## Pago

Tabla `pagos`. El registro de un cobro asociado a un pedido.

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `uuid` PK, default `gen_random_uuid()` | Interno; nunca se expone al comprador |
| `pedido_id` | `uuid`, not null, FK a `pedidos.id` `on delete cascade` | Un pago sin pedido no existe (FR-030) |
| `proveedor` | `text`, not null | `'simulado'` es el único al cierre de esta feature (research.md #3) |
| `pago_id_proveedor` | `text`, null | El identificador del pago **en el proveedor** — el único dato del cobro que FR-006 permite guardar. `null` mientras el cobro se inició y el proveedor todavía no informó nada |
| `monto_centavos` | `integer`, not null | Unidades mínimas de la moneda, enteras. Con el que se cobró, no el vigente hoy (research.md #18) |
| `moneda` | `text`, not null | Código ISO de 3 letras mayúsculas |
| `estado` | `text`, not null, default `'pendiente'` | `'pendiente'` \| `'aprobado'` \| `'rechazado'` |
| `creado_en` | `timestamptz`, not null, default `now()` | |
| `actualizado_en` | `timestamptz`, not null, default `now()` | Último cambio informado por el proveedor |

**Restricciones**:

```sql
constraint monto_positivo check (monto_centavos > 0),
constraint moneda_iso check (moneda ~ '^[A-Z]{3}$')
```

**Decisiones no obvias**:

- **`monto_centavos integer` y no `numeric` ni `float`.** Un monto en coma flotante es un error
  de dinero esperando su redondeo, y el Principio VII trata un error de dinero como
  irreversible. Enteros en unidades mínimas no admiten ambigüedad de representación.
- **La fila de `pagos` nace con el cobro, no con el aviso.** `iniciarCobro(pedido)`
  (research.md #3) inserta el pago en `'pendiente'` con el monto y la moneda del momento. Así
  queda registrado por cuánto se intentó cobrar incluso si el aviso nunca llega, que es
  justamente el caso que el Principio VII no quiere perder de vista. La alternativa —crear el
  pago al recibir el aviso— dejaría un intento abandonado sin precio, y haría depender el monto
  histórico de la configuración vigente el día del aviso, que es lo que research.md #18
  descarta.
- **`pago_id_proveedor` nullable con unicidad.** `unique (proveedor, pago_id_proveedor)` impide
  que dos filas reclamen el mismo pago del proveedor; los `null` múltiples que Postgres admite
  en un índice único son exactamente lo que necesita un pago todavía no informado.
- **`proveedor` sin `check`.** Agregar un proveedor es registrar un archivo en
  `src/lib/pagos/registro.ts` (Principio II), no correr una migración. Un `check` cerrado acá
  acoplaría el esquema al catálogo de proveedores, que es lo contrario del Principio VII.
  `regalos.tema` sí lleva `check` porque los temas son un conjunto de producto, no un punto de
  extensión de infraestructura.
- **No existe ninguna columna donde pudiera entrar un dato de tarjeta** (FR-006). No es solo que
  no haya `pan` ni `cvv`: la forma normalizada que devuelve `interpretarAviso` (research.md #3)
  es `{ eventoId, pagoId, pedidoId, monto, moneda, estado }`, así que **no hay camino** por el
  que un número de tarjeta llegue a la base, ni siquiera dentro de un payload crudo guardado por
  comodidad. Por eso `eventos_pago` tampoco guarda el cuerpo del aviso (ver más abajo).

**Índices**:

| Índice | Para qué |
|---|---|
| `pagos_pedido_id_idx` on `(pedido_id)` | Pagos de un pedido, para `/gracias/[pedido]` y la cola |
| `pagos_proveedor_pago_id_key` unique on `(proveedor, pago_id_proveedor)` | Un pago del proveedor, una fila |
| `pagos_pendiente_por_pedido_idx` unique on `(pedido_id) where pago_id_proveedor is null` | A lo sumo un cobro sin reclamar por pedido, de modo que el aviso sepa sin ambigüedad qué fila actualizar |

**Transiciones de estado del pago**:

```text
pendiente --(aviso: aprobado)---> aprobado
pendiente --(aviso: rechazado)--> rechazado
```

`aprobado` es terminal en esta feature. Un `rechazado` no se promueve a `aprobado`: un segundo
intento del comprador es un pago nuevo del proveedor, y por lo tanto una fila nueva. La
transición del pago a `aprobado` es la que dispara —en la misma operación— la transición del
pedido a `pagado`.

---

## Evento de pago

Tabla `eventos_pago`. No está en las Key Entities del spec: es la estructura que hace cumplir
FR-004 (idempotencia) a nivel de base, no de código (research.md #2).

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `uuid` PK, default `gen_random_uuid()` | |
| `proveedor` | `text`, not null | Mismo criterio que `pagos.proveedor`: sin `check` |
| `evento_id` | `text`, not null | El identificador **del evento** en el proveedor, no el del pago. Dos avisos distintos del mismo pago son dos eventos |
| `pedido_id` | `uuid`, **null**, FK a `pedidos.id` `on delete cascade` | `null` cuando el aviso refiere a un pedido que no existe. Ver abajo |
| `pago_id` | `uuid`, null, FK a `pagos.id` `on delete cascade` | La fila de `pagos` que el evento actualizó, si lo hizo |
| `estado_informado` | `text`, not null | Lo que el proveedor dijo, ya normalizado por `interpretarAviso` |
| `resultado` | `text`, not null | `'aplicado'` \| `'sin_efecto'` \| `'sin_pedido'` |
| `recibido_en` | `timestamptz`, not null, default `now()` | |

**Restricciones e índices**:

```sql
constraint eventos_pago_proveedor_evento_key unique (proveedor, evento_id),
constraint resultado_valido check (resultado in ('aplicado', 'sin_efecto', 'sin_pedido'))
```

```sql
create index eventos_pago_pedido_id_idx on eventos_pago (pedido_id);
create index eventos_pago_sin_pedido_idx on eventos_pago (recibido_en)
  where resultado = 'sin_pedido';
```

**Decisiones no obvias**:

- **`unique (proveedor, evento_id)` es la idempotencia, y es toda la idempotencia que hay**
  (FR-004, research.md #2). El manejador **verifica la firma primero y recién entonces
  inserta**; si la inserción viola la unicidad, responde 200 y no hace nada más. Un `select` previo tendría una ventana de carrera
  entre la lectura y la escritura; la restricción única no la tiene. Es la misma técnica atómica
  que la 001 usa para la primera apertura, aplicada al dinero.
- **La firma se verifica ANTES de insertar, y un aviso no verificado no deja fila.** El orden
  importa más de lo que parece: si un aviso con firma inválida se insertara "para dejar rastro",
  cualquiera podría mandar un `evento_id` inventado y, cuando llegara el aviso legítimo con ese
  mismo id, la restricción única lo trataría como duplicado y el pago **nunca se aplicaría**. La
  clave de idempotencia es, por construcción, envenenable; por eso solo se escriben eventos cuya
  autenticidad ya está probada (FR-005, Principio VII). Ni el rechazo por firma ni el rechazo
  por content-type dejan fila en esta tabla —y ese rechazo por content-type llega en dos
  códigos según qué capa corte: `403` del framework para un aviso en formulario, `text/plain` o
  sin cabecera, y `415` del manejador para un content-type que `checkOrigin` no vigila, como
  `application/xml` (research.md #1)—.
- **`pedido_id` es nullable, y de eso depende un caso límite del spec.** "Aviso de pago de un
  pedido que no existe: se rechaza sin alterar nada y queda registrado" (spec, Edge Cases)
  exige guardar el evento sin pedido asociado. Una FK `not null` haría ese registro imposible y
  el aviso se perdería en silencio, que es exactamente lo que el Principio VII prohíbe. El
  evento queda con `resultado = 'sin_pedido'`, la ruta responde `404` y el caso aparece en la
  cola operativa. **No hay asociación diferida ni cola de reintentos**: el pedido nace antes de
  ir a pagar (research.md #4), así que un aviso sin pedido es un error real —otro entorno, un
  pedido borrado— y no una carrera de tiempos. Se resuelve por rechazo explícito y visible, no
  por una promesa de reparación automática (research.md #2).
- **`resultado = 'sin_efecto'` no es redundante con la unicidad.** Dos avisos *distintos* del
  mismo pago tienen `evento_id` distinto: ambos se insertan, y el segundo no encuentra nada que
  cambiar porque el pedido ya está `pagado`. La unicidad cubre la re-entrega del mismo evento;
  `sin_efecto` cubre el evento nuevo que llega sobre un estado ya alcanzado. Las dos cosas
  juntas son lo que hace que 20 pagos confirmados por duplicado produzcan 20 pedidos pagados y
  nunca 40 (SC-006).
- **No se guarda el cuerpo crudo del aviso.** Es la consecuencia directa de FR-006: un payload
  completo del proveedor puede traer los últimos dígitos de la tarjeta, el nombre del titular o
  el BIN, y guardarlo "por si acaso" sería almacenar datos de tarjeta por la puerta de atrás. Se
  guardan los campos normalizados y nada más.
- **Un evento huérfano no contiene datos personales** —un identificador de evento, un estado y
  una fecha—, así que la cascada del borrado del pedido no lo alcanza y no hace falta que lo
  alcance (FR-030, research.md #16).

---

## Aviso

Tabla `avisos`. Un mensaje emitido al comprador (spec, Key Entities), con el registro que hace
verificable FR-029 (research.md #12).

| Campo | Tipo | Reglas |
|---|---|---|
| `id` | `uuid` PK, default `gen_random_uuid()` | |
| `pedido_id` | `uuid`, not null, FK a `pedidos.id` `on delete cascade` | |
| `tipo` | `text`, not null | `'comprobante'` \| `'revision'` \| `'aprobacion'` — los tres de FR-026 |
| `destinatario` | `text`, not null | La dirección de correo a la que se envió. **Nunca el celular**: el celular tiene un propósito declarado distinto y usarlo acá lo violaría (FR-035) |
| `proveedor` | `text`, not null | `'consola'` en desarrollo y simulación, `'resend'` en producción (research.md #12). Sin `check`, mismo criterio que `pagos.proveedor` |
| `estado` | `text`, not null, default `'pendiente'` | `'pendiente'` \| `'enviado'` \| `'fallido'` |
| `intentos` | `integer`, not null, default `0` | Se incrementa en cada intento, exitoso o no |
| `error` | `text`, null | Motivo de la última falla, acotado. Nunca el cuerpo del mensaje ni contenido de la historia |
| `creado_en` | `timestamptz`, not null, default `now()` | |
| `enviado_en` | `timestamptz`, null | Instante del envío exitoso |

**Restricciones e índices**:

```sql
constraint avisos_pedido_tipo_key unique (pedido_id, tipo),
constraint tipo_valido check (tipo in ('comprobante', 'revision', 'aprobacion')),
constraint estado_valido check (estado in ('pendiente', 'enviado', 'fallido')),
constraint enviado_en_requiere_enviado check (
  (estado = 'enviado' and enviado_en is not null) or estado <> 'enviado'
)
```

```sql
-- Cola operativa: lo que falta mandar y lo que falló (research.md #14, FR-029).
create index avisos_no_enviados_idx on avisos (creado_en) where estado <> 'enviado';
```

**Decisiones no obvias**:

- **`unique (pedido_id, tipo)` es lo que hace que cada aviso se emita una sola vez** (FR-026,
  US4 Independent Test: "cada uno de los tres avisos se emitió una sola vez"). Y no pelea con el
  reintento: reintentar es `UPDATE` sobre la misma fila, incrementando `intentos`. El registro
  del aviso es la *intención* de avisar, no cada intento de red.
- **Tiene un efecto de producto buscado**: FR-014 permite corregir y reenviar la historia sin
  límite, y sin esta restricción cada reenvío dispararía otro aviso de "regalo listo". El
  comprador recibe uno, el primero, y las correcciones no le llenan la casilla.
- **La falla queda en la tabla y el pedido no se bloquea** (FR-029). `estado = 'fallido'` con su
  `error` y sus `intentos` es un registro reintentable; el pedido sigue su curso porque ninguna
  transición de `pedidos` depende de que un aviso se haya enviado.
- **El reintento es manual, desde la cola operativa** (research.md #12): cada aviso fallido se
  muestra con un botón que lo reencola, y reencolar es un `UPDATE` sobre la misma fila que
  incrementa `intentos`. **No hay reintento automático ni tarea programada**: FR-029 pide que la
  falla quede registrada para poder reintentarse, no que el sistema reintente solo, y con el
  volumen de esta etapa un reintento automático es infraestructura que no se puede ejercitar a
  mano y que puede duplicar mensajes. El índice parcial `avisos_no_enviados_idx` es lo que hace
  esa cola barata de consultar.
- **El registro es independiente del proveedor** (research.md #12): se escribe igual con
  `consola` que con `resend`, porque el requisito es del negocio y no del proveedor. Eso es lo
  que permite verificar FR-029 en el entorno de simulación, sin cuenta de correo (FR-028).
- **`destinatario` duplica `pedidos.email`, a propósito.** Guarda la dirección a la que
  realmente se envió, que es lo único con lo que se puede diagnosticar y reintentar una falla.
  No agrega superficie de datos personales: es el mismo dato que el comprador dio, y se borra
  en la misma cascada (FR-030).

---

## Borrador

No es tabla: es el `jsonb` de `pedidos.borrador`, con su **propio** esquema zod en
`src/lib/borrador/esquema.ts` (research.md #8). Documento único por pedido; no se normaliza por
el mismo motivo por el que `regalos.contenido` no se normaliza (001 research.md #14): agregar un
paso no debe requerir una migración.

### Forma

```json
{
  "v": 1,
  "paso": "fotos",
  "destinatario": { "nombre": "Ana", "subtitulo": "para vos" },
  "tema": "nocturno",
  "fechaInicio": "2024-02-14",
  "momentos": [
    { "titulo": "Primer viaje", "texto": "...", "fecha": "2024-06-01", "fotoRuta": "pedidos/<id>/k3j.webp" }
  ],
  "fotos": [
    { "ruta": "pedidos/<id>/a7f.webp", "alt": "Los dos en la playa", "ancho": 1200, "alto": 1600 }
  ],
  "cancion": { "url": "https://open.spotify.com/track/...", "titulo": "...", "artista": "..." },
  "carta": { "texto": "..." },
  "preguntas": [ { "texto": "¿Te casás conmigo?", "respuesta": "Sí" } ],
  "cierre": { "texto": "Fin" },
  "actualizadoEn": "2026-11-10T19:04:00Z"
}
```

| Campo | Tipo | Reglas |
|---|---|---|
| `v` | `number` | Versión del esquema del borrador, presente desde la primera escritura (Principio VI). **Independiente** del `v` del contenido: son dos esquemas y dos líneas de versión |
| `paso` | `string`, opcional | Último paso guardado. Es lo que permite a `/contar/[pedido]/[paso]` devolver al comprador donde estaba (FR-010) |
| `destinatario.nombre` | `string`, opcional en el borrador | Pasa a `portada.nombreDestinatario`, donde **sí** es obligatorio |
| `destinatario.subtitulo` | `string`, opcional | Pasa a `portada.subtitulo` |
| `tema` | `string`, opcional | Clima visual. Al enviar debe ser uno de los tres de la 001 (`nocturno`, `papel`, `luminoso`), que es lo que el `check` de `regalos.tema` admite |
| `fechaInicio` | `string`, opcional | Si está, genera un bloque `contador`; si no, no hay contador |
| `momentos[]` | array, opcional, puede estar vacío | Un elemento por momento. `texto` es obligatorio recién al enviar |
| `momentos[].fotoRuta` | `string`, opcional | Ruta de storage de la foto del momento. **Nunca una dirección de acceso** |
| `fotos[]` | array, opcional, máximo 10 | Galería. `ruta` y `alt`; `ancho`/`alto` los escribe `sharp` al reducir |
| `cancion` | objeto, opcional | `url`, `titulo`, `artista` |
| `carta.texto` | `string`, opcional | Hasta ~4.000 caracteres (spec, Edge Cases) |
| `preguntas[]` | array, opcional | `texto` y `respuesta` |
| `cierre.texto` | `string`, opcional | |
| `actualizadoEn` | `string`, opcional | Espejo de `pedidos.actualizado_en` dentro del documento, para diagnóstico |

**Todo es opcional, y eso es el requisito, no una omisión**: FR-011 exige aceptar la carga
incompleta como borrador y exigir completitud únicamente al enviar.

### Qué contiene en cada paso

Cada paso del formulario es un `<form>` que hace POST, guarda **su propia rama** y redirige al
paso siguiente (research.md #8). "Un paso = una petición guardada" es autoguardado real sin una
línea de JavaScript: el comprador que cierra la pestaña ya tiene guardado todo lo anterior
(FR-010, SC-004).

| Paso | Ramas que escribe | Estado del documento al salir del paso |
|---|---|---|
| 1. Destinatario y clima | `destinatario`, `tema`, `fechaInicio` | Solo esas tres ramas; el resto ausente |
| 2. Momentos | `momentos[]` | Se agrega la rama; los momentos sin foto todavía |
| 3. Fotos | `fotos[]`, `momentos[].fotoRuta` | Cada subida exitosa agrega un elemento con su `ruta` ya reducida |
| 4. Canción | `cancion` | |
| 5. Carta | `carta` | |
| 6. Preguntas | `preguntas[]` | |
| 7. Cierre | `cierre` | Documento completo candidato a envío |

**Escritura por rama, no por documento.** Cada POST actualiza su clave con un `jsonb_set`
dirigido, no reescribiendo el `jsonb` entero con lo que tenía cargado esa pestaña. Es lo que
hace cierto el caso límite "el comprador recarga el formulario 30 veces: el borrador no se
corrompe ni se duplica": dos pestañas abiertas en pasos distintos no se pisan lo que la otra
guardó. Una escritura de documento completo convertiría cada envío de formulario viejo en una
pérdida silenciosa de pasos posteriores, y el comprador **ya pagó** — es el peor momento del
producto para perder datos.

### Por qué su esquema es distinto del esquema de contenido del motor

Decisión 8 de research.md, en una línea: **el borrador valida "esto es guardable" y el contenido
valida "esto es entregable"**. Son dos preguntas distintas, en dos momentos distintos.

| | `src/lib/borrador/esquema.ts` | `src/lib/contenido/esquema.ts` (001) |
|---|---|---|
| Pregunta que responde | ¿Puedo guardar esto sin perder lo que el comprador escribió? | ¿Esto es un regalo entregable? |
| Cuándo corre | En cada POST de paso | Una sola vez, al enviar, y en cada lectura de `regalos.contenido` |
| Obligatoriedad | Nada es obligatorio | `portada.nombreDestinatario`, `momento.texto`, `carta.texto`, `galeria.fotos[].alt`, `cancion.url` lo son |
| Forma | Un objeto por paso del formulario | `{ v, receta: Bloque[] }` con `posicion` |
| Tolerancia al error | Máxima: un campo a medio escribir se guarda igual | Ninguna: lo que no valida no nace |
| Versionado | `v` del borrador | `v` del contenido, hoy `1` |

Mezclarlos en un esquema único con todos los campos opcionales —la alternativa que research.md
#8 rechaza— obligaría al esquema del motor a aceptar basura a medio escribir, y con eso
destruiría lo único que ese esquema aporta: la garantía de que un regalo publicado está
completo. El motor no es un validador de formularios; es el contrato de lo entregado, y el
Principio VI lo vuelve irrevocable.

### Traducción al contenido del motor (FR-012)

El envío traduce el borrador a `{ v: 1, receta: [...] }` usando **los ocho tipos de bloque que
ya existen**, sin agregar ni modificar ninguno (Principio II, research.md #20). `posicion` se
asigna consecutiva en este orden:

| Rama del borrador | Bloque emitido | Si falta |
|---|---|---|
| `destinatario` | `portada` (1) | No se puede enviar: `nombreDestinatario` es obligatorio |
| `fechaInicio` | `contador` (1) | No se emite el bloque |
| `momentos[]` | `momento` (uno por elemento) | No se emiten |
| `fotos[]` | `galeria` (1, con todas las fotos no asignadas a un momento) | No se emite |
| `cancion` | `cancion` (1) | No se emite |
| `carta` | `carta` (1) | No se emite |
| `preguntas[]` | `pregunta` (uno por elemento) | No se emiten |
| `cierre` | `cierre` (1) | No se emite |
| `tema` | — | Va a `regalos.tema`, no a un bloque |

Las fotos se traducen a `foto.ruta`, **no** a `foto.url` (research.md #6, #7): el contenido
guarda la ruta de storage y la dirección de acceso se firma en cada render. La `ruta` que se
escribe en el contenido lleva ya el prefijo del regalo —`regalos/{regalo_id}/…`—, porque el
envío mueve los objetos del prefijo del pedido al del regalo en la misma operación
(research.md #16, ver la sección *Foto*).

**La validación de envío es más estricta que el esquema de contenido, a propósito.** El motor
omite en silencio un bloque sin contenido significativo o una `cancion.url` fuera de la lista
blanca de dominios (001 research.md #21) — comportamiento correcto para renderizar, e
inaceptable para entregar: el comprador cargó una canción y recibiría un regalo sin ella sin
que nadie se lo diga. Por eso el envío rechaza esos casos con un mensaje claro de qué falta
(FR-011) en vez de dejar que el render los descarte.

---

## Foto

No es tabla. Una foto vive en dos lugares, y en ninguno de los dos como fila propia:

1. El **archivo** en Supabase Storage, bucket `fotos`, declarado `public = false` en
   `supabase/config.toml` (research.md #15).
2. Su **referencia** —`ruta` y `alt`— dentro de `pedidos.borrador` primero, y de
   `regalos.contenido` después.

| Dato | Dónde | Reglas |
|---|---|---|
| Ruta de storage | `borrador.fotos[].ruta`, `contenido…foto.ruta` | `pedidos/{pedido_id}/{aleatorio}.webp` mientras el pedido está en borrador; `regalos/{regalo_id}/{aleatorio}.webp` desde que se envía la historia. El nombre aleatorio no cambia en la mudanza, y no se deriva del nombre del archivo subido ni de un contador (FR-020, Principio V) |
| Texto alternativo | `…alt` | Obligatorio en el contenido (esquema de la 001, Reglas de Calidad) |
| Dimensiones | `…ancho`, `…alto` | Las escribe `sharp` al reducir; opcionales |
| Bytes | Bucket `fotos` | Solo la versión reducida. El original **no se almacena** (FR-038) y los metadatos, incluida la ubicación GPS, se eliminan (FR-039) |
| Dirección de acceso | **en ningún lado** | Se firma por lote en cada render del servidor y muere con el request (FR-020, research.md #6) |

**Las fotos se mueven al enviar la historia** (research.md #16). Mientras el pedido está en
borrador viven bajo `pedidos/{pedido_id}/`, porque el regalo todavía no existe cuando se sube la
primera foto; al nacer el regalo se mueven a `regalos/{regalo_id}/`, que es el prefijo que el
borrado de la feature 001 ya barre. Sin ese movimiento, borrar un regalo por la vía existente
dejaría sus fotos en el bucket para siempre: `eliminar.ts` lista `regalos/{id}/` y no sabe nada
de `pedidos/{id}/`. Mover, en vez de extender el contrato de borrado de la 001, es lo que
mantiene ese contrato intacto y hace que empiece a cubrir las fotos nuevas sin tocarlo.

La mudanza la ejecuta el envío ([`contracts/api-enviar-historia.md`](./contracts/api-enviar-historia.md)),
es idempotente, y reescribe las rutas del borrador junto con las del contenido para que las dos
nombren siempre el objeto vigente. Una foto agregada en una corrección posterior nace ya bajo el
prefijo del regalo. El borrado del pedido barre **los dos** prefijos, porque un pedido abandonado
antes del envío tiene fotos que nunca llegaron a mudarse (FR-030).

**Una foto quitada antes de enviar se borra del bucket en el mismo momento**, no al enviar
(FR-019, spec Edge Cases: "no queda almacenada"). Lo mismo vale para una foto que desaparece
del borrador en una corrección posterior.

---

## Tarjeta

No es tabla, y no se persiste. Es un archivo derivado de un regalo publicado: su QR más el
texto mínimo de instrucción (FR-022, FR-023), generado por `scripts/generar-qr.ts` leyendo
`regalos.slug` y `SITIO_URL`.

No hay tabla de tarjetas porque la tarjeta en sí no se persiste: el QR es función pura del slug
—que es inmutable (Principio VI)— y la compuerta de emisión se evalúa en el momento de generar
(research.md #11). Ningún registro evita una emisión indebida; lo que la evita es que el
generador **se niegue**: no emite si el host de `SITIO_URL` termina en `vercel.app`, es
`localhost` o es una IP (FR-024, Compuerta 16), ni si el regalo no está `publicado` (FR-025). La
marca de simulación se estampa sobre la imagen, no en el nombre del archivo.

**Pero la emisión sí se registra**, en dos columnas del pedido y sin tabla nueva
(research.md #22): `pedidos.qr_emitido_en` y `pedidos.qr_simulacion`. No está ahí para evitar
una emisión, sino para que quede rastro de **qué soporte físico salió, cuándo, y si lo que se
imprimió era una tarjeta de simulación**. Para un negocio cuyo entregable es un objeto impreso
que no se puede corregir, eso es el último tramo del "pedido pagado sin regalo entregado" que el
Principio VII obliga a hacer visible. Las reglas de escritura están en la sección *Pedido* y en
[`contracts/qr-y-tarjeta.md`](./contracts/qr-y-tarjeta.md).

---

## El cambio al esquema de contenido: `foto.ruta`

Único cambio al contrato de datos de la feature 001 (research.md #7, #20).

```ts
// src/lib/contenido/tipos-bloque.ts — después
export interface Foto {
  url: string;      // sin cambios, con su significado actual, para siempre
  alt: string;
  ancho?: number;
  alto?: number;
  ruta?: string;    // NUEVO, opcional: ruta de storage en el bucket privado `fotos`
}
```

| | Antes | Después |
|---|---|---|
| `url` | `string`, requerido | **igual**: `string`, requerido, mismo significado |
| `ruta` | no existía | `string`, **opcional** |
| `v` del contenido | `1` | **`1`** |

**Reglas de resolución** (en `src/lib/regalos.ts`, nunca en un componente de bloque):

1. Si `ruta` está presente → se firma por lote (`createSignedUrls`) y el resultado se entrega
   en `url`.
2. Si `ruta` está ausente → se usa `url` tal cual, sin tocarla.
3. Si no se puede resolver ninguna de las dos → la foto se omite en render, como ya hace la 001
   con un bloque sin contenido renderizable. Nunca una pantalla en blanco (Principio I).

Los ocho componentes de `src/bloques/` siguen recibiendo `foto.url` ya resuelto y **no se
modifican**: la capa de datos entrega el contenido resuelto y el motor sigue sin saber si detrás
hay un bucket privado, uno público o un enlace externo (research.md #6).

**Por qué `url` no se toca.** El Principio VI prohíbe renombrar o eliminar un campo existente;
solo admite agregados. Reinterpretar `url` como ruta cuando no empieza con `http` —la
alternativa que research.md #7 rechaza— cambiaría el significado de un campo existente sin
cambiar su nombre, que es la peor variante de lo que ese principio prohíbe. **Por qué no se sube
a `v: 2`.** Agregar un campo opcional a un tipo existente es exactamente la evolución que v1
admite; una versión nueva se reserva para un cambio que v1 no pueda expresar.

### Qué garantiza el fixture dorado `tests/fixtures/contenido-v1.json`

El fixture está congelado: `v: 1`, los ocho tipos de bloque, y sus fotos con `url` absoluta a un
origen externo y **sin `ruta`**. `compatibilidad-versiones.spec.ts` lo renderiza en cada corrida.
Con eso, el fixture es la prueba —no la promesa— de cuatro cosas:

1. **`ruta` sigue siendo opcional.** Un contenido sin `ruta` valida y renderiza. Si alguien la
   volviera obligatoria, el fixture falla en la validación.
2. **`url` conserva su significado.** Un enlace externo sigue sirviéndose tal cual. La
   resolución no intenta firmar una dirección absoluta ni la trata como ruta de bucket.
3. **El contenido ya guardado sigue siendo válido.** Todo regalo nacido antes de esta feature
   —y el seed de demo, que usa enlaces externos— renderiza igual, sin migración de datos.
4. **El perímetro del cambio no se movió.** El fixture no se edita en esta feature. Si hiciera
   falta editarlo para que algo pase, la señal es inequívoca: el cambio salió del perímetro
   acordado (research.md #20) y dejó de ser un agregado compatible.

---

## Relaciones

```text
pedidos (1) ── (0..1) regalos        # pedidos.regalo_id -> regalos.id, UNIQUE, on delete set null
pedidos (1) ── (0..n) pagos          # on delete cascade
pedidos (1) ── (0..n) eventos_pago   # on delete cascade; pedido_id nullable (evento huérfano)
pedidos (1) ── (0..3) avisos         # on delete cascade; UNIQUE (pedido_id, tipo)
pedidos.borrador                     # jsonb embebido, no relación SQL
pagos (1) ── (0..n) eventos_pago     # eventos_pago.pago_id, on delete cascade

slugs (1) ── (0..1) regalos          # de la feature 001, sin cambios
regalos (1) ── (0..n) aperturas      # de la feature 001, sin cambios
```

### Por qué la referencia va de `pedidos` a `regalos` y no al revés

Decisión 10 de research.md, y es el Principio II aplicado al dinero. El motor no sabe de
ocasiones; tampoco tiene por qué saber de pedidos, cobros ni campañas.

- **Si `regalos` apuntara a `pedidos`**, el motor quedaría acoplado al comercio: un regalo
  creado a mano para una prueba, un seed o una demo tendría que inventar un pedido para ser
  válido. Los helpers de test de la feature 001 crean regalos sin pedido, y los 28 tests que son
  el gate de esta feature dejarían de pasar.
- **Una columna de comercio dentro de `regalos`** (`pedido_id`, `monto`, `estado_pago`) está
  rechazada por el mismo motivo, y además obligaría a modificar la tabla que esta feature se
  comprometió a no tocar.
- **La dirección elegida deja `regalos` exactamente como estaba**, y toda la asimetría del
  comercio vive en la tabla nueva, que es donde puede cambiar sin consecuencias para lo
  entregado.

### Qué impide de verdad el doble regalo (y qué papel juega `unique` en `pedidos.regalo_id`)

El mecanismo es un **reclamo atómico sobre el pedido antes de crear el regalo**
(research.md #9): `UPDATE pedidos SET regalo_id = $nuevo WHERE id = $1 AND regalo_id IS NULL`.
El envío que gana el reclamo se queda con su regalo; el que lo pierde deshace el que acababa de
crear y devuelve el que sí quedó. Es la misma técnica de UPDATE condicional que la feature 001
usa para la primera apertura y para la aprobación.

**La restricción única sobre `pedidos.regalo_id` no es lo que da esa garantía**, y atribuírsela
fue un error de la primera redacción. Esa restricción se evalúa *después* de que el regalo ya
existe: dos envíos en paralelo crearían dos regalos y solo el segundo fallaría al escribir el
pedido, dejando un regalo huérfano con un slug que el Principio VI prohíbe reutilizar para
siempre. Lo que la unicidad sí impide es que **dos pedidos** compartan un mismo regalo. Queda
como red de contención, no como defensa principal (FR-021, research.md #9,
[`contracts/api-enviar-historia.md`](./contracts/api-enviar-historia.md)).

### Por qué `on delete set null` y no `cascade`

La FK apunta desde `pedidos` hacia `regalos`, así que la cascada, si existiera, borraría el
**pedido** al borrar el regalo: se perdería el registro de un cobro. Eso es precisamente lo que
el Principio VII prohíbe. Con `set null`, un regalo borrado por la vía operativa de la 001 deja
el pedido en pie, pagado y sin regalo — que es lo que la cola operativa tiene que mostrar
(FR-008). Borrar el pedido, en cambio, sí arrastra el regalo, pero por una operación explícita y
ordenada, no por una cascada (ver abajo).

### Lo que esta feature escribe en `regalos`

Inserta filas; no cambia la tabla. Al primer envío de la historia: `slug` tomado de `slugs`,
`tema` del borrador, `contenido` traducido, `estado = 'en_revision'`, `vencimiento = null`
—los regalos nacen con vigencia permanente (spec, Assumptions)—, `aprobado_en = null`. Las
correcciones posteriores reemplazan **solo** `contenido`, y solo mientras
`estado = 'en_revision'` (FR-014, FR-016). El slug y la fila de `slugs` no se tocan nunca
(FR-015, research.md #9).

---

## Alcance del borrado

Decisión 16 de research.md, FR-030, Principio V ("borrado real, en base y en storage, en menos
de 72 h").

| Entidad | Qué pasa al borrar el pedido | Mecanismo | Por qué |
|---|---|---|---|
| `pedidos` (la fila) | Se borra | `DELETE` explícito | Incluye correo, celular, consentimiento, borrador y el registro de emisión del QR: todos son columnas de la fila (FR-030) |
| `pedidos.borrador` | Se borra con la fila | — | Es una columna, no una tabla. No hay copia en ningún otro lado |
| Fotos en el bucket `fotos` | Se borran todos los objetos bajo `pedidos/{id}/` **y** bajo `regalos/{regalo_id}/` | Borrado explícito de Storage, **antes** del `DELETE` | Los dos prefijos, porque las fotos nacen bajo el del pedido y se mueven al del regalo al enviar (research.md #16): un pedido abandonado antes del envío las tiene sin mudar. Ninguna cascada de Postgres alcanza Storage, y si el orden se invirtiera y fallara el borrado de archivos se perdería el prefijo que dice qué borrar |
| `pagos` | Se borran | `on delete cascade` | No hay nada que conservar: el identificador del pago en el proveedor sin pedido no sirve para nada, y es un dato del comprador |
| `eventos_pago` del pedido | Se borran | `on delete cascade` | Idem |
| `eventos_pago` huérfanos (`pedido_id is null`) | **No** se tocan | — | No pertenecen a ningún pedido y no contienen datos personales: un id de evento, un estado y una fecha |
| `avisos` | Se borran | `on delete cascade` | Incluyen la dirección de correo del comprador |
| `regalos` (el asociado) | Se borra | `DELETE` explícito del regalo **antes** del pedido; el `set null` de la FK se dispara solo | FR-030: "y el regalo asociado si ya nació" |
| `aperturas` del regalo | Se borran | `on delete cascade` de la 001 | Ya resuelto por la feature 001 |
| `slugs` (la fila) | **NUNCA se borra** | `UPDATE slugs SET regalo_id = NULL` | Ver abajo |
| `token_baja` | Se borra con la fila del pedido | — | |

**Orden de la operación**, y no es intercambiable: borrar objetos de Storage bajo
`pedidos/{id}/` y bajo `regalos/{regalo_id}/` → borrar el regalo (dispara la cascada de
`aperturas` y el `set null` de `pedidos.regalo_id`) → `UPDATE slugs SET regalo_id = NULL` →
borrar la fila de `pedidos` (dispara las cascadas de `pagos`, `eventos_pago` y `avisos`). Cada
paso que falle deja la información necesaria para reintentar el siguiente; el inverso no.

### Quién dispara el borrado (FR-030)

Una ruta **propia de esta feature**: `DELETE /api/pedidos/[id]/eliminar`, autenticada con
`Authorization: Bearer <OPS_SECRET>` —el mismo secreto de servidor que usa la ruta de borrado de
la feature 001— y especificada en
[`contracts/api-eliminar-pedido.md`](./contracts/api-eliminar-pedido.md) (research.md #16).

El `DELETE` de la 001 opera sobre un **regalo** y no conoce pedidos, pagos ni avisos, así que no
alcanza para FR-030; borrar el pedido sí alcanza el regalo, porque la referencia va en esa
dirección (research.md #10). La ruta de la 001 no se toca y sigue siendo válida para un regalo
que nunca tuvo pedido.

La credencial es el secreto de servidor y **no** el id del pedido: FR-030 dice *«a pedido del
comprador»*, no *«por el comprador»*, y un borrado irreversible que se disparara con el solo
conocimiento del enlace convertiría cada enlace filtrado en una destrucción posible.

### Por qué la fila de `slugs` nunca se borra

Hay una tensión real entre dos principios, y la feature 001 ya eligió de qué lado resolverla
(research.md #16):

- El **Principio V** exige borrado real: nada del comprador queda.
- El **Principio VI** exige que un identificador entregado **nunca** se reasigne ni se reutilice.

Si la fila de `slugs` se borrara, su valor volvería al espacio de slugs disponibles y el
generador podría entregárselo a otro regalo. Entonces un QR ya impreso —que no se actualiza
nunca y está en manos de alguien— abriría **el regalo de otra persona**. No es una fuga teórica:
es la peor falla de privacidad imaginable en este producto, y la causaría el borrado hecho en
nombre de la privacidad.

La fila que queda no es un dato personal: es el string del slug y una fecha, con
`regalo_id = NULL`. No hay contenido, ni correo, ni fotos, ni forma de llegar a nada. Es una
lápida que ocupa el número para que nadie más lo use. `eliminar.spec.ts` de la feature 001 lo
verifica, y esta feature extiende el alcance del borrado a las cuatro tablas nuevas **sin
cambiar esa regla**.

---

## Reglas de validación por requisito

| FR | Qué impone sobre los datos | Dónde se hace cumplir |
|---|---|---|
| FR-002 | Existe una fila de `pedidos` antes de cualquier efecto del pago | `pedidos` se inserta en `/comprar`, antes de redirigir (research.md #4) |
| FR-003 | El identificador del pedido es no adivinable y es la única credencial | `pedidos.id` uuid v4; ninguna consulta del comprador usa otro criterio |
| FR-004 | El mismo aviso, cualquier cantidad de veces, un solo efecto | `unique (proveedor, evento_id)`; la firma se verifica **antes** del `insert`, y el `insert` es la comprobación (research.md #2) |
| FR-005 | Un aviso no verificado no escribe nada | La firma se verifica antes del `insert`; sin fila, sin efecto |
| FR-006 | Solo identificador del proveedor, monto y estado | `pagos` no tiene columna donde entre un dato de tarjeta; `eventos_pago` no guarda el cuerpo crudo |
| FR-008 | "Pagado sin regalo entregado" es computable y consultable | `pedidos_estado_creado_en_idx` + join con `regalos.estado` |
| FR-009 | Siete ramas del borrador, una por paso | `src/lib/borrador/esquema.ts` |
| FR-010 | Lo guardado sobrevive al cierre de la pestaña | `pedidos.borrador` persistido por POST de paso; `borrador.paso` para retomar |
| FR-011 | El borrador admite todo incompleto; el envío exige completitud | Dos esquemas separados (research.md #8). El mínimo para enviar es tema + nombre del destinatario + al menos un bloque de contenido (research.md #21) |
| FR-012 | El envío produce `{ v: 1, receta }` con los ocho tipos existentes | `src/lib/borrador/a-contenido.ts`; `contenido/esquema.ts` valida |
| FR-013 | El regalo nace `en_revision` | `regalos.estado` default `'en_revision'` (001) |
| FR-014 | Las correcciones reemplazan solo `contenido` | `UPDATE regalos SET contenido` con `WHERE estado = 'en_revision'` |
| FR-015 | El slug se asigna una vez y no cambia | `regalos.slug` inmutable; la fila de `slugs` no se reasigna (research.md #9) |
| FR-016 | Un regalo publicado no admite cambios de contenido | El `WHERE estado = 'en_revision'` no matchea; sin filas afectadas, sin cambio |
| FR-017 | Todo texto del comprador se guarda y se muestra como texto literal | `text`/`jsonb` sin interpretación; escape en render (001, `escape-html.spec.ts`) |
| FR-018 | Cada foto es una imagen y no excede el peso admitido | `sharp` como autoridad final (research.md #5); lo que no valida no entra al bucket ni al borrador |
| FR-019 | Las fotos quitadas no quedan almacenadas | Borrado de Storage en el mismo momento de quitarlas |
| FR-020 | No hay dirección de acceso guardada ni adivinable | Se guarda `ruta`, nunca una dirección firmada; nombre de archivo aleatorio; bucket privado |
| FR-021 | Doble envío, un solo regalo | Reclamo atómico `UPDATE pedidos SET regalo_id = … WHERE regalo_id IS NULL` antes de crear el regalo; `unique (pedidos.regalo_id)` como red de contención (research.md #9) |
| FR-024 / FR-025 | No hay QR sin dominio propio ni sin regalo publicado | Compuerta en `src/lib/qr.ts`, evaluada en la emisión (research.md #11). Toda emisión exitosa queda registrada en `pedidos.qr_emitido_en` y `pedidos.qr_simulacion` (research.md #22) |
| FR-026 | Tres avisos, uno de cada tipo | `unique (pedido_id, tipo)` con `check` sobre `tipo` |
| FR-027 | Ningún aviso lleva datos que el comprador no dio | `avisos.destinatario` es el correo que él mismo cargó; no hay otra fuente |
| FR-029 | Una falla de aviso queda registrada y reintentable | `avisos.estado = 'fallido'`, `intentos`, `error`; ninguna transición de pedido depende de un aviso. El reintento es manual, desde la cola operativa (research.md #12) |
| FR-030 | El borrado alcanza todo lo del comprador | Cascadas + borrado explícito de Storage en los dos prefijos, disparado por `DELETE /api/pedidos/[id]/eliminar` con `OPS_SECRET` (ver Alcance del borrado) |
| FR-031 | Nadie accede al pedido de otro | Toda lectura filtra por `pedidos.id`; nada enumerable, nada secuencial, sin índice por correo |
| FR-034 | El correo es obligatorio | `email text not null` + `check` de forma mínima |
| FR-035 | El celular es opcional y nunca se guarda sin consentimiento | `celular` nullable + `check celular_requiere_consentimiento` |
| FR-036 | La baja borra el número | `UPDATE` a `null`, no una marca (ver abajo) |
| FR-037 / FR-038 / FR-039 | Solo la versión reducida, sin metadatos | `sharp` antes de escribir en el bucket; el original nunca se escribe |

---

## Datos personales

Inventario completo de lo que esta feature guarda de una persona. Si no está en esta tabla, no
se guarda (Principio V: "se guarda SOLO lo necesario para renderizar y entregar la página").

| Dato | Dónde | ¿Obligatorio? | Para qué |
|---|---|---|---|
| Correo del comprador | `pedidos.email`, `avisos.destinatario` | **Sí** (FR-034) | Es la vía de entrega de sus enlaces. Sin él no hay forma de darle lo que compró |
| Celular del comprador | `pedidos.celular` | **No** (FR-035) | Publicidad futura, y nada más. Único dato que el producto **no** necesita para funcionar |
| Consentimiento publicitario y su fecha | `pedidos.consentimiento_publicidad`, `pedidos.consentimiento_en` | — | Demostrar que el consentimiento existió (research.md #13) |
| Fecha de baja publicitaria | `pedidos.baja_publicidad_en` | — | Constancia de que la baja se honró. Sobrevive al borrado del número porque, sin número, no identifica a nadie (research.md #13) |
| Contenido de la historia | `pedidos.borrador`, `regalos.contenido` | Según el paso | Es el producto |
| Fotos | Bucket `fotos` | No | Es el producto. Solo la versión reducida, sin metadatos (FR-038, FR-039) |
| Nombre del destinatario | Dentro del borrador y del contenido | Sí, al enviar | `portada.nombreDestinatario` |
| Identificador del pago en el proveedor, monto, moneda, estado | `pagos` | Sí | FR-006. Es el máximo que se puede guardar de un cobro |

**Lo que explícitamente no se guarda**: datos de tarjeta en ninguna forma (FR-006, Principio
VII); domicilio postal —el entregable es un archivo imprimible, no una tarjeta enviada (spec,
Assumptions)—; nombre o apellido del comprador, que ningún requisito pide; IP, user agent o
cualquier señal de analítica de terceros (FR-033); ni el cuerpo crudo de los avisos del
proveedor de pago.

### Cómo se cumple la excepción publicitaria acotada del Principio V

La constitución admite guardar un dato de contacto con fin publicitario solo bajo cuatro
condiciones, y exige una quinta sobre la baja. La excepción entró en la constitución **v1.3.0**
(la v1.3.1 posterior fue solo una corrección de redacción sobre la razón del Principio VII y no
toca el Principio V). Las cinco están en el modelo, no en el
formulario (Compuerta 17, research.md #13):

| Condición de la constitución | Cómo la hace cumplir el modelo |
|---|---|
| **Opcional, nunca exigido para comprar** | `pedidos.celular` es nullable y ninguna restricción lo requiere. `estado = 'pagado'` se alcanza con `celular is null` sin ninguna diferencia (SC-016, FR-035) |
| **Explícito y no pre-aceptado** | `consentimiento_publicidad boolean not null default false`. El default de la base es "no", así que un formulario mal armado, un POST sin el campo o un bug de aplicación dejan "no", nunca "sí" |
| **Propósito declarado al pedirlo** | `consentimiento_en` fecha el instante en que se declaró el propósito y se aceptó. Un consentimiento sin fecha es un consentimiento que no se puede demostrar (research.md #13) |
| **Nunca deducido de otro dato ni usado para otro fin** | El celular no se deriva de nada y no aparece en ninguna otra columna. `avisos.destinatario` es correo: los avisos transaccionales nunca viajan por el canal publicitario, y el canal publicitario no tiene registro en `avisos` |
| **Vía de baja que BORRA, no que marca** | `pedidos.token_baja` habilita `/baja/[token]`, cuyo efecto es `UPDATE pedidos SET celular = NULL, consentimiento_publicidad = false`. No existe ninguna columna `baja`, `dado_de_baja` ni `activo`: marcar en vez de borrar está rechazado explícitamente por la constitución, y el modelo no ofrece el lugar donde hacerlo |

**El `check celular_requiere_consentimiento` es el corazón de todo esto.** Convierte "no
guardarlo sin consentimiento" de una intención del manejador del formulario en un invariante de
la base: no existe un `INSERT` ni un `UPDATE`, correcto o erróneo, que deje un número sin su
consentimiento y su fecha. Es la misma filosofía que la decisión 2 aplica a la idempotencia: la
tabla manda, no el código.

**Por qué `token_baja` y no `pedidos.id`.** El enlace de baja viaja **dentro de los mensajes
publicitarios**, el canal más propenso a reenvíos, capturas y filtraciones. Si fuera el `id` del
pedido, cada mensaje publicitario sería una filtración de la credencial que da acceso al pedido
completo, al borrador y a la historia entera (FR-003, FR-031). Con un token propio, lo peor que
puede hacer quien lo obtenga es dar de baja un número que ya iba a borrarse. La única operación
que el token habilita es destructiva hacia el dato publicitario y ciega para todo el resto.

**La baja es idempotente**: visitarla dos veces deja el mismo estado y responde lo mismo. La
fila sobrevive —el pedido sigue existiendo, con su correo y su historia— porque la baja es de la
publicidad, no del pedido. El borrado del pedido completo es FR-030 y es otra operación.

---

## Contradicciones detectadas, y cómo quedaron resueltas

Esta sección se escribió como registro de lo que no se podía resolver desde el modelo. **Las
siete quedan acá, con su resolución al lado**: sirve como rastro de auditoría, no como lista de
pendientes. La fuente de verdad es `research.md`, que hoy tiene 23 decisiones.

1. **El tope de peso de foto es 10 MB o 4 MB, según dónde se lea.** El spec (Assumptions y
   FR-018) declaraba 10 MB al subir, y research.md #5 rechazaba "bajar el tope declarado a
   4 MB" mientras fijaba 4 MB en el camino sin JavaScript.
   → **Resuelta por la decisión 5.** Son **dos topes declarados explícitamente**, no uno: hasta
   **10 MB con JavaScript**, porque la foto se reduce antes de salir del dispositivo, y hasta
   **4 MB sin JavaScript**, que es el tope real que impone la plataforma al cuerpo de una
   petición. No es el mismo límite disfrazado y el formulario lo explica en vez de fallar sin
   mensaje. El modelo no tiene que expresar dos topes: `sharp` sigue siendo la autoridad final
   sobre lo que entra al bucket.
2. **El mínimo para enviar una historia no estaba definido en ninguna parte.** Este documento lo
   asumía y lo dejaba marcado como asunción.
   → **Resuelta por la decisión 21.** Una historia es enviable con **tema + nombre del
   destinatario + al menos un bloque de contenido** (momento, carta, galería, canción, pregunta
   o cierre). Deja de ser una asunción de este documento: es una decisión declarada, y las
   condiciones completas viven en
   [`contracts/api-enviar-historia.md`](./contracts/api-enviar-historia.md).
3. **El caso límite del aviso que llega antes del pedido quedaba sin camino de reparación.**
   → **Resuelta por la decisión 2, por rechazo explícito y no por reparación.** Un aviso cuyo
   pedido no existe se **rechaza con 404**, queda registrado con `resultado = 'sin_pedido'` y
   aparece en la cola operativa. **No hay asociación diferida ni cola de reintentos**: el pedido
   nace antes de ir a pagar (decisión 4), así que un aviso sin pedido es un error real —otro
   entorno, un pedido borrado— y no una carrera de tiempos. La información para mirarlo está
   igual en el modelo (`pedido_id` nullable, `resultado`, índice parcial por `sin_pedido`), pero
   nadie promete repararlo automáticamente.
4. **El borrado de un regalo por la vía de la feature 001 dejaba fotos huérfanas.**
   → **Resuelta por la decisión 16.** Las fotos viven bajo `pedidos/{pedido_id}/` mientras el
   pedido está en borrador y **se mueven a `regalos/{regalo_id}/` al enviar la historia**, que es
   el prefijo que `eliminar.ts` de la 001 ya barre. El contrato de borrado de la 001 no cambia y
   empieza a cubrir las fotos nuevas sin tocarlo. Y FR-030 ya tiene dueño:
   `DELETE /api/pedidos/[id]/eliminar` con `OPS_SECRET`
   ([`contracts/api-eliminar-pedido.md`](./contracts/api-eliminar-pedido.md)), que barre los dos
   prefijos.
5. **`Foto` y `Tarjeta` figuran como Key Entities y no tienen fila en ninguna tabla**, de modo
   que no quedaba registro de qué QR se emitió, cuándo ni si fue marcado como simulación.
   → **Resuelta por la decisión 22.** Dos columnas en `pedidos` —`qr_emitido_en` y
   `qr_simulacion`—, sin tabla nueva. `Foto` sigue sin fila propia y eso no es un hueco: su
   referencia vive en el borrador y en el contenido, y sus bytes en el bucket, como explica la
   sección *Foto*.
6. **Citas de versión de la constitución que no coincidían.**
   → **Resuelta: la excepción publicitaria entró en v1.3.0.** La v1.3.1 fue una corrección de
   redacción posterior sobre la razón del Principio VII y no toca el Principio V. La cita
   unificada es **v1.3.0** en los tres documentos de Fase 1.
7. **Traza menor**: research.md #5 cita "FR-018" como fuente del tope de 10 MB, pero la cifra
   está en las Assumptions del spec, no en FR-018.
   → **Sigue siendo una traza, sin efecto sobre el modelo.** Queda anotada para que la próxima
   lectura no busque donde no está. No requiere ninguna decisión.
