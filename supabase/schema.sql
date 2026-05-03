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
      'admin',
      'tutor'
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

do $$
begin
  if not exists (select 1 from pg_type where typname = 'assegnazione_specializzando') then
    create type public.assegnazione_specializzando as enum (
      'rianimazione',
      'sala_base',
      'sala_locoregionale',
      'sala_avanzata'
    );
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- profiles: single source of truth for application role (linked to Auth)
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  nome text not null default '',
  cognome text not null default '',
  telefono text,
  role public.app_role not null default 'specializzando',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.specializzandi_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  anno_specialita int not null,
  assegnazione public.assegnazione_specializzando not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint specializzandi_profiles_anno_check check (anno_specialita between 1 and 5)
);

create index if not exists specializzandi_profiles_assegnazione_idx
  on public.specializzandi_profiles (assegnazione);

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

create table if not exists public.clinical_areas (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.clinical_areas (code, name, sort_order)
values
  ('rianimazione', 'Rianimazione', 10),
  ('sala_base', 'Sala base', 20),
  ('sala_locoregionale', 'Sala locoregionale', 30),
  ('sala_avanzata', 'Sala avanzata', 40)
on conflict (code) do update
set
  name = excluded.name,
  sort_order = excluded.sort_order;

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

-- Turni v2 workflow fields (idempotent and rollout-safe)
alter table public.shifts
  add column if not exists status text;

alter table public.shifts
  add column if not exists proposed_by uuid references public.profiles (id) on delete set null;

alter table public.shifts
  add column if not exists submitted_at timestamptz;

alter table public.shifts
  add column if not exists approved_by uuid references public.profiles (id) on delete set null;

alter table public.shifts
  add column if not exists approved_at timestamptz;

alter table public.shifts
  add column if not exists rejected_by uuid references public.profiles (id) on delete set null;

alter table public.shifts
  add column if not exists rejected_at timestamptz;

alter table public.shifts
  add column if not exists rejection_reason text;

-- Backfill legacy rows: assigned -> approved, unassigned -> draft
update public.shifts
set status = case
  when assignee_profile_id is not null then 'approved'
  else 'draft'
end
where status is null;

alter table public.shifts
  alter column status set default 'draft';

alter table public.shifts
  alter column status set not null;

alter table public.shifts
  drop constraint if exists shifts_status_check;

alter table public.shifts
  add constraint shifts_status_check check (status in ('draft', 'submitted', 'approved', 'rejected'));

-- Optional audit backfill for legacy assigned shifts
update public.shifts
set approved_at = coalesce(approved_at, now())
where status = 'approved'
  and approved_at is null
  and assignee_profile_id is not null;

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
    'admin',
    'tutor'
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
-- Turnistica mensile (piano mese + righe turno assegnabili)
-- ---------------------------------------------------------------------------

create table if not exists public.monthly_shift_plans (
  id uuid primary key default gen_random_uuid(),
  year int not null,
  month int not null check (month between 1 and 12),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved')),
  created_by uuid references public.profiles (id) on delete set null,
  submitted_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  reopened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (year, month)
);

create table if not exists public.shift_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.monthly_shift_plans (id) on delete cascade,
  shift_date date not null,
  kind text not null check (kind in ('sala', 'ambulatorio', 'reperibilita')),
  period text not null check (period in ('mattina', 'pomeriggio', 'giornata', 'reperibilita')),
  start_time time,
  end_time time,
  label text not null,
  room_name text,
  specialty text,
  source text not null default 'generated'
    check (source in ('excel', 'generated', 'manual')),
  assigned_to uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shift_items
  add column if not exists clinical_area_id uuid references public.clinical_areas (id) on delete restrict;

create index if not exists shift_items_clinical_area_id_idx
  on public.shift_items (clinical_area_id)
  where clinical_area_id is not null;

create index if not exists shift_items_plan_id_shift_date_idx
  on public.shift_items (plan_id, shift_date);

create table if not exists public.planning_change_log (
  id uuid primary key default gen_random_uuid(),
  planning_month_id uuid not null references public.monthly_shift_plans (id) on delete cascade,
  shift_id uuid references public.shift_items (id) on delete set null,
  actor_user_id uuid references public.profiles (id) on delete set null,
  action text not null check (action in ('created', 'updated', 'deleted', 'imported')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists planning_change_log_plan_created_idx
  on public.planning_change_log (planning_month_id, created_at desc);

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

drop trigger if exists monthly_shift_plans_set_updated_at on public.monthly_shift_plans;
create trigger monthly_shift_plans_set_updated_at
before update on public.monthly_shift_plans
for each row execute function public.set_updated_at();

drop trigger if exists shift_items_set_updated_at on public.shift_items;
create trigger shift_items_set_updated_at
before update on public.shift_items
for each row execute function public.set_updated_at();

drop trigger if exists clinical_areas_set_updated_at on public.clinical_areas;
create trigger clinical_areas_set_updated_at
before update on public.clinical_areas
for each row execute function public.set_updated_at();

drop trigger if exists specializzandi_profiles_set_updated_at on public.specializzandi_profiles;
create trigger specializzandi_profiles_set_updated_at
before update on public.specializzandi_profiles
for each row execute function public.set_updated_at();

-- Aggiorna vincoli su DB già creati prima dell’aggiunta di `manual` (idempotente)
alter table public.shift_items drop constraint if exists shift_items_source_check;
alter table public.shift_items add constraint shift_items_source_check
  check (source in ('excel', 'generated', 'manual'));

-- ---------------------------------------------------------------------------
-- Profili: integrità ruolo vs specializzandi_profiles
-- ---------------------------------------------------------------------------

create or replace function public.profiles_strip_specializzandi_on_role_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and old.role = 'specializzando'
     and new.role in ('admin', 'tutor') then
    delete from public.specializzandi_profiles where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_strip_specializzandi_on_role_change on public.profiles;

create trigger profiles_strip_specializzandi_on_role_change
before update of role on public.profiles
for each row
execute function public.profiles_strip_specializzandi_on_role_change();

create or replace function public.profiles_specializzando_integrity()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'specializzando' then
    if not exists (
      select 1
      from public.specializzandi_profiles sp
      where sp.user_id = new.id
    ) then
      raise exception 'specializzando richiede specializzandi_profiles (anno_specialita e assegnazione).';
    end if;
  elsif new.role in ('admin', 'tutor') then
    if exists (
      select 1
      from public.specializzandi_profiles sp
      where sp.user_id = new.id
    ) then
      raise exception 'ruolo % non ammette dati in specializzandi_profiles.', new.role;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_specializzando_integrity on public.profiles;

create constraint trigger profiles_specializzando_integrity
after insert or update of role on public.profiles
deferrable initially deferred
for each row
execute function public.profiles_specializzando_integrity();

-- ---------------------------------------------------------------------------
-- Aggiornamento profilo Admin (singola transazione; solo service_role)
-- ---------------------------------------------------------------------------

create or replace function public.admin_apply_profile_update(
  p_user_id uuid,
  p_nome text,
  p_cognome text,
  p_telefono text,
  p_email text,
  p_is_active boolean,
  p_role public.app_role,
  p_anno int,
  p_asseg public.assegnazione_specializzando
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_role not in ('specializzando'::public.app_role, 'admin'::public.app_role, 'tutor'::public.app_role) then
    raise exception 'Ruolo non valido.';
  end if;

  if p_role = 'specializzando'::public.app_role then
    if p_anno is null or p_anno < 1 or p_anno > 5 or p_asseg is null then
      raise exception 'specializzando richiede anno_specialita (1–5) e assegnazione.';
    end if;
  end if;

  if coalesce(nullif(trim(p_nome), ''), '') = '' or coalesce(nullif(trim(p_cognome), ''), '') = '' then
    raise exception 'Nome e cognome obbligatori.';
  end if;

  update public.profiles
  set
    nome = trim(p_nome),
    cognome = trim(p_cognome),
    telefono = nullif(trim(p_telefono), ''),
    email = lower(nullif(trim(p_email), '')),
    is_active = p_is_active,
    role = p_role,
    updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'Utente non trovato.';
  end if;

  if lower(nullif(trim(p_email), '')) is null then
    raise exception 'Email obbligatoria.';
  end if;

  if p_role = 'specializzando'::public.app_role then
    insert into public.specializzandi_profiles as sp (user_id, anno_specialita, assegnazione)
    values (p_user_id, p_anno, p_asseg)
    on conflict (user_id) do update set
      anno_specialita = excluded.anno_specialita,
      assegnazione = excluded.assegnazione,
      updated_at = now();
  else
    delete from public.specializzandi_profiles where user_id = p_user_id;
  end if;
end;
$$;

revoke all on function public.admin_apply_profile_update(
  uuid, text, text, text, text, boolean,
  public.app_role, integer, public.assegnazione_specializzando
)
from PUBLIC;

revoke execute on function public.admin_apply_profile_update(
  uuid, text, text, text, text, boolean,
  public.app_role, integer, public.assegnazione_specializzando
)
from anon, authenticated;

grant execute on function public.admin_apply_profile_update(
  uuid, text, text, text, text, boolean,
  public.app_role, integer, public.assegnazione_specializzando
)
to service_role;

-- ---------------------------------------------------------------------------
-- Auth bootstrap: auto-create profile on new auth.users row
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  r text := nullif(trim(meta ->> 'role'), '');
  resolved_role public.app_role := 'specializzando'::public.app_role;
  v_nome text := coalesce(nullif(trim(meta ->> 'nome'), ''), '');
  v_cognome text := coalesce(nullif(trim(meta ->> 'cognome'), ''), '');
  v_telefono text := nullif(trim(meta ->> 'telefono'), '');
  v_anno int;
  v_asseg_raw text := nullif(trim(meta ->> 'assegnazione'), '');
  v_asseg_enum public.assegnazione_specializzando;
  meta_anno_nonempty boolean := nullif(trim(meta ->> 'anno_specialita'), '') is not null;
  meta_asseg_nonempty boolean := v_asseg_raw is not null;
begin
  if r in ('specializzando', 'admin', 'tutor') then
    resolved_role := r::public.app_role;
  end if;

  if resolved_role in ('admin', 'tutor') then
    if meta_anno_nonempty or meta_asseg_nonempty then
      raise exception
        'Metadati anno_specialita/assegnazione non ammessi per ruolo % (usare solo per specializzando).',
        resolved_role;
    end if;
  end if;

  if v_nome = '' and v_cognome = '' and meta ? 'full_name' then
    v_nome := coalesce(nullif(trim(split_part(trim(meta ->> 'full_name'), ' ', 1)), ''), '');
    v_cognome := coalesce(
      nullif(
        trim(
          substring(
            trim(meta ->> 'full_name')
            from length(split_part(trim(meta ->> 'full_name'), ' ', 1)) + 2
          )
        ),
        ''
      ),
      ''
    );
  end if;

  insert into public.profiles (
    id,
    email,
    nome,
    cognome,
    telefono,
    role,
    is_active
  )
  values (
    new.id,
    coalesce(nullif(trim(new.email), ''), ''),
    v_nome,
    v_cognome,
    v_telefono,
    resolved_role,
    true
  )
  on conflict (id) do nothing;

  if resolved_role = 'specializzando'::public.app_role then
    begin
      v_anno :=
        case
          when nullif(trim(meta ->> 'anno_specialita'), '') is null then null
          else (trim(meta ->> 'anno_specialita'))::int
        end;
    exception
      when others then v_anno := null;
    end;

    v_asseg_enum := null;
    if v_asseg_raw is not null then
      begin
        v_asseg_enum := v_asseg_raw::public.assegnazione_specializzando;
      exception
        when others then v_asseg_enum := null;
      end;
    end if;

    if v_anno is null or v_anno < 1 or v_anno > 5 or v_asseg_enum is null then
      raise exception
        'specializzando richiede nei metadati utente anno_specialita (1-5) e assegnazione valida (rianimazione|sala_base|sala_locoregionale|sala_avanzata).';
    end if;

    insert into public.specializzandi_profiles (
      user_id,
      anno_specialita,
      assegnazione
    )
    values (new.id, v_anno, v_asseg_enum)
    on conflict (user_id) do update set
      anno_specialita = excluded.anno_specialita,
      assegnazione = excluded.assegnazione,
      updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
