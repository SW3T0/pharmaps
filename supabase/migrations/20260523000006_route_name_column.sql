-- Add name column to routes table for descriptive route naming
alter table public.routes add column if not exists name text;
