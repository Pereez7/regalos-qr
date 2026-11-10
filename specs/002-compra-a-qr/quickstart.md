# Quickstart: validar de la compra al QR end-to-end

Guía de ejecución para probar la feature de punta a punta (US1, US2, US3, US4) sin cuenta en
ningún proveedor de pago ni de correo, y sin dominio propio. No repite el contrato de datos
(ver [data-model.md](./data-model.md)) ni el de las rutas (ver [contracts/](./contracts/)) —
solo los pasos para correrlo y confirmar que funciona.

En los pasos, `<pedido>` es el identificador no adivinable del pedido (la única credencial del
comprador, FR-003), `<slug>` y `<id>` son los del regalo de la feature 001, y `<token>` es el de
baja publicitaria (research.md #13).

## Prerrequisitos

- Node.js 20 LTS
- Supabase CLI (`supabase start` para Postgres + Storage local)
- Un celular en la misma red LAN, para el escaneo real del QR (US3)
- `openssl` y `exiftool` (o `identify -verbose`) para las verificaciones de firma y de metadatos
- Las variables de entorno de la feature 001 ya documentadas en `.env.example`:
  `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPS_SECRET`, `SITIO_URL`, `MODO_INTERNO`,
  `ACCESO_INTERNO_SECRETO`

### Variables de entorno nuevas de esta feature

| Variable | Valor para validar en local | Para qué |
|---|---|---|
| `PAGO_PROVEEDOR` | `simulado` | Elige el adaptador de pago (research.md #3). `simulado` es el único proveedor al cierre de esta feature. |
| `PAGO_SIMULADO_SECRETO` | cualquier cadena larga, p. ej. `secreto-de-pago-local` | Secreto HMAC con el que el proveedor simulado firma sus avisos. Es lo que hace que el camino de verificación de firma se ejercite de verdad en simulación, y no quede sin probar hasta el día que se conecte el proveedor real. |
| `CORREO_PROVEEDOR` | `consola` | Elige el adaptador de correo (research.md #12). `consola` imprime el aviso en la terminal y lo registra igual en la tabla `avisos`. |
| `PRECIO` | `18000` | Monto del único producto (research.md #18). Se lee en runtime, no en build. |
| `MONEDA` | `ARS` | Moneda de ese monto. Cada pago guarda el monto y la moneda con los que se cobró. |
| `RESEND_API_KEY` | vacío | Solo lo necesita el proveedor `resend` en producción. Vacío en simulación; en el Escenario 4 se usa a propósito con un valor inválido para forzar una falla de envío. |

Dos cosas que conviene dejar claras antes de empezar, porque parecen errores y no lo son:

- **`SITIO_URL=http://localhost:4321` hace que el generador de QR se niegue a emitir un QR
  vendible.** Es el comportamiento correcto (research.md #11, FR-024): la compuerta rechaza
  `localhost`, cualquier host que termine en `vercel.app` y cualquier dirección IP. Hay una
  verificación dedicada a comprobarlo (Verificación 9).
- **`/pedidos` no la protege `MODO_INTERNO`: tiene su propia compuerta derivada de
  `OPS_SECRET`** (research.md #14). El motivo tiene fecha de detonación conocida: `MODO_INTERNO`
  se apaga exactamente el día que la landing se abre al público, y en ese momento `/pedidos`
  —que muestra correos de compradores y su estado de pago— quedaría accesible para cualquiera.
  Los dos ciclos de vida son opuestos, así que las dos compuertas son independientes. Para la
  validación local hay que tener `OPS_SECRET` seteado y presentarlo como lo pide la cola; el
  Escenario 5 lo verifica en los dos sentidos.

## Setup

```bash
npm install
supabase start
supabase db push          # 0001_regalos.sql + 0002_pedidos.sql (pedidos, pagos, eventos_pago, avisos)
npm run bucket:fotos      # asegura el bucket `fotos` con public = false (research.md #15)
npm run seed:regalo-demo  # el regalo de ejemplo que la landing va a mostrar
npm run dev
```

Verificaciones de setup, antes de seguir:

1. `0002_pedidos.sql` crea las cuatro tablas nuevas y **ninguna columna nueva en `regalos`**
   (research.md #10, data-model.md). Si `regalos` cambió, el cambio salió del perímetro.
2. `npm run bucket:fotos` debe reportar el bucket `fotos` como privado. Si lo reporta público,
   detenerse acá: FR-020 y SC-011 no se pueden validar contra un bucket público.
3. `npm run seed:regalo-demo` imprime el `id` y el `slug` del regalo demo. Aprobarlo en
   `/revisar/<id>` para que la landing pueda mostrarlo como ejemplo navegable.

## Escenario 1 — US1: el visitante entiende la propuesta y paga

1. Abrir `http://localhost:4321/` → **esperado**: qué es el regalo, al menos un ejemplo real
   navegable de punta a punta (el del seed, ya aprobado), el precio tomado de `PRECIO`/`MONEDA`,
   y **una sola** acción de compra (FR-001, SC-001).
2. Cambiar `PRECIO` en `.env`, reiniciar el server y recargar **sin reconstruir** → **esperado**:
   la landing muestra el precio nuevo. Si exige rebuild, el valor se está leyendo solo por
   `import.meta.env` y research.md #18 no se cumplió.
3. Revisar la landing a 320 px y a 1440 px → **esperado**: cero scroll horizontal (FR-032,
   SC-010).
4. Tocar la acción de compra → **esperado**: formulario con el correo como **obligatorio**
   (FR-034) y el celular como **opcional**, con el propósito publicitario declarado al pedirlo y
   un consentimiento que llega **sin marcar** (FR-035). Confirmar en el HTML que la casilla no
   trae `checked`.
5. Completar el correo (sin celular por ahora) y enviar a `/comprar`
   (ver `contracts/api-iniciar-compra.md`) → **antes** de completar el cobro, consultar la base:
   **esperado**: ya existe la fila en `pedidos` con estado `iniciado` (research.md #4, FR-002).
   El pedido nace antes de ir a pagar.
6. Abrir `/gracias/<pedido>` sin haber pagado → **esperado**: el estado real, "pendiente de
   pago", nunca una pantalla que diga que todo salió bien (US1 AS4).
7. Completar el cobro en el proveedor simulado → **esperado**: el aviso firmado llega a
   `/api/pagos/webhook/simulado`, el pedido pasa a `pagado`, y `/gracias/<pedido>` ahora muestra
   el enlace de carga de la historia (US1 AS2).
8. Consultar la fila de `pagos`: **esperado**: identificador del pago en el proveedor, monto y
   moneda (los de `PRECIO`/`MONEDA` al momento del cobro) y estado. **Ningún** dato de tarjeta en
   ninguna columna (FR-006).
9. Abrir `/gracias/<otro>` con un identificador inventado, y después con el del pedido real
   alterado en un carácter → **esperado**: no se ve ni el contenido ni el estado de ese pedido
   (FR-031, US1 AS6).

## Escenario 2 — US2: el comprador carga su historia sin miedo a perderla

Partiendo del pedido pagado del Escenario 1, entrando siempre por `/contar/<pedido>/<paso>`.

1. Abrir el enlace de carga → **esperado**: se puede empezar sin crear cuenta, sin contraseña y
   sin registro previo (FR-003, US2 AS1).
2. Completar el paso de destinatario y clima visual (uno de los tres temas de la feature 001:
   nocturno, papel, luminoso) y avanzar → **esperado**: el paso es un `<form>` que hace POST a
   `/api/pedidos/<pedido>/borrador`, guarda y redirige al paso siguiente (research.md #8,
   `contracts/api-borrador.md`).
3. Completar el paso de momentos (tres momentos) y avanzar.
4. **Cerrar la pestaña acá, a mitad de camino.** Esperar, y volver a abrir el mismo enlace →
   **esperado**: destinatario, tema y los tres momentos están, y la carga sigue desde donde
   estaba (FR-010, US2 AS2, SC-004). Este es el punto de la feature donde perder datos es más
   caro: el comprador ya pagó. "Un paso = una petición guardada" es lo que lo hace cierto sin una
   línea de JavaScript.
5. Recargar el formulario 30 veces seguidas → **esperado**: el borrador no se corrompe ni se
   duplica, y no nace ningún regalo (Edge Case).
6. Paso de fotos: subir cinco, una de ellas de ~10 MB sacada con un celular moderno →
   **esperado**: se aceptan todas, se ven incorporadas a la historia, y se pueden quitar y
   reordenar antes de enviar (FR-019, US2 AS3). La reducción ocurre en el navegador antes de
   subir (research.md #5), así que la petición nunca se acerca al tope de 4,5 MB de Vercel.
7. Desactivar JavaScript y subir otra foto → **esperado**: la subida directa funciona con tope de
   4 MB y, al pasarse, un mensaje claro **antes** de subir (research.md #5,
   `contracts/api-fotos.md`). Sin JS la carga completa sigue siendo usable. Los dos topes son una
   decisión declarada, no una contradicción: **10 MB con JavaScript** —la foto se reduce antes de
   salir del dispositivo— y **4 MB sin JavaScript**, que es el tope real de la plataforma. El
   formulario lo explica en vez de fallar sin mensaje.
8. Subir un PDF renombrado a `.jpg`, y después un archivo de imagen de más de 10 MB →
   **esperado**: los dos se rechazan con un mensaje claro y **todo el resto del borrador queda
   intacto** (FR-018, US2 AS8).
9. Quitar una de las fotos subidas y listar los objetos del bucket `fotos` → **esperado**: la
   foto quitada no quedó almacenada (FR-019, Edge Case).
10. Escribir en la carta un texto con etiquetas HTML dentro (`<b>hola</b>`) y de ~4.000
    caracteres, y un nombre con emoji → **esperado**: se guardan y se muestran como texto
    literal, tanto en la carga como después en el regalo, sin recortes (FR-017, Edge Cases).
11. Intentar enviar la historia incompleta (p. ej. sin cierre) → **esperado**: el sistema indica
    exactamente qué falta, en lenguaje claro, y **no** la envía (FR-011, US2 AS4). Es la
    diferencia entre los dos esquemas: el borrador valida "esto es guardable" y el contenido
    valida "esto es entregable" (research.md #8, `contracts/borrador.schema.md`).
12. Completar canción, carta, preguntas y cierre, y enviar (`contracts/api-enviar-historia.md`)
    → **esperado**: nace un regalo en `en_revision` con su enlace de revisión, y el comprador
    recibe ese enlace (FR-013, US2 AS5). Anotar el `<slug>` y el `<id>`.
    - Listar el bucket `fotos` antes y después del envío → **esperado**: las fotos estaban bajo
      `pedidos/<pedido>/` y ahora están bajo `regalos/<id>/`, con el mismo nombre aleatorio y
      sin ningún objeto dejado atrás (research.md #16). Es el prefijo que el borrado de la
      feature 001 ya barre: sin la mudanza, borrar el regalo por la vía existente dejaría las
      fotos en el bucket para siempre.
    - Confirmar que `regalos.contenido` y `pedidos.borrador` nombran las rutas **nuevas**: las
      dos tienen que apuntar al objeto vigente.
    - Probar el mínimo de envío con un borrador pelado: solo tema, nombre del destinatario y
      **un** bloque de contenido (una carta sola alcanza) → **esperado**: se envía
      (research.md #21). Quitar ese único bloque → **esperado**: no se envía, y el faltante se
      explica en lenguaje del comprador.
13. Abrir `/revisar/<id>` → **esperado**: la historia cargada, traducida al contenido versionado
    que ya consume el motor de la feature 001 (FR-012), sin ningún tipo de bloque nuevo.
14. Volver a la carga, cambiar la carta y reenviar. Repetir tres veces → **esperado**: el
    contenido del regalo cambia, el `<slug>` **no** cambia nunca, y la fila de `slugs` sigue
    siendo la misma (FR-014, FR-015, research.md #9, US2 AS6).
15. Aprobar en `/revisar/<id>` (el `<form>` de la feature 001) → **esperado**: el regalo queda
    publicado y `/r/<slug>` sirve el contenido.
16. Intentar volver a la carga y modificar la historia → **esperado**: el sistema no lo permite y
    explica por qué: lo entregado es inmutable (FR-016, US2 AS7).

## Escenario 3 — US3: el QR y la tarjeta lista para imprimir

Con el regalo del Escenario 2 ya publicado. El generador es `npm run qr -- <slug>`; las opciones
exactas (incluida la marca de simulación) están en `contracts/qr-y-tarjeta.md`.

1. Con `SITIO_URL=http://localhost:4321`, intentar generar el QR **vendible** → **esperado**: el
   generador se niega y explica el motivo (research.md #11, FR-024, US3 AS3). Repetir con
   `SITIO_URL=https://regalos-qr-nine.vercel.app` y con `SITIO_URL=http://192.168.0.10:4321`:
   los tres se niegan igual.
2. Generar el QR marcado explícitamente como **simulación** → **esperado**: se emite, y la
   tarjeta lleva la palabra "SIMULACIÓN" **estampada sobre la imagen**, no solo en el nombre del
   archivo (research.md #11). Un archivo se renombra o se reenvía sin su nombre; una marca
   impresa no se pierde.
   - Consultar el pedido de ese regalo → **esperado**: `qr_emitido_en` con el instante de la
     emisión y `qr_simulacion = true` (research.md #22). Repetir la emisión → las dos columnas se
     sobrescriben: interesa qué soporte salió último.
   - Repetir el intento **negado** del paso 1 y volver a consultar → **esperado**: las columnas
     quedan como estaban. Una compuerta que se niega no deja registro de emisión, porque no hubo
     emisión.
3. Revisar la tarjeta antes de imprimir → **esperado**: incluye el QR y el texto mínimo para que
   quien la recibe entienda que debe escanearlo (FR-023, US3 AS4).
4. Para el escaneo real: poner `SITIO_URL=http://<ip-lan-de-la-maquina>:4321`, volver a generar
   la tarjeta marcada como simulación, e imprimirla **al tamaño previsto de la tarjeta**.
5. Escanear con el celular, con iluminación de interior → **esperado**: abre `/r/<slug>`, el
   regalo correcto (FR-022, US3 AS1). Repetir 10 veces: 10 de 10 (SC-008, US3 AS2).
6. Tomar un regalo todavía en revisión (otro pedido, o un seed nuevo) e intentar generar su QR
   vendible → **esperado**: se niega; no existe QR antes de la aprobación del comprador (FR-025,
   US3 AS5).

## Escenario 4 — US4: los tres avisos de correo

Con `CORREO_PROVEEDOR=consola`, cada aviso se imprime en la terminal de `npm run dev` **y** se
registra en la tabla `avisos` con su tipo, destinatario, estado y pedido (research.md #12).

1. Al quedar pagado el pedido (Escenario 1, paso 7) → **esperado**: aviso tipo comprobante,
   impreso en consola y con fila en `avisos`, con el enlace de carga de la historia dentro
   (FR-026, US4 AS1).
2. Leer ese aviso completo → **esperado**: no incluye ningún dato que el comprador no haya dado.
   En el pedido sin celular, no menciona ningún número (FR-027).
3. Al enviar la historia (Escenario 2, paso 12) → **esperado**: aviso tipo revisión, con el
   enlace `/revisar/<id>` dentro (US4 AS2).
4. Al aprobar (Escenario 2, paso 15) → **esperado**: aviso tipo aprobación, que deja claro que el
   regalo está publicado y que su contenido ya no se puede cambiar (US4 AS3). El disparador es
   `src/pages/api/regalos/[id]/aprobar.ts`, el único punto del sistema que se entera de que la
   aprobación ocurrió; es el tercero de los tres archivos de la feature 001 que esta feature toca
   (research.md #20). El cambio es aditivo: la transición de estado y la respuesta del endpoint
   no cambian, y `revision-y-aprobacion.spec.ts` de la 001 es el gate que lo verifica.
5. Contar las filas de `avisos` de ese pedido → **esperado**: exactamente una por tipo. Las tres
   correcciones del paso 14 del Escenario 2 **no** generan avisos de revisión extra.
6. Forzar una falla de envío: `CORREO_PROVEEDOR=resend` con `RESEND_API_KEY=clave-invalida`, y
   completar una compra nueva hasta el pago → **esperado**: el pedido queda pagado igual, no se
   bloquea ni se pierde, y el aviso queda en `avisos` con estado de falla, listo para reintentar
   (FR-029, US4 AS4). Volver a `CORREO_PROVEEDOR=consola` al terminar.
7. Abrir `/pedidos` → **esperado**: el aviso fallido aparece en la lista, **con su botón de
   reintento** (research.md #12, #14). Volver a `CORREO_PROVEEDOR=consola`, tocar ese botón →
   **esperado**: el aviso se reencola, se envía, `intentos` se incrementa sobre la **misma** fila
   y el estado pasa a enviado. El reintento es **manual**: no hay reintento automático ni tarea
   programada, y nada hay que esperar a que corra solo.

## Escenario 5 — Simulación de venta completa

Este es el recorrido que prueba que la feature está terminada (SC-005, SC-012). Se hace de una
sola pasada, en una base limpia, sin tocar nada a mano entre pasos:

```bash
supabase db reset && supabase db push && npm run bucket:fotos && npm run seed:regalo-demo
```

1. Abrir `/` como visitante nuevo y recorrer el ejemplo del seed de punta a punta.
2. Comprar: correo + celular, con el consentimiento marcado a mano.
3. Completar el cobro simulado. Confirmar pedido `pagado`, pago registrado y comprobante emitido.
4. Cargar la historia completa en **tres sesiones distintas**, cerrando la pestaña entre ellas.
5. Enviar. Confirmar regalo `en_revision`, `<slug>` asignado y aviso de revisión emitido.
6. Corregir una vez y reenviar. Confirmar que el `<slug>` no cambió.
7. Aprobar en `/revisar/<id>`. Confirmar aviso de aprobación y `/r/<slug>` sirviendo el regalo.
8. Abrir `/r/<slug>` en el celular, tocar la pantalla de apertura, recorrer los bloques y
   confirmar que las fotos se ven: son las reducidas, servidas por dirección firmada en el render
   (research.md #6).
9. Generar la tarjeta marcada como simulación, imprimirla, escanear el QR y confirmar que abre
   ese mismo regalo.
10. Abrir `/pedidos` → **esperado**: el pedido ya **no** figura como pagado sin regalo entregado,
    y sí figuran los pedidos `iniciado` que quedaron sin pagar en los escenarios anteriores
    (FR-008, SC-007, research.md #14).
11. Abrir `/pedidos` **sin** la credencial que deriva de `OPS_SECRET` → **esperado**: no se ve
    nada de la cola. Presentarla y volver → **esperado**: la cola se ve
    (research.md #14).
12. Apagar `MODO_INTERNO` (vacío) y volver a abrir `/pedidos` sin la credencial de `OPS_SECRET`
    → **esperado**: sigue sin verse. Este es el paso que importa: `MODO_INTERNO` se apaga el día
    que la landing se abre al público, y la cola —que muestra correos de compradores— no puede
    quedar colgada de ese flag. Las dos compuertas son independientes porque sus ciclos de vida
    son opuestos (research.md #14).
13. Con `MODO_INTERNO=1` y `ACCESO_INTERNO_SECRETO` seteado, abrir la landing sin cookie →
    **esperado**: 404, y tras `/acceso?clave=...` se ve. Esa compuerta sigue siendo la del deploy
    interno, y no tiene nada que ver con la de `/pedidos`.

Este recorrido está automatizado en `venta-completa.spec.ts` (research.md #19). Si el recorrido
manual y el test no coinciden, **manda el test**: un checklist manual se rompe en silencio.

## Verificaciones de lo que se rompe en silencio

Los comandos de esta sección usan `$CAB_FIRMA` para el nombre de la cabecera de firma, que lo
fija `contracts/api-webhook-pago.md`, y el cuerpo del aviso tiene la forma que ese mismo contrato
define:

```bash
export AVISO=http://localhost:4321/api/pagos/webhook/simulado
export CAB_FIRMA=...                              # ver contracts/api-webhook-pago.md
export PAGO_SIMULADO_SECRETO=secreto-de-pago-local

CUERPO='{...}'   # forma del aviso: ver contracts/api-webhook-pago.md
FIRMA=$(printf '%s' "$CUERPO" | openssl dgst -sha256 -hmac "$PAGO_SIMULADO_SECRETO" -r | cut -d' ' -f1)
```

### 1. Aviso de pago duplicado que no duplica el pedido

```bash
for i in $(seq 1 10); do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST "$AVISO" \
    -H 'content-type: application/json' -H "$CAB_FIRMA: $FIRMA" -d "$CUERPO"
done
```

**Esperado**: 200 en las diez —no 409: un no-2xx provocaría reintentos infinitos de un evento ya
procesado (research.md #2)—, una sola fila en `eventos_pago` para ese `evento_id`, el pedido
`pagado` una sola vez, un solo pago y **un solo** comprobante en `avisos` (FR-004, SC-006,
US1 AS3).

Repetir con dos entregas **simultáneas** del mismo evento (los dos `curl` con `&`, o un
`Promise.all` de dos `fetch`) → **esperado**: idéntico resultado. La garantía viene de la
restricción única sobre `(proveedor, evento_id)`, no de una comprobación previa en el código: un
`select` antes del `insert` tiene una ventana de carrera y esto no.

Confirmar también el **orden**: la firma se verifica **antes** de insertar, así que un aviso
rechazado por firma o por content-type **no deja fila** en `eventos_pago` (research.md #2). Es
una cuestión de seguridad y no de estilo: insertar primero permitiría envenenar la clave de
idempotencia con un `evento_id` inventado y hacer que el aviso legítimo se trate como duplicado,
de modo que el pago nunca se aplicaría. Mandar un `evento_id` inventado con firma **inválida** y
después el mismo `evento_id` con firma válida → **esperado**: el segundo se aplica.

### 2. Aviso con firma inválida, rechazado

Mandar el mismo cuerpo con la firma alterada en un carácter, y después sin cabecera de firma.

**Esperado**: se rechaza con el código que fija `contracts/api-webhook-pago.md`, **ningún** pedido
se modifica, y el intento queda registrado (FR-005, US1 AS5). La verificación no mira de dónde
parece venir la petición: el cuerpo bien firmado pasa **sin** cabecera `Origin`, y el mal firmado
falla aunque traiga un `Origin` que parezca legítimo.

Verificar también el aviso de un **pedido que no existe**: firma válida, `pedidoId` inventado →
se rechaza sin alterar nada y queda registrado (Edge Case).

### 3. Aviso que no es `application/json`, rechazado con 415

```bash
curl -i -X POST "$AVISO" -H 'content-type: application/xml' -H "$CAB_FIRMA: $FIRMA" -d "$CUERPO"
```

**Esperado**: 415 (research.md #1). El manejador exige `application/json` explícitamente, para
que un proveedor futuro que avise por formulario sea visible de inmediato en vez de dejar un 403
silencioso.

Ojo con el matiz, que es la trampa de este paso: con
`content-type: application/x-www-form-urlencoded` (o `text/plain`, o sin content-type) la
respuesta **no** es 415 sino **403**, porque el `checkOrigin` de Astro corta antes de que el
manejador llegue a correr —es exactamente la medición de research.md #1—. Los dos códigos son un
rechazo correcto, pero el test tiene que esperar el que corresponde a cada content-type.
Confirmar además que `application/json` **sí** pasa sin cabecera `Origin` y con un `Origin`
ajeno: eso es lo que permite dejar `checkOrigin` encendido y no debilitar la protección CSRF de
los formularios de compra, de carga y de baja.

### 4. Doble envío de la historia que produce un solo regalo

Con un borrador completo, disparar dos envíos simultáneos (doble clic real, o dos `POST` en
paralelo a `/api/pedidos/<pedido>/enviar`).

**Esperado**: nace **un solo** regalo, con un solo `<slug>` y una sola fila en `slugs`. La
garantía es el **reclamo atómico sobre el pedido antes de crear el regalo**
—`UPDATE pedidos SET regalo_id = … WHERE id = $1 AND regalo_id IS NULL`—, no la restricción
única sobre `pedidos.regalo_id`, que se evalúa después de que el regalo ya existe y queda como
red de contención (FR-021, research.md #9, Edge Case). Confirmar además que **no quedó ningún
regalo huérfano**: tantas filas en `regalos` como envíos ganados, y ninguna fila de `slugs`
borrada (Principio VI).

### 5. Foto cuyo original no quedó almacenado y cuyos metadatos se eliminaron

Subir una foto de 10 MB con GPS en sus metadatos (cualquier foto de celular sin editar), enviar y
publicar. Después descargar del bucket `fotos` lo que quedó guardado:

**Esperado**:

- Un solo objeto por foto, la versión reducida, bajo `regalos/<id>/` —el envío movió las fotos
  desde `pedidos/<pedido>/` (research.md #16)—. **No** hay copia del original (FR-038), y la
  reducción ocurrió antes de que naciera el regalo: lo entregado no depende de ningún
  procesamiento posterior.
- Pesa menos de 300 KB en promedio y a lo sumo 600 KB (SC-013); un regalo con 10 fotos ocupa
  menos de 6 MB contando todo lo que se guarda de él (SC-014).
- `exiftool <archivo> | grep -i gps` no devuelve nada: ningún metadato de ubicación sobrevivió
  (FR-039, SC-015).
- En la pantalla del celular la diferencia no se nota (comparar contra el original a ojo).
- Una foto que ya venía chica y optimizada no se agrandó ni quedó peor que la original
  (Edge Case).

`sharp` es la autoridad final acá: la reducción en el navegador es por velocidad y por el tope de
Vercel, pero lo que define formato, dimensiones y ausencia de metadatos es el servidor, porque no
se puede confiar en lo que llega del cliente (research.md #5).

### 6. Foto inaccesible para quien no está viendo el regalo

1. Tomar la `ruta` de storage de una foto desde `regalos.contenido` y pedirla al bucket **sin
   firma** → **esperado**: se rechaza (bucket privado, research.md #15).
2. Confirmar que `regalos.contenido` guarda **`ruta`** y no una dirección de acceso ya firmada:
   la firma nace y muere dentro del request que la usa, nunca se persiste (FR-020,
   research.md #6 y #7).
3. Tomar del HTML de `/r/<slug>` una dirección firmada, alterarle un carácter y pedirla →
   **esperado**: no sirve. Esperar su vencimiento y repetir → **esperado**: tampoco (SC-011).
4. Confirmar que el QR y `/r/<slug>` **no** llevan firma alguna: la ruta pública es estable de
   por vida y lo único que vence es la dirección interna de cada foto. Es lo que hace compatible
   la firma por render con el Principio VI.

### 7. Compra completada sin dar celular

Completar una compra entera dejando el campo de celular vacío y el consentimiento sin marcar.

**Esperado**: la compra se completa (SC-016), `pedidos.celular` queda en nulo,
`pedidos.consentimiento_publicidad` en falso y sin fecha, y ningún aviso menciona un número
(FR-035, FR-027). Repetir dejando el celular vacío **pero** marcando el consentimiento: tampoco
se guarda número.

### 8. Baja publicitaria que borra el número

Partiendo de un pedido con celular y consentimiento dados:

1. Abrir `/baja/<token>` y confirmar la baja (`contracts/api-baja-publicidad.md`) →
   **esperado**: `pedidos.celular` queda en **nulo** y `consentimiento_publicidad` en falso. No
   existe ninguna columna que marque "dado de baja" conservando el número (FR-036,
   research.md #13).
2. Intentar usar ese `<token>` como identificador de pedido en `/gracias/` y en `/contar/` →
   **esperado**: no da acceso al pedido, al borrador ni al regalo. El enlace de baja viaja dentro
   de mensajes publicitarios y no puede ser también la credencial del pedido.
3. Borrar el pedido a pedido del comprador, con la ruta propia de esta feature
   (`contracts/api-eliminar-pedido.md`):

   ```bash
   curl -i -X DELETE "http://localhost:4321/api/pedidos/<pedido>/eliminar" \
     -H "authorization: Bearer $OPS_SECRET"
   ```

   **Esperado**: `204`, y desaparecen la fila, el borrador, las fotos del bucket —**en los dos
   prefijos**, `pedidos/<pedido>/` y `regalos/<id>/`—, los pagos, los eventos de pago, los
   avisos, el contacto, el consentimiento y el regalo asociado con sus aperturas. La fila de
   `slugs` **sigue ahí**, huérfana: un slug entregado no se reasigna jamás (FR-030,
   research.md #16, igual que `eliminar.spec.ts` de la 001). Sin la cabecera → `401` y nada se
   borra: la credencial es el secreto de servidor y nunca el id del pedido, porque FR-030 dice
   *a pedido del comprador*, no *por el comprador*.

### 9. El generador de QR se niega porque `SITIO_URL` apunta al deploy interno

```bash
for url in http://localhost:4321 https://regalos-qr-nine.vercel.app http://192.168.0.10:4321; do
  SITIO_URL=$url npm run qr -- <slug>
done
```

**Esperado**: el intento falla, con el motivo explicado, en 10 de 10 ocasiones (SC-009, FR-024), y
lo único que se puede emitir es la tarjeta marcada como simulación. Un QR impreso no se actualiza
nunca y ese error no tiene corrección posible: por eso la compuerta bloquea en vez de advertir.

## Criterios sin gate automatizado (declarados, no omitidos)

Cuatro criterios de éxito **no** tienen test y no lo van a tener: son manuales por naturaleza,
porque miden comprensión humana y papel impreso (research.md #19). Quedan acá como verificación
manual, declarados como tales en vez de fingir cobertura automatizada:

| Criterio | Cómo se verifica a mano | Dónde |
|---|---|---|
| **SC-001** — entender qué se vende y cuánto cuesta en menos de 30 s | Mostrar la landing a alguien que nunca vio el producto y tomar el tiempo hasta que lo explica con sus palabras | Escenario 1, paso 1 |
| **SC-002** — pagar en menos de 3 min | Cronometrar desde la acción de compra hasta el pedido `pagado` | Escenario 1, pasos 4–7 |
| **SC-003** — cargar una historia completa en menos de 20 min | Cronometrar la carga de destinatario, tres momentos, cinco fotos, canción, carta y cierre | Escenario 2 |
| **SC-008** — QR impreso legible 10 de 10 | Imprimir la tarjeta al tamaño previsto y escanear diez veces con un celular de gama baja, con luz de interior | Escenario 3, pasos 4–5 |

Todo el resto de los criterios tiene gate automatizado en la tabla de abajo.

## Verificación automatizada (criterios medibles)

```bash
npm run test:e2e                              # build de producción + server + toda la suite
npm run test:e2e -- venta-completa.spec.ts    # solo el recorrido completo
```

`playwright.config.ts` ya hace el `npm run build` y levanta `node ./dist/server/entry.mjs`: los
tests corren siempre contra el build de producción, nunca contra el dev server. Las variables de
entorno nuevas tienen que estar en `.env` (el config hace `process.loadEnvFile()`) o inyectadas
en CI.

Specs nuevos de esta feature (research.md #19):

| Test | Criterio |
|---|---|
| `venta-completa.spec.ts` | SC-005/SC-012: landing → cobro simulado → carga en varias sesiones → envío → revisión → aprobación → regalo público → QR generado |
| `pago-idempotente.spec.ts` | FR-004/SC-006: mismo aviso 10 veces y dos entregas simultáneas → un solo pedido pagado y una sola acción derivada; FR-005: firma alterada, ausente y pedido inexistente rechazados con registro; research.md #1: `application/json` pasa con y sin `Origin`, `application/xml` → 415, form-urlencoded → 403 |
| `borrador-autoguardado.spec.ts` | FR-010/SC-004: sesión cerrada a mitad de la carga y retomada sin perder nada; 30 recargas sin corromper el borrador |
| `envio-unico.spec.ts` | FR-021: doble envío → un solo regalo, un solo slug |
| `fotos-privadas.spec.ts` | FR-020/FR-037/FR-038/FR-039 + SC-011/SC-013/SC-014/SC-015: original no almacenado, peso dentro del presupuesto, sin metadatos de ubicación, ruta inaccesible sin firma y firma no persistida |
| `celular-opcional.spec.ts` | FR-035/FR-036 + SC-016: compra completa con el celular vacío y el consentimiento sin pre-aceptar; la baja borra el número |
| `qr-compuerta.spec.ts` | FR-024/FR-025 + SC-009: se niega con `localhost`, `vercel.app` e IP, y con un regalo sin aprobar; emite solo con la marca de simulación estampada; research.md #22: la emisión queda registrada en `pedidos.qr_emitido_en` / `qr_simulacion`, y un intento negado no registra nada |
| `cola-operativa.spec.ts` | FR-008/SC-007: pedido pagado sin regalo visible en `/pedidos`, pedido iniciado sin pagar, aviso fallido con su botón de reintento manual (research.md #12); research.md #14: la cola exige su propia credencial derivada de `OPS_SECRET`, con `MODO_INTERNO` encendido y apagado |

**Éxito** = los specs nuevos en verde **y los 28 tests de la feature 001 intactos y en verde**
(research.md #20 los toma como perímetro; son los 18 archivos que ya están en `tests/e2e/`, y
ninguno se modifica en esta feature). Sobre ese número: la suite ejecuta **28 tests a partir de
26 llamadas a `test()`**, porque `contraste-aa.spec.ts` genera un test por tema recorriendo los
tres archivos de tokens. Los dos números son correctos y no hay nada que reconciliar: el gate es
el de 28 ejecutados (research.md #19). Tres de ellos son los que avisan si el cambio se salió de
lo acordado:

- `compatibilidad-versiones.spec.ts` — el fixture dorado `tests/fixtures/contenido-v1.json` no
  conoce `foto.ruta` y tiene que seguir renderizando igual, y el seed de demo con enlaces
  externos en `url` también (research.md #7).
- `lcp.spec.ts` — la firma por render agrega una ida y vuelta a Supabase en el render del regalo.
  Si rompe el presupuesto de 2,5 s en 3G, la mitigación es firmar con vigencia amplia y apoyarse
  en la caché del navegador, no volver al bucket público (research.md #6).
- `presupuesto-js.spec.ts` — el JavaScript de la reducción de fotos vive en las páginas de carga.
  `/r/[slug]` y `/revisar/[id]` no reciben ni un byte nuevo (research.md #17).

Este es el gate de "terminado" para esta feature, junto con las Compuertas de Aceptación de la
constitución —en particular la 16, que es la compuerta del QR hecha código.
