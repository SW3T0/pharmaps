-- Habilitar extensiones necesarias
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1. Tabla de Configuración de la Aplicación
create table if not exists public.app_settings (
  key text primary key,
  value jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Habilitar RLS
alter table public.app_settings enable row level security;

-- Políticas RLS
create policy "Cualquier usuario autenticado puede leer configuración"
  on public.app_settings for select using (auth.role() = 'authenticated');

create policy "Cualquier usuario autenticado puede modificar configuración"
  on public.app_settings for all using (auth.role() = 'authenticated');

-- Insertar configuración inicial (activa por defecto)
insert into public.app_settings (key, value)
values ('weekly_sync', '{"enabled": true}'::jsonb)
on conflict (key) do nothing;

-- 2. Función para verificar si pg_cron tiene programada la sincronización
create or replace function public.is_weekly_sync_active()
returns boolean
language plpgsql
security definer -- Ejecuta con privilegios del creador (postgres) para poder leer cron.job
as $$
declare
  is_active boolean;
begin
  -- Intentar buscar en cron.job
  select exists (
    select 1 from cron.job where jobname = 'sync-pharmacies-weekly'
  ) into is_active;
  return is_active;
exception
  when others then
    -- Fallback si no hay acceso o no está instalado
    return false;
end;
$$;

-- 3. Función para activar/desactivar la sincronización semanal
create or replace function public.toggle_weekly_sync(enable_sync boolean)
returns boolean
language plpgsql
security definer -- Ejecuta con privilegios del creador para poder modificar cron.schedule/unschedule
as $$
begin
  if enable_sync then
    -- Registrar en configuración
    insert into public.app_settings (key, value, updated_at)
    values ('weekly_sync', '{"enabled": true}'::jsonb, now())
    on conflict (key) do update set value = '{"enabled": true}'::jsonb, updated_at = now();

    -- Desprogramar previamente por si ya existiera para evitar duplicados o errores
    perform cron.unschedule('sync-pharmacies-weekly');

    -- Programar la tarea semanal (Domingo 2:00 AM)
    perform cron.schedule(
      'sync-pharmacies-weekly',
      '0 2 * * 0', -- Cada Domingo a las 02:00 AM
      $sub$
      select net.http_post(
        url := 'https://putjmoosncbafmspmtvz.supabase.co/functions/v1/import-pharmacies',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb
      );
      $sub$
    );
  else
    -- Registrar en configuración de desactivación
    insert into public.app_settings (key, value, updated_at)
    values ('weekly_sync', '{"enabled": false}'::jsonb, now())
    on conflict (key) do update set value = '{"enabled": false}'::jsonb, updated_at = now();

    -- Desprogramar de pg_cron
    perform cron.unschedule('sync-pharmacies-weekly');
  end if;

  return enable_sync;
exception
  when others then
    return false;
end;
$$;
