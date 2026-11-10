# Contrato: `POST /api/pagos/webhook/[proveedor]`

> Nota de ruteo: el proveedor es un segmento dinámico porque el adaptador de pago admite más
> de un proveedor (research.md #3) y cada uno firma y nombra sus campos distinto. `simulado`
> es el único proveedor emitido al cierre de esta feature. Un `proveedor` que no esté
> registrado en el adaptador responde `404` sin leer el cuerpo.

Implementa FR-004 (idempotencia), FR-005 (autenticidad, nunca procedencia) y FR-006 (nada de
tarjeta) / Principio VII y Compuerta de Aceptación 14. Es el **único** camino por el que un
pedido pasa a `pagado`: ni el regreso del comprador desde el proveedor, ni ninguna página, ni
ninguna otra ruta de API cambian el estado de pago (research.md #4).

## Request

- **Método**: `POST`
- **Path param**: `proveedor` — clave del adaptador (`simulado` hoy)
- **Content-Type**: `application/json`, **obligatorio y exclusivo**. Cualquier otro valor se
  rechaza, pero el código depende de qué capa corta: `403` del framework para los
  content-types que `checkOrigin` vigila —formulario, `text/plain`, cabecera ausente— y `415`
  de este manejador para los que no vigila, como `application/xml` (ver abajo).
- **Headers**: la cabecera de firma que define el proveedor. Para `simulado`:
  `X-Firma: <hex>` = HMAC-SHA256 del **cuerpo crudo** con `PAGO_SIMULADO_SECRETO`.
- **Body**: documento JSON opaco para esta ruta. Lo interpreta el adaptador
  (`interpretarAviso(request)` → `{ eventoId, pagoId, pedidoId, monto, moneda, estado }`,
  research.md #3). Esta ruta no conoce la forma del payload de ningún proveedor.
- **Auth**: la verificación de firma, y nada más. Sin secreto en la URL, sin lista de IP, sin
  `Origin`, sin cookie.
- **Invocación**: servidor a servidor, desde el proveedor de pago. Nunca desde un navegador.

### Por qué `application/json` y nada más (evidencia medida)

El `checkOrigin` de Astro queda **encendido** (research.md #1). La medición contra el deploy
real, con y sin cabecera `Origin`, es la evidencia que sostiene este contrato:

| Content-Type | Sin `Origin` | `Origin` ajeno |
|---|---|---|
| `application/json` | **pasa** | **pasa** |
| `application/x-www-form-urlencoded` | 403 | 403 |
| `text/plain` | 403 | 403 |
| (sin content-type) | 403 | — |

De ahí se siguen las dos mitades del contrato:

1. **No hay excepción que pedir.** Un aviso en JSON entra sin `Origin`, que es lo que mandan
   los proveedores de pago habituales. Los formularios de la feature —compra, carga de la
   historia, baja publicitaria— conservan intacta su protección CSRF.
2. **El rechazo de lo que no es JSON viene de dos capas distintas, y las dos son correctas.**
   El `415` de este manejador **no es alcanzable** para los content-types de la tabla: a
   `application/x-www-form-urlencoded`, a `text/plain` y a la ausencia de cabecera los rechaza
   el framework con `403` **antes de que el manejador se ejecute** (research.md #1). El `415`
   solo se observa con un content-type que `checkOrigin` no vigila, como `application/xml`:
   ahí el manejador sí corre, y es él el que exige `application/json`.

Corolario operativo, y es el punto que un test se equivoca si lo ignora: un `403` en esta ruta
**es** el rechazo esperado de un aviso enviado como formulario, no una anomalía. Un test que
espere `415` para un aviso en `x-www-form-urlencoded` va a fallar (research.md #1). El `415`
es el rechazo esperado para un content-type ajeno que llega hasta el manejador.

### Por qué la cabecera `Origin` no participa de la decisión

- El Principio VII lo exige textualmente: *la protección de un webhook DEBE ser la
  verificación de su firma, NUNCA el chequeo de origen*.
- Ningún proveedor de pago manda `Origin`. Una comprobación que solo puede fallar no es una
  protección: es una caída programada (research.md #1, Principio VII).
- `Origin`, la IP de origen y cualquier otra señal de procedencia son falsificables o
  cambiantes; la firma HMAC sobre el cuerpo no lo es. FR-005 dice exactamente eso: la
  verificación NO DEBE depender de la procedencia aparente de la petición.

## Comportamiento

El orden importa: cada paso es una compuerta y ninguno escribe antes de que pase el anterior.

1. **Proveedor**: si `proveedor` no está registrado en el adaptador → `404`, sin leer el
   cuerpo, sin registrar nada.
2. **Content-Type**: si no es `application/json` → `415`. No se lee el cuerpo, no se verifica
   firma, no se registra evento, no se toca ningún pedido. Este paso solo se alcanza con un
   content-type que `checkOrigin` no vigila (`application/xml` y similares): los de formulario,
   `text/plain` y la ausencia de cabecera ya fueron rechazados con `403` por el framework, sin
   llegar hasta acá (research.md #1).
3. **Firma**: se lee el cuerpo **como texto crudo** —antes de parsearlo, porque la firma es
   sobre los bytes recibidos— y se verifica el HMAC en comparación de tiempo constante (mismo
   criterio que `coincideSecreto` en `src/lib/acceso.ts`). Firma ausente, mal formada o que no
   valida → `401`, y no se modifica ni se registra nada.
4. **Interpretación**: el adaptador traduce el payload. Si el JSON es ilegible o falta alguno
   de los campos que el adaptador necesita → `400`. No se registra evento: un evento sin
   `eventoId` no es idempotable.
5. **Registro del evento, con la firma ya verificada** (research.md #2):
   `INSERT INTO eventos_pago` con `proveedor`,
   `evento_id`, `pedido_id`, `estado_informado` y `resultado`. La tabla tiene restricción única
   sobre `(proveedor, evento_id)`. **No se guarda el cuerpo crudo del aviso**: un payload
   completo del proveedor puede traer los últimos dígitos de la tarjeta o el nombre del
   titular, y archivarlo "por si acaso" sería almacenar datos de tarjeta por la puerta de atrás
   (FR-006, data-model.md). Se guardan los campos ya normalizados y nada más.
   - Si la inserción **viola la unicidad** → el evento ya fue procesado: responde `200` y no
     hace nada más. Nunca `409`.
   - Si la inserción **tiene éxito** → sigue al paso 6. La idempotencia la garantiza la
     restricción de la base, no una comprobación previa en el código: un `select` antes del
     `insert` tiene una ventana de carrera que la restricción única no tiene (misma técnica
     atómica que la feature 001 usa para la primera apertura).
   - **El orden entre el paso 3 y este paso es de seguridad, no de estilo.** Se inserta
     *después* de verificar la firma porque insertar antes dejaría la clave de idempotencia
     envenenable: cualquiera podría mandar un `evento_id` inventado y el aviso legítimo que
     llegara después quedaría tratado como duplicado, de modo que **el pago nunca se
     aplicaría** (research.md #2). Por eso un rechazo por firma (`401`) o por content-type
     (`415` acá, `403` en el framework) **no deja fila** en `eventos_pago`.
6. **Pedido**: busca el pedido por `pedidoId`.
   - Si no existe → el evento queda registrado con `pedido_id = NULL` y
     `resultado = 'sin_pedido'`, aparece en la cola operativa, no se altera nada más y responde
     `404` (Edge Case: *aviso de pago de un pedido que no existe: se rechaza sin alterar nada
     y queda registrado*). Por
     research.md #4 este caso no debería ocurrir nunca: el pedido nace antes de ir a pagar, de
     modo que ya existe cuando llega el aviso —incluso si el aviso llega antes de que el
     comprador vuelva del proveedor—. Si ocurre, es un aviso de otro entorno o un aviso
     apócrifo con firma válida, y queda a la vista en la cola operativa.
   - Si existe → sigue al paso 7.
7. **Pago**: la fila de `pagos` **ya existe**, en estado `pendiente`, creada al iniciar el
   cobro con el monto y la moneda del momento
   ([`api-iniciar-compra.md`](./api-iniciar-compra.md), research.md #18). Este paso la
   actualiza: `pago_id_proveedor`, `estado` (`aprobado` \| `rechazado`) y `actualizado_en`.
   **Jamás** se guarda ningún dato de tarjeta (FR-006): la forma normalizada que devuelve
   `interpretarAviso` es `{ eventoId, pagoId, pedidoId, monto, moneda, estado }`, y no hay
   ninguna columna donde un dato de tarjeta pudiera entrar.
   - Si el monto informado difiere del cotizado, **no se bloquea el pago**: se conserva el
     cotizado, se registra la discrepancia y queda visible en la cola operativa. Bloquearlo
     dejaría a un comprador que pagó sin su regalo, que es justo lo que el Principio VII
     prohíbe (ver H8 de [`CONTRADICCIONES.md`](./CONTRADICCIONES.md)).
8. **Efecto sobre el pedido**, según el `estado` que informa el adaptador:
   - `aprobado` → `UPDATE pedidos SET estado = 'pagado', pagado_en = now() WHERE id = $1 AND
     estado = 'iniciado'`. UPDATE condicional, por la misma razón que en
     `/api/regalos/[id]/aprobar`: a prueba de concurrencia y de reprocesos.
   - `rechazado` / `pendiente` / cualquier otro → se registra en `pagos`, el evento queda con
     `resultado = 'sin_efecto'` y el pedido **queda como está**. Un pedido que el proveedor no aprobó nunca muestra una pantalla de éxito
     (Escenario 4 de la User Story 1).
9. **Acciones derivadas**: recién con el pedido en `pagado` se emite el comprobante de compra
   (FR-026) a través del adaptador de correo, registrándolo en `avisos` con
   `tipo = 'comprobante'`. La restricción `unique (pedido_id, tipo)` es la segunda red: el
   aviso se emite una sola vez aunque el efecto se intentara dos veces. Solo el ganador de la
   inserción del paso 5 llega acá, así que un aviso duplicado no vuelve a mandar correo
   (SC-006: *ninguna acción derivada duplicada*). Una falla de envío deja la fila de `avisos`
   en estado fallido y **no** revierte el pago ni cambia la respuesta de esta ruta (FR-029). El
   reintento de ese aviso es **manual, desde la cola operativa**, con un botón que lo reencola:
   no hay reintento automático ni tarea programada (research.md #12).

## Response

- `200 OK` → evento aplicado, o evento duplicado, o evento de un pago no aprobado. Cuerpo
  vacío o un JSON mínimo de acuse; el proveedor no lo lee.
- `400` → cuerpo JSON ilegible, o sin los campos que el adaptador necesita.
- `401` → firma ausente o que no valida. Ningún pedido fue modificado.
- `404` → `proveedor` desconocido, o `pedidoId` que no corresponde a ningún pedido.
- `415` → `Content-Type` que llega al manejador y no es `application/json` (p. ej.
  `application/xml`).
- `403` → **no lo emite este manejador**: lo emite el `checkOrigin` del framework para
  `application/x-www-form-urlencoded`, `text/plain` o una petición sin content-type, antes de
  que el manejador exista. Se documenta acá porque es la respuesta que de verdad va a ver un
  proveedor que avise por formulario (research.md #1).
- `500` → falla al escribir en la base. Se devuelve a propósito: el proveedor reintenta, y el
  reintento es seguro por construcción.

### Por qué un duplicado responde `200` y nunca `409`

Los proveedores reintentan ante cualquier respuesta que no sea `2xx`. Un `409` ante un evento
ya procesado provocaría reintentos infinitos de algo que ya está hecho (research.md #2). El
`200` dice la verdad desde el punto de vista del proveedor: *tu aviso está aplicado*.

Única asimetría conocida, declarada acá para que nadie la descubra como sorpresa: un aviso de
un pedido inexistente responde `404` en su **primera** entrega y `200` en las siguientes, por
la regla del duplicado. Es inofensivo —en ninguno de los dos casos se altera un pedido— y es
preferible a inventar un tercer código.

## Invariantes garantizados

- El mismo `(proveedor, evento_id)` produce **un solo** efecto, cualquiera sea la cantidad de
  entregas y aunque lleguen simultáneamente (FR-004, SC-006: 20 pagos confirmados por
  duplicado producen 20 pedidos pagados, nunca 40).
- Ningún aviso sin firma válida modifica un pedido, un pago ni un aviso (FR-005).
- Ninguna respuesta de esta ruta depende de `Origin`, de la IP de origen ni de ninguna otra
  señal de procedencia (FR-005, Principio VII).
- Todo aviso con firma válida e interpretable queda registrado en `eventos_pago` antes de que
  se ejecute cualquier acción derivada de él (FR-002, Principio VII: *el pago DEBE registrarse
  antes de cualquier otra acción derivada*).
- Ningún aviso rechazado —por firma, por content-type o por payload ilegible— deja fila en
  `eventos_pago`: la clave de idempotencia solo se escribe con avisos cuya autenticidad ya
  está probada (research.md #2).
- Un aviso cuyo pedido no existe queda registrado con `resultado = 'sin_pedido'`, responde
  `404` y aparece en la cola operativa. No hay asociación diferida ni cola de reintentos: el
  pedido nace antes de ir a pagar, así que un aviso sin pedido es un error real
  (research.md #2, #4).
- Nunca existe una fila en `pagos` ni en `eventos_pago` con datos de tarjeta ni con el cuerpo
  crudo del aviso (FR-006).
- Un pedido nunca pasa a `pagado` por efecto de un `GET`, de un formulario, ni del regreso del
  comprador desde el proveedor.
- Esta ruta no crea pedidos. Si el pedido no existe, no se inventa uno (research.md #4).
