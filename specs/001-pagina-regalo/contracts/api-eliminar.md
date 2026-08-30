# Contrato: `DELETE /api/regalos/[id]/eliminar`

Implementa FR-018 / Principio V ("borrado real"). Herramienta operativa sin UI de
administración (research.md #9) — fuera de alcance de esta feature construir un panel.

## Request

- **Método**: `DELETE`
- **Path param**: `id` — UUID del regalo
- **Headers**: `Authorization: Bearer <OPS_SECRET>` — secreto de servidor (variable de
  entorno), distinto del `id` del regalo. Sin este header válido → `401`.
- **Body**: ninguno

## Comportamiento

1. Verifica `Authorization`. Si falta o no coincide con `OPS_SECRET` → `401`, no toca datos.
2. Si el regalo no existe → `404`.
3. Si existe:
   a. Borra del bucket de Storage todos los objetos bajo `regalos/{id}/`.
   b. Borra la fila de `regalos` (el `on delete cascade` de `aperturas.regalo_id` se encarga
      de las aperturas asociadas — FR-018).
   c. Actualiza la fila de `slugs` correspondiente: `regalo_id = NULL`. La fila de `slugs` en
      sí **no se borra** (Principio VI, research.md #4) — el valor del slug queda bloqueado
      para siempre.
4. Responde `204 No Content`.

## Response

- `204` → borrado completo (DB + Storage).
- `401` → secreto ausente o incorrecto.
- `404` → `id` no corresponde a ningún regalo.

## Invariantes garantizados

- Tras un `204`, no queda ninguna fila en `regalos` ni en `aperturas` para ese `id`, y no
  queda ningún objeto en Storage bajo `regalos/{id}/`.
- El `slug` que tenía ese regalo nunca vuelve a asignarse a otro regalo (verificado por la
  fila persistente en `slugs`, no por lógica de aplicación).
- Objetivo de este contrato: completarse en <72 h desde la invocación (Principio V); en la
  práctica, la operación es síncrona y se completa en la misma request.
