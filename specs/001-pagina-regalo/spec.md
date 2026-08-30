# Feature Specification: Página de Regalo Personalizada

**Feature Branch**: `001-pagina-regalo`

**Created**: 2026-08-30

**Status**: Draft

**Input**: User description: "Feature: página de regalo personalizada. Alguien compró un regalo digital y escribió su historia. Su pareja recibe una tarjeta impresa con un QR, lo escanea, y se abre una página que cuenta la historia de ellos dos. Esta feature cubre exactamente eso: de un código en la URL a una historia en pantalla. Fuera de alcance: cobro y pedidos, formulario de personalización y carga de fotos, redacción asistida, generación del QR y la tarjeta imprimible, landing de venta."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El destinatario escanea el QR y ve su historia (Priority: P1)

Alguien recibe una tarjeta física con un código QR. Al escanearlo desde su celular, se abre
una página que cuenta, con fotos, texto y una canción, la historia que el comprador escribió
sobre ellos dos.

**Why this priority**: Es el producto en sí. Sin esta página funcionando de punta a punta,
no hay nada que la persona compradora esté pagando.

**Independent Test**: Se puede probar completamente publicando un regalo con una receta de
bloques definida y accediendo a su enlace público desde un celular: la página debe abrir,
mostrar la portada, y permitir recorrer el resto de los bloques sin errores.

**Acceptance Scenarios**:

1. **Given** un regalo publicado con una receta de bloques válida, **When** el destinatario
   abre el enlace público en su celular, **Then** ve una pantalla de apertura que requiere una
   acción explícita antes de mostrar el contenido.
2. **Given** que el destinatario ya realizó la acción de apertura, **When** avanza por la
   página, **Then** ve, en orden, cada bloque de la receta con su contenido correspondiente
   (portada, contador, momentos, galería, canción, carta, preguntas, cierre, según lo definido).
3. **Given** un regalo cuya receta incluye un bloque de tipo no reconocido por el sistema,
   **When** el destinatario abre la página, **Then** ese bloque no aparece y el resto de la
   página se muestra con normalidad, sin mensajes de error visibles.
4. **Given** un código que no corresponde a ningún regalo, que corresponde a un regalo aún no
   publicado, o que corresponde a un regalo vencido, **When** alguien accede a esa URL,
   **Then** ve una página de "no disponible", nunca un error técnico crudo.
5. **Given** que las imágenes del regalo no llegan a cargar, **When** el destinatario abre la
   página, **Then** todo el texto de la historia sigue siendo legible.

---

### User Story 2 - El comprador revisa y aprueba la página antes de que exista el QR (Priority: P2)

Antes de que se genere cualquier QR, la persona que compró el regalo necesita ver exactamente
la página que va a recibir su pareja, poder pedir correcciones, y dar su aprobación explícita.

**Why this priority**: Sin esta revisión, se corre el riesgo de entregar una historia con
errores en un soporte (el QR impreso) que después no se puede corregir.

**Independent Test**: Se puede probar completamente generando un regalo en estado "en
revisión", abriendo su enlace de revisión (distinto del enlace público), y verificando que
muestra el contenido exacto y que el estado no cambia a "publicado" hasta registrar una
aprobación explícita.

**Acceptance Scenarios**:

1. **Given** un regalo recién creado con su receta de bloques, **When** el comprador abre el
   enlace de revisión, **Then** ve exactamente la misma página, con el mismo contenido y los
   mismos bloques, que vería el destinatario si el regalo estuviera publicado.
2. **Given** un regalo en estado "en revisión", **When** el comprador aún no dio su
   aprobación, **Then** el regalo no es accesible mediante ningún enlace público y su estado
   no avanza a "publicado".
3. **Given** un regalo en estado "en revisión", **When** el comprador registra su aprobación
   explícita, **Then** el sistema guarda la fecha de esa aprobación y el regalo pasa a estado
   "publicado", quedando disponible en su enlace público.
4. **Given** un regalo ya publicado, **When** se compara su contenido con el que el comprador
   aprobó, **Then** el contenido es idéntico: no hay cambios entre lo aprobado y lo entregado.

---

### User Story 3 - El comprador se entera de la primera apertura (Priority: P3)

Después de publicar el regalo, la persona compradora quiere saber cuándo su pareja abrió la
página por primera vez.

**Why this priority**: No es necesaria para que el producto funcione ni para que se pueda
vender, pero es el detalle que genera el momento compartible y de mayor satisfacción.

**Independent Test**: Se puede probar completamente abriendo, por primera vez, el enlace
público de un regalo publicado, y verificando que queda registrada una única fecha/hora de
"primera apertura", visible para el comprador, que no se sobrescribe en aperturas
posteriores.

**Acceptance Scenarios**:

1. **Given** un regalo publicado que nunca fue abierto, **When** el destinatario lo abre por
   primera vez, **Then** el sistema registra la fecha/hora de esa apertura como la "primera
   apertura" del regalo.
2. **Given** un regalo cuya primera apertura ya fue registrada, **When** el destinatario (u
   otra persona) vuelve a abrir el enlace, **Then** la fecha de "primera apertura" no cambia.
3. **Given** un regalo con su primera apertura registrada, **When** el comprador consulta el
   estado de su regalo, **Then** puede ver que ya fue abierto y en qué momento.

---

### Edge Cases

- **Nombre con emoji o acentos**: el texto ingresado por el comprador se muestra tal cual fue
  escrito, sin alterarlo ni quitarle caracteres.
- **Carta muy larga (~4.000 caracteres)**: se muestra completa; el bloque se adapta en alto sin
  romper el diseño de la página ni provocar scroll horizontal.
- **Carta vacía**: un bloque sin contenido significativo se omite igual que un bloque de tipo
  desconocido; la página sigue mostrando el resto de los bloques con normalidad.
- **Foto vertical muy alargada o cuadrada**: el bloque de galería adapta el encuadre sin
  recortar de forma que pierda el sentido de la imagen ni rompa el diseño de la página.
- **Fecha de inicio del contador en el futuro**: el bloque de contador muestra el tiempo
  restante hasta esa fecha en lugar de tiempo transcurrido.
- **Escaneo sin conexión a internet**: si el regalo nunca fue abierto antes en ese dispositivo,
  la página no puede cargar sin conexión; si ya se había abierto antes en ese dispositivo,
  vuelve a mostrarse de forma legible aunque la conexión falle.
- **Dos personas abren el mismo regalo al mismo tiempo**: la "primera apertura" se registra una
  única vez, incluso si dos aperturas ocurren de forma simultánea.
- **Recarga de la página 30 veces**: cada recarga puede registrarse como una apertura más, pero
  ninguna modifica la fecha de "primera apertura" ya guardada, ni degrada el rendimiento de la
  página.
- **Texto con etiquetas HTML dentro**: las etiquetas se muestran como texto literal en pantalla;
  nunca se interpretan ni afectan el diseño de la página.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE identificar cada regalo mediante un código único en la URL,
  corto, compuesto por caracteres sin ambigüedad visual (sin 0/O ni 1/l), que no sea
  adivinable ni secuencial respecto de otros códigos existentes.
- **FR-002**: El sistema DEBE mostrar una página de "no disponible" — nunca un error técnico
  crudo — cuando el código de la URL no corresponde a ningún regalo, corresponde a un regalo
  no publicado, o corresponde a un regalo vencido.
- **FR-003**: El sistema DEBE renderizar el contenido de un regalo como la combinación de un
  tema visual y una lista ordenada de bloques.
- **FR-004**: El sistema DEBE soportar, al lanzamiento, los siguientes tipos de bloque:
  portada, contador, momento, galería, canción, carta, pregunta y cierre.
- **FR-005**: El sistema DEBE permitir cualquier cantidad de bloques de un mismo tipo dentro de
  la receta de un regalo, incluyendo cero, uno o varios.
- **FR-006**: Si la receta de un regalo incluye un tipo de bloque que el sistema no reconoce,
  el sistema DEBE omitir ese bloque en silencio y mostrar el resto de la página con
  normalidad.
- **FR-007**: El sistema DEBE tratar todo texto ingresado por el comprador como texto plano y
  escaparlo antes de mostrarlo; el sistema NO DEBE interpretar ni ejecutar HTML incluido en ese
  texto.
- **FR-008**: El sistema DEBE mostrar, al abrir la página publicada, una pantalla de apertura
  que exige una acción explícita del destinatario antes de revelar el contenido del regalo.
- **FR-009**: El bloque de tipo contador DEBE calcular el tiempo transcurrido desde una fecha
  de inicio y DEBE actualizarse en vivo mientras la página permanece abierta.
- **FR-010**: El bloque de tipo canción DEBE reproducir audio únicamente después de una acción
  explícita del destinatario; el sistema NO DEBE reproducir audio de forma automática.
- **FR-011**: El sistema DEBE mantener, para cada regalo, dos estados de visibilidad — "en
  revisión" y "publicado" — cada uno accesible mediante un enlace distinto.
- **FR-012**: El sistema DEBE mostrar, en el enlace de revisión, exactamente el mismo
  contenido y los mismos bloques que se mostrarían en el enlace público una vez publicado.
- **FR-013**: El sistema NO DEBE permitir que un regalo pase al estado "publicado" sin un
  registro de aprobación explícita del comprador, con fecha.
- **FR-014**: El sistema DEBE registrar cada apertura de la página publicada de un regalo.
- **FR-015**: El sistema DEBE registrar la fecha/hora de la primera apertura de cada regalo
  exactamente una vez, sin sobrescribirla en aperturas posteriores, incluso ante aperturas
  simultáneas.
- **FR-016**: El sistema DEBE permitir que cada regalo tenga una fecha de expiración
  configurable; la ausencia de esa fecha significa vigencia permanente.
- **FR-017**: El sistema DEBE tratar un regalo vencido como no disponible para nuevas
  aperturas, mostrando la página de "no disponible" (FR-002).
- **FR-018**: El sistema DEBE permitir borrar un regalo a pedido, incluyendo su contenido, sus
  fotos y sus registros de apertura asociados.
- **FR-019**: El sistema DEBE dejar constancia, para el comprador, de si su regalo ya fue
  abierto y en qué momento ocurrió la primera apertura, visible cuando el comprador consulta
  el enlace de su regalo. El sistema NO DEBE enviar avisos automáticos (por ejemplo, email o
  SMS) ante la primera apertura.
- **FR-020**: El sistema DEBE mostrar correctamente la página en anchos de pantalla entre 320 y
  1440 píxeles, sin generar scroll horizontal en ningún bloque.

### Key Entities

- **Regalo**: la unidad central de la feature. Tiene un código único de acceso, un tema
  visual, una receta ordenada de bloques, un estado de visibilidad ("en revisión" o
  "publicado"), una fecha de aprobación, una fecha de expiración opcional, y los registros de
  sus aperturas.
- **Bloque**: un elemento de contenido dentro de la receta de un regalo. Tiene un tipo (portada,
  contador, momento, galería, canción, carta, pregunta o cierre), una posición dentro del
  orden de la receta, y los datos específicos de su tipo (por ejemplo, una fecha de inicio para
  el contador, o una lista de fotos para la galería).
- **Apertura**: un evento de acceso a la página publicada de un regalo. Tiene una fecha/hora, y
  un indicador de si fue la primera apertura registrada para ese regalo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El contenido de la portada (incluyendo el nombre del destinatario) es visible en
  pantalla en menos de 2,5 segundos en una conexión 3G simulada, en un celular de gama baja.
- **SC-002**: La página se muestra correctamente, sin scroll horizontal, en anchos de pantalla
  entre 320 y 1440 píxeles.
- **SC-003**: Es posible publicar una historia con un solo bloque de tipo "momento" y otra con
  diez bloques del mismo tipo, ambas sin modificar código del sistema.
- **SC-004**: Es posible preparar una nueva edición temática, definiendo únicamente su receta de
  bloques, en menos de 30 minutos.
- **SC-005**: Con las imágenes bloqueadas o sin cargar, el 100% del texto de la página sigue
  siendo legible.
- **SC-006**: La página cumple contraste mínimo AA en los tres temas visuales disponibles al
  lanzamiento (nocturno, papel y luminoso).
- **SC-007**: Un conjunto de 20 regalos de prueba, cada uno con una historia distinta, se
  publican y se abren de punta a punta sin fallos.

## Assumptions

- El código de acceso de cada regalo tiene una longitud corta fija (por ejemplo, 8 caracteres)
  tomada de un alfabeto que excluye caracteres visualmente ambiguos.
- Una vez que un regalo pasa a estado "publicado", su contenido y receta de bloques dejan de
  poder editarse, en línea con que lo entregado es inmutable.
- El sistema ofrece tres temas visuales predefinidos disponibles al lanzamiento — nocturno
  (íntimo y oscuro, para aniversarios y declaraciones), papel (claro y analógico, para
  propuestas y bodas), y luminoso (alegre y con color, para cumpleaños y amistad) — los tres
  cumpliendo contraste AA.
- La fecha de expiración de cada regalo es fijada por un proceso externo a esta feature (por
  ejemplo, al momento de la compra); esta feature solo la hace cumplir.
- El acceso al enlace de revisión no requiere cuenta ni login, de la misma manera que el
  acceso al enlace público.
- Los destinatarios acceden principalmente desde el celular; el uso desde escritorio es
  secundario pero no debe romper el diseño.
- Todo el contenido de la página está en español.
- Las fotos que forman parte de la galería ya llegan procesadas (tamaño y formato listos) a
  esta feature.
- Cada pedido de compra corresponde a un único regalo.
