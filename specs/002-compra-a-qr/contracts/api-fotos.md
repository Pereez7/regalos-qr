# Contrato: `POST /api/pedidos/[id]/fotos`

Implementa FR-018 (validar cada foto y rechazar sin afectar el resto), FR-019 (quitar y
reordenar, sin conservar las quitadas), FR-020 (ubicación no adivinable, acceso resuelto al
mostrar), FR-037 (reducir al subir), FR-038 (el original no se almacena) y FR-039 (sin
metadatos). El reordenamiento y el texto alternativo se guardan por el paso `fotos` de
[`api-borrador.md`](./api-borrador.md); acá viven la subida y la baja de un archivo.

Una sola ruta con dos acciones, discriminadas por el campo `accion` del formulario:

| `accion` | Qué hace |
|---|---|
| `subir` (por defecto) | Procesa y almacena una foto nueva. |
| `quitar` | Borra del bucket la foto indicada y la saca del borrador. |

> Nota de método: las dos acciones son `POST` sobre la misma ruta —y no un `DELETE` sobre una
> subruta— por el mismo motivo por el que aprobar es un `POST` en la feature 001: un
> formulario HTML sin JavaScript solo sabe emitir `GET` y `POST`, y el comprador que ya pagó no
> puede depender de que su JavaScript funcione (research.md #8, #17). Es también la ruta única
> que fija `plan.md` (`src/pages/api/pedidos/[id]/fotos.ts`). El `DELETE` de la feature 001
> (`/api/regalos/[id]/eliminar`) es una herramienta operativa con secreto de servidor, no una
> acción del comprador.

## Dos topes declarados, y por qué define este contrato

Las funciones de Vercel limitan el cuerpo de una petición a **4,5 MB**. Una foto de 10 MB de
un celular moderno **no puede llegar** a este endpoint: la plataforma corta la petición antes
de que el handler exista. El spec admite originales de hasta 10 MB (Assumptions, Edge Case
*foto de 10 MB desde un celular moderno*) y exige no almacenarlos (FR-038). Las dos cosas se
satisfacen reduciendo **en el navegador** antes de subir (research.md #5):

| Camino | Qué llega al endpoint | Tope declarado al comprador |
|---|---|---|
| Con JavaScript | la foto ya reducida en `canvas` (vanilla, sin librería) | **10 MB** de original |
| Sin JavaScript | el archivo tal cual lo eligió el comprador | **4 MB**, dicho en la página |

**Los dos topes son una decisión declarada, no una contradicción** (research.md #5, spec
Assumptions): hasta 10 MB con JavaScript, porque la foto se reduce antes de salir del
dispositivo; hasta 4 MB sin JavaScript, que es el tope real que impone la plataforma al cuerpo
de una petición. No es el mismo límite disfrazado: es un límite de plataforma que el navegador
puede sortear reduciendo antes de subir.

Consecuencia que este contrato no puede ocultar: en el camino sin JavaScript, un archivo por
encima del tope de la plataforma es rechazado **por la plataforma**, no por el endpoint, y la
respuesta no es nuestra. Por eso el tope de 4 MB se declara en la página junto al campo y se
vuelve a verificar en el servidor: el formulario lo explica en vez de fallar sin mensaje, que
es exactamente lo que pide FR-018 (ver C1 de
[`CONTRADICCIONES.md`](./CONTRADICCIONES.md), resuelta por la decisión 5).

El costo en JavaScript de la reducción cae en las páginas de carga. El presupuesto duro de
100 KB de las Reglas de Calidad protege `/r/[slug]`, que sigue en cero añadido
(research.md #17).

## `accion = subir`

### Request

- **Método**: `POST`
- **Path param**: `id` — UUID del pedido
- **Content-Type**: `multipart/form-data`
- **Body**: `accion=subir`, `foto` (archivo, obligatorio), `alt` (texto, opcional)
- **Auth**: el conocimiento del `id`

### Comportamiento

1. `id` inexistente → `404`. Pedido no pagado → `409`. Regalo ya `publicado` → `409`
   (FR-016). En los tres casos no se escribe nada, ni en la base ni en el bucket.
2. Si el pedido ya tiene **10** fotos → `409`: es el límite por regalo (Assumptions), y
   protege el tiempo de carga de la página del regalo (Principio I).
3. Si no llega archivo, o llega vacío → `400`.
4. Si el archivo excede el tope del servidor → `413`, con el peso admitido en el mensaje.
5. **`sharp` es la autoridad final** (research.md #5). No se confía en el `Content-Type`
   declarado ni en la extensión del nombre: se decodifica el archivo.
   - Si no es una imagen real, o es un formato no admitido → `415`, con mensaje claro, y el
     resto del borrador queda intacto (FR-018, Escenario 8 de la User Story 2).
   - Si es una imagen real → se normaliza: lado mayor acotado al tamaño que la página del
     regalo necesita, conversión a `webp`, y **eliminación completa de metadatos**, incluida
     cualquier información de ubicación GPS (FR-039, SC-015).
   - **No se agranda nunca**: una foto que ya viene chica y optimizada se re-encoda sin
     ampliar sus dimensiones (Edge Case *foto que ya viene chica y optimizada*).
6. **El original no se escribe en ninguna parte** (FR-038). Vive en memoria el tiempo del
   procesamiento y se descarta. No hay archivo temporal, no hay copia en el bucket, no hay
   paso posterior de reducción: lo entregado nunca depende de un procesamiento que todavía no
   ocurrió.
7. Se guarda la versión reducida en el bucket privado `fotos`, bajo el prefijo que
   corresponde al estado del pedido (research.md #16):
   - si el regalo **todavía no nació** → `pedidos/<id_pedido>/<aleatorio>.webp`;
   - si el regalo **ya nació** —una foto agregada durante una corrección— →
     `regalos/<id_regalo>/<aleatorio>.webp`, el prefijo definitivo.

   El nombre es aleatorio, nunca derivado del nombre del archivo subido ni de un contador: es
   lo que vuelve la ubicación no adivinable (FR-020, Principio V).
8. Se agrega la entrada al final de `borrador.fotos[]`: `{ ruta, alt, ancho, alto }`. La `ruta`
   es el único identificador de la foto dentro del borrador, y siempre es la ruta **vigente**
   del objeto en el bucket. Mientras el pedido está en borrador el prefijo es del pedido,
   porque el regalo todavía no existe cuando se sube la primera foto; al enviar la historia,
   [`api-enviar-historia.md`](./api-enviar-historia.md) **mueve** los objetos a
   `regalos/<id_regalo>/` y reescribe las rutas del borrador, que es el prefijo que el borrado
   de la feature 001 ya barre (research.md #16).
9. `303` a `/contar/[id]/fotos`, que vuelve a listar las fotos con la nueva incluida.

Si la conexión se corta a mitad de la subida, no se escribe entrada en el borrador y no queda
objeto en el bucket: el resto del borrador queda intacto y la foto se puede volver a subir
(Edge Case correspondiente).

### Response

- `303 See Other` → `Location: /contar/[id]/fotos`
- `400` → sin archivo
- `404` → `id` inexistente
- `409` → pedido no pagado, regalo publicado, o límite de 10 fotos alcanzado
- `413` → archivo por encima del tope admitido
- `415` → el archivo no es una imagen, o su formato no está admitido

## `accion = quitar`

### Request

- **Método**: `POST`
- **Path param**: `id` — UUID del pedido
- **Content-Type**: `application/x-www-form-urlencoded`
- **Body**: `accion=quitar`, `ruta` — la ruta de storage de la foto a quitar
- **Auth**: el conocimiento del `id`

### Comportamiento

1. `id` inexistente → `404`. Pedido no pagado → `409`. Regalo ya `publicado` → `409`.
2. `ruta` ausente, o que no está en `borrador.fotos[]` de **ese** pedido → `404`. Nunca se
   puede quitar la foto de otro pedido, ni una ruta arbitraria del bucket (FR-031).
3. Se borra el objeto del bucket **y** se quita la entrada del borrador, en ese orden. Si el
   borrado del objeto falla, no se quita la entrada y se responde `500`: es preferible una
   foto que sigue estando a una referencia huérfana que el comprador ya no puede volver a
   quitar.
4. Se limpia toda `momentos[].fotoRuta` que apunte a esa foto, para que no quede un momento
   referenciando una foto que no existe.
5. `303` a `/contar/[id]/fotos`.

El borrado del archivo ocurre **en el momento de quitarla**, no al enviar (FR-019, Edge Case:
*no queda almacenada*). Lo mismo vale para una foto que desaparece del borrador en una
corrección posterior.

### Response

- `303 See Other` → `Location: /contar/[id]/fotos`
- `404` → `id` inexistente, o `ruta` que no pertenece a ese borrador
- `409` → pedido no pagado, o regalo publicado
- `500` → el objeto no se pudo borrar del bucket; nada se quitó del borrador

## Cómo se muestra una foto (y qué no hace este contrato)

Esta ruta **no** devuelve direcciones de acceso. El borrador y el contenido del regalo guardan
la `ruta` de storage; la dirección se firma en cada render del servidor, en una sola llamada
por lote, dentro de `src/lib/regalos.ts` (research.md #6, #7). La firma nace y muere dentro del
request que la usa: nunca se persiste, nunca se imprime, nunca se comparte. El QR apunta a
`/r/[slug]`, que no lleva firma alguna.

## Invariantes garantizados

- Ninguna foto almacenada es la original que subió el comprador (FR-038).
- Ninguna foto almacenada conserva metadatos, ni de ubicación ni de ningún otro tipo (FR-039,
  SC-015).
- Una foto quitada antes de enviar no queda almacenada en ninguna parte (FR-019).
- Una foto rechazada no modifica el borrador en lo más mínimo (FR-018).
- La ubicación de cada foto es no adivinable y vive en un bucket privado, declarado como
  infraestructura con `public = false` (FR-020, research.md #15). Nadie que no esté viendo el
  regalo puede acceder a ella (SC-011).
- Un pedido nunca tiene más de 10 fotos (Assumptions, SC-014).
- El peso de lo almacenado es una fracción del original, sin diferencia perceptible en pantalla
  de celular (FR-037, SC-013: promedio < 300 KB, máximo 600 KB).
- Mientras el regalo no nació, las fotos viven bajo `pedidos/<id_pedido>/`; al enviar la
  historia se mueven a `regalos/<id_regalo>/`, que es el prefijo que el borrado de la feature
  001 ya barre (research.md #16, data-model.md). Sin ese movimiento, borrar un regalo por la
  vía existente dejaría sus fotos en el bucket para siempre: `eliminar.ts` lista
  `regalos/<id>/` y no sabe nada de `pedidos/<id>/`.
- El borrado del pedido ([`api-eliminar-pedido.md`](./api-eliminar-pedido.md)) barre **los dos**
  prefijos, porque un pedido abandonado antes del envío tiene fotos que nunca llegaron a
  mudarse (FR-030).
