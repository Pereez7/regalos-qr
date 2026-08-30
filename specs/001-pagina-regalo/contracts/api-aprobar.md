# Contrato: `POST /api/regalos/[id]/aprobar`

Implementa FR-013 / Principio III. Invocado por el `<form>` plano de `/revisar/[id]`
(research.md #8) — no requiere JavaScript de cliente.

## Request

- **Método**: `POST`
- **Path param**: `id` — UUID del regalo (también el token de acceso a `/revisar/[id]`)
- **Body**: ninguno (form vacío; toda la información necesaria está en `id`)
- **Auth**: ninguna — el conocimiento del `id` (UUID v4, no listado públicamente) es la
  autorización, igual que el acceso a `/revisar/[id]` (Assumptions: sin login)

## Comportamiento

1. Busca el regalo por `id`.
2. Si no existe → 404, redirect a `/no-disponible`.
3. Si `estado != 'en_revision'` (ya publicado) → no vuelve a aprobar; redirect 303 a
   `/revisar/[id]` sin modificar `aprobado_en` (una aprobación no se sobrescribe).
4. Si `estado == 'en_revision'`:
   - `UPDATE regalos SET aprobado_en = now(), estado = 'publicado' WHERE id = $1 AND estado = 'en_revision'`
   - Esta UPDATE condicional es la misma técnica de atomicidad que research.md #5, para el
     caso de doble submit del form.
5. Redirect 303 a `/revisar/[id]`, que ahora muestra el estado "publicado" y la fecha de
   aprobación.

## Response

- `303 See Other` → `Location: /revisar/[id]` en el camino feliz y en el caso ya-aprobado.
- `404` → cuando `id` no corresponde a ningún regalo.

## Invariantes garantizados

- `aprobado_en`, una vez seteado, no cambia (FR-013: "queda idéntico lo aprobado y lo
  entregado").
- Nunca hay una fila con `estado = 'publicado'` y `aprobado_en IS NULL`.
