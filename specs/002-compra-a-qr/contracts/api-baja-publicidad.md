# Contrato: `POST /baja/[token]`

> Nota de ruteo: la página y la acción viven en la misma ruta (`src/pages/baja/[token].astro`,
> según `plan.md`): el `GET` muestra la confirmación y el `POST` ejecuta la baja. No hay una
> ruta de API aparte, porque no hay nada que un cliente programático necesite de acá.

Implementa FR-036 (vía de baja que **borra** el número, no lo marca) y el cierre de FR-035 /
Principio V (excepción publicitaria acotada) / Compuerta de Aceptación 17. Invocado por el
`<form>` plano de la página `/baja/[token]` — no requiere JavaScript de cliente.

## El token es propio, y no es el id del pedido

`pedidos.token_baja` es un valor no adivinable —32 caracteres hexadecimales, 128 bits—,
distinto del id del pedido y sin relación derivable con él. Se genera al crear el pedido, con
celular o sin él: la columna es `not null unique` (data-model.md), de modo que la ruta de baja
existe siempre y nunca hay que crear el token tarde.

El motivo es directo (research.md #13): el enlace de baja viaja **dentro de mensajes
publicitarios**. Si fuera el id del pedido, cada mensaje publicitario sería una filtración de
la credencial que da acceso al pedido, al borrador y a la historia completa. Usar el id del
pedido como enlace de baja está rechazado explícitamente.

Consecuencias de contrato, no de implementación:

- Con el `token_baja` **no** se puede leer el pedido, el borrador, las fotos, el correo, ni el
  regalo. Esta ruta y la página `/baja/[token]` son lo único que acepta ese token.
- Con el id del pedido **no** se puede dar de baja: no hay forma de llegar acá sin el token.
  Son dos credenciales con dos alcances y no se cruzan.
- La página `/baja/[token]` no muestra el número que está por borrar, ni el correo, ni ningún
  otro dato del pedido. Confirma la acción y nada más: un enlace que llegó a la bandeja
  equivocada no debe revelar a quién pertenece.

## Request

- **Método**: `POST`
- **Path param**: `token` — el `token_baja` del pedido
- **Body**: ninguno (form de confirmación vacío)
- **Content-Type**: `application/x-www-form-urlencoded`
- **Auth**: el conocimiento del `token`, y nada más

La confirmación es un `POST` y no un `GET` a propósito: un `GET` lo dispara cualquier
precargador de enlaces del cliente de correo, y una baja involuntaria sería irreversible —el
número ya no está para volver a guardarlo—.

## Comportamiento

1. Si `token` no corresponde a ningún pedido → `404`. No se distingue de un token ya usado ni
   de un pedido que nunca dio un celular.
2. Si corresponde → `UPDATE pedidos SET celular = NULL, consentimiento_publicidad = false,
   baja_publicidad_en = now() WHERE token_baja = $1`.
   - El número **se borra**, no se marca como dado de baja. Marcarlo y conservarlo está
     rechazado explícitamente por la constitución (Principio V) y por research.md #13.
   - `consentimiento_en` —la fecha en que el comprador consintió— se conserva: es lo que
     permite demostrar, más adelante, que el consentimiento existió, y por sí sola no
     identifica a nadie ni sirve para contactar (research.md #13).
3. La operación es **idempotente**: repetir la baja sobre un pedido que ya la hizo deja el
   mismo estado y responde igual. No hace falta distinguir el caso: el `UPDATE` ya es
   incondicional y el resultado es el mismo.
4. `303` a `/baja/[token]`, que confirma en lenguaje claro que el número fue borrado y que no
   va a recibir más mensajes.

El `token_baja` **no** se borra junto con el número: si se borrara, la página de confirmación
respondería `404` justo después de la baja y el comprador no tendría cómo saber que funcionó.
El token sin celular asociado no da acceso a nada.

## Response

- `303 See Other` → `Location: /baja/[token]`
- `404` → `token` inexistente

## Invariantes garantizados

- Tras un `303`, no queda ningún número de celular guardado para ese pedido, en ninguna
  columna ni en ninguna copia (FR-036, Principio V: *la baja DEBE borrarlo, no marcarlo*).
- El `token_baja` nunca da acceso al pedido, al borrador, a las fotos ni al regalo
  (research.md #13, FR-031).
- Un pedido que nunca dio un celular responde igual, sin revelar que no había nada que borrar
  (SC-016: una compra se puede completar sin dar celular).
- La restricción `celular_requiere_consentimiento` de la tabla hace imposible el estado
  intermedio «número sin consentimiento»: la baja deja los tres campos coherentes o no los
  deja (FR-035, data-model.md).
- La baja no altera el pedido, el borrador ni el regalo: borrar el dato publicitario y borrar
  el pedido son dos acciones distintas, con alcances distintos (FR-030, research.md #16).
- Ningún número de celular se usa para un propósito distinto del declarado al pedirlo, y la
  baja es la vía por la que el comprador lo revoca (FR-035, Compuerta 17).
