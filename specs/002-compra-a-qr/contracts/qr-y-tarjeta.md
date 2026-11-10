# Contrato: generador de QR y tarjeta

Implementa FR-022 (QR que apunta al enlace público), FR-023 (tarjeta lista para imprimir con
el texto mínimo), FR-024 (prohibido emitir QR vendible sin dominio propio) y FR-025 (prohibido
emitir el QR de un regalo no aprobado). Es la Compuerta de Aceptación 16 hecha código, más la
11 (dominio propio, nunca acortadores ni servicios de QR de terceros). Toda emisión exitosa
queda registrada en el pedido (research.md #22, ver *Registro de la emisión*).

> Nota de superficie: **ninguna ruta de API ni ninguna página emite un QR.** El generador es un
> módulo de servidor (`src/lib/qr.ts`) con una entrada de línea de comandos
> (`scripts/generar-qr.ts`, invocado como `npm run qr -- <slug>`). Es deliberado: una compuerta que se puede alcanzar por HTTP es una
> compuerta que alguien va a alcanzar por HTTP el día de apuro. Un QR impreso no se actualiza
> nunca y ese error no tiene corrección posible (Principio VI, research.md #11).

## Entrada

| Parámetro | Obligatorio | Valor |
|---|---|---|
| `slug` | sí | El slug del regalo, tal como aparece en `/r/<slug>`. |
| `simulacion` | no | Bandera explícita. Ausente = se pretende emitir un QR **vendible**. |
| `formato` | no | `png` (por defecto) o `svg` para el QR; la tarjeta siempre se emite además en PNG. |

Entrada de entorno, leída en runtime con el patrón `import.meta.env.X ?? process.env.X`
(research.md #18, para que el valor sea el del despliegue y no el de la compilación):

- `SITIO_URL` — la dirección pública del sitio. Es lo que la compuerta inspecciona.

El generador recibe un `slug` y **no** un texto arbitrario: no existe forma de pedirle un QR
que apunte a otra parte. El destino siempre se construye como `<SITIO_URL>/r/<slug>`.

## Compuerta de emisión

Se evalúa **antes** de generar un solo byte. En este orden:

1. **`SITIO_URL` ausente o no parseable como URL absoluta** → se niega. Sin dirección pública
   no hay destino posible.
2. **Host de simulación**: se niega la emisión vendible si el host
   - termina en `vercel.app`,
   - es `localhost` (o `127.0.0.1`),
   - o es una dirección IP.

   El criterio es *«no es un deploy de simulación»*, no una lista de dominios permitidos:
   mantener una lista era la alternativa rechazada en research.md #11.
3. **Estado del regalo**: el regalo debe existir y estar `publicado` con `aprobado_en` no
   nulo. Un regalo `en_revision` → se niega. No existe QR antes de la aprobación del comprador
   (FR-025, Principio III, Escenario 5 de la User Story 3).
4. **Vigencia**: un regalo con `vencimiento` pasado → se niega. Los regalos de esta feature
   nacen con vigencia permanente (Assumptions), así que el caso solo aparece si alguien fijó
   una expiración a mano.

Si (2) se cumple —el host **es** de simulación— hay exactamente dos salidas:

- sin la bandera `simulacion` → **se niega**, con un mensaje que nombra el host encontrado y
  la razón: *la dirección pública todavía no es un dominio propio del negocio; el QR no se
  emite* (FR-024, SC-009: el intento falla en 10 de 10 ocasiones);
- con la bandera `simulacion` → emite, y la salida queda **marcada** (ver abajo).

Si el host **no** es de simulación y la bandera `simulacion` viene igual, se emite marcado: la
bandera solo puede degradar la salida, nunca habilitarla.

Advertir en consola y emitir igual está rechazado explícitamente: una advertencia que no
bloquea es una advertencia que alguien va a pasar por alto (research.md #11).

## Salida

En el camino de éxito, un directorio por regalo con:

| Archivo | Qué es |
|---|---|
| `qr-<slug>.png` (o `.svg`) | El código QR solo, sin texto alrededor. |
| `tarjeta-<slug>.png` | La tarjeta completa, lista para llevar a imprimir. |

Parámetros del QR, elegidos para que sobreviva al papel (SC-008: 10 de 10 escaneos con un
celular de gama baja e iluminación de interior):

- Contenido: exactamente `<SITIO_URL>/r/<slug>`. Sin parámetros de seguimiento, sin
  redirecciones intermedias, sin acortadores y sin servicios de QR de terceros: si
  desaparecen, mueren todos los regalos vendidos (Principio VI, Compuerta 11).
- Corrección de errores nivel **Q**, para tolerar manchas y dobleces del papel.
- Zona de silencio de al menos **4 módulos** alrededor del código.
- Lado impreso del QR de al menos **30 mm**.
- Negro sobre blanco, sin logo ni imagen encima, sin degradados.

Parámetros de la tarjeta (valores por defecto de este contrato; el spec no fija medidas):

- 100 × 150 mm a 300 ppp.
- El QR centrado, con su zona de silencio respetada.
- El texto mínimo de instrucción: qué es y que hay que escanear el código con la cámara del
  celular (FR-023).
- La dirección pública en texto legible, como alternativa si la cámara falla. El alfabeto del
  slug ya está elegido sin `0`, `O`, `1`, `l` ni `I` justamente para que se pueda tipear desde
  una tarjeta impresa sin ambigüedad (feature 001, research.md #3).
- Contraste AA y tamaño de texto legible a distancia de brazo (Reglas de Calidad).

### Registro de la emisión (research.md #22)

Una emisión exitosa escribe dos columnas en el **pedido** del regalo, sin tabla nueva
(data-model.md):

| Columna | Qué guarda |
|---|---|
| `pedidos.qr_emitido_en` | Instante de la emisión. `null` mientras no se emitió ninguna. |
| `pedidos.qr_simulacion` | `true` si la emisión salió marcada como simulación. |

Reglas:

- Se escribe **después** de que los archivos quedaron generados, nunca antes: una compuerta
  que se niega no deja rastro de emisión porque no hubo emisión.
- Una reemisión **sobrescribe** las dos columnas: lo que interesa es qué soporte salió último,
  y un pedido corresponde a un único regalo y por lo tanto a una única tarjeta (Assumptions de
  la feature 001). Una tabla de emisiones solo haría falta el día que se reimprima una tarjeta
  perdida, y ese día el dato que hay que agregar es otro (research.md #22).
- El pedido se encuentra por `pedidos.regalo_id`. Un regalo **sin pedido** —un seed, una demo o
  un regalo creado a mano para una prueba— se emite igual y **no** registra nada: el motor no
  sabe de pedidos y esta compuerta no inventa uno (Principio II, research.md #10). La ausencia
  de registro no es un error y no cambia el código de salida.
- Sin esto no quedaría registro de qué soporte físico salió, cuándo, ni si lo que se imprimió
  era una tarjeta de simulación. Para un negocio cuyo entregable es un objeto impreso que no se
  puede corregir, eso es el último tramo del "pedido pagado sin regalo entregado" que el
  Principio VII obliga a hacer visible.

### La marca de simulación

Cuando la emisión es de simulación, la palabra **SIMULACIÓN** se estampa **sobre la imagen de
la tarjeta**, de forma visible e imposible de recortar sin mutilar la tarjeta, y el nombre del
archivo lleva además el sufijo `-simulacion`.

Las dos cosas, no una: un archivo se renombra o se reenvía sin su nombre; una marca impresa
sobre la tarjeta no se pierde (research.md #11). El nombre del archivo es una comodidad, la
marca sobre la imagen es la garantía.

## Errores

El generador **falla**, con código de salida distinto de cero y un mensaje que nombra la
causa, en estos casos:

- `SITIO_URL` ausente, vacía o no parseable.
- Host de simulación sin la bandera `simulacion` (FR-024).
- `slug` que no corresponde a ningún regalo.
- Regalo en estado `en_revision` (FR-025).
- Regalo con `vencimiento` pasado.

Nunca emite una salida parcial: si la compuerta se niega, no queda ningún archivo escrito.

## Invariantes garantizados

- Es **imposible** obtener un QR sin marca de simulación mientras `SITIO_URL` apunte a un
  deploy interno (FR-024, SC-009, Compuerta 16).
- Es **imposible** obtener el QR de un regalo que su comprador no aprobó (FR-025,
  Principio III).
- Todo QR emitido apunta a `<SITIO_URL>/r/<slug>`: a un dominio propio, sin intermediarios y
  sin terceros (Principio VI, Compuerta 11).
- El destino de un QR emitido no cambia nunca: `/r/<slug>` es la ruta pública estable de por
  vida, el slug no se reasigna, y el enlace no lleva firma ni token que pueda vencer
  (Principio VI, research.md #6, #9).
- La marca de simulación viaja dentro de la imagen, no solo en el nombre del archivo
  (research.md #11).
- Toda emisión exitosa sobre un regalo que tiene pedido queda registrada en
  `pedidos.qr_emitido_en` y `pedidos.qr_simulacion`; una emisión negada no escribe nada
  (research.md #22).
- Ninguna ruta HTTP de la aplicación puede emitir un QR, ni marcado ni sin marcar.
