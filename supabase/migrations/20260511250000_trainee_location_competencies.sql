-- Competenze / preferenze / rotazioni specializzando ↔ sala o area tipo (planning).

do $$
begin
  create type public.trainee_location_competency_status as enum (
    'abilitato',
    'preferenziale',
    'rotazione',
    'non_assegnabile'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.trainee_assignment_location_competencies (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references public.profiles (id) on delete cascade,
  assignment_location_id uuid references public.assignment_locations (id) on delete cascade,
  clinical_area_id uuid references public.clinical_areas (id) on delete cascade,
  status public.trainee_location_competency_status not null,
  note text,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trainee_competency_at_least_one_target check (
    assignment_location_id is not null or clinical_area_id is not null
  ),
  constraint trainee_competency_date_range check (
    starts_on is null or ends_on is null or ends_on >= starts_on
  )
);

create index if not exists trainee_competencies_trainee_id_idx
  on public.trainee_assignment_location_competencies (trainee_id);

create index if not exists trainee_competencies_assignment_location_id_idx
  on public.trainee_assignment_location_competencies (assignment_location_id)
  where assignment_location_id is not null;

create index if not exists trainee_competencies_clinical_area_id_idx
  on public.trainee_assignment_location_competencies (clinical_area_id)
  where clinical_area_id is not null;

alter table public.trainee_assignment_location_competencies enable row level security;

drop policy if exists "trainee_competencies_select_admin_tutor_own" on public.trainee_assignment_location_competencies;
create policy "trainee_competencies_select_admin_tutor_own"
on public.trainee_assignment_location_competencies
for select
to authenticated
using (
  public.is_admin()
  or public.is_tutor()
  or trainee_id = auth.uid()
);

drop policy if exists "trainee_competencies_insert_admin" on public.trainee_assignment_location_competencies;
create policy "trainee_competencies_insert_admin"
on public.trainee_assignment_location_competencies
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "trainee_competencies_update_admin" on public.trainee_assignment_location_competencies;
create policy "trainee_competencies_update_admin"
on public.trainee_assignment_location_competencies
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "trainee_competencies_delete_admin" on public.trainee_assignment_location_competencies;
create policy "trainee_competencies_delete_admin"
on public.trainee_assignment_location_competencies
for delete
to authenticated
using (public.is_admin());

drop trigger if exists trainee_competencies_set_updated_at on public.trainee_assignment_location_competencies;
create trigger trainee_competencies_set_updated_at
before update on public.trainee_assignment_location_competencies
for each row execute function public.set_updated_at();
