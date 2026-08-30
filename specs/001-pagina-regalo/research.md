# Phase 0 Research: Página de Regalo Personalizada

Todas las incógnitas del Technical Context quedan resueltas abajo; no quedan
`NEEDS CLARIFICATION` pendientes.

## 1. Adaptador de despliegue: Node serverless, no Edge Runtime

- **Decision**: `@astrojs/vercel` en modo funciones serverless de Node (no Edge Middleware /
  Edge Runtime).
- **Rationale**: el proyecto ya prevé un endpoint de tarjeta imprimible con `qrcode` + `sharp`
  (fuera de alcance de *esta* feature, pero parte del mismo despliegue). `sharp` usa bindings
  nativos que no corren en Edge Runtime. Elegir Node serverless desde el arranque evita migrar
  de runtime más adelante solo por ese endpoint. Para `/r/[slug]` en sí, Node serverless en
  Vercel cumple igual el objetivo de LCP <2,5 s: el costo dominante es la latencia de red del
  celular, no el cold start del runtime.
- **Alternatives considered**: Edge Runtime (más rápido en cold start, pero incompatible con
  `sharp`; forzaría separar el endpoint de tarjeta en otro runtime, más complejidad para una
  ganancia marginal en esta feature).

## 2. Migración futura a Cloudflare Pages

- **Decision**: no se resuelve en este plan. Se documenta como riesgo abierto: Cloudflare
  Workers tampoco soporta `sharp` de forma nativa, así que el endpoint de tarjeta imprimible
  necesitará su propia decisión (p. ej. mover solo ese endpoint a un runtime Node aparte)
  cuando llegue esa migración.
- **Rationale**: la migración no es parte de esta feature (`/r/[slug]` no usa `sharp`); forzar
  la decisión ahora sería resolver un problema que todavía no existe.
- **Alternatives considered**: decidir el reemplazo de `sharp` ahora (p. ej. `@cf-wasm/photon`)
  — descartado por alcance; no bloquea nada de esta feature.

## 3. Alfabeto y generación del slug

- **Decision**: alfabeto Crockford-like de 32 símbolos sin 0/O/1/l/I:
  `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`. Longitud fija de 8 caracteres. Generación: bytes
  aleatorios criptográficos (`crypto.getRandomValues`) mapeados al alfabeto; se inserta en la
  tabla `slugs` con `INSERT ... ON CONFLICT DO NOTHING` y se reintenta con un nuevo valor si
  hay colisión.
- **Rationale**: cumple FR-001 (sin ambigüedad visual, no adivinable, no secuencial) porque el
  slug nunca deriva de un contador ni de datos del regalo. 8 caracteres sobre 32 símbolos dan
  ~1.1 × 10^12 combinaciones, suficiente para no colisionar a la escala de esta feature.
- **Alternatives considered**: UUID completo en la URL (descartado: feo en una tarjeta
  impresa, sin necesidad de esa cantidad de entropía); slug derivado del id del pedido
  (descartado: sería adivinable/secuencial, viola FR-001).

## 4. No reasignación de slugs tras un borrado

- **Decision**: tabla `slugs` independiente de `regalos`, con su propia fila persistente que
  **nunca se borra**, ni siquiera cuando se borra el regalo asociado (FR-018). Al borrar un
  regalo, `slugs.regalo_id` pasa a `NULL` pero la fila del slug permanece, bloqueando ese
  valor para siempre.
- **Rationale**: es la única forma de cumplir el Principio VI ("un identificador de regalo ya
  entregado NUNCA se reasigna ni se reutiliza") cuando FR-018 exige poder borrar el regalo
  completo. Si el slug viviera solo como columna de `regalos`, borrar la fila liberaría el
  valor para un regalo futuro.
- **Alternatives considered**: soft-delete de `regalos` (mantener la fila con `estado =
  'borrado'`) — descartado porque el Principio V exige borrado real de la fila y del storage,
  no una marca.

## 5. Registro atómico de la primera apertura

- **Decision**: columna `primera_apertura_en timestamptz null` directamente en `regalos`,
  actualizada con `UPDATE regalos SET primera_apertura_en = now() WHERE id = $1 AND
  primera_apertura_en IS NULL RETURNING primera_apertura_en`. Cada apertura (primera o no) se
  inserta además como fila en `aperturas` para conteo/auditoría. La condición `WHERE ... IS
  NULL` en una única sentencia UPDATE es atómica a nivel de fila en Postgres: ante dos
  requests simultáneos, solo uno obtiene una fila afectada. **Esta UPDATE se invoca desde
  `POST /api/regalos/[slug]/abrir`, nunca desde el `GET` que sirve la página** — ver research.md
  #19 para el porqué.
- **Rationale**: resuelve el Edge Case de dos aperturas simultáneas y el de 30 recargas sin
  necesitar locks explícitos ni una tabla de coordinación aparte.
- **Alternatives considered**: `SELECT ... FOR UPDATE` + lógica en aplicación (más código,
  misma garantía); columna `es_primera` por fila de `aperturas` con índice único parcial
  (funciona, pero obliga a leer antes de escribir; la UPDATE condicional es más simple y ya
  atómica).

## 6. Ruta de fotos en Storage

- **Decision**: bucket de Supabase Storage con rutas `regalos/{regalo_id}/{uuid}.{ext}`, sin
  listado de directorio habilitado. El bucket es de lectura pública (la página en sí ya es
  pública por slug), pero ninguna ruta es adivinable ni está indexada.
- **Rationale**: cumple Principio V ("rutas no adivinables y no indexadas") sin necesitar URLs
  firmadas con expiración, que complicarían el cacheo de imágenes en el celular del
  destinatario y podrían romper la carga si el destinatario abre el link días después de
  generada la firma.
- **Alternatives considered**: URLs firmadas con expiración larga — descartado por el riesgo
  de que expiren mientras el QR sigue impreso y circulando (viola indirectamente Principio
  VI: el contenido debe seguir sirviendo para siempre).

## 7. Enlace de revisión como token de capacidad

- **Decision**: `/revisar/[id]` usa el UUID (v4) primario del regalo como token de acceso. No
  hay login (Assumptions). El UUID v4 (122 bits de entropía aleatoria) actúa como "magic
  link": nadie puede adivinarlo, y no se expone en ningún listado público.
- **Rationale**: satisface US2/FR-012 sin construir autenticación, consistente con que el
  enlace público tampoco requiere cuenta.
- **Alternatives considered**: columna `review_token` separada del id — descartado por
  redundante; el `id` ya cumple el mismo rol y mantenerlo único simplifica el modelo.

## 8. Aprobación sin JavaScript de cliente

- **Decision**: el botón "Aprobar" en `/revisar/[id]` es un `<form method="POST"
  action="/api/regalos/[id]/aprobar">` plano. El endpoint valida estado `en_revision`,
  registra `aprobado_en = now()`, cambia `estado` a `publicado`, y responde con un redirect
  (303) de vuelta a `/revisar/[id]` mostrando la confirmación.
- **Rationale**: cero JS adicional en una página que de por sí no necesita presupuesto de JS
  (no es `/r/[slug]`), y evita cualquier estado de carrera entre un `fetch` de cliente y la
  navegación.
- **Alternatives considered**: `fetch` + actualización optimista del DOM — descartado, no
  aporta nada sobre un POST plano y agrega JS sin necesidad.

## 9. Borrado a pedido sin panel de administración

- **Decision**: `DELETE /api/regalos/[id]/eliminar` protegido por un secreto de servidor
  (`Authorization: Bearer <OPS_SECRET>`, variable de entorno), invocado manualmente/por
  soporte. No se construye UI de administración en esta feature (fuera de alcance de
  spec.md).
- **Rationale**: FR-018 exige la *capacidad* de borrar, no una superficie de administración;
  construir un panel completo sería alcance no pedido. Proteger con secreto evita que el
  UUID del regalo (conocido por quien recibe el link de revisión) sea suficiente para
  borrarlo.
- **Alternatives considered**: sin protección adicional (solo el UUID) — descartado: el
  comprador conoce el UUID vía el link de revisión y no debería poder borrar por accidente ni
  un tercero que lo intercepte.

## 10. Presupuesto de JavaScript en `/r/[slug]`

- **Decision**: cero runtime de framework. Astro con `output: "server"` y componentes 100%
  `.astro` sin directivas `client:*` no embebe hidratación de React/Vue/etc. Los únicos
  scripts son los inline de `Contador.astro`, `Cancion.astro` y `Pregunta.astro`, cada uno
  vanilla DOM (`setInterval`, `<audio>.play()/.pause()`, toggle de `aria-expanded`), escritos
  a mano sin dependencias. Estimado: <5 KB sin comprimir en total, muy por debajo del objetivo
  de 20 KB y del techo de 100 KB.
- **Rationale**: es la única forma de garantizar el presupuesto sin depender de tree-shaking
  de un framework; con cero framework en el cliente no hay presupuesto que vigilar más allá
  del propio código.
- **Alternatives considered**: Astro islands con `client:visible` para los tres bloques
  interactivos usando un framework — descartado explícitamente por el usuario ("Cero React
  acá") y además incompatible con el presupuesto: el runtime mínimo de cualquier framework de
  islas ya consume una porción no trivial de 20 KB antes de escribir una sola línea propia.

## 11. Verificación de contraste AA en ambos temas

- **Decision**: test Playwright que recorre los pares fondo/texto definidos en
  `tokens-claro.css` y `tokens-oscuro.css` y calcula el ratio de contraste WCAG (fórmula de
  luminancia relativa) contra el umbral AA (4.5:1 texto normal, 3:1 texto grande),
  fallando el build si algún par no llega al umbral.
- **Rationale**: hace el criterio de aceptación (SC-006, Compuerta 4) verificable en CI sin
  depender de una revisión visual manual.
- **Alternatives considered**: axe-core vía `@axe-core/playwright` — buena opción
  complementaria para accesibilidad general (foco visible, alt text), pero su regla de
  contraste actúa sobre el DOM renderizado más que sobre los tokens; se usa además de la
  verificación directa de tokens, no en su reemplazo.

## 12. Simulación de 3G + gama baja para LCP

- **Decision**: Playwright + CDP (`chromium.launchPersistentContext` con `Network Domain`) —
  `client.send('Network.emulateNetworkConditions', {...preset "Slow 3G"...})` y
  `client.send('Emulation.setCPUThrottlingRate', { rate: 4 })` para simular gama baja, luego
  medir `LCP` vía `PerformanceObserver` inyectado antes de la navegación.
- **Rationale**: es el único mecanismo dentro de Playwright que reproduce de forma
  determinística ambas condiciones (red y CPU) exigidas por SC-001, sin depender de un
  servicio externo.
- **Alternatives considered**: Lighthouse CI — mide LCP con throttling similar, pero como
  herramienta aparte duplicaría el runner de tests; se deja como posible adición futura, no
  necesaria para cumplir el criterio ahora.

## 13. Definición de los tres temas visuales

- **Decision**: tres temas por paleta/tono, no por ocasión — `nocturno` (íntimo y oscuro),
  `papel` (claro y analógico) y `luminoso` (alegre y con color) — expresados como archivos de
  custom properties (`tokens-nocturno.css`, `tokens-papel.css`, `tokens-luminoso.css`). Los
  tres deben pasar `contraste-aa.spec.ts` (SC-006).
- **Rationale**: el nombre de cada tema describe una propiedad visual (tono, paleta, luz), no
  una ocasión — "nocturno" no es "aniversario", es oscuro e íntimo y puede usarse para
  cualquier ocasión que un comprador elija. Esto mantiene el Principio II intacto ("el motor
  no sabe de ocasiones") aunque las descripciones de uso sugerido (aniversarios,
  declaraciones, propuestas, bodas, cumpleaños, amistad) vivan solo como guía de producto
  fuera del motor, nunca como campo o condicional en el código.
- **Alternatives considered**: dos temas (claro/oscuro) — reemplazado por pedido explícito;
  temas nombrados directamente por ocasión (p. ej. `tema-aniversario`) — descartado, violaría
  el Principio II al acoplar el motor a un catálogo de ocasiones que crece sin límite.

## 14. Versionado y evolución del contenido de un bloque

- **Decision**: `contenido` es un JSONB con forma `{ v: number, receta: Bloque[] }`. Cada tipo
  de bloque tiene su propio esquema `zod`, validado en `src/lib/contenido/esquema.ts`. Reglas
  de evolución: un campo nuevo se agrega como opcional en el esquema de su versión; ningún
  campo se renombra ni se quita del esquema de una versión ya emitida; un tipo de bloque
  nuevo es un esquema nuevo que convive con los anteriores, nunca un reemplazo.
- **Rationale**: es la implementación directa del Principio VI (Compuertas 12 y 13) y de FR-004/FR-005.
- **Alternatives considered**: una tabla `bloques` normalizada en SQL en vez de JSONB —
  descartado: cada columna nueva sería una migración de esquema SQL, lo que va contra
  "agregar un bloque = crear el archivo y registrarlo, nada más" pedido por el usuario.

## 15. Tipo de bloque desconocido

- **Decision**: `registro.ts` exporta un `Record<string, Componente>`. El renderer de
  `RegaloLayout.astro` itera `receta`, hace `registro[bloque.tipo]`, y si es `undefined`
  simplemente no renderiza nada para ese elemento (sin log visible al usuario, sin
  placeholder de error).
- **Rationale**: cumple FR-006 literalmente y es la implementación más simple posible del
  Principio II (agregar un tipo = agregar una entrada al mapa).
- **Alternatives considered**: renderizar un bloque de "tipo no soportado" visible —
  descartado, FR-006 exige omitirlo en silencio.

## 16. Encuadre del bloque `galeria` para fotos extremas (cuadrada / vertical muy alargada)

- **Decision**: cada foto se muestra con `object-fit: contain` dentro de un contenedor cuyo
  alto máximo está acotado por CSS (no un `aspect-ratio` fijo tipo cuadrado/16:9). El
  contenedor reserva espacio con `aspect-ratio` calculado a partir de `ancho`/`alto` cuando
  vienen en el dato (evita layout shift), pero nunca recorta: una foto vertical muy alargada
  queda "en caja" (letterboxed) en vez de perder parte de la imagen.
- **Rationale**: el Edge Case exige que el encuadre "no recorte de forma que pierda el
  sentido de la imagen ni rompa el diseño de la página". `object-fit: cover` (que sí recorta)
  es más prolijo visualmente pero puede cortar cabezas o cuerpos en fotos verticales extremas;
  `contain` es la única opción que garantiza cero pérdida de contenido visual para *cualquier*
  proporción de foto, a costa de posibles franjas de fondo alrededor — aceptable frente al
  requisito explícito de no perder sentido.
- **Alternatives considered**: `object-fit: cover` con `object-position` fijo — descartado,
  no puede garantizarse sin recorte para proporciones extremas; recorte inteligente
  (detección de sujeto) — descartado, fuera de alcance y de presupuesto de JS para esta
  feature.

## 17. Verificación de compatibilidad hacia adelante sin tener aún una v2 real

- **Decision**: `compatibilidad-versiones.spec.ts` fija un fixture versionado y committeado al
  repo (`tests/fixtures/contenido-v1.json`, un documento `{ v: 1, receta: [...] }` con
  ejemplos de los 8 tipos de bloque) y hace un snapshot/assert de su render. Este fixture y su
  test **no se editan nunca** una vez que exista contenido real en producción con `v: 1` — es
  un test de regresión permanente, no uno que se actualiza junto con el código.
- **Rationale**: al lanzamiento no existe todavía una v2 real, así que no hay forma de probar
  "compatibilidad hacia adelante" contra una versión futura concreta. Lo que sí se puede
  garantizar hoy es que el path de render de `v: 1` queda congelado por un test que cualquier
  cambio futuro (incluida la introducción de `v: 2`) tiene que seguir pasando. Es la única
  forma honesta de hacer verificable el Principio VI antes de que exista una segunda versión:
  el test no prueba "v2 no rompe nada" (no hay v2), prueba "v1 no se puede tocar", que es
  exactamente lo que el principio exige.
- **Alternatives considered**: esperar a la primera migración real de esquema para escribir
  este test — descartado, dejaría el Principio VI sin ninguna verificación automatizada desde
  el día uno, exactamente el escenario que el principio busca prevenir.

## 18. El contador nunca muestra un valor negativo

- **Decision**: el `<script>` de `Contador.astro` calcula `delta = ahora - fechaInicio`. Si
  `delta < 0` (fecha futura, Edge Case ya cubierto), se muestra la cuenta regresiva
  (`|delta|`) tal como decide research.md original. Si la página permanece abierta y `delta`
  cruza de negativo a positivo en vivo (FR-009: actualización en vivo), el contador se
  clampea a `0` exactamente en el cruce y en el siguiente tick pasa a contar hacia adelante
  desde `0` — nunca se muestra `-00:00:01` ni un rebote visual.
- **Rationale**: `fecha-futura.spec.ts` pide explícitamente "muestra 0, nunca números
  negativos"; sin este clamp explícito en el cruce, una resta ingenua podría mostrar
  brevemente un valor negativo mal formateado (p. ej. `"-1"` en el campo de segundos) en el
  primer tick post-cruce.
- **Alternatives considered**: recargar la página al cruzar el umbral — descartado, rompe la
  experiencia de lectura continua sin necesidad; simplemente clampear en el cálculo es una
  línea de código.

## 19. El registro de apertura NUNCA ocurre en el `GET` que sirve la página

- **Decision**: `src/pages/r/[slug].astro` (el `GET` público) solo lee y renderiza; no llama a
  `registrarApertura`. El único disparador de una apertura es `POST
  /api/regalos/[slug]/abrir`, invocado por un `<script>` en la pantalla de apertura del
  layout, exclusivamente cuando el destinatario toca esa pantalla (research.md #22). La
  llamada es *fire-and-forget*: el contenido se revela en el cliente sin esperar la respuesta
  del POST.
- **Rationale**: WhatsApp, Instagram, iMessage, Facebook y otros clientes de mensajería hacen
  un `GET` automático (a veces varios) a cualquier link compartido para generar su tarjeta de
  vista previa, *antes* de que la persona lo abra. Si el registro de apertura dependiera del
  `GET`, esos crawlers marcarían la primera apertura — y como `primera_apertura_en` es
  inmutable por diseño (Principio VI), ese dato quedaría arruinado para siempre en cuanto
  alguien comparte el link. Mover el registro a una acción explícita de cliente (tap → POST)
  es la única forma de que "primera apertura" signifique lo que FR-015 y US3 necesitan que
  signifique: que la persona la vio, no que un bot la pre-cargó.
- **Alternatives considered**: filtrar por `User-Agent` conocido de crawlers en el `GET` —
  descartado, es una lista incompleta y que se desactualiza (cualquier bot nuevo o no
  identificado seguiría contando); exigir JavaScript para todo el render — descartado, rompe
  Principio I (la página debe ser legible incluso con degradación); la solución elegida no
  exige JS para *ver* el contenido, solo para que la apertura quede registrada, que es un
  efecto secundario no bloqueante.
- **Verificación**: `primera-apertura.spec.ts` incluye un caso explícito — un `GET` a
  `/r/[slug]` con `User-Agent` de crawler (p. ej. `WhatsApp/2.23.20.0`) NO debe registrar
  apertura, sea cual sea el User-Agent, porque el `GET` ya no registra nada bajo ninguna
  circunstancia.

## 20. Bloque `momento` incluye una foto opcional

- **Decision**: `momento` gana `foto?: Foto` (mismo tipo `Foto = { url, alt, ancho?, alto? }`
  que `galeria`), con el mismo tratamiento de encuadre (`object-fit: contain`, research.md
  #16) cuando está presente.
- **Rationale**: un "momento" — una foto con su texto — es, según quien pidió este ajuste, el
  bloque más usado del producto; sin foto, el tipo estaba incompleto frente a su propio
  propósito.
- **Alternatives considered**: modelar la foto de un momento como un bloque `galeria`
  separado inmediatamente antes/después — descartado, obliga a la receta a coordinar dos
  bloques para expresar una sola idea y pierde la agrupación visual (foto + texto juntos).

## 21. Canción como embed de terceros, no audio propio

- **Decision**: el bloque `cancion` deja de servir un archivo de audio propio. `url` pasa a
  ser un link de Spotify o YouTube; `src/lib/contenido/embeds.ts` valida ese link contra una
  lista blanca de dominios (`open.spotify.com`, `spotify.com`, `youtube.com`, `youtu.be`,
  `www.youtube.com`) y lo traduce a una URL de embed (YouTube vía `www.youtube-nocookie.com`
  para minimizar cookies de terceros; Spotify vía su URL de embed estándar). El `<iframe>` no
  se inserta en el DOM hasta que el destinatario toca el bloque (carga diferida); ningún
  parámetro de autoplay se agrega nunca (FR-010).
- **Rationale**: alojar archivos de audio con derechos de autor de terceros en almacenamiento
  propio es un riesgo legal directo. Delegar la reproducción al proveedor original (con el
  link que el propio comprador aportó) traslada esa responsabilidad a donde corresponde.
- **Tensión con el Principio V** ("PROHIBIDA la analítica de terceros en la página del
  regalo"): un embed de Spotify/YouTube no es un script de analítica nuestro, es el propio
  contenido que el comprador eligió mostrar — la distinción que hace el Principio V es contra
  instrumentación de medición que *nosotros* agregaríamos (GA, Meta Pixel), no contra un
  reproductor de terceros que es el contenido en sí. Aun así, se mitiga activamente: (a) el
  iframe no carga ningún recurso de terceros hasta el tap explícito — cero tráfico a
  Spotify/YouTube en la carga inicial de la página, que es lo que protege el presupuesto de
  JS y el tiempo a portada (SC-001); (b) YouTube se embebe en modo `-nocookie`; (c) el
  dominio está en lista blanca cerrada, no es una URL arbitraria. Ver también la fila V de la
  Constitution Check en plan.md.
- **Alternatives considered**: subir el audio a Supabase Storage (riesgo legal, descartado);
  exigir que el comprador suba un archivo con licencia — fuera de alcance de esta feature (no
  hay formulario de carga); reproducir el embed automáticamente en cuanto el bloque entra en
  viewport — descartado, viola FR-010 (nada de reproducción sin acción explícita) y además
  cargaría JS/red de terceros antes de tiempo.

## 22. La pantalla de apertura vive en el layout, no en un bloque

- **Decision**: la pantalla de apertura (FR-008) se implementa en `RegaloLayout.astro`, no
  dentro de `Portada.astro`. El layout busca el primer bloque `tipo: "portada"` en la receta
  (si existe) para tomar `nombreDestinatario` como texto de la pantalla de apertura; si la
  receta no tiene bloque `portada`, muestra un texto genérico neutro ("Tenés un regalo"). Tras
  el tap: se revela el resto de la receta en orden (incluido el bloque `portada`, si existe,
  con su contenido completo) y se dispara el `POST /api/regalos/[slug]/abrir` (research.md
  #19).
- **Rationale**: FR-008 y FR-004/FR-005 (cualquier cantidad de bloques de un tipo, incluyendo
  cero) ya implican que la pantalla de apertura es un comportamiento del sistema, no de un
  tipo de bloque — una receta sin `portada` igual debe abrir con una acción explícita. Atarla
  a `Portada.astro` la hacía condicional a que ese bloque existiera, lo cual viola FR-005
  indirectamente (una receta sin `portada` sería válida pero se abriría sin pantalla de
  apertura, rompiendo FR-008).
- **Alternatives considered**: mantenerla en `Portada.astro` y exigir que toda receta incluya
  un bloque `portada` — descartado, contradice FR-005 ("cualquier cantidad... incluyendo
  cero") y agrega una regla de validación que el spec nunca pidió.

## 23. Medición de LCP en dos tiempos

- **Decision**: `tests/e2e/lcp.spec.ts` (renombrado desde `lcp-portada.spec.ts`) mide dos
  momentos bajo la misma emulación de 3G + gama baja (research.md #12): (1) la pantalla de
  apertura visible en <2,5 s (SC-001), y (2) tras simular el tap, el primer bloque real de la
  receta visible en <2,5 s adicionales (SC-008).
- **Rationale**: la pantalla de apertura es deliberadamente liviana (research.md #22: texto +
  fondo, sin fotos ni iframes) y por diseño va a cumplir cualquier presupuesto de LCP sin
  decir nada sobre el resto de la página. El momento que de verdad puede fallar — una galería
  con fotos pesadas, o un primer bloque de contenido real — recién se mide después del tap, y
  sin una segunda medición ese riesgo queda invisible para el test.
- **Alternatives considered**: medir un único LCP end-to-end del documento completo sin
  distinguir el gate del contenido — descartado, un LCP agregado no diagnostica cuál de las
  dos partes (gate o contenido real) es la que eventualmente se degrada.

## 24. Compuerta 2 es degradación, no funcionamiento offline (excepción razonada)

- **Decision**: la Compuerta 2 de la constitución ("Degradación verificada con foto rota,
  canción rota y conexión caída: la página se lee") se implementa y se verifica como
  degradación ante **fallas parciales de red durante una sesión activa** —
  `tests/e2e/render-sin-imagenes.spec.ts` (foto rota), `tests/e2e/cancion-rota.spec.ts`
  (canción rota) y `tests/e2e/degradacion-conexion.spec.ts` (recursos que no cargan en
  general). Deliberadamente **no** se implementa ningún mecanismo de service worker, Cache
  API ni `Cache-Control` orientado a que la página cargue completa sin conexión alguna
  (offline real) en una visita posterior.
- **Rationale**: un service worker que cachee la respuesta de `/r/[slug]` puede servir una
  versión vieja del regalo después de que el comprador pida una corrección y vuelva a
  aprobar — el destinatario vería contenido no aprobado (versión anterior) o, peor, contenido
  que el comprador corrigió específicamente por estar mal. Eso viola el Principio III ("nada
  se publica sin aprobación del comprador") por una vía que la constitución no previó: una
  copia cacheada en el dispositivo del destinatario que nunca se invalida. El riesgo de
  introducir ese mecanismo es mayor que el problema que resuelve, porque el caso de uso real
  — reabrir sin conexión un regalo que ese mismo dispositivo ya abrió antes — es marginal
  frente al riesgo de entregar contenido desactualizado de forma silenciosa e indetectable.
- **Alternatives considered**: service worker con invalidación de caché atada a un hash de
  `contenido` — descartado por complejidad no pedida por ningún FR/SC de spec.md y porque
  seguiría dependiendo de que el destinatario vuelva a tener conexión al menos una vez para
  invalidar la copia vieja, sin garantía de que eso ocurra antes de que abra el regalo
  offline. Cache-Control agresivo del navegador sin service worker — descartado por el mismo
  riesgo de servir una respuesta vieja, con menos control aún sobre cuándo se invalida.
