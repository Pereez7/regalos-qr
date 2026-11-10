# Contrato: `POST /api/pedidos/[id]/borrador` y `GET /api/pedidos/[id]/borrador`

Implementa FR-009 (carga por pasos), FR-010 (retomar sin perder nada), FR-011 (el borrador
admite estar incompleto) y FR-017 (todo texto es texto plano). Forma del documento guardado:
[`borrador.schema.md`](./borrador.schema.md). Las páginas que lo usan son
`/contar/[pedido]/[paso]` (`plan.md`).

Es la aplicación directa de research.md #8: **un paso = una petición guardada**. Cada paso del
formulario es un `<form>` que hace POST, guarda y redirige al paso siguiente. Eso es
autoguardado real sin una línea de JavaScript: el comprador que cierra la pestaña ya tiene
guardado todo lo que completó hasta el paso anterior (SC-004).

## `POST` — guardar un paso

### Request

- **Método**: `POST`
- **Path param**: `id` — UUID del pedido, que es también su credencial (FR-003)
- **Content-Type**: `application/x-www-form-urlencoded`. Protegido por el `checkOrigin` de
  Astro, que research.md #1 deja intacto justamente para estos formularios.
- **Body**: el campo `paso` más los campos planos de ese paso. **Un paso por petición**:
  una petición que traiga campos de dos pasos escribe solo la rama del `paso` declarado e
  ignora el resto.
- **Auth**: ninguna más que el conocimiento del `id`, igual que `/revisar/[id]` en la feature
  001.

### Pasos admitidos y orden canónico

| `paso` | Rama que escribe | Campos planos | Siguiente |
|---|---|---|---|
| `destinatario` | `destinatario`, `tema`, `fechaInicio` | `nombre`, `subtitulo`, `tema`, `fecha_inicio` | `momentos` |
| `momentos` | `momentos[]` | `momento_titulo`, `momento_texto`, `momento_fecha` (repetidos) | `fotos` |
| `fotos` | `fotos[]`, `momentos[].fotoRuta` | `foto_ruta`, `foto_alt` (repetidos), `momento_foto` (repetido) | `cancion` |
| `cancion` | `cancion` | `cancion_url`, `cancion_titulo`, `cancion_artista` | `carta` |
| `carta` | `carta` | `carta_texto` | `preguntas` |
| `preguntas` | `preguntas[]` | `pregunta_texto`, `pregunta_respuesta` (repetidos) | `cierre` |
| `cierre` | `cierre` | `cierre_texto` | `resumen` |

Reglas de los campos repetidos, sin JavaScript y sin índices en el nombre: los valores de un
mismo nombre llegan en el orden del documento, y se emparejan **por posición** (el primer
`momento_titulo` con el primer `momento_texto`, y así). Una tripleta enteramente vacía se
descarta en vez de guardar un momento en blanco.

El paso `fotos` **no sube ni quita archivos** —eso es
[`api-fotos.md`](./api-fotos.md)—; guarda el texto alternativo de cada foto ya subida, su
**orden**, y a qué momento pertenece cada una (FR-019). El orden es el orden en que llegan los
`foto_ruta`, que es el orden en que el formulario los lista. Una `foto_ruta` que no está en el
borrador se ignora; una foto del borrador ausente de la lista se conserva al final, para que un
formulario mal formado nunca pierda una foto que sigue en el bucket.

### Comportamiento

1. Si `id` no corresponde a ningún pedido → `404`. Nunca se distingue entre "no existe" y "no
   es tuyo": es lo que hace cumplible FR-031 sin filtrar la existencia de pedidos ajenos.
2. Si `paso` falta o no es uno de los siete nombres de la tabla → `404`. Un paso inválido no
   escribe nada: el borrador queda exactamente como estaba.
3. Si `pedidos.estado != 'pagado'` → `409`, con una explicación del estado real del pedido. No
   se guarda nada. Un pedido en `iniciado` no tiene historia que cargar todavía, y
   `/gracias/[pedido]` ya está mostrando *pendiente de pago* (Escenario 4 de la User Story 1).
4. Si el pedido tiene un regalo asociado y ese regalo está `publicado` → `409`: lo entregado es
   inmutable (FR-016). Mientras el regalo siga `en_revision`, el borrador se puede cambiar
   cuantas veces el comprador quiera (FR-014).
5. **Normalización de texto**: todo valor de texto se guarda como texto plano literal, sin
   interpretar ni sanear HTML —no se eliminan etiquetas ni se escapan entidades al guardar—.
   El escape ocurre al renderizar, igual que en el motor (FR-017, regla 5 de
   `regalo-contenido.schema.md`). Se recortan espacios al principio y al final, y nada más: un
   nombre con emoji o una carta de ~4.000 caracteres se guardan tal cual.
6. **Límite de tamaño por campo**: si un campo excede el tope declarado en
   `borrador.schema.md` → `422`, nombrando el campo. Es el único motivo por el que el borrador
   rechaza un guardado: `422` significa *esto no es guardable*, nunca *esto está incompleto*.
7. **Escritura por rama, no por documento**: se escribe únicamente la rama del paso dentro de
   `pedidos.borrador` (`jsonb`), con una escritura dirigida y no reescribiendo el documento
   entero con lo que tenía cargado esa pestaña. Es lo que hace cierto el caso límite de las 30
   recargas: dos pestañas abiertas en pasos distintos no se pisan lo que la otra guardó, y un
   formulario viejo reenviado no borra los pasos posteriores. El comprador **ya pagó**: es el
   peor momento del producto para perder datos (data-model.md, research.md #8).
8. Se actualiza `borrador.paso` con el paso recién guardado y `pedidos.actualizado_en`. El
   `paso` es lo que permite devolver al comprador donde estaba cuando vuelve a su enlace
   (FR-010).
9. **Redirección**: `303` a `/contar/[id]/<siguiente>` según la tabla. Desde `cierre`, a
   `/contar/[id]/resumen`, que es donde vive la acción de enviar
   ([`api-enviar-historia.md`](./api-enviar-historia.md)).

Guardar el mismo paso treinta veces produce el mismo borrador que guardarlo una vez: la
escritura es un reemplazo de rama, no un agregado (Edge Case: *comprador que recarga el
formulario de carga 30 veces*).

### Response

- `303 See Other` → `Location: /contar/[id]/<siguiente>`.
- `404` → `id` inexistente, o `paso` ausente/desconocido.
- `409` → pedido no pagado, o regalo ya publicado.
- `422` → un campo excede su tope de tamaño. Se nombra el campo; el resto del borrador queda
  intacto.

## `GET` — recuperar el borrador

### Request

- **Método**: `GET`
- **Path param**: `id` — UUID del pedido
- **Auth**: el conocimiento del `id`

### Response

- `200 OK`, `application/json`:

```jsonc
{
  "estado": "pagado",          // estado del pedido: iniciado | pagado
  "regaloId": null,            // uuid del regalo si ya nació, null si no
  "estadoRegalo": null,        // en_revision | publicado | null
  "borrador": { "v": 1 },      // ver borrador.schema.md
  "faltantes": []              // qué falta para poder enviar; ver api-enviar-historia.md
}
```

- `404` → `id` inexistente.

`faltantes` es la **misma** función pura del borrador que usa el envío. No se guarda en
ninguna parte y no hay estado de errores que sobreviva a un redirect: se recalcula en cada
lectura, que es lo que permite mostrar qué falta sin JavaScript y sin mensajes de un solo uso
(FR-011).

El `GET` nunca devuelve el borrador de otro pedido, ni expone el `token_baja`, ni el celular,
ni direcciones de acceso a las fotos. Solo devuelve rutas de storage, que no sirven sin firma
(FR-020, research.md #6).

## Invariantes garantizados

- Un borrador guardado hasta el paso N sobrevive a cerrar la pestaña y volver horas o días
  después al mismo enlace, con el 100% de lo cargado (FR-010, SC-004).
- El borrador **nunca** rechaza un guardado por estar incompleto. La exigencia de completitud
  existe en un solo punto del sistema: el envío (FR-011, research.md #8).
- Guardar un paso no altera ninguna otra rama del documento.
- Ningún texto del comprador se interpreta como HTML, ni al guardarlo ni al mostrarlo
  (FR-017).
- Ninguna petición con un `id` que no sea el del propio pedido lee ni escribe nada (FR-031).
- El esquema del borrador es independiente del esquema de contenido del motor: acá se valida
  *guardable*, allá *entregable* (research.md #8).
