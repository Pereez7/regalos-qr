# Contradicciones y huecos detectados al escribir los contratos

Registro **y rastro de auditoría**. Cada ítem salió de intentar escribir un contrato
verificable y encontrar que `spec.md` y `research.md` no decían lo mismo, o no decían nada.
Nada se borra de acá: cada ítem conserva su redacción original y lleva debajo su
**resolución**, con la decisión de `research.md` que la resuelve. Donde algo siga abierto, está
dicho con esas palabras.

> Estado tras la reconciliación de Fase 1: `research.md` tiene **23 decisiones** (antes 20) y es
> la fuente de verdad. Las decisiones 21 y 22 son nuevas, y las decisiones 1, 2, 5, 9, 12, 13,
> 14, 16, 19 y 20 se corrigieron. Esta lista se actualizó contra esa versión; los contratos
> también.

> `data-model.md` tiene su propia sección «Contradicciones detectadas, y cómo quedaron
> resueltas», escrita en paralelo a este archivo. Coincide de forma independiente en C1, C3, C4,
> H3 y H4, lo que refuerza que no son lecturas forzadas. Lo que sigue agrega el ángulo del
> contrato —códigos de estado, precondiciones, superficie de rutas— y no reemplaza esa sección.
> Lo que los contratos adoptaron está anotado como **adoptado**, siempre marcado como decisión
> de contrato —no como decisión de diseño reabierta—.

---

## Contradicciones

### C1 — El tope de peso de una foto: 10 MB en el spec, 4 MB sin JavaScript

- **spec.md**: las Assumptions fijan el peso máximo admitido en **10 MB** al subir, y el Edge
  Case *«foto de 10 MB desde un celular moderno»* dice que **se acepta**. (Traza menor:
  `research.md #5` atribuye la cifra a FR-018, que no menciona ninguna.)
- **research.md #5**: el cuerpo de una petición en Vercel está limitado a **4,5 MB**, así que
  una foto de 10 MB no puede llegar al endpoint. La reducción en el navegador resuelve el caso
  con JavaScript; **sin JavaScript, el tope declarado es 4 MB**. La decisión rechaza
  explícitamente bajar el tope declarado a 4 MB en general.
- **Qué queda sin cerrar**: el Edge Case del spec falla en el camino sin JavaScript, que es el
  camino que el Principio I y research.md #8 exigen que funcione. Son dos topes distintos
  según una condición que el spec no menciona.
- **Adoptado en [`api-fotos.md`](./api-fotos.md)**: los dos topes se declaran en una tabla
  explícita, y el de 4 MB se anuncia en la página junto al campo. El contrato declara también
  que el rechazo por encima del límite de la plataforma lo emite la plataforma, no el endpoint,
  de modo que el mensaje claro que pide FR-018 tiene que existir **antes** de la subida.

**Resuelta — decisión 5 (corregida).** Ya no es una contradicción: son **dos topes declarados
explícitamente**, hasta **10 MB con JavaScript** (la foto se reduce antes de salir del
dispositivo) y hasta **4 MB sin JavaScript** (tope real de la plataforma), y el formulario lo
explica en vez de fallar sin mensaje. El spec lo dice igual en sus Assumptions. Lo que
`api-fotos.md` había adoptado como decisión de contrato es exactamente lo que la decisión
declara, así que el contrato se mantiene y deja de estar marcado como elección propia.

### C2 — Los tres avisos de FR-026 contra «no se toca ninguna ruta de API de la 001»

- **spec.md**: FR-026 exige tres avisos, el tercero es la **confirmación de aprobación**
  (User Story 4, escenario 3).
- **research.md #20**: enumera exactamente lo que esta feature cambia del código existente y
  dice que **no** se tocan «las rutas de API de la 001». La aprobación ocurre en
  `POST /api/regalos/[id]/aprobar`, que es una de ellas.
- **Qué queda sin cerrar**: no hay ningún punto del sistema donde emitir el tercer aviso sin
  tocar esa ruta, salvo inventar un disparador nuevo (una pasada periódica sobre regalos
  aprobados sin aviso, un `trigger` de base, u otro mecanismo). Ninguna decisión de
  `research.md` elige uno.
- **Adoptado**: nada. Ningún contrato de este directorio emite el aviso de aprobación. Los dos
  primeros sí tienen dueño: el comprobante de compra en
  [`api-webhook-pago.md`](./api-webhook-pago.md) y el aviso de regalo listo en
  [`api-enviar-historia.md`](./api-enviar-historia.md).

**Resuelta — decisión 20 (corregida).** El perímetro son **tres** archivos de la feature 001, no
dos: se suma `src/pages/api/regalos/[id]/aprobar.ts`, que emite el aviso de aprobación por ser
el único punto del sistema que se entera de que la aprobación ocurrió. El cambio es aditivo —no
altera la transición de estado ni la respuesta del endpoint— y `revision-y-aprobacion.spec.ts`
de la 001 es el gate. El tercer aviso ya tiene disparador y no hace falta inventar ninguna
pasada periódica. No hay contrato nuevo en este directorio porque la ruta es de la 001
(`specs/001-pagina-regalo/contracts/api-aprobar.md`); `quickstart.md` verifica la emisión en el
Escenario 4, paso 4.

### C3 — Los dos Edge Cases del aviso de pago sin pedido se contradicen entre sí

- **spec.md**, Edge Cases, dos ítems consecutivos:
  1. *«Aviso de pago que llega antes de que termine de registrarse el pedido: el pago no se
     pierde; se asocia al pedido correcto cuando este existe.»* → implica guardar el aviso en
     espera y aplicarlo después.
  2. *«Aviso de pago de un pedido que no existe: se rechaza sin alterar nada y queda
     registrado.»* → implica rechazarlo y no aplicarlo nunca.
- **research.md #4** cierra la ventana del primer caso: el pedido nace **antes** de ir a pagar,
  así que ya existe cuando llega el aviso. Pero no describe ningún mecanismo de asociación
  diferida, que es lo que el primer ítem promete.
- **Adoptado en [`api-webhook-pago.md`](./api-webhook-pago.md)**: el segundo ítem, que es el
  compatible con research.md #4 — el evento se registra, no se altera nada y se responde
  `404`. Queda escrito en el contrato que, por construcción, el caso no debería ocurrir nunca.

**Resuelta — decisión 2 (corregida), por rechazo explícito y no por reparación.** Un aviso cuyo
pedido no existe se rechaza con **404**, queda registrado con `resultado = 'sin_pedido'` y
aparece en la cola operativa. **No hay asociación diferida ni cola de reintentos**: el caso no
puede ocurrir porque el pedido nace antes de ir a pagar, y dejarlo abierto obligaría a construir
una cola que nadie va a construir. El spec corregido dice lo mismo en sus Edge Cases. Lo adoptado
por el contrato era lo correcto y ahora está respaldado por la decisión.

### C4 — Versión de la constitución citada para la excepción publicitaria

- **spec.md**, Assumptions: *«está escrita en la constitución v1.3.0»*.
- **research.md #13**: *«la excepción del Principio V (constitución v1.3.1)»*.
- **Hecho**: la excepción se incorporó en v1.3.0 y la constitución vigente es v1.3.1, cuyo
  informe de sincronización dice que el PATCH corrige la razón del Principio VII y no toca el
  Principio V. Las dos citas apuntan a la misma regla; solo una nombra la versión vigente.
- **Adoptado**: discrepancia cosmética, sin efecto en ningún contrato. Se anota para que no
  vuelva a discutirse.

**Resuelta — decisión 13 (corregida).** La cita unificada es **v1.3.0**: ahí entró la excepción
publicitaria. La v1.3.1 fue solo una corrección de redacción posterior sobre la razón del
Principio VII. `research.md`, `spec.md`, `data-model.md` y este archivo dicen ahora lo mismo.

---

## Huecos

Cosas que ninguno de los dos documentos definía y que un contrato no puede dejar en blanco. En
todos los casos el contrato eligió un valor y lo marcó como propio. Debajo de cada uno, qué pasó
con esa elección.

### H1 — La restricción única sobre `pedidos.regalo_id` no alcanza por sí sola

`research.md #9` decía que *«`pedidos.regalo_id` con restricción única es lo que impide que un
doble envío cree un segundo regalo (FR-021)»*, y `data-model.md` repetía el razonamiento: *«la
segunda intenta escribir un `regalo_id` distinto en un pedido que ya tiene uno, y la unicidad la
rechaza»*. La unicidad sobre `regalo_id` impide que **dos pedidos** compartan un regalo, pero no
impide que **un** pedido, enviado dos veces en paralelo, cree dos regalos distintos: el segundo
`UPDATE` reemplazaría el valor en la misma fila —cosa que la unicidad no bloquea— y dejaría el
primer regalo huérfano, con su slug ya consumido.

**Adoptado en [`api-enviar-historia.md`](./api-enviar-historia.md)**: reclamo atómico
`UPDATE pedidos SET regalo_id = $nuevo WHERE id = $1 AND regalo_id IS NULL` —la misma técnica
de UPDATE condicional que la feature 001 ya usa para la primera apertura y para la aprobación,
y que `research.md #2` invoca para el webhook—, y el perdedor deshace el regalo que acababa de
crear conservando su fila de `slugs`. La restricción única queda como red de contención, no
como mecanismo principal. Es un refuerzo de la decisión 9, no un cambio: su intención
—*un solo regalo por pedido*— se mantiene intacta.

**Resuelta — decisión 9 (corregida).** La decisión ya no atribuye a la unicidad una garantía que
no da: el mecanismo es el **reclamo atómico previo a crear el regalo**, y la restricción única es
la red de contención. Lo que el contrato había adoptado pasó a ser la decisión misma.
`data-model.md` corrigió su propia sección en el mismo sentido.

### H2 — No hay contrato para borrar un pedido (FR-030)

FR-030 exige poder borrar un pedido a pedido del comprador, con su borrador, sus fotos, sus
datos de contacto, su consentimiento y el regalo asociado. `research.md #16` fijaba el
**alcance** del borrado, pero no quién lo dispara ni con qué credencial, y la lista de contratos
de esta tarea no incluía esa ruta. No estaba escrita en este directorio.

**Resuelta — decisión 16 (corregida), y el contrato ya existe.** FR-030 tiene dueño: una ruta
propia de esta feature, `DELETE /api/pedidos/[id]/eliminar`, autenticada con `OPS_SECRET`, que
opera sobre el pedido y alcanza el regalo. Está especificada en
[`api-eliminar-pedido.md`](./api-eliminar-pedido.md), con el mismo formato que el resto, y barre
los dos prefijos de fotos.

### H3 — Las fotos del borrador quedan fuera del alcance del borrado de la feature 001

Las fotos se suben antes de que el regalo exista, así que su prefijo en el bucket es del
**pedido** (`pedidos/<id_pedido>/…`) y no del regalo. El contrato
`specs/001-pagina-regalo/contracts/api-eliminar.md` borra los objetos bajo `regalos/<id>/`, y
`research.md #20` dice que esa ruta no se toca. Resultado: borrar el regalo por la vía de la
001 **no** alcanza las fotos del pedido. Lo cubre el borrado del pedido (H2), que todavía no
tiene contrato.

**Resuelta — decisión 16 (corregida).** Las fotos viven bajo `pedidos/{pedido_id}/` mientras el
pedido está en borrador y **se mueven a `regalos/{regalo_id}/` al enviar la historia**, que es el
prefijo que el borrado de la 001 ya barre. El contrato de la 001 queda intacto y empieza a cubrir
las fotos nuevas sin tocarlo. La mudanza está especificada en
[`api-enviar-historia.md`](./api-enviar-historia.md) (idempotente, solo la hace el ganador del
reclamo), y [`api-fotos.md`](./api-fotos.md) fija que una foto subida después de que el regalo
nació ya nace bajo el prefijo del regalo. El borrado del pedido barre los dos prefijos, porque un
pedido abandonado antes del envío tiene fotos sin mudar.

### H4 — Qué es «el mínimo para que el regalo tenga sentido»

El Edge Case *«historia sin ningún momento, sin fotos y sin canción»* dice que se envía igual
*«si lo cargado alcanza el mínimo para que el regalo tenga sentido»*, y no definía ese mínimo.
FR-011 exige indicar con precisión qué falta, lo que obliga a tenerlo definido.

**Adoptado en [`api-enviar-historia.md`](./api-enviar-historia.md)**: nombre del destinatario,
tema válido, al menos un bloque con contenido real (momento con texto, foto, canción, carta o
pregunta) y texto alternativo en toda foto.

**Resuelta — decisión 21 (nueva).** El mínimo es **tema + nombre del destinatario + al menos un
bloque de contenido** (momento, carta, galería, canción, pregunta o cierre). El contrato dejó de
marcarlo como valor propio y cita la decisión; se agregaron `galería` y `cierre`, que su lista
original no incluía. Las condiciones que quedan en el contrato —texto alternativo en toda foto,
`cancion.url` dentro de la lista blanca— no son parte del mínimo: son reglas de validez sobre los
bloques que sí están cargados. `borrador.schema.md` y `data-model.md` apuntan al mismo mínimo.

### H5 — Topes de tamaño de los campos del borrador

El spec solo menciona una carta de *«~4.000 caracteres»* y un nombre con emoji. No hay topes
para ningún campo, ni cantidad máxima de momentos ni de preguntas.

**Adoptado en [`borrador.schema.md`](./borrador.schema.md)**: una tabla de topes campo por
campo (carta 8.000, momentos 12, preguntas 5, y el resto), marcados como valores del contrato.

**Sin cambios: sigue siendo una decisión de contrato, y está bien que lo sea.** Ninguna de las 22
decisiones fija topes de campo, y no hacía falta: lo que no es negociable es que exista un tope, y
el valor concreto es ajustable sin tocar ninguna decisión. No es un pendiente.

### H6 — Dimensiones de la tarjeta y parámetros del QR

SC-008 exige que el QR impreso *«al tamaño de la tarjeta»* se escanee 10 de 10 veces, y ni el
spec ni `research.md #11` fijan ese tamaño, el nivel de corrección de errores, la zona de
silencio ni el lado mínimo del código.

**Adoptado en [`qr-y-tarjeta.md`](./qr-y-tarjeta.md)**: 100 × 150 mm a 300 ppp, corrección
nivel Q, zona de silencio de 4 módulos, lado del QR ≥ 30 mm. Son valores por defecto del
contrato y están marcados como tales: SC-008 es la medición que los confirma o los corrige.

**Sin cambios: decisión de contrato, confirmada o corregida por SC-008**, que la decisión 19
declara explícitamente como criterio manual. No es un pendiente de diseño.

### H7 — Dimensiones y formato de salida de la foto reducida

FR-037 pide reducir *«al tamaño máximo que la página del regalo necesita»* y SC-013 fija el
resultado en peso (promedio < 300 KB, máximo 600 KB), pero ninguno fija el lado mayor ni el
formato de salida.

**Adoptado en [`api-fotos.md`](./api-fotos.md)**: el contrato exige lado mayor acotado, formato
único de salida, sin ampliación de una foto que ya viene chica, y metadatos eliminados; los
números concretos quedan como parámetro de implementación que SC-013 y SC-014 verifican.

**Sin cambios: decisión de contrato**, con SC-013 y SC-014 como gate automatizado. No es un
pendiente.

### H8 — Discrepancia entre el monto cotizado y el monto que informa el proveedor

`research.md #18` dice que cada pago guarda el monto y la moneda con los que se cobró, y
`data-model.md` fija que la fila de `pagos` nace con el cobro, en `pendiente`, con el precio del
momento. Nada dice qué hacer si el aviso informa un monto distinto del cotizado.

**Adoptado en [`api-webhook-pago.md`](./api-webhook-pago.md)**: se conserva el cotizado, la
discrepancia se registra y queda visible en la cola operativa, y el pago **no se bloquea**:
bloquearlo dejaría a un comprador que pagó sin su regalo, que es justo lo que el Principio VII
prohíbe.

**RESUELTA en su parte técnica por la decisión 23**, que además fija lo que el contrato dejaba
implícito: vale el monto que informa el proveedor, porque es el que el comprador pagó de verdad,
y se guardan los dos montos para que la discrepancia sea detectable.

Lo que queda fuera de todo documento de ingeniería, y con razón, es **qué hace el negocio** con
una discrepancia cuando la vea en la cola: reintegrar, cobrar la diferencia o dejarla pasar. Eso
no es un hueco del diseño —el sistema ya garantiza que el caso sea visible y que ninguna venta se
pierda— sino una decisión comercial que se toma caso por caso.

### H9 — La cola operativa queda sin protección el día que se apaga el modo interno

`research.md #14` protegía `/pedidos` con la compuerta de modo interno de `src/middleware.ts`.
Esa compuerta se enciende con `MODO_INTERNO=1` y hoy cubre el sitio entero. El día que el
negocio tenga dominio propio y la apague para abrir la landing al público, `/pedidos` —que
lista correos de compradores— queda accesible sin credencial. Ni el spec ni la decisión
mencionaban ese cruce.

**Adoptado**: nada. Ningún contrato de este directorio cubre `/pedidos`; se anota porque
aparece al leer la decisión 14 junto con FR-001, que pide una landing pública.

**Resuelta — decisión 14 (corregida).** `/pedidos` tiene **su propia** compuerta derivada de
`OPS_SECRET`, **no** la de `MODO_INTERNO`. El motivo quedó escrito donde corresponde: ese flag se
apaga exactamente el día que la landing se abre al público, y en ese momento `/pedidos` —que
muestra correos de compradores y su estado de pago— quedaría accesible para cualquiera. Los dos
ciclos de vida son opuestos, así que las dos compuertas son independientes. `quickstart.md` lo
verifica en los dos sentidos (Escenario 5, pasos 11–13) y `cola-operativa.spec.ts` es el gate.
Sigue sin contrato propio en este directorio porque `/pedidos` es una página, no una ruta de API.

### H10 — Nombres de pasos, de campos de formulario y de la cabecera de firma

Las rutas las fija `plan.md` y los contratos las adoptan sin cambiarlas: `/comprar`,
`/gracias/[pedido]`, `/contar/[pedido]/[paso]`, `/baja/[token]`, `/pedidos`,
`POST /api/pagos/webhook/[proveedor]`, `POST|GET /api/pedidos/[id]/borrador`,
`POST /api/pedidos/[id]/fotos`, `POST /api/pedidos/[id]/enviar`,
`DELETE /api/pedidos/[id]/eliminar`.

Lo que **ningún** documento previo fija, y los contratos tuvieron que nombrar para poder
especificar redirecciones y precondiciones:

- los siete nombres de `paso` (`destinatario`, `momentos`, `fotos`, `cancion`, `carta`,
  `preguntas`, `cierre`) y los dos pasos terminales (`resumen`, `enviado`);
- los nombres de los campos planos de cada formulario, incluido el discriminador `accion`
  (`subir` \| `quitar`) de la ruta de fotos, que existe porque `plan.md` prevé **una sola**
  ruta `fotos.ts` y un formulario sin JavaScript no puede emitir `DELETE`;
- la cabecera de firma del proveedor simulado, `X-Firma`;
- los nombres de las dos columnas del registro de emisión del QR, `pedidos.qr_emitido_en` y
  `pedidos.qr_simulacion`, que la decisión 22 describe sin nombrar.

El enlace público del regalo, `/r/[slug]`, no se toca: es de la feature 001 y es estable de por
vida (Principio VI).

**Sin cambios: decisiones de nombre, no de diseño.** Siguen siendo del contrato, y ahora están
reflejadas también en `data-model.md` (las dos columnas de QR) y en `quickstart.md`.

---

## Resueltas tras la reconciliación

Los cuatro puntos que quedaron abiertos al terminar de propagar las decisiones se cerraron
después, con las decisiones 13 y 23 de `research.md` y dos correcciones de nomenclatura. Se
dejan acá con su resolución.

1. **H8 — qué hace el negocio con una discrepancia de monto.** **Resuelto por la decisión 23.**
   Vale el monto que informa el proveedor, porque es el que el comprador pagó. La discrepancia
   contra el precio cotizado no bloquea el pago ni frena la entrega: se guardan los dos montos y
   el caso aparece marcado en la cola operativa. Bloquear castigaría al comprador por un cambio
   de precio que no provocó y crearía el pedido pagado sin entregar que el Principio VII prohíbe
   dejar en silencio; ignorarlo dejaría al negocio cobrando de menos sin enterarse.

2. **`pedidos.baja_publicidad_en`: una columna que un contrato usaba y el modelo no declaraba.**
   **Resuelto: la fecha se guarda**, y la columna se agregó a `data-model.md` y a su inventario
   de datos personales. Parece contradecir "la baja borra", pero no lo hace: lo que el Principio
   V obliga a borrar es el dato personal, y una fecha sin número no identifica a nadie.
   Guardarla es lo que permite demostrar que la baja se honró, que es la obligación que acompaña
   al derecho de darse de baja. La decisión 13 quedó ampliada con este punto.

3. **Dos nombres para el secreto del proveedor de pago simulado.** **Resuelto: el nombre
   canónico es `PAGO_SIMULADO_SECRETO`**, en singular, por consistencia con `PAGO_PROVEEDOR`.
   `api-webhook-pago.md` decía `PAGOS_SIMULADO_SECRETO` y quedó corregido. Era una diferencia de
   una letra que rompía la firma HMAC en la primera corrida, y haberla detectado antes de
   escribir una línea de código es exactamente para lo que sirve este documento.

4. **`research.md` descrito como de 20 decisiones en el árbol de `plan.md`.** **Resuelto**:
   `plan.md` dice 23, que es la cantidad vigente tras sumar el mínimo de envío (21), el registro
   de emisión del QR (22) y la discrepancia de monto (23).

## Abiertas tras la reconciliación

Ninguna. Los cuatro puntos de arriba eran los últimos, y los cuatro quedaron cerrados.
