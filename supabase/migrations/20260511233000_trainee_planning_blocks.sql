-- Blocchi indisponibilità / attività non assistenziali per specializzando (lezioni, congressi, desiderata a fascia, ecc.).
-- Le ferie multi-giorno restano su `leave_requests`; qui si modellano slot giornalieri con fascia.

do $$
begin
  create type public.trainee_planning_block_period as enum ('morning', 'afternoon', 'full_day');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.trainee_planning_block_kind as enum ('didattica', 'congresso', 'desiderata', 'altro');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.trainee_planning_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  block_date date not null,
  period public.trainee_planning_block_period not null,
  kind public.trainee_planning_block_kind not null,
  title text not null default '',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trainee_planning_blocks_user_date_idx
  on public.trainee_planning_blocks (user_id, block_date);

alter table public.trainee_planning_blocks enable row level security;

drop policy if exists "trainee_planning_blocks_select_planning_roles" on public.trainee_planning_blocks;
create policy "trainee_planning_blocks_select_planning_roles"
on public.trainee_planning_blocks
for select
to authenticated
using (
  public.is_admin()
  or public.is_tutor()
  or public.is_specializzando()
);

drop policy if exists "trainee_planning_blocks_insert_admin_or_self" on public.trainee_planning_blocks;
create policy "trainee_planning_blocks_insert_admin_or_self"
on public.trainee_planning_blocks
for insert
to authenticated
with check (
  public.is_admin()
  or (public.is_specializzando() and user_id = auth.uid())
);

drop policy if exists "trainee_planning_blocks_update_admin_or_self" on public.trainee_planning_blocks;
create policy "trainee_planning_blocks_update_admin_or_self"
on public.trainee_planning_blocks
for update
to authenticated
using (public.is_admin() or (public.is_specializzando() and user_id = auth.uid()))
with check (public.is_admin() or (public.is_specializzando() and user_id = auth.uid()));

drop policy if exists "trainee_planning_blocks_delete_admin_or_self" on public.trainee_planning_blocks;
create policy "trainee_planning_blocks_delete_admin_or_self"
on public.trainee_planning_blocks
for delete
to authenticated
using (public.is_admin() or (public.is_specializzando() and user_id = auth.uid()));

drop trigger if exists trainee_planning_blocks_set_updated_at on public.trainee_planning_blocks;
create trigger trainee_planning_blocks_set_updated_at
before update on public.trainee_planning_blocks
for each row execute function public.set_updated_at();
