-- Escritura dirigida del borrador (specs/002-compra-a-qr/contracts/api-borrador.md, paso 7).
--
-- Por qué estas funciones existen, y no es una preferencia de estilo: el contrato exige
-- escribir UNA RAMA del `jsonb` y no reescribir el documento entero con lo que tenía cargado
-- esa pestaña. Leer-modificar-escribir desde la aplicación tiene una ventana en la que dos
-- pestañas abiertas en pasos distintos se pisan lo que la otra guardó, y el comprador YA
-- PAGÓ: es el peor momento del producto para perder datos. PostgREST no sabe expresar
-- `jsonb_set`, así que la escritura dirigida vive donde sí es atómica — en la base.

-- Fusión superficial de ramas: `||` reemplaza las claves de primer nivel que vienen en
-- `p_ramas` y deja intactas las demás. Eso es exactamente "escribir la rama del paso".
-- `p_borrar` saca claves que el comprador vació (una fecha que borró, por ejemplo): sin eso
-- quedarían como `null` y el esquema del borrador no admite `null`, solo ausencia.
create or replace function guardar_ramas_borrador(
  p_pedido_id uuid,
  p_ramas jsonb,
  p_paso text,
  p_borrar text[] default '{}'
) returns jsonb
language sql
as $$
  update pedidos
     set borrador = (
           (coalesce(borrador, '{"v": 1}'::jsonb) || p_ramas) - p_borrar
         ) || jsonb_build_object('v', 1, 'paso', p_paso, 'actualizadoEn', to_jsonb(now())),
         actualizado_en = now()
   where id = p_pedido_id
  returning borrador;
$$;

-- Agrega una foto al final de `fotos[]` en una sola sentencia. Dos subidas simultáneas no
-- se pierden una a la otra, que es lo que pasaría con un leer-modificar-escribir.
create or replace function agregar_foto_borrador(
  p_pedido_id uuid,
  p_foto jsonb
) returns jsonb
language sql
as $$
  update pedidos
     set borrador = jsonb_set(
           coalesce(borrador, '{"v": 1}'::jsonb),
           '{fotos}',
           coalesce(borrador -> 'fotos', '[]'::jsonb) || jsonb_build_array(p_foto),
           true
         ),
         actualizado_en = now()
   where id = p_pedido_id
  returning borrador;
$$;

-- Quita una foto por su ruta y limpia toda referencia a ella desde los momentos, para que no
-- quede un momento apuntando a una foto que ya no existe (api-fotos.md, paso 4 de `quitar`).
create or replace function quitar_foto_borrador(
  p_pedido_id uuid,
  p_ruta text
) returns jsonb
language plpgsql
as $$
declare
  v_borrador jsonb;
  v_fotos jsonb;
  v_momentos jsonb;
begin
  select borrador into v_borrador from pedidos where id = p_pedido_id;
  if v_borrador is null then
    return null;
  end if;

  select coalesce(jsonb_agg(foto), '[]'::jsonb) into v_fotos
    from jsonb_array_elements(coalesce(v_borrador -> 'fotos', '[]'::jsonb)) as foto
   where foto ->> 'ruta' is distinct from p_ruta;

  select coalesce(
           jsonb_agg(
             case when momento ->> 'fotoRuta' = p_ruta
                  then momento - 'fotoRuta'
                  else momento
             end
           ),
           '[]'::jsonb
         )
    into v_momentos
    from jsonb_array_elements(coalesce(v_borrador -> 'momentos', '[]'::jsonb)) as momento;

  update pedidos
     set borrador = jsonb_set(
           jsonb_set(v_borrador, '{fotos}', v_fotos, true),
           '{momentos}',
           v_momentos,
           true
         ),
         actualizado_en = now()
   where id = p_pedido_id
  returning borrador into v_borrador;

  return v_borrador;
end;
$$;

-- Reescribe las rutas del borrador después de mudar los objetos al prefijo del regalo
-- (research.md #16). Idempotente: una ruta que ya está en el destino no cambia.
create or replace function mudar_rutas_borrador(
  p_pedido_id uuid,
  p_regalo_id uuid
) returns jsonb
language plpgsql
as $$
declare
  v_borrador jsonb;
  v_origen text := 'pedidos/' || p_pedido_id::text || '/';
  v_destino text := 'regalos/' || p_regalo_id::text || '/';
  v_fotos jsonb;
  v_momentos jsonb;
begin
  select borrador into v_borrador from pedidos where id = p_pedido_id;
  if v_borrador is null then
    return null;
  end if;

  select coalesce(
           jsonb_agg(
             case when foto ->> 'ruta' like v_origen || '%'
                  then jsonb_set(foto, '{ruta}',
                         to_jsonb(v_destino || replace(foto ->> 'ruta', v_origen, '')))
                  else foto
             end
           ),
           '[]'::jsonb
         )
    into v_fotos
    from jsonb_array_elements(coalesce(v_borrador -> 'fotos', '[]'::jsonb)) as foto;

  select coalesce(
           jsonb_agg(
             case when momento ->> 'fotoRuta' like v_origen || '%'
                  then jsonb_set(momento, '{fotoRuta}',
                         to_jsonb(v_destino || replace(momento ->> 'fotoRuta', v_origen, '')))
                  else momento
             end
           ),
           '[]'::jsonb
         )
    into v_momentos
    from jsonb_array_elements(coalesce(v_borrador -> 'momentos', '[]'::jsonb)) as momento;

  update pedidos
     set borrador = jsonb_set(
           jsonb_set(v_borrador, '{fotos}', v_fotos, true),
           '{momentos}',
           v_momentos,
           true
         ),
         actualizado_en = now()
   where id = p_pedido_id
  returning borrador into v_borrador;

  return v_borrador;
end;
$$;

grant execute on function guardar_ramas_borrador(uuid, jsonb, text, text[]) to service_role;
grant execute on function agregar_foto_borrador(uuid, jsonb) to service_role;
grant execute on function quitar_foto_borrador(uuid, text) to service_role;
grant execute on function mudar_rutas_borrador(uuid, uuid) to service_role;
