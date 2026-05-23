-- Periodi di assegnazione specializzando (storico ambito con date).

create extension if not exists btree_gist;

create table if not exists public.trainee_assignment_periods (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references public.profiles (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  ambito public.assegnazione_specializzando not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trainee_assignment_periods_date_range check (ends_on >= starts_on)
);

create index if not exists trainee_assignment_periods_trainee_id_idx
  on public.trainee_assignment_periods (trainee_id);

create index if not exists trainee_assignment_periods_trainee_starts_idx
  on public.trainee_assignment_periods (trainee_id, starts_on desc);

-- Nessuna sovrapposizione date per lo stesso specializzando e lo stesso ambito.
alter table public.trainee_assignment_periods
  drop constraint if exists trainee_assignment_periods_no_overlap_same_ambito;

alter table public.trainee_assignment_periods
  add constraint trainee_assignment_periods_no_overlap_same_ambito
  exclude using gist (
    trainee_id with =,
    ambito with =,
    daterange(starts_on, ends_on, '[]') with &&
  );

alter table public.trainee_assignment_periods enable row level security;

drop policy if exists "trainee_assignment_periods_select_admin_tutor_own" on public.trainee_assignment_periods;
create policy "trainee_assignment_periods_select_admin_tutor_own"
on public.trainee_assignment_periods
for select
to authenticated
using (
  public.is_admin()
  or public.is_tutor()
  or trainee_id = auth.uid()
);

drop policy if exists "trainee_assignment_periods_insert_admin" on public.trainee_assignment_periods;
create policy "trainee_assignment_periods_insert_admin"
on public.trainee_assignment_periods
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "trainee_assignment_periods_update_admin" on public.trainee_assignment_periods;
create policy "trainee_assignment_periods_update_admin"
on public.trainee_assignment_periods
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "trainee_assignment_periods_delete_admin" on public.trainee_assignment_periods;
create policy "trainee_assignment_periods_delete_admin"
on public.trainee_assignment_periods
for delete
to authenticated
using (public.is_admin());

drop trigger if exists trainee_assignment_periods_set_updated_at on public.trainee_assignment_periods;
create trigger trainee_assignment_periods_set_updated_at
before update on public.trainee_assignment_periods
for each row execute function public.set_updated_at();
