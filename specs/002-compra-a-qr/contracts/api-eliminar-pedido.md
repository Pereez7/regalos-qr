# Contrato: `DELETE /api/pedidos/[id]/eliminar`

> Nota de superficie: es la ruta que **esta** feature agrega para FR-030 (research.md #16). El
> `DELETE /api/regalos/[id]/eliminar` de la feature 001 opera sobre un regalo y no conoce
> pedidos, pagos ni avisos, así que no alcanza para FR-030. La dirección de la referencia hace
> que la de acá sí alcance: borrar el pedido llega al regalo, porque `pedidos.regalo_id` apunta
> a `regalos.id` y no al revés (research.md #10). La ruta de la 001 **no se toca**, y sigue
> siendo válida para un regalo que nunca tuvo pedido.

Implementa FR-030 (borrar un pedido a pedido del comprador, con su borrador, sus fotos, sus
datos de contacto, su consentimiento publicitario y el regalo asociado si ya nació) / Principio
V ("borrado real, en base y en storage, en menos de 72 h"). Herramienta operativa sin UI de
administración: el panel completo está explícitamente fuera de alcance (spec.md).

## Request

- **Método**: `DELETE`
- **Path param**: `id` — UUID del pedido
- **Headers**: `Authorization: Bearer <OPS_SECRET>` — secreto de servidor (variable de
  entorno), el mismo que usa la ruta de borrado de la feature 001. Sin este header válido →
  `401`.
- **Body**: ninguno

### Por qué `OPS_SECRET` y no el id del pedido

El id del pedido es la credencial del comprador para **operar** sobre su pedido (FR-003), y
esta operación es irreversible: borra la historia, las fotos y el regalo. Un borrado que se
disparara con el solo conocimiento del enlace convertiría cada enlace filtrado, reenviado o
capturado en una destrucción posible, y no habría de dónde recuperar nada.

FR-030 dice *«a pedido del comprador»*, no *«por el comprador»*: el comprador lo pide y el
negocio lo ejecuta, exactamente como la ruta de borrado de la feature 001. Es también la razón
por la que no hay página ni formulario para esto: la única credencial es un secreto de
servidor, que no vive en ningún navegador.

## Comportamiento

El orden **no es intercambiable**: cada paso que falle deja la información necesaria para
reintentar el siguiente, y el orden inverso no (data-model.md, *Alcance del borrado*).

1. Verifica `Authorization`. Si falta o no coincide con `OPS_SECRET` → `401`, no toca ni la
   base ni el bucket.
2. Si el pedido no existe → `404`. No se distingue de un pedido ya borrado: repetir el borrado
   responde `404` y no es un error de la operación.
3. **Storage primero**: borra del bucket privado `fotos` todos los objetos bajo
   `pedidos/{id_pedido}/` **y**, si el pedido tiene regalo, todos los que estén bajo
   `regalos/{regalo_id}/`. Los dos prefijos, porque las fotos nacen bajo el del pedido y se
   mueven al del regalo al enviar la historia (research.md #16): un pedido abandonado antes del
   envío tiene fotos que nunca llegaron a mudarse, y uno que ya envió las tiene mudadas.
   Ninguna cascada de Postgres alcanza Storage, y si el orden se invirtiera y fallara el borrado
   de archivos se perdería el prefijo que dice qué borrar.
4. **El regalo asociado, si ya nació**: `DELETE FROM regalos WHERE id = $regalo_id`. Dispara el
   `on delete cascade` de `aperturas` (feature 001) y el `on delete set null` de
   `pedidos.regalo_id`.
5. **La fila de `slugs`**: `UPDATE slugs SET regalo_id = NULL`. **Nunca se borra** (Principio
   VI, research.md #16): si volviera al espacio de slugs disponibles, un QR ya impreso —que no
   se actualiza nunca y está en manos de alguien— podría abrir el regalo de otra persona. La
   fila que queda es el string del slug y una fecha, sin contenido, sin correo y sin forma de
   llegar a nada.
6. **La fila del pedido**: `DELETE FROM pedidos WHERE id = $1`. Con ella se van, en la misma
   fila, el correo, el celular, el consentimiento y su fecha, el `token_baja`, el borrador
   completo y el registro de emisión del QR; y por `on delete cascade`, las filas de `pagos`,
   de `eventos_pago` del pedido y de `avisos`.
7. Responde `204 No Content`.

**Los `eventos_pago` huérfanos** (`pedido_id is null`, `resultado = 'sin_pedido'`) **no se
tocan**: no pertenecen a ningún pedido y no contienen datos personales —un identificador de
evento, un estado y una fecha— (data-model.md, research.md #2).

## Response

- `204` → borrado completo, en base y en Storage.
- `401` → secreto ausente o incorrecto. Nada fue borrado.
- `404` → `id` no corresponde a ningún pedido.
- `500` → una parte del borrado falló. Lo ya borrado no se restituye y la operación es
  **reintentable**: cada paso es idempotente y el que falló vuelve a intentarse con la misma
  petición.

## Invariantes garantizados

- Tras un `204` no queda, para ese pedido: fila en `pedidos`, en `pagos`, en `eventos_pago` con
  `pedido_id`, ni en `avisos`; ni objeto en el bucket bajo `pedidos/{id_pedido}/` o
  `regalos/{regalo_id}/`; ni fila en `regalos` ni en `aperturas` del regalo asociado (FR-030,
  Principio V).
- Tras un `204` no queda ningún dato de contacto del comprador en ninguna columna ni en ninguna
  copia: el correo y el celular viven solo en la fila del pedido y en `avisos.destinatario`, que
  cae por cascada (FR-030, Principio V).
- La fila de `slugs` sobrevive siempre, huérfana, y ese slug no se reasigna jamás (Principio VI,
  research.md #16; `eliminar.spec.ts` de la feature 001 verifica la misma regla).
- Ningún borrado se dispara con el id del pedido: la única credencial es `OPS_SECRET`
  (FR-003, FR-031).
- El contrato de borrado de la feature 001 **no cambia**: sigue listando `regalos/{id}/` y
  sigue sirviendo para un regalo sin pedido. Esta ruta es un agregado, no una modificación
  (research.md #16, #20).
- La operación se completa en la misma petición, muy por debajo de las 72 h que exige el
  Principio V.
