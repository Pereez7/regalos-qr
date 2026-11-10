# Research: De la Compra al QR

**Feature**: `002-compra-a-qr` | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

Decisiones de Fase 0. Cada una resuelve una incógnita concreta del spec o una restricción del
stack ya existente. Las mediciones citadas se hicieron contra el deploy real
(`regalos-qr-nine.vercel.app`), no contra documentación.

---

## 1. El `checkOrigin` de Astro no bloquea un webhook JSON — medido

**Decision**: dejar `security.checkOrigin` en su valor por defecto (encendido). Los webhooks de
pago aceptan **únicamente** `application/json`; cualquier otro content-type que llegue al
manejador recibe 415.

**Corrección sobre la primera redacción de esta decisión**: el 415 no es alcanzable para los
content-types que más importan. Como muestra la medición de abajo, `x-www-form-urlencoded`,
`text/plain` y la ausencia de content-type los rechaza el framework con **403 antes de que el
manejador se ejecute**. El 415 solo se observa con un content-type que `checkOrigin` no vigila,
como `application/xml`. Los dos códigos son correctos y vienen de capas distintas; un test que
espere 415 para un aviso en formulario va a fallar.

**Medición** (POST a un endpoint real del deploy, con y sin cabecera `Origin`):

| Content-Type | Sin `Origin` | `Origin` ajeno |
|---|---|---|
| `application/json` | **pasa** | **pasa** |
| `application/x-www-form-urlencoded` | 403 | 403 |
| `text/plain` | 403 | 403 |
| (sin content-type) | 403 | — |

**Rationale**: el `checkOrigin` de Astro solo protege los content-types explotables por CSRF
desde un formulario cross-site. `application/json` no es uno de ellos, y es el que mandan los
proveedores de pago habituales. Por lo tanto **no hay que debilitar nada**: los formularios de
la feature conservan su protección CSRF intacta y los webhooks funcionan sin excepción alguna.

Exigir `application/json` explícitamente no es decorativo: es lo que convierte un
comportamiento que hoy es favorable en un contrato verificable. Un proveedor futuro que avise
por formulario será rechazado —con 403 del framework, no con nuestro 415— y el contrato deja
escrito que ese rechazo es esperado y que la salida no es aflojar `checkOrigin`, sino exigirle al
proveedor que avise en JSON o darle un manejador propio que verifique firma.

**Alternatives considered**:
- *Desactivar `checkOrigin` globalmente* — rechazado: expondría a CSRF los formularios de
  aprobación, de carga de historia y de baja publicitaria para no resolver ningún problema real.
- *Excluir la ruta del webhook del middleware de seguridad* — rechazado: Astro no ofrece
  exclusión por ruta para `checkOrigin`, y no hace falta.
- *Verificar `Origin` además de la firma* — rechazado por el Principio VII: ningún proveedor
  manda `Origin`, así que sería una comprobación que solo puede fallar.

---

## 2. Idempotencia del aviso de pago: la tabla manda, no el código

**Decision**: tabla `eventos_pago` con restricción única sobre `(proveedor, evento_id)`. El
manejador **verifica la firma primero**, y solo entonces **inserta** el evento; si la inserción
viola la unicidad, responde 200 y no hace nada más. Solo si la inserción tuvo éxito aplica el
efecto sobre el pedido.

**El orden entre verificar y registrar es una cuestión de seguridad, no de estilo.** Si un aviso
con firma inválida dejara fila "para tener rastro", cualquiera podría envenenar la clave de
idempotencia enviando un `evento_id` inventado: el aviso legítimo que llegara después quedaría
tratado como duplicado y **el pago nunca se aplicaría**. Por eso un rechazo por firma o por
content-type no deja fila en `eventos_pago`.

**Rationale**: la idempotencia queda garantizada por una restricción de base de datos, no por
una comprobación previa en el código. Un `select` antes del `insert` tiene una ventana de carrera
entre los dos; la restricción única no la tiene. Es la misma técnica atómica que la feature 001
ya usa para la primera apertura (`research.md` #5 de la 001), aplicada al dinero.

Responder 200 ante un duplicado —y no 409— es deliberado: los proveedores reintentan ante
cualquier respuesta que no sea 2xx, así que un 409 provocaría reintentos infinitos de un evento
que ya está procesado.

**Evento sin pedido**: un aviso cuyo pedido no existe —pedido borrado, o un entorno apuntando a
la base de otro— se **rechaza con 404 y queda registrado** con `resultado = 'sin_pedido'`,
visible en la cola operativa. El spec listaba también un caso de "asociación diferida" (el aviso
que llega antes de que el pedido exista); ese caso no puede ocurrir, porque el pedido nace antes
de ir a pagar (decisión 4), y dejarlo abierto obligaría a una cola de reintentos que nadie va a
construir. Se resuelve por rechazo explícito y visible, no por una promesa de reparación
automática.

**Alternatives considered**:
- *Comprobar si el pedido ya está pagado y salir* — rechazado: no cubre dos avisos distintos del
  mismo pago, ni dos entregas simultáneas del mismo evento.
- *Bloqueo a nivel de aplicación* — rechazado por complejidad innecesaria sobre una restricción
  que la base ya ofrece gratis.
- *Insertar el evento antes de verificar la firma* — rechazado por el envenenamiento de la clave
  de idempotencia descrito arriba.
- *Asociación diferida del aviso huérfano* — rechazado: requiere una cola de reintentos para un
  caso que el orden de la decisión 4 vuelve imposible.

---

## 3. Adaptador de pago con proveedor simulado

**Decision**: `src/lib/pagos/` con una interfaz y un archivo por proveedor, al mismo patrón que
`src/bloques/registro.ts`:

```
iniciarCobro(pedido) → { urlDeCobro }
interpretarAviso(request) → { eventoId, pagoId, pedidoId, monto, moneda, estado }
```

`simulado.ts` es el primer y único proveedor al cierre de esta feature. Firma sus avisos con
HMAC usando un secreto local, de modo que el camino de verificación de firma se ejercita de
verdad en simulación y no queda como código sin probar hasta el día que se conecte el proveedor
real.

**Rationale**: permite recorrer la feature completa sin cuenta en ningún proveedor, sin túnel y
sin tarjeta de prueba, que es el requisito explícito del spec (FR-007). Y cumple el Principio
VII: el flujo de pedido no se acopla a ningún proveedor concreto.

La decisión de qué proveedor real conectar (Stripe, Mercado Pago u otro) depende del país y de
la situación fiscal del negocio, y queda fuera de esta feature por diseño, no por olvido.

**Alternatives considered**:
- *Integrar Stripe en modo test desde el principio* — rechazado: obliga a tener cuenta, y
  acopla las decisiones de diseño a la forma de un proveedor antes de saber si es el elegido.
- *Simular sin firma* — rechazado: dejaría la verificación de firma sin ejercitar hasta
  producción, que es exactamente donde no se quiere descubrir que está mal.

---

## 4. El pedido nace antes de ir a pagar

**Decision**: el pedido se crea en estado `iniciado` **antes** de redirigir al cobro, con su
identificador ya asignado. El aviso de pago lo pasa a `pagado`.

**Rationale**: el Principio VII exige que el pago quede registrado antes de cualquier acción
derivada, y eso solo es posible si el pedido ya existe cuando llega el aviso. Resuelve también
el caso límite del aviso que llega antes de que el comprador vuelva del proveedor: el pedido ya
está ahí esperando.

Un pedido `iniciado` que nunca se paga es basura inofensiva y recuperable: aparece en la cola
operativa como abandonado, nunca como venta.

**Alternatives considered**:
- *Crear el pedido al recibir el aviso de pago* — rechazado: si el aviso se pierde, no queda
  rastro de que alguien intentó comprar, y el Principio VII prohíbe exactamente eso.

---

## 5. El tope de 4,5 MB de Vercel contra la foto de 10 MB

**Decision**: reducir la foto **en el navegador** antes de subirla (canvas, vanilla, sin
librería), y usar `sharp` en el servidor como autoridad final del formato y las dimensiones.
Sin JavaScript, el formulario acepta la subida directa con un tope de 4 MB y un mensaje claro.

**Inconsistencia detectada y resuelta**: la primera redacción de esta decisión rechazaba "bajar
el tope declarado a 4 MB" y a la vez fijaba 4 MB en el camino sin JavaScript, dejando al
comprador con dos topes distintos según lo que ejecute su navegador —y el más bajo justo en el
camino que el Principio I protege. Se resuelve declarándolo explícitamente, y en los dos
documentos: **hasta 10 MB con JavaScript** (la foto se reduce antes de salir del dispositivo) y
**hasta 4 MB sin JavaScript** (tope real de la plataforma, con un mensaje que explica cómo
continuar). No es el mismo límite disfrazado: es un límite de plataforma que el navegador puede
sortear reduciendo antes de subir, y el formulario lo dice en vez de fallar sin explicación.

**Rationale**: las funciones de Vercel limitan el cuerpo de una petición a 4,5 MB, así que una
foto de 10 MB de un celular moderno **no puede llegar** al endpoint. El spec admite originales
de hasta 10 MB (FR-018) y exige no almacenarlos (FR-038); reducir antes de subir satisface las
dos cosas y además hace la subida mucho más rápida en la red del comprador.

`sharp` sigue siendo la autoridad porque no se puede confiar en lo que llega del cliente: valida
que sea una imagen real, normaliza dimensiones, convierte el formato y elimina los metadatos
(FR-039), incluida la ubicación GPS que traen las fotos de celular.

El costo en JavaScript cae en las páginas de carga, no en `/r/[slug]`. El presupuesto duro de
100 KB de las Reglas de Calidad aplica a la página del regalo, que sigue en cero añadido.

**Alternatives considered**:
- *URL de subida firmada directa a Supabase Storage* — rechazado para esta vuelta: evita el
  tope de Vercel, pero mete un segundo camino de escritura al bucket y obliga a un paso
  posterior de descarga, reducción y reemplazo. Es la salida si la reducción en el navegador
  resulta insuficiente; queda anotada, no descartada.
- *Bajar el tope declarado a 4 MB* — rechazado: rechazaría fotos normales de celular, que es
  justo el caso de uso central.

---

## 6. Fotos privadas: firma por render, resuelta fuera del motor de bloques

**Decision**: bucket `fotos` privado. El contenido del regalo guarda la **ruta** de storage. Las
direcciones de acceso se firman en cada render del servidor, en una sola llamada por lote
(`createSignedUrls`), dentro de `src/lib/regalos.ts`. Los componentes de bloque siguen
recibiendo `foto.url` ya resuelto y **no se modifican**.

**Rationale**: esto revisa de frente la decisión **#6 de `specs/001-pagina-regalo/research.md`**,
que había descartado las direcciones firmadas con este argumento: una firma vencida rompería un
QR ya impreso, violando el Principio VI. El argumento era correcto para el diseño que evaluaba
—firmar una vez y guardar o imprimir esa dirección— y es incorrecto para este: la firma nace y
muere dentro del request que la usa. Nunca se persiste, nunca se imprime, nunca se comparte. El
QR apunta a `/r/[slug]`, que no lleva firma alguna y sigue siendo estable de por vida.

Resolverlo en `src/lib/regalos.ts` y no en `Galeria.astro` / `Momento.astro` es lo que hace
compatible esta decisión con la restricción de no tocar el motor: la capa de datos entrega el
contenido ya resuelto, y el motor sigue sin saber si detrás hay un bucket privado, uno público o
un enlace externo.

**Costo medido a vigilar**: agrega una ida y vuelta a Supabase en el render del regalo, en
secuencia con la consulta que ya existe. `lcp.spec.ts` de la feature 001 es el gate que lo
mantiene honesto: si rompe el presupuesto de 2,5 s en 3G, la mitigación es firmar con vigencia
amplia y apoyarse en la caché del navegador, no volver al bucket público.

**Alternatives considered**:
- *Ruta propia que haga de intermediaria y sirva los bytes* — rechazado: la dirección sería
  estable y cacheable por CDN, lo que es mejor para el LCP, pero sería también una dirección
  permanente que funciona para cualquiera que la tenga. FR-020 pide lo contrario.
- *Volver al bucket público* — rechazado: es lo que había y contradice el Principio V.
- *Firmar dentro de cada componente de bloque* — rechazado: rompería la restricción de no
  modificar el motor y metería acceso a infraestructura dentro de un bloque de presentación.

---

## 7. `foto.ruta`: un campo nuevo, sin tocar el que ya existe

**Decision**: agregar `ruta` como campo **opcional** al objeto `foto` del esquema de contenido
v1. `url` se mantiene, con su significado actual, para siempre. La resolución prefiere `ruta`
cuando está presente y cae a `url` cuando no.

**Rationale**: el Principio VI prohíbe renombrar o eliminar un campo existente; solo admite
agregados. El fixture dorado `tests/fixtures/contenido-v1.json` está congelado y no incluye
`ruta`, así que el renderer tiene que seguir funcionando sin ese campo —y
`compatibilidad-versiones.spec.ts` lo verifica en cada corrida. El seed de demo usa enlaces
externos en `url`, y debe seguir funcionando igual.

No se sube a `v: 2`. Agregar un campo opcional a un tipo existente es exactamente la evolución
que el esquema v1 admite; una versión nueva se reserva para un cambio que v1 no pueda expresar.

**Alternatives considered**:
- *Reinterpretar `url` como ruta cuando no empieza con `http`* — rechazado: cambia el
  significado de un campo existente sin cambiar su nombre, que es la peor variante de lo que el
  Principio VI prohíbe. Rompería el fixture dorado de forma silenciosa.
- *Crear `v: 2`* — rechazado: desproporcionado, y obligaría a mantener dos ramas de esquema por
  un campo opcional.

---

## 8. Borrador: esquema propio, un paso por petición, autoguardado sin JavaScript

**Decision**: `pedidos.borrador` es un `jsonb` con su **propio** esquema zod
(`src/lib/borrador/esquema.ts`), separado del esquema de contenido del motor. El borrador admite
todo incompleto. Cada paso del formulario es un `<form>` que hace POST, guarda y redirige al
paso siguiente.

**Rationale**: "un paso = una petición guardada" es autoguardado real sin una línea de
JavaScript: el comprador que cierra la pestaña ya tiene guardado todo lo que completó hasta el
paso anterior. Encaja con el Principio I —la degradación sin JS ya es una propiedad verificada
del proyecto— y mantiene el formulario utilizable en la peor red.

Dos esquemas y no uno porque validan cosas distintas en momentos distintos: el borrador valida
"esto es guardable" y el contenido valida "esto es entregable". Mezclarlos obligaría a que el
esquema del motor aceptara basura a medio escribir, lo que lo volvería inútil como garantía de
lo que se entrega.

Sobre esa base se puede sumar, como mejora opcional, un guardado dentro del paso mientras el
comprador escribe. No es requisito y no cambia el modelo.

**Alternatives considered**:
- *Formulario de una sola página con guardado por JavaScript* — rechazado: sin JS no guarda
  nada, y el comprador ya pagó. Es el peor momento del producto para perder datos.
- *Un esquema único con todos los campos opcionales* — rechazado: haría imposible que el
  esquema de contenido garantice que un regalo entregado está completo.

---

## 9. El slug se asigna una vez y sobrevive a las correcciones

**Decision**: el regalo y su slug nacen en el **primer** envío de la historia. Las correcciones
posteriores reemplazan el `contenido` del regalo mientras siga en revisión, y nunca el slug ni
la fila de `slugs`.

**Rationale**: el Principio III exige corregir sin límite y el Principio VI exige que la ruta
pública sea estable de por vida y que un identificador entregado no se reasigne. Las dos cosas
conviven si el slug se asigna temprano y el contenido es lo único mutable, y solo antes de
publicar.

El doble envío se resuelve con un **reclamo atómico sobre el pedido antes de crear el regalo**:
una actualización condicionada a que el pedido todavía no tenga regalo. El que gana el reclamo
crea el regalo; el que pierde devuelve el que ya existe.

**Corrección**: la primera redacción atribuía a la restricción única sobre `pedidos.regalo_id`
una garantía que no da. Esa restricción se evalúa *después* de que el regalo ya existe, así que
dos envíos en paralelo crean dos regalos y solo el segundo falla al reclamar el pedido — dejando
un regalo huérfano con un slug que el Principio VI prohíbe reutilizar para siempre. El mecanismo
que de verdad garantiza FR-021 es el reclamo atómico previo a la creación; la restricción única
queda como red de contención, no como defensa principal.

**Alternatives considered**:
- *Crear el regalo solo al aprobar* — rechazado: la feature 001 sirve `/revisar/[id]` a partir
  de un regalo existente, así que no habría nada que revisar.
- *Un regalo nuevo por cada corrección* — rechazado: generaría slugs huérfanos y rompería la
  regla de no reasignar identificadores.

---

## 10. Tablas nuevas, ninguna columna de comercio en `regalos`

**Decision**: cuatro tablas nuevas —`pedidos`, `pagos`, `eventos_pago`, `avisos`— con la
referencia en `pedidos.regalo_id → regalos.id`. `regalos` no cambia.

**Rationale**: es el Principio II aplicado al dinero. El motor no sabe de ocasiones; tampoco
tiene por qué saber de pedidos, cobros ni campañas. La dirección de la referencia importa: si
`regalos` apuntara a `pedidos`, el motor quedaría acoplado al comercio y un regalo de prueba
creado a mano dejaría de ser válido.

**Alternatives considered**:
- *Agregar `pedido_id`, `monto` y `estado_pago` a `regalos`* — rechazado por el Principio II, y
  porque rompería los helpers de test de la feature 001, que crean regalos sin pedido.

---

## 11. Compuerta del QR: la emisión se niega sola

**Decision**: el generador de QR lee `SITIO_URL` y **se niega** a emitir si el host termina en
`vercel.app`, es `localhost` o es una dirección IP. Solo emite con la marca explícita de
simulación, y en ese caso estampa la palabra "SIMULACIÓN" sobre la tarjeta generada.

**Rationale**: es la Compuerta de Aceptación 16, hecha código. Posponer la compra del dominio es
seguro solo si es **imposible** imprimir por accidente un QR que apunte al deploy interno. Un QR
impreso no se actualiza nunca, y ese error no tiene corrección posible.

Estampar la marca sobre la imagen, y no solo en el nombre del archivo, es deliberado: un archivo
se renombra o se reenvía sin su nombre, una marca impresa sobre la tarjeta no se pierde.

**Alternatives considered**:
- *Advertir en consola y emitir igual* — rechazado: una advertencia que no bloquea es una
  advertencia que alguien va a pasar por alto el día de apuro.
- *Comparar contra una lista de dominios permitidos* — rechazado: habría que mantenerla, y el
  criterio real es simplemente "no es un deploy de simulación".

---

## 12. Adaptador de correo con proveedor de consola, y la tabla como registro

**Decision**: `src/lib/correo/` con la misma forma que el adaptador de pago. Proveedor `consola`
para desarrollo y simulación; `resend` para producción. Todo aviso se registra en la tabla
`avisos` con su estado, cualquiera sea el proveedor.

**Rationale**: permite recorrer la feature sin cuenta de correo (FR-028) y hace que FR-029 sea
verificable: una falla de envío queda en la tabla con su estado, el pedido no se bloquea, y hay
de dónde reintentar. El registro es independiente del proveedor porque el requisito es del
negocio, no del proveedor.

**Alternatives considered**:
- *Usar Resend en modo prueba* — rechazado: necesita cuenta y clave, lo que contradice el
  requisito de correr la simulación completa sin proveedores.
- *Solo escribir a consola, sin tabla* — rechazado: no deja rastro reintentable y haría FR-029
  imposible de verificar.
- *Reintento automático por tarea programada* — rechazado para esta vuelta: agrega una
  superficie que no se puede ejercitar en la simulación y arriesga avisos duplicados.

**Reintento**: manual, desde la cola operativa. Cada aviso fallido se muestra con un botón que
lo reencola. FR-029 pide que la falla "quede registrada para poder reintentarse", no que el
sistema reintente solo. Con el volumen de esta etapa, un reintento automático es infraestructura
que no se puede ejercitar a mano y que puede duplicar mensajes; un botón es verificable y
suficiente. Queda anotado como el primer candidato a automatizar cuando el volumen lo
justifique.

---

## 13. Celular opcional y baja que borra

**Decision**: `pedidos.celular` nullable, `pedidos.consentimiento_publicidad` booleano con su
fecha, y un token de baja no adivinable que habilita una página `/baja/[token]`. La baja hace
`UPDATE` poniendo el celular en nulo, el consentimiento en falso y la fecha de baja en el
instante en que ocurrió.

**La fecha de baja se guarda; el número no.** Parece contradictorio con "la baja borra", pero no
lo es: lo que el Principio V obliga a borrar es el dato personal, y una fecha sin número no
identifica a nadie. Guardarla es lo que permite demostrar que la baja se honró, que es
precisamente la obligación que acompaña al derecho de darse de baja.

**Rationale**: la excepción del Principio V (constitución v1.3.0) exige que el dato sea
opcional, con propósito declarado al pedirlo, con consentimiento no pre-aceptado y con una vía
de baja que **borre** el número, no que lo marque. Guardar la fecha del consentimiento es lo que
permite demostrar, más adelante, que existió.

Un token propio para la baja, en vez del identificador del pedido, evita que el enlace de baja
—que va dentro de mensajes publicitarios— sea también la credencial que da acceso al pedido y a
la historia completa.

**Alternatives considered**:
- *Marcar `baja = true` y conservar el número* — rechazado explícitamente por la constitución.
- *Usar el id del pedido como enlace de baja* — rechazado: convertiría cada mensaje publicitario
  en una filtración de la credencial del pedido.

---

## 14. Cola operativa: una ruta, no un panel

**Decision**: una sola página `/pedidos`, con **su propia** compuerta derivada de `OPS_SECRET`,
que lista pedidos pagados sin regalo entregado, pedidos iniciados que nunca se pagaron, y avisos
fallidos con su botón de reintento.

**Corrección**: la primera redacción la protegía con la compuerta de modo interno
(`MODO_INTERNO`). Eso es un error con fecha de detonación conocida: ese flag se apaga
exactamente el día que la landing se abre al público, y en ese momento `/pedidos` —que muestra
correos de compradores y su estado de pago— quedaría accesible para cualquiera. La protección de
la cola tiene que ser independiente de la del deploy interno, porque sus ciclos de vida son
opuestos.

**Rationale**: FR-008 y el Principio VII piden visibilidad, no administración. El panel completo
está explícitamente fuera de alcance. Reutilizar la compuerta de modo interno evita inventar un
segundo mecanismo de autenticación para esta feature.

**Alternatives considered**:
- *Panel con login* — rechazado por alcance.
- *Consultas SQL a mano* — rechazado: algo que requiere abrir una consola no se mira, y un
  pedido que nadie mira es el pedido perdido que el Principio VII prohíbe.

---

## 15. El bucket se declara como infraestructura

**Decision**: declarar `fotos` con `public = false` en `supabase/config.toml`, y dejar
`npm run bucket:fotos` como verificación idempotente para el proyecto remoto.

**Rationale**: hoy el bucket existe porque un test lo creó, y estuvo público hasta que se corrió
un script. Un estado de infraestructura que depende de que alguien se acuerde de ejecutar algo
no es un estado, es una casualidad.

---

## 16. Alcance del borrado

**Decision**: borrar un pedido alcanza su fila, su borrador, sus fotos en el bucket, sus pagos,
sus eventos de pago, sus avisos, su contacto y su consentimiento, más el regalo asociado con sus
aperturas si ya nació. La fila de `slugs` **no** se borra nunca.

**Las fotos se mueven al enviar la historia.** Mientras el pedido está en borrador viven bajo
`pedidos/{pedido_id}/`; al nacer el regalo se mueven a `regalos/{regalo_id}/`, que es el prefijo
que el borrado de la feature 001 ya barre. Sin ese movimiento, borrar un regalo por la vía
existente dejaría sus fotos en el bucket para siempre: `eliminar.ts` lista `regalos/{id}/` y no
sabría nada de `pedidos/{id}/`. Mover, en vez de extender el contrato de borrado de la 001, es lo
que mantiene ese contrato intacto y hace que empiece a cubrir las fotos nuevas sin tocarlo.

**Quién dispara el borrado** (FR-030): una ruta propia de esta feature, autenticada con el mismo
`OPS_SECRET` que la de la 001, que opera sobre el pedido. El `DELETE` de la 001 opera sobre un
regalo y no conoce pedidos, pagos ni avisos, así que no alcanza para FR-030; borrar el pedido sí
alcanza el regalo, porque la referencia va en esa dirección.

**Rationale**: el Principio V exige borrado real en base y en storage. El Principio VI exige que
un slug entregado no se reasigne jamás, y la feature 001 ya resolvió esa tensión conservando la
fila de `slugs` huérfana; `eliminar.spec.ts` lo verifica. Esta feature extiende el alcance a las
tablas nuevas sin cambiar esa regla.

---

## 17. Presupuesto de JavaScript, por página

**Decision**: `/r/[slug]` y `/revisar/[id]` no reciben ni un byte nuevo de JavaScript. Las
páginas de esta feature —landing, carga de historia, cola operativa— admiten JavaScript vanilla
donde mejore la experiencia, con todo funcionando sin él.

**Rationale**: el presupuesto duro de 100 KB de las Reglas de Calidad protege la página del
regalo, que es el producto, y `presupuesto-js.spec.ts` lo vigila. Las páginas de compra las usa
el comprador, en su propia red, sin la urgencia del momento de la apertura. Son dos contextos
distintos y merecen dos presupuestos distintos.

---

## 18. El precio es configuración, no código

**Decision**: precio y moneda como variables de entorno, leídas en runtime con el mismo patrón
`import.meta.env.X ?? process.env.X` que ya usan `src/lib/supabase.ts` y `src/lib/acceso.ts`.

**Rationale**: el patrón no es estilístico. Escrito solo como `import.meta.env.X`, Vite reemplaza
el valor en tiempo de compilación, de modo que cambiar el precio exigiría reconstruir y
redesplegar. Ya se verificó ese comportamiento al construir la compuerta de acceso interno.

Cada pago guarda el monto y la moneda con los que se cobró, así que un cambio de precio no
reescribe la historia de lo ya vendido.

---

## 19. Estrategia de pruebas

**Decision**: Playwright, igual que la feature 001, con un test de recorrido completo
(`venta-completa.spec.ts`) que atraviesa landing → cobro simulado → carga en varias sesiones →
envío → revisión → aprobación → regalo público → QR generado.

Más los gates por requisito: idempotencia con avisos duplicados y simultáneos, firma inválida
rechazada, content-type no-JSON rechazado, borrador retomado tras cerrar la sesión, doble envío
que produce un solo regalo, foto reducida y sin metadatos, foto inaccesible sin estar viendo el
regalo, compra sin celular, baja que borra el número, QR que se niega a emitirse sin dominio
propio, y cola operativa que muestra el pedido pagado sin regalo.

**Criterios sin gate automatizado**: SC-001 (entender la propuesta en 30 s), SC-002 (pagar en
3 min), SC-003 (cargar la historia en 20 min) y SC-008 (QR impreso legible 10 de 10) son
manuales por naturaleza: miden comprensión humana y papel impreso. Quedan en `quickstart.md`
como verificación manual, declarados como tales en vez de fingir cobertura automatizada.

**Rationale**: la simulación de venta tiene que ser un test y no un documento. Un checklist
manual se rompe en silencio; un test falla. Es el mismo razonamiento que llevó a
`compatibilidad-versiones.spec.ts` en la feature 001, que es lo único que hace *verificable* el
Principio VI en vez de solo declarado.

---

## 20. Lo que esta feature cambia de la feature 001, y por qué es seguro

**Decision**: se tocan exactamente dos cosas del código existente:

1. `src/lib/contenido/esquema.ts` y `tipos-bloque.ts` — se agrega `foto.ruta` opcional
   (decisión 7).
2. `src/lib/regalos.ts` — resuelve `ruta` a dirección firmada antes de entregar el contenido
   (decisión 6).

3. `src/pages/api/regalos/[id]/aprobar.ts` — emite el aviso de aprobación tras registrarla.

**Corrección**: la primera redacción declaraba intocables "las rutas de API de la 001", lo que
volvía FR-026 imposible de cumplir: el tercer aviso es la confirmación de aprobación, la
aprobación ocurre únicamente en `aprobar.ts`, y ningún otro punto del sistema se entera de que
pasó. Las alternativas —detectar la aprobación por sondeo desde la cola, o por una tarea
programada— agregan una superficie entera para evitar tres líneas en el único lugar que ya tiene
el dato. El cambio es aditivo: no altera la transición de estado ni la respuesta del endpoint, y
`revision-y-aprobacion.spec.ts` de la feature 001 es el gate que lo verifica.

**No** se tocan: los ocho componentes de `src/bloques/`, `registro.ts`, `RegaloLayout.astro`,
`src/pages/r/[slug].astro`, `src/pages/revisar/[id].astro`, `api/abrir/[slug].ts`,
`api/regalos/[id]/eliminar.ts`, los temas, ni el fixture dorado.

**Rationale**: la restricción es no modificar el motor de bloques, y ninguno de los dos archivos
tocados forma parte de él: uno es el esquema de datos, otro la capa de acceso y el tercero un
endpoint al que solo se le agrega un efecto. Los 28 tests de la feature 001 son el gate: si
alguno rompe, el cambio salió del perímetro acordado.

Sobre ese número: la suite ejecuta **28 tests a partir de 26 llamadas a `test()`**, porque
`contraste-aa.spec.ts` genera un test por tema recorriendo los tres archivos de tokens. Los dos
números son correctos y no hay nada que reconciliar: el gate es el de 28 ejecutados.


---

## 21. El mínimo para poder enviar una historia

**Decision**: una historia es enviable con **tema + nombre del destinatario + al menos un bloque
de contenido** (un momento, una carta, una galería, una canción, una pregunta o un cierre). Todo
lo demás es opcional.

**Rationale**: FR-011 exige indicar con precisión qué falta, y eso es imposible si el mínimo no
está escrito en ninguna parte. El spec lo delegaba a "lo mínimo para que el regalo tenga
sentido", que no es verificable.

El mínimo es deliberadamente bajo por el Principio II: el motor acepta recetas con cualquier
cantidad de bloques de cada tipo, incluido cero, y exigir una receta rica acá sería meter una
opinión editorial dentro de la puerta de entrada. Pero no puede ser vacío: un regalo sin un solo
bloque de contenido es una página en blanco, y eso el Principio I lo declara defecto bloqueante.

**Alternatives considered**:
- *Exigir portada, un momento y una carta* — rechazado: convierte una preferencia editorial en
  una regla del sistema, y bloquea un regalo legítimo que sea solo una carta.
- *Permitir enviar cualquier cosa* — rechazado: habilita entregar una página en blanco.

---

## 22. Registro de la emisión del QR

**Decision**: dos columnas en `pedidos` —cuándo se emitió el QR y si fue una emisión de
simulación—, sin tabla nueva.

**Rationale**: sin esto no queda registro de qué soporte físico salió, cuándo, ni si lo que se
imprimió era una tarjeta de simulación. Para un negocio cuyo entregable es un objeto impreso que
no se puede corregir, eso es un agujero operativo y no un detalle: es exactamente el "pedido
pagado sin regalo entregado" que el Principio VII obliga a hacer visible, en su último tramo.

Dos columnas y no una tabla porque un pedido corresponde a un único regalo (Assumptions de la
feature 001) y, por lo tanto, a una única tarjeta. Una tabla de emisiones solo haría falta el día
que se reimprima una tarjeta perdida, y ese día el dato que hay que agregar es otro.

---

## 23. Discrepancia entre el monto cotizado y el informado

**Decision**: el monto que vale es **el que informa el proveedor**, porque es el que el comprador
pagó de verdad. Una discrepancia contra el precio cotizado al iniciar el pedido **no bloquea el
pago ni frena la entrega**: se guardan los dos montos, el pedido sigue su curso y la discrepancia
aparece marcada en la cola operativa para que alguien la mire.

**Rationale**: las dos alternativas son peores que registrar y seguir. Bloquear el pedido ante
una discrepancia castiga al comprador por un desajuste que no provocó —el caso normal es un
cambio de precio entre que abrió la página y que terminó de pagar— y produce exactamente el
pedido pagado sin entregar que el Principio VII prohíbe dejar en silencio. Ignorar la
discrepancia, en cambio, deja al negocio cobrando de menos sin enterarse nunca.

Registrar los dos montos y marcarlo es lo único que respeta las dos cosas: el comprador recibe
lo que pagó, y el negocio se entera. Es la misma forma que ya tiene el resto de esta feature
ante lo inesperado: no frenar al comprador, hacerlo visible en la cola.

**Alternatives considered**:
- *Rechazar el pago y devolver el dinero* — rechazado: convierte un cambio de precio en una
  venta perdida y un reembolso, por un caso que casi siempre es benigno.
- *Confiar en el monto cotizado* — rechazado: el dinero que entró es el del proveedor, y
  anotar otro número es tener la contabilidad mal a propósito.
- *No guardar el cotizado* — rechazado: sin los dos montos la discrepancia es indetectable.
