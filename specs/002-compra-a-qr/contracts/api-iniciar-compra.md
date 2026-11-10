# Contrato: `POST /comprar`

> Nota de ruteo: la acción vive en la misma ruta que la página (`src/pages/comprar.astro`,
> según `plan.md`): el `POST` del formulario de la landing crea el pedido y redirige al cobro.
> El nombre de este archivo —`api-iniciar-compra.md`— es el que fija `plan.md` y se conserva;
> no hay una ruta bajo `/api/` para esto porque no hay ningún cliente programático que la
> necesite.

Implementa FR-002 (el pedido queda registrado antes de cualquier acción derivada del pago),
FR-003 (enlace propio no adivinable como única credencial), FR-034 (correo obligatorio),
FR-035 (celular opcional con consentimiento no pre-aceptado) y FR-007 (proveedor simulado).
Invocado por el `<form>` plano de la página de inicio (FR-001) — no requiere JavaScript de
cliente.

Es la aplicación directa de research.md #4: **el pedido nace antes de ir a pagar**. El
identificador ya está asignado cuando el comprador sale hacia el proveedor, de modo que el
aviso de pago siempre encuentra un pedido esperando, incluso si llega antes de que el
comprador vuelva.

## Request

- **Método**: `POST`
- **Content-Type**: `application/x-www-form-urlencoded` (formulario plano). A diferencia del
  webhook de pago, esta ruta **sí** queda protegida por el `checkOrigin` de Astro, que es
  exactamente lo que research.md #1 preserva al no debilitar nada globalmente.
- **Body** (campos del formulario):

| Campo | Obligatorio | Regla |
|---|---|---|
| `email` | sí | Dirección de correo con forma válida. Es la vía de entrega de los enlaces (FR-034). |
| `celular` | no | Si viene vacío o ausente, no se guarda nada (FR-035, SC-016). |
| `consentimiento_publicidad` | no | Casilla **no pre-marcada**. Solo cuenta como consentimiento si llega presente. |

- **Auth**: ninguna. No hay cuenta, contraseña ni registro en ningún punto del recorrido
  (FR-003).

## Comportamiento

1. **Validación mínima**: `email` presente y con forma de dirección de correo. Si falta o no
   valida → `400`, no se crea ningún pedido. El formulario de la landing usa
   `type="email" required`, así que el navegador corta este caso antes; el `400` cubre el
   envío programático. La columna es `not null` con `check` de forma mínima, de modo que la
   regla la hace cumplir la tabla y no solo el manejador (data-model.md).
2. **Celular y consentimiento** (FR-035, Compuerta de Aceptación 17):
   - `celular` presente **y** `consentimiento_publicidad` presente → se guardan
     `pedidos.celular`, `pedidos.consentimiento_publicidad = true` y
     `pedidos.consentimiento_en = now()`. El `check celular_requiere_consentimiento` de la
     tabla hace imposible guardar el número sin su consentimiento y su fecha: un bug de
     aplicación no puede producir ese estado.
   - `celular` presente **sin** consentimiento → **no se guarda el número**. El pedido se crea
     igual y la compra sigue. Nunca se deduce el consentimiento de la presencia del dato.
   - `celular` ausente → `celular = NULL`, `consentimiento_publicidad = false`. La compra se
     completa igual (SC-016).
   - El propósito publicitario se declara en la propia página, junto a la casilla; esta ruta
     no puede repararlo si allí falta.
3. **Creación del pedido**: `INSERT INTO pedidos` con
   - `id` = UUID v4 generado por la base — es la credencial del comprador (FR-003),
   - `estado = 'iniciado'`,
   - `email`,
   - `token_baja` — token propio de la baja publicitaria, generado **siempre**, con celular o
     sin él: la columna es `not null unique` y es un valor distinto del `id`, sin relación
     derivable con él (research.md #13, data-model.md),
   - `borrador = '{"v":1}'`, `regalo_id = NULL`.
4. **Creación del cobro**: se llama `iniciarCobro(pedido)` del adaptador (research.md #3), que
   inserta la fila de `pagos` en estado `pendiente` con `monto_centavos` y `moneda` **del
   momento**, leídos de `PRECIO` y `MONEDA` en runtime con el patrón
   `import.meta.env.X ?? process.env.X` (research.md #18) —nunca con valores incrustados en
   tiempo de compilación, porque cambiar el precio no debe exigir redesplegar—, y devuelve
   `{ urlDeCobro }`. El adaptador recibe el pedido **ya creado**, con su id, para que la
   referencia del cobro en el proveedor apunte a un pedido existente.
5. **Redirección**: `303` a `urlDeCobro`.
6. **Falla del proveedor**: si `iniciarCobro` falla o no devuelve una dirección → `502`. El
   pedido queda en `iniciado`, con su cobro en `pendiente`, y aparece en la cola operativa como
   intento abandonado (research.md #14). No se borra: un intento de compra del que no queda
   rastro es exactamente lo que el Principio VII prohíbe.

El orden 3 → 4 no es negociable. Crear el pedido al recibir el aviso de pago fue rechazado
explícitamente en research.md #4: si el aviso se pierde, no queda rastro de que alguien
intentó comprar.

## Response

- `303 See Other` → `Location: <urlDeCobro>` del proveedor. En modo simulado, la dirección de
  cobro es una página propia que reproduce el comportamiento observable de un proveedor real
  (FR-007) y que, al confirmar, emite el aviso firmado contra
  `POST /api/pagos/webhook/simulado`.
- `400` → `email` ausente o inválido. Ningún pedido creado.
- `502` → el adaptador de pago no pudo entregar una dirección de cobro. El pedido existe en
  `iniciado`.

Esta ruta **nunca** responde `200` con una pantalla de éxito: un pedido recién creado no está
pagado, y decir lo contrario es el caso que FR-002 y el Escenario 4 de la User Story 1
prohíben. El único lugar donde el comprador ve el estado de su pedido es `/gracias/[pedido]`,
que muestra el estado **real** —`iniciado` como "pendiente de pago"— porque no existe ningún
estado intermedio optimista que pudiera mostrarse por error.

## Postcondiciones

- Existe exactamente un pedido en estado `iniciado`, con id propio y no adivinable, cuyo
  enlace `/gracias/<id>` ya es válido.
- Existe exactamente una fila de `pagos` en `pendiente` para ese pedido, con el monto y la
  moneda con los que se intentó cobrar: queda registrado por cuánto se intentó cobrar incluso
  si el aviso nunca llega (Principio VII).
- Ningún dato de tarjeta pasó por el sistema: el cobro ocurre del lado del proveedor (FR-006).
- Si no hubo consentimiento explícito, no existe ningún número de celular guardado para ese
  pedido.

## Invariantes garantizados

- Todo pedido que llega al proveedor de cobro existe en la base **antes** de salir hacia él
  (FR-002, Principio VII, research.md #4).
- El id del pedido es la única credencial que el comprador necesita, y no hay forma de
  enumerar ni adivinar el de otro: no hay índice por correo ni identificador secuencial en
  ninguna parte (FR-003, FR-031).
- El `token_baja` es un valor distinto del id del pedido: el enlace que viaja dentro de un
  mensaje publicitario nunca da acceso al pedido ni a la historia (research.md #13).
- `monto_centavos` y `moneda` quedan congelados en la fila de `pagos` en el momento de iniciar
  el cobro, de modo que un cambio de precio posterior no reescribe la historia de lo ya
  vendido (research.md #18).
- Un pedido `iniciado` que nunca se paga es basura inofensiva y visible: aparece en la cola
  operativa como abandonado, nunca como venta (research.md #4, FR-008).
