-- Habilitar extensión PostGIS para geolocalización
create extension if not exists postgis;

-- 1. Tabla de Perfiles de Delegados
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  updated_at timestamp with time zone,
  full_name text not null,
  role text check (role in ('admin', 'delegado')) default 'delegado',
  company_id uuid not null default '00000000-0000-0000-0000-000000000000'
);

-- 2. Tabla de Farmacias (Galicia)
create table if not exists public.pharmacies (
  id uuid default gen_random_uuid() primary key,
  xunta_id text unique, -- ID oficial de la Xunta de Galicia
  name text not null,
  address text not null,
  city text not null,
  postal_code text not null,
  location geography(Point, 4326) not null, -- Coordenadas geoespaciales
  phone text,
  email text,
  contact_person text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Crear índice espacial GIST en la columna location para optimizar búsquedas por cercanía
create index if not exists pharmacies_location_idx on public.pharmacies using gist(location);

-- 3. Tabla de Relación Delegado-Cliente (Farmacia Asignada)
create table if not exists public.delegado_pharmacies (
  delegado_id uuid references public.profiles(id) on delete cascade,
  pharmacy_id uuid references public.pharmacies(id) on delete cascade,
  primary key (delegado_id, pharmacy_id)
);

-- 4. Tabla de Rutas Planificadas
create table if not exists public.routes (
  id uuid default gen_random_uuid() primary key,
  delegado_id uuid references public.profiles(id) on delete cascade not null,
  date date not null,
  status text check (status in ('draft', 'active', 'completed', 'cancelled')) default 'draft',
  distance_meters numeric default 0,
  duration_seconds numeric default 0,
  polyline text, -- Codificación de la línea geométrica de la ruta
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Tabla de Paradas (Waypoints) dentro de una Ruta
create table if not exists public.route_stops (
  id uuid default gen_random_uuid() primary key,
  route_id uuid references public.routes(id) on delete cascade not null,
  pharmacy_id uuid references public.pharmacies(id) on delete cascade not null,
  stop_order integer not null, -- Posición en la secuencia óptima
  status text check (status in ('pending', 'completed', 'skipped')) default 'pending',
  check_in_time timestamp with time zone,
  check_out_time timestamp with time zone,
  notes text,
  constraint unique_route_stop_order unique (route_id, stop_order)
);

-- 6. Tabla de Sesiones de Chat (para mantener el historial y contexto de la conversación)
create table if not exists public.chat_sessions (
  id uuid default gen_random_uuid() primary key,
  delegado_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 7. Tabla de Mensajes del Chatbot
create table if not exists public.chat_messages (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references public.chat_sessions(id) on delete cascade not null,
  sender text check (sender in ('user', 'assistant')) not null,
  content text not null,
  message_type text check (message_type in ('text', 'route_card', 'error')) default 'text',
  metadata jsonb, -- Almacena información de la ruta generada (distancia, duración, polyline)
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Habilitar RLS en las tablas
alter table public.profiles enable row level security;
alter table public.pharmacies enable row level security;
alter table public.delegado_pharmacies enable row level security;
alter table public.routes enable row level security;
alter table public.route_stops enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;

-- Políticas RLS para Profiles
create policy "Los usuarios pueden ver su propio perfil" 
  on public.profiles for select using (auth.uid() = id);

create policy "Los usuarios pueden actualizar su propio perfil" 
  on public.profiles for update using (auth.uid() = id);

-- Políticas RLS para Pharmacies (Lectura pública para autenticados)
create policy "Cualquier delegado autenticado puede ver farmacias" 
  on public.pharmacies for select using (auth.role() = 'authenticated');

-- Políticas RLS para Delegado-Pharmacies
create policy "Delegados pueden ver sus asignaciones de farmacias" 
  on public.delegado_pharmacies for select using (auth.uid() = delegado_id);

-- Políticas RLS para Routes (Solo el dueño de la ruta puede gestionarla)
create policy "Delegados pueden gestionar sus propias rutas"
  on public.routes for all using (auth.uid() = delegado_id);

-- Políticas RLS para Route Stops (Accesible si la ruta pertenece al delegado)
create policy "Delegados pueden gestionar las paradas de sus rutas"
  on public.route_stops for all using (
    exists (
      select 1 from public.routes 
      where routes.id = route_stops.route_id and routes.delegado_id = auth.uid()
    )
  );

-- Políticas RLS para Chat Sessions
create policy "Delegados pueden gestionar sus propias sesiones de chat"
  on public.chat_sessions for all using (auth.uid() = delegado_id);

-- Políticas RLS para Chat Messages
create policy "Delegados pueden gestionar sus propios mensajes"
  on public.chat_messages for all using (
    exists (
      select 1 from public.chat_sessions 
      where chat_sessions.id = chat_messages.session_id and chat_sessions.delegado_id = auth.uid()
    )
  );
