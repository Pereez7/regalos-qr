<!--
SYNC IMPACT REPORT
Version change: 1.3.0 → 1.3.1
Bump rationale: PATCH — se corrige la razón del Principio VII. La regla no cambia: la
protección de un webhook sigue siendo la verificación de firma y nunca el chequeo de
origen. Lo que se corrige es el hecho citado para justificarla, que estaba mal: el
rechazo por falta de `Origin` depende del content-type, y un aviso en JSON pasa. Sin
cambio semántico en ningún principio.

Principles defined: ninguno nuevo.
Added sections: ninguna.

Modified sections:
  - VII. Ningún pedido se pierde → razón corregida con la medición real por content-type

Removed sections: ninguna.
Deferred TODOs: ninguno. No quedan tokens sin resolver.
-->

# regalos-qr Constitution

## Core Principles

### I. El regalo abre primero

La página que ve el destinatario es el producto; todo lo demás es andamiaje.

- La página del regalo DEBE abrir sin cuenta, sin login y sin registro previo.
- El primer contenido legible DEBE aparecer en menos de 2,5 s en red 3G y en celular de gama baja.
- Ante falla de una foto, de la canción o de la conexión, la página DEBE seguir siendo legible.
  Una pantalla en blanco es un defecto bloqueante, nunca un caso aceptable.
- PROHIBIDO mostrar banners, interstitials o pedidos de permiso antes del contenido.

**Razón**: el destinatario abre el regalo una sola vez, en el peor teléfono y la peor red del día.
Cualquier fricción previa al contenido destruye el único momento que importa.

### II. Bloques, no plantillas

Una página es un tema más una lista ordenada de bloques.

- Cada bloque DEBE ser un tipo independiente, con su propio contrato de datos.
- Una edición nueva DEBE expresarse como una receta de bloques, NUNCA como un cambio en el renderizador.
- Un tipo de bloque nuevo DEBE agregarse en un solo archivo.
- PROHIBIDO introducir campos con nombre de ocasión dentro del motor. El motor no sabe de ocasiones.

**Razón**: el catálogo de ocasiones crece sin límite; el motor no. Si el motor conoce las ocasiones,
cada edición nueva lo modifica y el costo de cada edición crece en vez de bajar.

### III. Nada se publica sin aprobación del comprador

- El comprador DEBE ver la página exacta que verá el destinatario antes de que exista el QR.
- El comprador DEBE poder corregir las veces que quiera, sin límite.
- Sin aprobación explícita del comprador, el estado NO DEBE avanzar a publicado.

**Razón**: el QR es irreversible una vez entregado. La aprobación es la última compuerta antes
de que el error deje de ser corregible.

### IV. La IA redacta, no inventa

- La IA SOLO puede reorganizar, corregir y dar ritmo a lo que escribió el comprador.
- PROHIBIDO agregar lugares, fechas, apodos, anécdotas o sentimientos que el comprador no haya dado.
- Si falta un dato, se pregunta. NO se rellena.
- La voz resultante DEBE ser la del comprador.

**Razón**: un recuerdo inventado invalida el regalo entero. La utilidad de la IA acá es el ritmo,
no el contenido.

### V. Datos mínimos, borrado real

- Se guarda SOLO lo necesario para renderizar y entregar la página.
- Las fotos DEBEN alojarse en rutas no adivinables y no indexadas.
- La expiración DEBE ser configurable; `null` significa permanente.
- El borrado a pedido DEBE completarse en menos de 72 h, de base de datos y de storage.
- PROHIBIDA la analítica de terceros en la página del regalo.
- Excepción acotada: se puede guardar un dato de contacto con fin publicitario SOLO si el
  comprador lo dio de forma explícita y opcional, con el propósito declarado en el momento de
  pedirlo. PROHIBIDO exigirlo para comprar. PROHIBIDO deducirlo de otro dato. PROHIBIDO usarlo
  para un propósito distinto del declarado.
- Todo dato de contacto con fin publicitario DEBE tener una vía de baja, y la baja DEBE
  borrarlo, no marcarlo.

**Razón**: el contenido es privado e íntimo por definición. Guardar de más es asumir un riesgo
que el comprador no aceptó, y un borrado que deja copias no es un borrado. La excepción publicitaria existe
porque el negocio necesita poder volver a hablarle a un cliente, y está acotada de esa forma
porque un dato arrancado como condición de compra no es un dato que el comprador aceptó dar:
es el mismo riesgo que el principio prohíbe, con otro nombre.

### VI. Lo entregado es inmutable

Un QR impreso no se actualiza nunca. Todo lo que quedó del otro lado de una entrega es permanente.

- La ruta pública del regalo DEBE ser estable de por vida. PROHIBIDO cambiar su forma una vez
  entregado el primer QR.
- Un identificador de regalo ya entregado NUNCA se reasigna ni se reutiliza.
- Los QR entregados DEBEN apuntar a un dominio propio. PROHIBIDO usar acortadores o servicios
  de QR de terceros: si desaparecen, mueren todos los regalos vendidos.
- Los datos de cada regalo DEBEN llevar versión de esquema desde el primer registro.
- PROHIBIDO renombrar o eliminar un campo existente. Solo se agregan campos nuevos.
- PROHIBIDO eliminar un tipo de bloque. Se pueden crear sucesores; los anteriores se mantienen
  para siempre.

**Razón**: el soporte físico del producto está fuera de nuestro control desde el momento de la
entrega. Cualquier cambio incompatible rompe regalos ya pagados, de forma silenciosa e
irreparable.

### VII. Ningún pedido se pierde

Un error de dinero es tan irreversible como un QR mal impreso: alguien pagó y no recibió.

- El pago DEBE registrarse antes de cualquier otra acción derivada de él.
- Los webhooks de pago DEBEN ser idempotentes: el mismo evento recibido dos veces produce un
  solo efecto.
- La protección de un webhook DEBE ser la verificación de su firma, NUNCA el chequeo de origen.
- PROHIBIDO almacenar datos de tarjeta. Solo identificador del proveedor, monto y estado.
- Un pedido pagado sin regalo entregado DEBE ser visible en una cola operativa. PROHIBIDO que
  un pedido quede trabado en silencio.
- El proveedor de pago DEBE estar detrás de un adaptador, con un proveedor simulado disponible
  para desarrollo. PROHIBIDO acoplar el flujo de pedido a un proveedor concreto.

**Razón**: el comprador paga antes de que exista el regalo, así que entre el cobro y la entrega
hay una ventana donde el pedido solo vive en nuestros registros. Si se cae ahí, el comprador
pagó por nada y nosotros no tenemos forma de enterarnos. El chequeo de origen merece mención
explícita porque el riesgo es real y silencioso: Astro responde 403 a un POST sin header
`Origin` cuando el content-type es de formulario, y ningún proveedor de pago manda `Origin`.
Un proveedor que avise por formulario en vez de JSON queda rechazado sin dejar rastro visible.
Medido en el entorno real: con `application/json` el aviso pasa incluso sin `Origin`; con
`application/x-www-form-urlencoded`, `text/plain` o sin content-type, se rechaza.

## Reglas de Calidad

- Los criterios de éxito DEBEN ser medibles y sin tecnología. "Rápido" no vale;
  "menos de 2,5 s en 3G" sí.
- Todo bloque DEBE probarse a 360 px de ancho antes de darse por hecho.
- Accesibilidad obligatoria: contraste AA, foco visible, respeto de `prefers-reduced-motion`,
  y texto alternativo en toda imagen.
- El renderizador NUNCA recibe HTML crudo del comprador.
- Presupuesto duro: menos de 100 KB de JavaScript en la página del regalo.
  Objetivo real: menos de 20 KB.

## Compuertas de Aceptación

Ninguna función se considera terminada sin verificar, en este orden:

1. Primer contenido visible en menos de 2,5 s en 3G y gama baja (Principio I).
2. Degradación verificada con foto rota, canción rota y conexión caída: la página se lee (Principio I).
3. Render probado a 360 px de ancho (Reglas de Calidad).
4. Contraste AA, foco visible, `prefers-reduced-motion` y alt en toda imagen (Reglas de Calidad).
5. JavaScript de la página del regalo por debajo de 100 KB (Reglas de Calidad).
6. Ningún campo con nombre de ocasión agregado al motor; el bloque nuevo vive en un solo archivo
   (Principio II).
7. El estado no llega a publicado sin aprobación explícita registrada (Principio III).
8. Ningún dato de la salida de IA que no esté en la entrada del comprador (Principio IV).
9. Sin analítica de terceros y sin datos guardados de más; borrado verificado en base y storage
   (Principio V).
10. La ruta pública del regalo no cambia de forma tras la primera entrega, y ningún identificador
    entregado se reasigna ni se reutiliza (Principio VI).
11. El QR entregado apunta a un dominio propio, nunca a un acortador o servicio de QR de terceros
    (Principio VI).
12. Todo registro de regalo lleva versión de esquema desde su creación; ningún campo existente
    fue renombrado ni eliminado, solo se agregaron campos nuevos (Principio VI).
13. Ningún tipo de bloque fue eliminado; los sucesores conviven con los tipos anteriores
    (Principio VI).
14. Todo pago quedó registrado antes de cualquier acción derivada, y el webhook que lo informa
    es idempotente y valida firma, no origen (Principio VII).
15. Ningún pedido pagado quedó sin regalo entregado fuera de una cola visible; ningún dato de
    tarjeta fue almacenado (Principio VII).
16. `SITIO_URL` apunta a un dominio propio antes de emitir cualquier QR destinado a una venta
    real. Mientras apunte a un deploy interno de simulación, PROHIBIDO emitir QR vendibles
    (Principio VI, ítem 11).
17. Ningún dato de contacto con fin publicitario se guardó sin consentimiento explícito y
    opcional del comprador, con el propósito declarado al pedirlo y una vía de baja que lo
    borra (Principio V).

## Governance

Esta constitución tiene precedencia sobre cualquier otra práctica del proyecto.

- **Enmiendas**: requieren escribir el cambio, la razón y subir versión.
- **Versionado (semver)**:
  - MAJOR: se quita o redefine un principio.
  - MINOR: se agrega un principio o una sección, o se amplía materialmente una guía existente.
  - PATCH: aclaraciones, redacción, correcciones sin cambio semántico.
- **Conflicto**: ante duda entre velocidad y principio, gana el principio.
- **Revisión de cumplimiento**: antes de aprobar cualquier plan, verificar que no viole ningún
  principio. Si lo viola, documentar la excepción y por qué no hay alternativa más simple.

**Version**: 1.3.1 | **Ratified**: 2026-08-29 | **Last Amended**: 2026-11-10
