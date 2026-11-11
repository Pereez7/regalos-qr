-- Data model: specs/002-compra-a-qr/data-model.md
-- Cuatro tablas nuevas sobre el esquema de la feature 001. `regalos`, `slugs` y `aperturas`
-- NO se tocan: ni una columna, ni un índice (research.md #10, #20).
-- La generación de identificadores con alfabeto propio (`token_baja`) vive en código
-- (src/lib/pedidos.ts), igual que los slugs en la 001.

create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  estado text not null default 'iniciado' check (estado in ('iniciado', 'pagado')),
  email text not null,
  celular text null,
  consentimiento_publicidad boolean not null default false,
  consentimiento_en timestamptz null,
  baja_publicidad_en timestamptz null,
  token_baja text not null unique,
  borrador jsonb not null default '{"v": 1}'::jsonb,
  -- La referencia va de `pedidos` a `regalos` y no al revés: el motor no sabe de comercio
  -- (research.md #10). `on delete set null` y no `cascade`: borrar un regalo no puede borrar
  -- el registro de un cobro (Principio VII).
  regalo_id uuid null unique references regalos (id) on delete set null,
  creado_en timestamptz not null default now(),
  pagado_en timestamptz null,
  actualizado_en timestamptz not null default now(),
  qr_emitido_en timestamptz null,
  qr_simulacion boolean not null default false,

  -- Mismo patrón que `aprobado_en_requiere_publicado` de la 001: el instante del hecho y el
  -- estado que lo declara no pueden desincronizarse.
  constraint pagado_en_requiere_pagado check (
    (estado = 'pagado' and pagado_en is not null) or estado = 'iniciado'
  ),

  -- FR-035: el número no se guarda sin consentimiento ni sin su fecha, y lo hace cumplir la
  -- tabla. Un bug del manejador del formulario no puede producir ese estado. La inversa
  -- —consentimiento sin celular— sí se admite: es lo que queda tras la baja, y un
  -- consentimiento sin dato asociado no guarda nada de nadie.
  constraint celular_requiere_consentimiento check (
    celular is null or (consentimiento_publicidad and consentimiento_en is not null)
  ),

  constraint email_no_vacio check (length(trim(email)) > 2 and position('@' in email) > 1),

  -- research.md #22: la marca de simulación no puede existir sin la emisión que la produjo.
  constraint qr_simulacion_requiere_emision check (
    qr_emitido_en is not null or qr_simulacion = false
  )
);

-- Cola operativa: pagados sin regalo e iniciados que nunca se pagaron (FR-008, research.md #14).
-- No hay índice por `email`, y es deliberado: ningún flujo busca un pedido por correo, y un
-- índice por correo es la estructura que convierte una base de pedidos en una lista de
-- direcciones consultable.
create index if not exists pedidos_estado_creado_en_idx on pedidos (estado, creado_en desc);

create table if not exists pagos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos (id) on delete cascade,
  -- `proveedor` sin `check`: agregar un proveedor es registrar un archivo en
  -- src/lib/pagos/registro.ts (Principio II), no correr una migración.
  proveedor text not null,
  pago_id_proveedor text null,
  -- Enteros en unidades mínimas: un monto en coma flotante es un error de dinero esperando su
  -- redondeo. `monto_centavos` es el cotizado al iniciar el cobro y no se reescribe nunca, así
  -- que un cambio de precio no toca la historia de lo ya vendido (research.md #18).
  monto_centavos integer not null,
  moneda text not null,
  -- El monto que informó el proveedor, cuando difiere del cotizado (research.md #23). `null`
  -- es el caso normal: no hubo discrepancia. Se guardan los dos para que la discrepancia sea
  -- detectable en la cola operativa; el pago no se bloquea.
  monto_informado_centavos integer null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobado', 'rechazado')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),

  constraint monto_positivo check (monto_centavos > 0),
  constraint monto_informado_positivo check (
    monto_informado_centavos is null or monto_informado_centavos > 0
  ),
  constraint moneda_iso check (moneda ~ '^[A-Z]{3}$'),

  -- Un pago del proveedor, una fila. Los `null` múltiples que Postgres admite en un índice
  -- único son exactamente lo que necesita un cobro todavía no informado.
  constraint pagos_proveedor_pago_id_key unique (proveedor, pago_id_proveedor)
);

create index if not exists pagos_pedido_id_idx on pagos (pedido_id);

-- A lo sumo un cobro sin reclamar por pedido, de modo que el aviso sepa sin ambigüedad qué
-- fila actualizar.
create unique index if not exists pagos_pendiente_por_pedido_idx
  on pagos (pedido_id) where pago_id_proveedor is null;

-- No está en las Key Entities del spec: es la estructura que hace cumplir FR-004
-- (idempotencia) a nivel de base y no de código (research.md #2).
-- No guarda el cuerpo crudo del aviso: un payload completo del proveedor puede traer los
-- últimos dígitos de la tarjeta o el nombre del titular, y archivarlo "por si acaso" sería
-- almacenar datos de tarjeta por la puerta de atrás (FR-006).
create table if not exists eventos_pago (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null,
  -- El identificador del EVENTO en el proveedor, no el del pago: dos avisos distintos del
  -- mismo pago son dos eventos.
  evento_id text not null,
  -- Nullable a propósito: un aviso cuyo pedido no existe se registra igual, con
  -- `resultado = 'sin_pedido'`. Una FK `not null` haría ese registro imposible y el aviso se
  -- perdería en silencio, que es lo que el Principio VII prohíbe.
  pedido_id uuid null references pedidos (id) on delete cascade,
  pago_id uuid null references pagos (id) on delete cascade,
  estado_informado text not null,
  resultado text not null,
  recibido_en timestamptz not null default now(),

  -- Esta es la idempotencia, y es toda la idempotencia que hay (FR-004): el manejador verifica
  -- la firma primero y recién entonces inserta; si la inserción viola esta unicidad, responde
  -- 200 y no hace nada más. Un `select` previo tendría una ventana de carrera que la
  -- restricción única no tiene.
  constraint eventos_pago_proveedor_evento_key unique (proveedor, evento_id),
  constraint resultado_valido check (resultado in ('aplicado', 'sin_efecto', 'sin_pedido'))
);

create index if not exists eventos_pago_pedido_id_idx on eventos_pago (pedido_id);
create index if not exists eventos_pago_sin_pedido_idx on eventos_pago (recibido_en)
  where resultado = 'sin_pedido';

create table if not exists avisos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references pedidos (id) on delete cascade,
  tipo text not null,
  -- La dirección de correo a la que se envió. NUNCA el celular: el celular tiene un propósito
  -- declarado distinto y usarlo acá lo violaría (FR-035).
  destinatario text not null,
  proveedor text not null,
  estado text not null default 'pendiente',
  intentos integer not null default 0,
  -- Motivo de la última falla, acotado. Nunca el cuerpo del mensaje ni contenido de la historia.
  error text null,
  creado_en timestamptz not null default now(),
  enviado_en timestamptz null,

  -- Cada aviso se emite una sola vez (FR-026). No pelea con el reintento: reintentar es un
  -- UPDATE sobre la misma fila que incrementa `intentos`. El registro del aviso es la
  -- intención de avisar, no cada intento de red.
  constraint avisos_pedido_tipo_key unique (pedido_id, tipo),
  constraint tipo_valido check (tipo in ('comprobante', 'revision', 'aprobacion')),
  constraint estado_valido check (estado in ('pendiente', 'enviado', 'fallido')),
  constraint enviado_en_requiere_enviado check (
    (estado = 'enviado' and enviado_en is not null) or estado <> 'enviado'
  )
);

-- Cola operativa: lo que falta mandar y lo que falló (research.md #14, FR-029).
create index if not exists avisos_no_enviados_idx on avisos (creado_en) where estado <> 'enviado';

-- Igual que en la 001: la app accede exclusivamente vía la service role, server-only
-- (src/lib/supabase.ts). RLS queda deshabilitado (no hay acceso anon/authenticated a estas
-- tablas); estos GRANT son necesarios porque las tablas creadas por migración no heredan
-- privilegios por defecto sobre el rol service_role.
grant usage on schema public to service_role;
grant select, insert, update, delete on pedidos, pagos, eventos_pago, avisos to service_role;
