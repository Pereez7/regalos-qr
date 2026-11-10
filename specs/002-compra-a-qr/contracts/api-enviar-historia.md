# Contrato: `POST /api/pedidos/[id]/enviar`

Implementa FR-011 (completitud exigida solo al enviar), FR-012 (traducir al contenido
versionado del motor sin tocarlo), FR-013 (nace el regalo en revisión con su enlace),
FR-014 (reenviar sin límite), FR-015 (el enlace público no cambia nunca), FR-016 (lo publicado
no se modifica), FR-017 (texto plano) y FR-021 (doble envío = un solo regalo). Invocado por el
`<form>` plano de `/contar/[pedido]/resumen` — no requiere JavaScript de cliente.

Es la frontera del producto: de un lado el borrador, que admite estar incompleto; del otro, el
contenido entregable que consume el motor de la feature 001. Las dos formas están
especificadas aparte —[`borrador.schema.md`](./borrador.schema.md) y
`specs/001-pagina-regalo/contracts/regalo-contenido.schema.md`— y esta ruta es el único lugar
donde se cruza de una a la otra (research.md #8).

## Request

- **Método**: `POST`
- **Path param**: `id` — UUID del pedido
- **Body**: ninguno (form vacío; todo lo necesario está en el borrador guardado)
- **Content-Type**: `application/x-www-form-urlencoded`
- **Auth**: el conocimiento del `id`

## Precondiciones

1. El pedido existe. Si no → `404`.
2. `pedidos.estado = 'pagado'`. Si no → `409`, con el estado real.
3. El regalo asociado, si ya existe, está `en_revision`. Si está `publicado` → `409` (ver
   abajo).
4. El borrador está **completo** según la validación de envío. Si no → `303` al resumen, que
   muestra qué falta.

## Validación de envío (FR-011)

Es una función pura del borrador: mismas entradas, mismo resultado, sin estado intermedio y
sin mensajes de un solo uso. Eso es lo que permite mostrar qué falta después de un redirect
sin JavaScript: la página de resumen **recalcula** los faltantes en cada visita, en vez de
depender de un error guardado (`GET /api/pedidos/[id]/borrador` devuelve la misma lista en
`faltantes`).

**El mínimo para enviar es el de research.md #21**, no un valor elegido por este contrato:
**tema + nombre del destinatario + al menos un bloque de contenido**.

- `tema` es uno de `nocturno`, `papel`, `luminoso` (los tres de la feature 001; el `check` de
  la columna `regalos.tema` no admite otro valor).
- `destinatario.nombre` presente (es además el único campo requerido de la portada del motor).
- Al menos **un** bloque de contenido entre: un momento, una carta, una galería, una canción,
  una pregunta o un cierre. Todo lo demás es opcional.

El mínimo es deliberadamente bajo por el Principio II: el motor acepta recetas con cualquier
cantidad de bloques de cada tipo, incluido cero, y exigir una receta rica acá sería meter una
opinión editorial dentro de la puerta de entrada. Pero no puede ser vacío: un regalo sin un
solo bloque de contenido es una página en blanco, y eso el Principio I lo declara defecto
bloqueante (research.md #21).

Reglas de validez sobre lo que **sí** está cargado. No son parte del mínimo: son condiciones
de entregable sobre cada bloque presente.

- Toda foto tiene su texto alternativo (Reglas de Calidad: *texto alternativo en toda
  imagen*). Una foto sin `alt` es un faltante, no un error de subida: el borrador la aceptó
  sin él a propósito.
- `cancion.url`, si está presente, resuelve a uno de los dominios de la lista blanca del motor
  (`src/lib/contenido/embeds.ts`, regla 7 del esquema de contenido). Si no, es un faltante con
  un mensaje que nombra los proveedores admitidos.
- Un momento cuenta como bloque de contenido si tiene texto, y una pregunta si tiene texto: es
  lo que el esquema del motor exige de cada uno.

Una historia sin ningún momento, sin fotos y sin canción **se envía igual** si cumple el
mínimo —una carta sola alcanza, y un cierre solo también—: el motor admite recetas con
cualquier cantidad de bloques de cada tipo (Edge Case correspondiente, Principio II).

Los faltantes se expresan en lenguaje del comprador —*falta el nombre de quien recibe el
regalo*—, nunca en nombres de campo (FR-011).

## Traducción del borrador al contenido v1 (FR-012)

El motor no se modifica: ni sus componentes, ni su registro, ni sus tipos de bloque
(research.md #20). La traducción produce un documento `{ "v": 1, "receta": [...] }` con
`posicion` asignada de forma creciente en este orden fijo:

| Orden | `tipo` del motor | Origen en el borrador |
|---|---|---|
| 0 | `portada` | `destinatario.nombre` → `nombreDestinatario`; `destinatario.subtitulo` → `subtitulo` |
| 1 | `contador` | `fechaInicio`. Si no está, el bloque no se emite |
| 2..n | `momento` | un bloque por cada momento con texto; `fotoRuta` → `foto: { ruta, alt }` |
| n+1 | `galeria` | las fotos del borrador que ningún momento usa, en el orden del borrador |
| n+2 | `cancion` | `cancion.url`, `cancion.titulo`, `cancion.artista` |
| n+3 | `carta` | `carta.texto` |
| n+4..m | `pregunta` | un bloque por cada pregunta con texto; `respuesta` opcional |
| m+1 | `cierre` | `cierre.texto` (el tipo `cierre` no tiene campos requeridos) |

Reglas de la traducción:

- Un bloque sin contenido significativo **no se emite**. Un paso que el comprador dejó vacío
  no produce un bloque vacío en el regalo.
- `tema` **no** viaja dentro de `contenido`: va a la columna `regalos.tema`. El tema es del
  regalo, no de la receta.
- Cada foto se emite con `ruta` —el campo opcional agregado en research.md #7— y sin `url`. El
  campo `url` conserva su significado de siempre y nunca se reinterpreta; el fixture dorado
  `tests/fixtures/contenido-v1.json`, que no tiene `ruta`, sigue siendo válido (Principio VI).
- No se sube a `v: 2`: agregar un campo opcional a un tipo existente es exactamente la
  evolución que v1 admite (research.md #7).
- Se usan **los ocho tipos de bloque que ya existen**, sin agregar ni modificar ninguno
  (Principio II, research.md #20).
- Todo texto se copia literal, sin interpretar HTML. El escape es del renderer (FR-017).

**La validación de envío es más estricta que el esquema de contenido, a propósito.** El motor
omite en silencio un bloque sin contenido significativo o una `cancion.url` fuera de la lista
blanca —comportamiento correcto para renderizar, e inaceptable para entregar: el comprador
cargó una canción y recibiría un regalo sin ella sin que nadie se lo diga—. Por eso el envío
los rechaza con un mensaje claro de qué falta (FR-011) en vez de dejar que el render los
descarte.

## Comportamiento

### Primer envío — nace el regalo

1. Se valida. Si hay faltantes → `303` a `/contar/[id]/resumen` y no se crea nada.
2. Se reserva el slug con `generarSlugUnico` (`src/lib/slugs.ts`): inserta la fila en `slugs`
   antes de que exista el regalo, igual que en la feature 001.
3. Se genera el `id` del regalo **antes** del `INSERT`, para que la traducción pueda nombrar el
   prefijo definitivo de las fotos (`regalos/<id_regalo>/`, paso 7).
4. `INSERT INTO regalos` con `slug`, `tema`, `contenido`, `estado = 'en_revision'`,
   `aprobado_en = NULL`, `vencimiento = NULL`. La vigencia nace permanente (Assumptions), y la
   feature 001 ya hace cumplir una expiración si existiera. Las fotos del contenido ya llevan
   su `ruta` escrita con el prefijo del regalo.
5. Se actualiza `slugs.regalo_id` apuntando al regalo nuevo.
6. **Reclamo atómico del regalo por el pedido**:
   `UPDATE pedidos SET regalo_id = $nuevo WHERE id = $1 AND regalo_id IS NULL`. Es la misma
   técnica de UPDATE condicional que la feature 001 usa para la primera apertura y para la
   aprobación.
   - Si afectó una fila → el pedido tiene su regalo. Sigue al paso 7.
   - Si afectó cero filas → otro envío simultáneo llegó primero (la restricción `unique` sobre
     `pedidos.regalo_id` es la red de contención; el `WHERE regalo_id IS NULL` es el mecanismo
     — ver H1 de [`CONTRADICCIONES.md`](./CONTRADICCIONES.md)). Este envío **deshace lo
     suyo**: borra el regalo que acababa de crear y deja su fila de `slugs` con
     `regalo_id = NULL`. La fila de `slugs` **no se borra** —ese valor queda bloqueado para
     siempre (Principio VI, research.md #16)— y se responde como el camino feliz, con el
     enlace del regalo que sí quedó. `pedidos.regalo_id` lleva además restricción única, que
     impide que dos pedidos compartan un regalo (research.md #9). El perdedor **no mueve
     ningún archivo**: las fotos siguen intactas bajo el prefijo del pedido y el ganador es el
     único que las muda.
7. **Mudanza de las fotos al prefijo del regalo** (research.md #16): cada objeto que esté bajo
   `pedidos/<id_pedido>/` se mueve a `regalos/<id_regalo>/` con el mismo nombre aleatorio, y
   `borrador.fotos[].ruta` junto con `momentos[].fotoRuta` se reescriben a la ruta nueva, de
   modo que el borrador y el contenido nombren siempre el objeto vigente.
   - `regalos/<id_regalo>/` es el prefijo que el borrado de la feature 001 ya barre: sin esta
     mudanza, borrar el regalo por `DELETE /api/regalos/[id]/eliminar` dejaría sus fotos en el
     bucket para siempre, porque esa ruta lista `regalos/<id>/` y no sabe nada de
     `pedidos/<id>/`. Mover, en vez de extender el contrato de borrado de la 001, es lo que
     mantiene ese contrato intacto (research.md #16).
   - La operación es **idempotente**: un objeto que ya está en el destino no se vuelve a mover.
     Un reenvío o un reintento tras una falla parcial converge al mismo estado.
   - Si la mudanza falla → `500`. El regalo existe, con su contenido apuntando al prefijo
     definitivo, y el reintento del envío completa la mudanza. Se prefiere esto a mover antes
     de reclamar: mover primero obligaría al perdedor de la carrera a devolver los archivos a
     su lugar, que es una compensación con su propia ventana de falla.
8. Se emite el aviso de regalo listo, con el enlace `/revisar/<regalo_id>`, por el adaptador
   de correo, y se registra en `avisos` con `tipo = 'revision'` (FR-026). La restricción
   `unique (pedido_id, tipo)` garantiza que se emita una sola vez. Una falla de envío deja la fila en estado
   fallido y **no** revierte el regalo ni cambia la respuesta (FR-029). El reintento es
   **manual, desde la cola operativa**, con un botón que reencola el aviso: no hay reintento
   automático ni tarea programada (research.md #12).
9. `303` a `/contar/[id]/enviado`, que muestra el enlace de revisión (FR-013).

### Reenvío — se reemplaza el contenido, nunca el slug

1. Se valida igual que en el primer envío.
2. Las fotos que el comprador agregó durante la corrección ya nacieron bajo
   `regalos/<id_regalo>/` ([`api-fotos.md`](./api-fotos.md)); si alguna quedó bajo
   `pedidos/<id_pedido>/` —por una mudanza que falló a mitad de camino— se mueve ahora, con la
   misma operación idempotente del paso 7 del primer envío.
3. `UPDATE regalos SET contenido = $nuevo, tema = $tema WHERE id = $regalo_id AND estado =
   'en_revision'`. Si la UPDATE afecta cero filas porque el regalo pasó a `publicado` entre la
   comprobación y la escritura → `409`: la carrera se pierde del lado seguro.
4. **No se toca** `regalos.slug`, ni la fila de `slugs`, ni `pedidos.regalo_id`, ni
   `aprobado_en`.
5. No se vuelve a emitir el aviso de regalo listo: el enlace de revisión es el mismo que el
   comprador ya tiene, y la restricción `unique (pedido_id, tipo)` de `avisos` lo hace cumplir
   por construcción. Sin ella, cada corrección le llenaría la casilla al comprador.
6. `303` a `/contar/[id]/enviado`.

El comprador puede corregir y reenviar **sin límite de veces** mientras el regalo siga en
revisión (FR-014, Principio III), y lo hace volviendo a su propia carga, no por un canal
aparte (Assumptions).

### Regalo ya publicado — se rechaza

`409`, con la explicación en lenguaje claro: el regalo ya fue aprobado y lo entregado es
inmutable (FR-016, Principio VI). La página de carga ya oculta la acción de enviar en ese
estado; el `409` es la compuerta que queda cuando alguien reenvía el formulario de una pestaña
vieja o fuerza la petición.

## Response

- `303 See Other` → `Location: /contar/[id]/enviado` — regalo creado o contenido reemplazado.
- `303 See Other` → `Location: /contar/[id]/resumen` — faltan datos; nada se creó ni se
  modificó.
- `404` → `id` inexistente.
- `409` → pedido no pagado, o regalo ya publicado.
- `500` → falla al escribir, o mudanza de fotos incompleta. Ni el regalo queda a medias ni el
  pedido queda apuntando a un regalo inexistente, y el reintento del envío converge al mismo
  estado.

## Invariantes garantizados

- El slug se asigna **una sola vez**, en el primer envío, y es el mismo para siempre: ninguna
  corrección, ningún reenvío y ninguna aprobación lo cambian (FR-015, Principio VI,
  research.md #9).
- Un doble envío —doble clic incluido— produce **un solo** regalo con **un solo** enlace
  público (FR-021, Edge Case correspondiente).
- Ningún regalo nace `publicado`: siempre `en_revision` con `aprobado_en = NULL`, que es
  además lo que la restricción `aprobado_en_requiere_publicado` de la feature 001 exige.
  Publicar es la aprobación del comprador y nada más (Principio III, Compuerta 7).
- El contenido de un regalo `publicado` nunca cambia por esta ruta (FR-016).
- Un regalo solo nace de un borrador que pasó la validación completa: nunca hay un regalo en
  revisión al que le falten datos (FR-011).
- El documento de contenido lleva `v` desde su primer registro (Principio VI, Compuerta 12).
- Ninguna fila de `slugs` se borra jamás, ni cuando el regalo que la reclamó se deshace por
  perder una carrera (Principio VI, research.md #16).
- El motor de bloques no se modifica: esta ruta solo escribe un documento que el motor ya sabe
  leer (FR-012, research.md #20).
- Tras un envío exitoso, ninguna foto del regalo queda bajo `pedidos/<id_pedido>/`: todas
  viven bajo `regalos/<id_regalo>/`, el prefijo que el borrado de la feature 001 barre
  (research.md #16, FR-030).
- Un regalo nace solo si el borrador cumple el mínimo de research.md #21 —tema, nombre del
  destinatario y al menos un bloque de contenido—: nunca nace un regalo que sea una página en
  blanco (FR-011, Principio I).
