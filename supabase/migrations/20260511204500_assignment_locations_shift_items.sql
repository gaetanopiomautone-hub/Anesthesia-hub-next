-- Sale / attività per assegnazione turni mensili (planning specializzandi).
-- Distinto da clinical_locations (logbook / anagrafica sale cliniche legacy).

do $$
begin
  create type public.assignment_location_kind as enum (
    'sala',
    'ambulatorio',
    'didattica',
    'ferie',
    'congresso',
    'altro'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.assignment_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind public.assignment_location_kind not null default 'sala',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shift_items
  add column if not exists assignment_location_id uuid references public.assignment_locations (id) on delete set null;

alter table public.shift_items
  add column if not exists notes text;

create index if not exists shift_items_assignment_location_id_idx
  on public.shift_items (assignment_location_id)
  where assignment_location_id is not null;

-- Seed iniziale (idempotente per nome)
insert into public.assignment_locations (name, kind, sort_order)
select v.name, v.kind::public.assignment_location_kind, v.sort_order
from (
  values
    ('Sala Orto', 'sala', 10),
    ('Sala Cardio', 'sala', 20),
    ('Ambulatorio', 'ambulatorio', 30),
    ('Aula didattica', 'didattica', 40),
    ('Congresso', 'congresso', 50),
    ('Ferie', 'ferie', 60)
) as v(name, kind, sort_order)
where not exists (
  select 1
  from public.assignment_locations al
  where al.name = v.name
);

alter table public.assignment_locations enable row level security;

drop policy if exists "assignment_locations_select_planning_roles" on public.assignment_locations;
create policy "assignment_locations_select_planning_roles"
on public.assignment_locations
for select
to authenticated
using (
  public.is_admin()
  or public.is_tutor()
  or public.is_specializzando()
);

drop policy if exists "assignment_locations_insert_admin" on public.assignment_locations;
create policy "assignment_locations_insert_admin"
on public.assignment_locations
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "assignment_locations_update_admin" on public.assignment_locations;
create policy "assignment_locations_update_admin"
on public.assignment_locations
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop trigger if exists assignment_locations_set_updated_at on public.assignment_locations;
create trigger assignment_locations_set_updated_at
before update on public.assignment_locations
for each row execute function public.set_updated_at();
