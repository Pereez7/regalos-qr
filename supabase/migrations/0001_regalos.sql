-- Data model: specs/001-pagina-regalo/data-model.md
-- Slug alphabet/generation lives in application code (src/lib/slugs.ts, research.md #3).

create table if not exists slugs (
  slug text primary key,
  regalo_id uuid null,
  creado_en timestamptz not null default now()
);

create table if not exists regalos (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique references slugs (slug),
  tema text not null check (tema in ('nocturno', 'papel', 'luminoso')),
  contenido jsonb not null,
  estado text not null default 'en_revision' check (estado in ('en_revision', 'publicado')),
  aprobado_en timestamptz null,
  vencimiento timestamptz null,
  primera_apertura_en timestamptz null,
  created_at timestamptz not null default now(),
  constraint aprobado_en_requiere_publicado check (
    (estado = 'publicado' and aprobado_en is not null) or estado = 'en_revision'
  )
);

alter table slugs
  add constraint slugs_regalo_id_fkey foreign key (regalo_id) references regalos (id);

create table if not exists aperturas (
  id uuid primary key default gen_random_uuid(),
  regalo_id uuid not null references regalos (id) on delete cascade,
  ocurrido_en timestamptz not null default now(),
  es_primera boolean not null default false
);

create index if not exists aperturas_regalo_id_idx on aperturas (regalo_id);
create index if not exists regalos_slug_idx on regalos (slug);

-- La app accede exclusivamente vía la service role, server-only (src/lib/supabase.ts).
-- RLS queda deshabilitado (no hay acceso anon/authenticated a estas tablas); estos
-- GRANT son necesarios porque las tablas creadas por migración no heredan privilegios
-- por defecto sobre el rol service_role.
grant usage on schema public to service_role;
grant select, insert, update, delete on slugs, regalos, aperturas to service_role;
