-- Cobro con QR interbancario y confirmación manual (research.md #24).
--
-- El QR estático cobra bien pero no dice QUÉ PEDIDO pagó. El comprador declara su pago
-- dejando el número de comprobante de la transferencia, y con ese número el negocio la
-- encuentra en su app del banco y confirma desde la cola operativa.
--
-- Es un dato del cobro, no un estado de la venta: el pedido sigue teniendo dos estados y una
-- sola transición. Mientras el pago no esté confirmado, el pedido sigue `iniciado` y
-- /gracias/[pedido] muestra "pendiente de pago", que es la verdad.
--
-- No es un dato sensible por sí solo: identifica una transferencia, no a una persona, y se
-- borra con la fila de `pagos` por la cascada del borrado del pedido (FR-030).

alter table pagos add column if not exists referencia_comprador text;

alter table pagos drop constraint if exists referencia_comprador_acotada;
alter table pagos add constraint referencia_comprador_acotada
  check (referencia_comprador is null or length(referencia_comprador) <= 64);

-- Cola operativa: los cobros que el comprador declaró y todavía nadie confirmó.
create index if not exists pagos_por_confirmar_idx on pagos (creado_en)
  where estado = 'pendiente' and referencia_comprador is not null;
