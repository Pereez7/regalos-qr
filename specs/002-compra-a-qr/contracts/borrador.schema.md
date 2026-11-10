# Contrato: `pedidos.borrador` (JSON del borrador)

El borrador es la **materia prima**; el contenido del regalo es **lo entregado**. Son dos
documentos distintos, con dos esquemas distintos, validados en dos momentos distintos
(research.md #8). Fuente de verdad de implementación: `src/lib/borrador/esquema.ts` (zod),
separado de `src/lib/contenido/esquema.ts`, que pertenece al motor y no se toca. La forma de la
columna está definida en `data-model.md`; este contrato fija las reglas de campo que un
validador tiene que hacer cumplir.

Implementa FR-009 (los siete pasos), FR-010 (retomar sin perder nada), FR-011 (admite estar
incompleto) y FR-017 (todo texto es texto plano). Se escribe y se lee por
[`api-borrador.md`](./api-borrador.md) y por [`api-fotos.md`](./api-fotos.md); se traduce a
contenido una sola vez, en [`api-enviar-historia.md`](./api-enviar-historia.md).

## Forma v1

```jsonc
{
  "v": 1,
  "paso": "fotos",
  "destinatario": { "nombre": "Ana", "subtitulo": "para vos" },
  "tema": "nocturno",
  "fechaInicio": "2024-02-14",
  "momentos": [
    { "titulo": "Primer viaje", "texto": "...", "fecha": "2024-06-01",
      "fotoRuta": "pedidos/<id_pedido>/k3j.webp" }
  ],
  "fotos": [
    { "ruta": "pedidos/<id_pedido>/a7f.webp", "alt": "Los dos en la playa",
      "ancho": 1200, "alto": 1600 }
  ],
  "cancion": { "url": "https://open.spotify.com/track/XXXX", "titulo": "...", "artista": "..." },
  "carta": { "texto": "..." },
  "preguntas": [ { "texto": "¿Te casás conmigo?", "respuesta": "Sí" } ],
  "cierre": { "texto": "Fin" },
  "actualizadoEn": "2026-11-10T19:04:00Z"
}
```

Un borrador recién nacido es `{ "v": 1 }` —el valor por defecto de la columna—. Cada rama
aparece cuando el comprador guarda el paso que la escribe, y nunca antes.

## Campo por campo

| Campo | Tipo | ¿Admite faltar? | Tope | Nota |
|---|---|---|---|---|
| `v` | entero | no | — | Siempre `1`. Lo escribe el servidor, nunca el formulario. |
| `paso` | texto | sí | — | Último paso guardado, uno de los siete nombres canónicos. Es lo que permite retomar donde se dejó (FR-010). |
| `destinatario.nombre` | texto | **sí** en el borrador, **no** al enviar | 80 | Único campo requerido de la portada del motor. Emoji admitido. |
| `destinatario.subtitulo` | texto | sí | 120 | Opcional también en el motor. |
| `tema` | enum | **sí** en el borrador, **no** al enviar | — | `nocturno` \| `papel` \| `luminoso`. Un valor fuera del enum es `422`: no es guardable, porque el `check` de `regalos.tema` no lo admitiría. Va al **regalo**, no a la receta. |
| `fechaInicio` | fecha `YYYY-MM-DD` | sí | — | Si está, genera el bloque `contador`; si no, no hay contador. Forma inválida → `422`. |
| `momentos[]` | lista | sí (ausente o vacía) | 12 momentos | El orden del array es el orden de render. |
| `momentos[].titulo` | texto | sí | 120 | |
| `momentos[].texto` | texto | sí | 2.000 | Un momento sin `texto` no se puede enviar: el motor lo exige. |
| `momentos[].fecha` | fecha `YYYY-MM-DD` | sí | — | Forma inválida → `422`. |
| `momentos[].fotoRuta` | texto | sí | — | Ruta de storage de la foto del momento. **Nunca una dirección de acceso.** Si la foto se quita, la referencia se limpia. Se reescribe al prefijo del regalo en el envío, igual que `fotos[].ruta`. |
| `fotos[]` | lista | sí (ausente o vacía) | **10 fotos** | Assumptions / SC-014. El orden del array es el orden de la galería. |
| `fotos[].ruta` | texto | no | — | Ruta **vigente** del objeto en el bucket: `pedidos/{id_pedido}/{aleatorio}.webp` mientras el regalo no nació, `regalos/{id_regalo}/{aleatorio}.webp` después del envío, que es cuando las fotos se mueven al prefijo definitivo (research.md #16). Identifica la foto dentro del borrador: no hay otro identificador. |
| `fotos[].alt` | texto | **sí** en el borrador, **no** al enviar | 160 | Reglas de Calidad: texto alternativo en toda imagen. |
| `fotos[].ancho`, `.alto` | entero | sí | — | De la versión ya reducida. Los escribe `sharp` al procesar, nunca el formulario. |
| `cancion.url` | texto | sí | 500 | Al enviar, debe resolver a la lista blanca del motor (`src/lib/contenido/embeds.ts`). En el borrador se guarda cualquier texto. |
| `cancion.titulo`, `.artista` | texto | sí | 120 | |
| `carta.texto` | texto | sí | 8.000 | El spec admite cartas de ~4.000 caracteres; el tope deja margen holgado. |
| `preguntas[]` | lista | sí (ausente o vacía) | 5 preguntas | |
| `preguntas[].texto` | texto | sí | 300 | Una pregunta sin `texto` no se emite al enviar. |
| `preguntas[].respuesta` | texto | sí | 120 | Opcional también en el motor. |
| `cierre.texto` | texto | sí | 500 | El tipo `cierre` del motor no tiene campos requeridos. |
| `actualizadoEn` | timestamp ISO | sí | — | Espejo de `pedidos.actualizado_en` dentro del documento, para diagnóstico. Lo escribe el servidor. |

Los topes de la columna «Tope» son valores de este contrato: ni el spec ni `research.md` los
fijan (ver H5 de [`CONTRADICCIONES.md`](./CONTRADICCIONES.md)). Lo que **no** es negociable es
que exista un tope: sin él, un campo de texto es un vector de abuso y el `jsonb` crece sin
límite.

Ningún campo del borrador acepta HTML interpretado: el texto se guarda literal y se escapa al
renderizar, igual que en el motor (FR-017, Edge Case *texto con etiquetas HTML dentro*).

## Qué admite estar incompleto, y qué no

El borrador admite **todo** incompleto. La única razón por la que un guardado se rechaza es
que el valor no sea **guardable**:

- excede su tope de tamaño → `422`,
- no respeta la forma de su tipo (`tema` fuera del enum, una fecha que no es una fecha) →
  `422`,
- el paso declarado no existe → `404`.

Lo que **nunca** produce un rechazo del borrador: un campo vacío, una lista vacía, un momento
sin texto, una foto sin `alt`, una canción sin enlace, un borrador entero en blanco. Todo eso
es un **faltante**, y los faltantes se evalúan en un solo punto del sistema: el envío
(FR-011).

Los campos marcados *«sí en el borrador, no al enviar»* son exactamente la frontera entre los
dos esquemas. El mínimo para enviar lo fija research.md #21 —**tema + nombre del destinatario +
al menos un bloque de contenido** (momento, carta, galería, canción, pregunta o cierre)— y no
este contrato; la lista completa de condiciones de envío vive en
[`api-enviar-historia.md`](./api-enviar-historia.md), y se calcula como función pura de este
documento: sin estado, sin mensajes de un solo uso, recalculable en cada visita a la página de
resumen.

## En qué se diferencia del esquema de contenido del motor

| | `pedidos.borrador` | `regalos.contenido` |
|---|---|---|
| Qué valida | *esto es guardable* | *esto es entregable* |
| Cuándo | en cada paso, mientras el comprador escribe | una sola vez, al enviar, y en cada lectura del regalo |
| Completitud | todo opcional por diseño | todo campo requerido está presente |
| Forma | ramas con nombre de paso (`destinatario`, `momentos`, …) | `receta`: lista plana de bloques con `tipo` y `posicion` |
| Mutabilidad | cambia cuantas veces el comprador quiera mientras el regalo esté en revisión | inmutable una vez publicado el regalo |
| Vida | se borra con el pedido | sobrevive al pedido mientras el regalo exista |
| Gobernanza | **no** está sujeto al Principio VI: nada de esto fue entregado | sujeto al Principio VI: ningún campo se renombra ni se elimina, jamás |
| Tema visual | `tema`, dentro del documento | fuera del documento: columna `regalos.tema` |
| Fotos | `ruta` vigente del bucket privado + `alt` | `foto.ruta` (research.md #7) bajo `regalos/{id_regalo}/`, resuelta a dirección firmada en cada render |

Mezclarlos en un esquema único con todos los campos opcionales está rechazado
explícitamente (research.md #8): haría imposible que el esquema de contenido garantice que un
regalo entregado está completo, que es su única razón de existir.

`v: 1` existe en los dos documentos por el mismo motivo práctico —saber con qué reglas leer lo
guardado— pero con fuerza distinta, y son **dos líneas de versión independientes**. En el
contenido es una obligación constitucional. Acá es una precaución: permite cambiar la forma del
borrador sin romperle la carga a alguien que la dejó a medio hacer la semana pasada.

## Qué **no** vive en el borrador

- El estado de pago, el monto, el correo, el celular y el consentimiento: son columnas del
  pedido, no del borrador. El dinero y el contacto no son materia prima de la historia.
- Direcciones de acceso a las fotos. El borrador guarda la `ruta` de storage; la dirección se
  firma en cada render y nunca se persiste (FR-020, research.md #6). Una dirección guardada
  sería exactamente la dirección permanente que FR-020 prohíbe.
- El slug del regalo. Lo asigna el envío y vive en `regalos` y `slugs`, no acá
  (research.md #9).
- Ningún campo con nombre de ocasión. El borrador alimenta el motor, y el motor no sabe de
  ocasiones (Principio II).

## Invariantes garantizados

- Un borrador válido hoy sigue siendo legible después de cualquier agregado futuro al esquema:
  los campos nuevos nacen opcionales.
- El borrador nunca contiene un dato que el comprador no haya escrito o subido (Principio V,
  FR-027).
- `fotos[].ruta` y `momentos[].fotoRuta` son consistentes: no queda una referencia a una foto
  que ya no está en la lista (lo garantiza [`api-fotos.md`](./api-fotos.md)).
- Ningún borrador es accesible con el id de otro pedido (FR-031).
- El borrador se borra por completo cuando se borra el pedido —es una columna de la fila, no
  hay copia en ningún otro lado—, junto con sus fotos en el bucket, en los dos prefijos que
  pueden contenerlas (FR-030, research.md #16,
  [`api-eliminar-pedido.md`](./api-eliminar-pedido.md)).
