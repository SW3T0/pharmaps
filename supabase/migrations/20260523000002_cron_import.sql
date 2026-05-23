-- 1. Habilitar extensiones necesarias para automatización cron
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Eliminar tarea previa si existe para evitar duplicados
select cron.unschedule('sync-pharmacies-weekly');

-- 3. Programar la actualización semanal (Cada domingo a las 02:00 AM)
-- La tarea invoca la Edge Function de Supabase para descargar y sincronizar farmacias desde el Sergas/OSM
select cron.schedule(
  'sync-pharmacies-weekly',
  '0 2 * * 0', -- Domingo 2:00 AM
  $$
  select net.http_post(
    url := 'https://putjmoosncbafmspmtvz.supabase.co/functions/v1/import-pharmacies',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
