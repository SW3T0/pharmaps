-- Función RPC para obtener farmacias con coordenadas extraídas de PostGIS
-- Supabase devuelve geography como WKB hex, que es inútil en el cliente.
-- Esta función usa ST_Y/ST_X para extraer lat/lng como columnas numéricas.

create or replace function public.get_pharmacies_with_coords()
returns table (
  id uuid,
  xunta_id text,
  name text,
  address text,
  city text,
  postal_code text,
  latitude double precision,
  longitude double precision,
  phone text,
  email text,
  contact_person text,
  notes text
)
language sql
stable
security definer
as $$
  select
    p.id,
    p.xunta_id,
    p.name,
    p.address,
    p.city,
    p.postal_code,
    ST_Y(p.location::geometry) as latitude,
    ST_X(p.location::geometry) as longitude,
    p.phone,
    p.email,
    p.contact_person,
    p.notes
  from public.pharmacies p;
$$;

-- Permitir que usuarios autenticados puedan llamar a esta función
grant execute on function public.get_pharmacies_with_coords() to authenticated;
