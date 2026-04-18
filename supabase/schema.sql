-- Anesthesia Hub: core schema (extensions, enums, tables, profile bootstrap)
-- Apply RLS policies from supabase/policies.sql after this file.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- ENUM types (idempotent: skip if already exists)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum (
      'specializzando',
      'addetto_turni',
      'amministratore',
      'tutor_strutturato'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'shift_area_type') then
    create type public.shift_area_type as enum ('sala_operatoria', 'rianimazione');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'shift_kind') then
    create type public.shift_kind as enum (
      'mattina',
      'pomeriggio',
      'giornaliero',
      'notte',
      'guardia',
      'reperibilita'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'leave_request_type') then
    create type public.leave_request_type as enum ('ferie', 'desiderata');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'approval_status') then
    create type public.approval_status as enum ('in_attesa', 'approvato', 'rifiutato');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'resource_type') then
    create type public.resource_type as enum ('pdf', 'link');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'supervision_level') then
    create type public.supervision_level as enum ('diretta', 'indiretta', 'assente');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'autonomy_level') then
    create type public.autonomy_level as enum ('assistito', 'con_supervisione', 'autonomo');
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- profiles: single source of truth for application role (linked to Auth)
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role public.app_role not null default 'specializzando',
  is_active boolean not null default true,
  year_of_training int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_year_of_training_check check (
    year_of_training between 1 and 5
    or year_of_training is null
  )
);

-- Migrate legacy column name residency_year -> year_of_training (non-destructive rename)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'residency_year'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'year_of_training'
  ) then
    alter table public.profiles rename column residency_year to year_of_training;
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- Domain tables
-- ---------------------------------------------------------------------------

create table if not exists public.clinical_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  area_type public.shift_area_type not null,
  specialty text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  shift_date date not null,
  shift_kind public.shift_kind not null,
  location_id uuid not null references public.clinical_locations (id) on delete restrict,
  assignee_profile_id uuid references public.profiles (id) on delete set null,
  supervisor_profile_id uuid references public.profiles (id) on delete set null,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shift_date, shift_kind, location_id)
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  requester_profile_id uuid not null references public.profiles (id) on delete cascade,
  request_type public.leave_request_type not null,
  start_date date not null,
  end_date date not null,
  status public.approval_status not null default 'in_attesa',
  note text,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_requests_date_check check (end_date >= start_date)
);

-- Integrita' stato vs approvazione (idempotente su DB gia' esistenti)
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where c.conname = 'leave_requests_approval_integrity'
      and n.nspname = 'public'
      and t.relname = 'leave_requests'
  ) then
    alter table public.leave_requests
      add constraint leave_requests_approval_integrity check (
        (status = 'in_attesa' and approved_by is null and approved_at is null)
        or (
          status in ('approvato', 'rifiutato')
          and approved_by is not null
          and approved_at is not null
        )
      );
  end if;
end$$;

create table if not exists public.university_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  event_date date not null,
  start_time time,
  end_time time,
  location text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.learning_resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  resource_type public.resource_type not null,
  file_url text,
  external_url text,
  visibility public.app_role[] not null default array[
    'specializzando',
    'addetto_turni',
    'amministratore',
    'tutor_strutturato'
  ]::public.app_role[],
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint learning_resources_link_check check (
    (resource_type = 'pdf' and file_url is not null)
    or (resource_type = 'link' and external_url is not null)
  )
);

create table if not exists public.procedure_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null,
  description text,
  active boolean not null default true
);

create table if not exists public.logbook_entries (
  id uuid primary key default gen_random_uuid(),
  trainee_profile_id uuid not null references public.profiles (id) on delete cascade,
  procedure_catalog_id uuid not null references public.procedure_catalog (id) on delete restrict,
  performed_on date not null,
  clinical_location_id uuid references public.clinical_locations (id) on delete set null,
  supervision_level public.supervision_level not null,
  autonomy_level public.autonomy_level not null,
  confidence_level int not null check (confidence_level between 1 and 5),
  supervisor_profile_id uuid references public.profiles (id) on delete set null,
  notes text,
  patient_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patient_reference_absent check (patient_reference is null)
);

-- ---------------------------------------------------------------------------
-- Helper: current role from profiles (used by RLS policies)
-- ---------------------------------------------------------------------------

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists shifts_set_updated_at on public.shifts;
create trigger shifts_set_updated_at
before update on public.shifts
for each row execute function public.set_updated_at();

drop trigger if exists leave_requests_set_updated_at on public.leave_requests;
create trigger leave_requests_set_updated_at
before update on public.leave_requests
for each row execute function public.set_updated_at();

drop trigger if exists logbook_entries_set_updated_at on public.logbook_entries;
create trigger logbook_entries_set_updated_at
before update on public.logbook_entries
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auth bootstrap: auto-create profile on new auth.users row
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, is_active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'specializzando',
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
