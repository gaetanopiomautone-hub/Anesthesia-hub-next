-- Aree sala / tipo turno (distinct da clinical_locations fisiche).
-- FK opzionale su shift_items per collegamento graduale; specialty/room_name restano per compatibilità.

create table public.clinical_areas (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clinical_areas enable row level security;

drop policy if exists "clinical_areas_select_planning_roles" on public.clinical_areas;
create policy "clinical_areas_select_planning_roles"
on public.clinical_areas
for select
to authenticated
using (
  public.is_admin()
  or public.is_tutor()
  or public.is_specializzando()
);

drop policy if exists "clinical_areas_insert_admin" on public.clinical_areas;
create policy "clinical_areas_insert_admin"
on public.clinical_areas
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "clinical_areas_update_admin" on public.clinical_areas;
create policy "clinical_areas_update_admin"
on public.clinical_areas
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

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

alter table public.shift_items
  add column if not exists clinical_area_id uuid references public.clinical_areas (id) on delete restrict;

create index if not exists shift_items_clinical_area_id_idx
  on public.shift_items (clinical_area_id)
  where clinical_area_id is not null;

-- Best-effort: shift_items non ha colonna `sala`; confronto con codici enum su specialty o room_name.
update public.shift_items si
set clinical_area_id = ca.id
from public.clinical_areas ca
where si.clinical_area_id is null
  and si.kind = 'sala'
  and (
    lower(trim(both from coalesce(si.specialty, ''))) = ca.code
    or lower(trim(both from coalesce(si.room_name, ''))) = ca.code
  );

drop trigger if exists clinical_areas_set_updated_at on public.clinical_areas;

create trigger clinical_areas_set_updated_at
before update on public.clinical_areas
for each row execute function public.set_updated_at();
