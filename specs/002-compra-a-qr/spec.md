# Feature Specification: De la Compra al QR

**Feature Branch**: `002-compra-a-qr`

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "Feature: de la compra al QR. Hoy el motor del regalo funciona
(feature 001) pero no existe forma de vender: no hay landing, ni cobro, ni manera de que un
comprador cargue su historia, ni generación del QR. Esta feature cubre exactamente ese camino:
de un visitante que llega al sitio a una tarjeta con QR lista para imprimir. Fuera de alcance:
redacción asistida por IA, panel de administración completo, catálogo de múltiples ediciones
temáticas, y cualquier cambio al motor de bloques de la feature 001."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El visitante entiende la propuesta y paga (Priority: P1)

Alguien llega al sitio sin saber qué se vende. Ve qué es el producto, ve ejemplos reales de
regalos ya hechos, entiende qué recibe y cuánto cuesta, y paga. Su pago queda registrado como
un pedido antes de que el sistema haga cualquier otra cosa.

**Why this priority**: sin esto no hay ingreso. Es el único punto del producto donde entra
dinero, y es el que convierte un motor que funciona en un negocio.

**Independent Test**: se puede probar completamente abriendo la página de inicio, recorriendo
los ejemplos, completando un pago en el entorno de simulación, y verificando que quedó un
pedido pagado con su comprobante, accesible por su propio enlace.

**Acceptance Scenarios**:

1. **Given** un visitante que nunca vio el producto, **When** abre la página de inicio,
   **Then** ve qué es el regalo, al menos un ejemplo real navegable de punta a punta, el
   precio, y una sola acción clara para comprar.
2. **Given** un visitante decidido a comprar, **When** completa el pago, **Then** el sistema
   registra el pedido como pagado y le muestra el enlace con el que va a cargar su historia.
3. **Given** un pago que el proveedor confirma, **When** el sistema recibe ese aviso dos veces
   —o diez—, **Then** el pedido queda pagado una sola vez y no se duplica ni el pedido ni
   ninguna acción derivada.
4. **Given** un pago que el proveedor nunca confirma, **When** el comprador vuelve a su enlace,
   **Then** ve el estado real de su pedido —pendiente de pago— y nunca una pantalla que diga
   que todo salió bien.
5. **Given** un aviso de pago que no se puede verificar como auténtico, **When** llega al
   sistema, **Then** se rechaza y no modifica ningún pedido.
6. **Given** un pedido pagado, **When** el comprador abre el enlace de otro pedido que no es
   el suyo, **Then** no ve ni el contenido ni el estado de ese pedido ajeno.

---

### User Story 2 - El comprador carga su historia sin miedo a perderla (Priority: P1)

El comprador, ya pagado, entra a su enlace y cuenta su historia por pasos: para quién es y con
qué clima visual, los momentos que quiere recordar, las fotos, la canción, la carta, las
preguntas, el cierre. Puede cerrar la pestaña en cualquier momento y volver más tarde sin haber
perdido nada. Cuando termina, envía, y ahí nace el regalo con su enlace de revisión.

**Why this priority**: es tan P1 como el pago. Un pago sin esta historia es plata cobrada sin
producto entregado. Es la pieza que convierte un pedido en un regalo.

**Independent Test**: se puede probar completamente partiendo de un pedido pagado, cargando una
historia completa en varias sesiones separadas —cerrando la pestaña entre pasos—, enviándola, y
verificando que el regalo resultante se ve en su enlace de revisión con exactamente el contenido
cargado.

**Acceptance Scenarios**:

1. **Given** un pedido pagado, **When** el comprador abre su enlace, **Then** puede empezar a
   cargar su historia sin crear cuenta, sin contraseña y sin registro previo.
2. **Given** un comprador a mitad de la carga, **When** cierra la pestaña y vuelve horas o días
   después al mismo enlace, **Then** encuentra todo lo que había escrito y subido, y continúa
   desde donde estaba.
3. **Given** un comprador cargando su historia, **When** sube fotos, **Then** las ve
   incorporadas a su historia y puede quitarlas o reordenarlas antes de enviar.
4. **Given** una historia incompleta, **When** el comprador intenta enviarla, **Then** el
   sistema le indica exactamente qué falta, en lenguaje claro, y no la envía.
5. **Given** una historia completa, **When** el comprador la envía, **Then** nace un regalo en
   estado "en revisión" con su enlace de revisión, y el comprador recibe ese enlace.
6. **Given** un regalo ya nacido y todavía en revisión, **When** el comprador quiere corregir
   algo, **Then** puede volver a su carga, cambiar lo que quiera cuantas veces quiera, y
   reenviar; el enlace público del regalo no cambia nunca entre correcciones.
7. **Given** un regalo ya aprobado y publicado, **When** el comprador intenta modificar su
   historia, **Then** el sistema no lo permite y explica por qué: lo entregado es inmutable.
8. **Given** un comprador que sube una foto que no es una imagen, o que pesa más de lo
   admitido, **Then** el sistema la rechaza con un mensaje claro y conserva intacto todo el
   resto de la carga.

---

### User Story 3 - El QR y la tarjeta lista para imprimir (Priority: P2)

Con el regalo aprobado, hace falta el soporte físico: un código QR que apunte al enlace público
del regalo, y una tarjeta lista para llevar a imprimir.

**Why this priority**: es lo que cierra la entrega, pero el regalo ya es verificable sin él —el
enlace público funciona igual. Se puede vender la primera unidad resolviendo la impresión a
mano, no así el pago ni la carga de la historia.

**Independent Test**: se puede probar completamente tomando un regalo publicado, generando su
QR y su tarjeta, escaneando ese QR con un celular, y verificando que abre el regalo correcto.

**Acceptance Scenarios**:

1. **Given** un regalo publicado, **When** se genera su QR, **Then** el código apunta al enlace
   público de ese regalo y, escaneado con un celular, lo abre.
2. **Given** un QR generado, **When** se lo imprime en papel al tamaño previsto de la tarjeta,
   **Then** sigue siendo legible por un celular de gama baja con poca luz.
3. **Given** que la dirección pública del sitio todavía no es un dominio propio del negocio,
   **When** alguien intenta generar un QR destinado a una venta real, **Then** el sistema se
   niega y explica el motivo; solo permite generarlo marcado explícitamente como simulación.
4. **Given** una tarjeta generada, **When** se la revisa antes de imprimir, **Then** incluye el
   QR y el texto mínimo necesario para que quien la reciba entienda que debe escanearlo.
5. **Given** un regalo todavía no aprobado, **When** se intenta generar su QR vendible,
   **Then** el sistema se niega: no existe QR antes de la aprobación del comprador.

---

### User Story 4 - El comprador recibe avisos en su correo (Priority: P3)

El comprador recibe por correo el comprobante de su compra con el enlace para cargar la
historia, el enlace de revisión cuando su regalo está listo para revisar, y la confirmación
cuando lo aprueba.

**Why this priority**: mejora mucho la experiencia y reduce pedidos perdidos por un enlace
cerrado sin copiar, pero nada de esto bloquea una venta: los mismos enlaces se pueden entregar
a mano.

**Independent Test**: se puede probar completamente recorriendo una compra de punta a punta en
el entorno de simulación y verificando que cada uno de los tres avisos se emitió una sola vez,
con el enlace correcto dentro.

**Acceptance Scenarios**:

1. **Given** un pedido que acaba de quedar pagado, **When** se emite el comprobante de compra,
   **Then** contiene el enlace para cargar la historia y nada que el comprador no haya dado.
2. **Given** un regalo recién nacido en estado "en revisión", **When** se emite su aviso,
   **Then** contiene el enlace de revisión.
3. **Given** un comprador que aprueba su regalo, **When** se emite la confirmación, **Then**
   queda claro que el regalo está publicado y que su contenido ya no se puede cambiar.
4. **Given** que el envío de un aviso falla, **When** ocurre esa falla, **Then** el pedido no se
   pierde ni queda bloqueado, y la falla queda registrada para reintentarla.

---

### Edge Cases

- **Pago aprobado y comprador que nunca vuelve**: el pedido queda pagado y sin historia. Debe
  aparecer en una cola de pedidos pendientes, visible para el negocio, nunca trabado en
  silencio.
- **Dos avisos de pago simultáneos del mismo pago**: el pedido queda pagado una sola vez.
- **Aviso de pago que llega antes de que termine de registrarse el pedido**: el pago no se
  pierde; se asocia al pedido correcto cuando este existe.
- **Aviso de pago de un pedido que no existe**: se rechaza sin alterar nada y queda registrado.
- **Aviso de pago cuya autenticidad no se puede verificar**: se rechaza. La verificación no
  depende de desde dónde parece venir la petición, sino de poder comprobar que el aviso es
  auténtico.
- **Comprador que recarga el formulario de carga 30 veces**: el borrador no se corrompe ni se
  duplica, y no nacen regalos repetidos.
- **Comprador que envía su historia dos veces seguidas con doble clic**: nace un solo regalo,
  con un solo enlace público.
- **Carta de ~4.000 caracteres, nombre con emoji, foto cuadrada o muy vertical**: la carga los
  acepta y el regalo resultante los muestra igual que ya los muestra el motor (cubierto por la
  feature 001; acá se verifica que la carga no los altere ni los recorte en el camino).
- **Texto con etiquetas HTML dentro**: se guarda y se muestra como texto literal, en la carga y
  en el regalo.
- **Historia sin ningún momento, sin fotos y sin canción**: si lo cargado alcanza el mínimo
  para que el regalo tenga sentido, se envía igual; el motor ya admite recetas con cualquier
  cantidad de bloques de cada tipo.
- **Foto subida y después quitada antes de enviar**: no queda almacenada.
- **Pedido borrado a pedido del comprador**: se borra el pedido, su borrador, sus fotos y el
  regalo asociado si ya nació.
- **Comprador que adivina o manipula el enlace de otro pedido**: no accede.
- **Conexión que se corta mientras se sube una foto**: el resto del borrador queda intacto y la
  foto se puede volver a subir.

## Requirements *(mandatory)*

### Functional Requirements

**Venta y pago**

- **FR-001**: El sistema DEBE ofrecer una página de inicio que explique el producto, muestre al
  menos un ejemplo real navegable, indique el precio y ofrezca una única acción de compra.
- **FR-002**: El sistema DEBE registrar cada compra como un pedido, con su estado de pago, antes
  de ejecutar cualquier acción derivada de ese pago.
- **FR-003**: El sistema DEBE identificar cada pedido mediante un enlace propio, no adivinable,
  que es la única credencial que el comprador necesita para operar sobre su pedido. El sistema
  NO DEBE exigir cuenta, contraseña ni registro previo en ningún punto del recorrido.
- **FR-004**: El sistema DEBE tratar los avisos de pago como idempotentes: el mismo aviso
  recibido cualquier cantidad de veces produce un solo efecto.
- **FR-005**: El sistema DEBE verificar la autenticidad de cada aviso de pago antes de
  aplicarlo, y DEBE rechazar los que no pueda verificar. Esa verificación NO DEBE depender de
  la procedencia aparente de la petición.
- **FR-006**: El sistema NO DEBE almacenar datos de tarjeta. Solo puede guardar el
  identificador del pago en el proveedor, el monto y el estado.
- **FR-007**: El sistema DEBE funcionar de punta a punta sin cuenta en ningún proveedor de pago
  real, mediante un modo de simulación equivalente en comportamiento observable.
- **FR-008**: El sistema DEBE exponer, para el negocio, una lista de los pedidos pagados que
  todavía no derivaron en un regalo entregado.

**Carga de la historia**

- **FR-009**: El sistema DEBE permitir al comprador de un pedido pagado cargar su historia por
  pasos: destinatario y clima visual, momentos, fotos, canción, carta, preguntas y cierre.
- **FR-010**: El sistema DEBE guardar el avance de la carga de forma que el comprador pueda
  abandonarla y retomarla desde el mismo enlace sin perder nada de lo ya cargado.
- **FR-011**: El sistema DEBE aceptar una carga incompleta como borrador y DEBE exigir que esté
  completa únicamente al momento de enviarla, indicando con precisión qué falta.
- **FR-012**: El sistema DEBE traducir la historia enviada al formato de contenido versionado
  que ya consume el motor de la feature 001, sin modificar ese motor ni sus tipos de bloque.
- **FR-013**: El sistema DEBE crear, al enviar la historia, un regalo en estado "en revisión"
  con su enlace de revisión, y DEBE entregar ese enlace al comprador.
- **FR-014**: El sistema DEBE permitir al comprador corregir y reenviar su historia, sin
  límite de veces, mientras el regalo siga en revisión.
- **FR-015**: El enlace público del regalo NO DEBE cambiar entre correcciones ni reenvíos: se
  asigna una sola vez y es el mismo para siempre.
- **FR-016**: El sistema NO DEBE permitir modificar la historia de un regalo ya publicado.
- **FR-017**: El sistema DEBE tratar todo texto ingresado por el comprador como texto plano,
  tanto al guardarlo como al mostrarlo, sin interpretar HTML.
- **FR-018**: El sistema DEBE validar cada foto subida —que sea una imagen y que no exceda el
  peso admitido— y DEBE rechazar las que no cumplan sin afectar el resto del borrador.
- **FR-019**: El sistema DEBE permitir quitar y reordenar fotos antes de enviar, y NO DEBE
  conservar las fotos quitadas.
- **FR-020**: El sistema DEBE almacenar las fotos de forma que no sean accesibles por una
  dirección adivinable ni queden accesibles de forma permanente para quien no esté viendo el
  regalo. El acceso a una foto DEBE resolverse en el momento de mostrarla, y NO DEBE depender
  de una dirección de acceso guardada de antemano.
- **FR-021**: El sistema DEBE producir, ante un doble envío de la misma historia, un solo
  regalo con un solo enlace público.

**QR y tarjeta**

- **FR-022**: El sistema DEBE generar, a partir de un regalo publicado, un código QR que apunte
  al enlace público de ese regalo.
- **FR-023**: El sistema DEBE generar una tarjeta lista para imprimir que incluya el QR y el
  texto mínimo para que quien la recibe entienda que debe escanearlo.
- **FR-024**: El sistema NO DEBE emitir un QR destinado a una venta real mientras la dirección
  pública del sitio no sea un dominio propio del negocio. Solo DEBE permitir generarlo marcado
  explícitamente como simulación.
- **FR-025**: El sistema NO DEBE emitir el QR de un regalo que todavía no fue aprobado por su
  comprador.

**Avisos**

- **FR-026**: El sistema DEBE emitir tres avisos al comprador: comprobante de compra con el
  enlace de carga, aviso de regalo listo con el enlace de revisión, y confirmación de
  aprobación.
- **FR-027**: El sistema NO DEBE incluir en ningún aviso datos que el comprador no haya
  provisto.
- **FR-028**: El sistema DEBE funcionar de punta a punta sin cuenta en ningún proveedor de
  correo real, mediante un modo de simulación equivalente en comportamiento observable.
- **FR-029**: Una falla en el envío de un aviso NO DEBE bloquear ni perder el pedido, y DEBE
  quedar registrada para poder reintentarse.

**Transversales**

- **FR-030**: El sistema DEBE permitir borrar un pedido a pedido del comprador, incluyendo su
  borrador, sus fotos y el regalo asociado si ya nació.
- **FR-031**: El sistema NO DEBE permitir que el titular de un pedido acceda al pedido, al
  borrador ni al regalo de otro.
- **FR-032**: El sistema DEBE mostrar correctamente todas las páginas de esta feature en anchos
  de pantalla entre 320 y 1440 píxeles, sin generar scroll horizontal.
- **FR-033**: El sistema NO DEBE incorporar analítica de terceros en la página pública del
  regalo.

### Key Entities

- **Pedido**: la unidad comercial. Tiene un identificador propio no adivinable que funciona como
  credencial, un estado de pago, un contacto del comprador para los avisos, el borrador de la
  historia, y la referencia al regalo si ya nació. Es la única entidad que conoce el dinero.
- **Pago**: el registro de un cobro asociado a un pedido. Tiene el identificador del pago en el
  proveedor, el monto, la moneda y el estado. No contiene datos de tarjeta.
- **Borrador**: la historia en construcción de un pedido. Admite estar incompleto, cambia
  cuantas veces el comprador quiera mientras el regalo esté en revisión, y es distinto del
  contenido del regalo: el borrador es materia prima, el contenido es lo entregado.
- **Foto**: una imagen subida por el comprador, asociada a un borrador. Tiene una ubicación no
  adivinable y un texto alternativo.
- **Tarjeta**: el soporte imprimible derivado de un regalo publicado. Contiene su QR y el texto
  mínimo de instrucción. Puede estar marcada como simulación.
- **Aviso**: un mensaje emitido al comprador. Tiene un tipo (comprobante, revisión,
  aprobación), un destinatario, un estado de envío y el pedido al que corresponde.
- **Regalo** *(entidad existente, feature 001)*: esta feature lo crea y lo referencia, pero no
  cambia su forma, sus estados, sus tipos de bloque ni su enlace público.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Una persona que nunca vio el producto puede entender qué se vende y cuánto cuesta
  en menos de 30 segundos en la página de inicio.
- **SC-002**: Un comprador puede completar el pago en menos de 3 minutos desde que decide
  comprar.
- **SC-003**: Un comprador puede cargar una historia completa —destinatario, tres momentos,
  cinco fotos, una canción, una carta y un cierre— en menos de 20 minutos.
- **SC-004**: Una carga interrumpida y retomada en otra sesión conserva el 100% de lo ya
  cargado, en 20 de 20 intentos.
- **SC-005**: Una venta completa —desde la página de inicio hasta el QR generado y escaneado—
  se puede recorrer de punta a punta en el entorno de simulación, sin cuenta en ningún
  proveedor de pago ni de correo, y sin dominio propio.
- **SC-006**: 20 pagos confirmados por duplicado producen 20 pedidos pagados, nunca 40, y
  ninguna acción derivada duplicada.
- **SC-007**: El 100% de los pedidos pagados sin regalo entregado aparece en la lista de
  pendientes del negocio.
- **SC-008**: El QR impreso al tamaño de la tarjeta se escanea con éxito en 10 de 10 intentos,
  desde un celular de gama baja, con iluminación de interior.
- **SC-009**: Ningún QR vendible puede generarse mientras la dirección pública del sitio no sea
  un dominio propio: el intento falla en 10 de 10 ocasiones.
- **SC-010**: Todas las páginas de esta feature se muestran sin scroll horizontal en anchos
  entre 320 y 1440 píxeles.
- **SC-011**: Una foto subida no es accesible por nadie que no esté viendo el regalo al que
  pertenece, verificado intentando acceder a su ubicación sin estar mirando ese regalo.
- **SC-012**: 20 compras de prueba completas, cada una con una historia distinta, recorren el
  camino entero sin intervención manual y sin fallos.

## Assumptions

- **Un solo producto, un solo precio.** No hay catálogo, ni variantes, ni cupones, ni
  suscripciones. El precio es un valor configurable del negocio.
- **El entregable es un archivo imprimible, no una tarjeta física enviada.** Esta feature no
  incluye logística, envío ni dirección postal; por eso tampoco recoge domicilio del comprador
  (Principio V: datos mínimos). Imprimir y entregar la tarjeta queda del lado de quien vende.
- **El contacto del comprador es un correo electrónico**, el único dato personal que se recoge
  además de la historia.
- **Los regalos nacen sin fecha de expiración** —vigencia permanente—, coherente con que lo
  entregado es inmutable. La feature 001 ya hace cumplir una expiración si existe.
- **El límite de fotos por regalo es 10**, suficiente para una historia y acotado para proteger
  el tiempo de carga de la página del regalo.
- **El peso máximo admitido por foto es 10 MB** antes de procesarla.
- **Las correcciones del comprador se hacen volviendo a su propia carga**, no por un canal
  aparte. Es lo que hace cumplible el Principio III —corregir sin límite— sin inventar un
  segundo camino de edición.
- **La revisión y aprobación ya existen** (feature 001): esta feature no las reimplementa, solo
  crea el regalo que las alimenta.
- **La cola de pedidos pendientes es una lista mínima para el negocio**, no un panel de
  administración completo (explícitamente fuera de alcance).
- **Los tres temas visuales son los de la feature 001** (nocturno, papel, luminoso). No se
  agregan temas ni ediciones temáticas nuevas.
- **El comprador y el destinatario son personas distintas**, y el destinatario nunca entra al
  recorrido de compra ni de carga.
- **Todo el contenido está en español.**
- **El proveedor de pago real y el de correo real se eligen y conectan después**, fuera de esta
  feature; lo que esta feature fija es que ambos vivan detrás de un adaptador con un proveedor
  simulado equivalente.
