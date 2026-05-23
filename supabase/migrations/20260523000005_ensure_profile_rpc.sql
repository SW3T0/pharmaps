-- 1. Función RPC para crear/asegurar el perfil del usuario autenticado
--    Usa SECURITY DEFINER para bypassar RLS en la tabla profiles.
--    Es idempotente: si ya existe, no hace nada.
create or replace function public.ensure_user_profile(
  p_full_name text default 'Delegado'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (auth.uid(), p_full_name, 'delegado')
  on conflict (id) do nothing;
end;
$$;

grant execute on function public.ensure_user_profile(text) to authenticated;

-- 2. Política INSERT en profiles (respaldo por si se llama directo)
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where tablename = 'profiles' 
    and policyname = 'Usuarios pueden crear su propio perfil'
  ) then
    create policy "Usuarios pueden crear su propio perfil"
      on public.profiles for insert
      with check (auth.uid() = id);
  end if;
end;
$$;
