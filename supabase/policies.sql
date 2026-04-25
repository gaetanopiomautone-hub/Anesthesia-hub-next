-- Minimal and strict RLS policies for the core workflow tables:
--   profiles, leave_requests, procedure_catalog, logbook_entries, shifts,
--   monthly_shift_plans, shift_items
-- Assumes public.profiles is the single source of truth for role.

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------

create or replace function public.get_my_role()
returns public.app_role
language sql
stable
as $$
  select role
  from public.profiles
  where id = auth.uid()
$$;

create or replace function public.is_scheduler_or_admin()
returns boolean
language sql
stable
as $$
  select public.get_my_role() in ('tutor', 'admin')
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, true) = true
  )
$$;

create or replace function public.is_tutor()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'tutor'
      and coalesce(p.is_active, true) = true
  )
$$;

create or replace function public.is_specializzando()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'specializzando'
      and coalesce(p.is_active, true) = true
  )
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- Rules:
-- - user reads own profile
-- - admin can read all
-- - user updates only own row and cannot escalate role/deactivate/edit email
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (
  auth.uid() = id
  or public.get_my_role() = 'admin'
);

drop policy if exists "profiles_update_own_limited_fields" on public.profiles;
create policy "profiles_update_own_limited_fields"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (
  auth.uid() = id
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.email = profiles.email
      and p.role = profiles.role
      and p.is_active = profiles.is_active
  )
);

-- ---------------------------------------------------------------------------
-- leave_requests
-- Rules:
-- - trainee sees own requests
-- - trainee inserts only own pending requests
-- - trainee updates only own pending requests
-- - scheduler/admin read all and can approve/reject
-- ---------------------------------------------------------------------------

alter table public.leave_requests enable row level security;

drop policy if exists "leave_select_own_or_scheduler_admin" on public.leave_requests;
create policy "leave_select_own_or_scheduler_admin"
on public.leave_requests
for select
to authenticated
using (
  requester_profile_id = auth.uid()
  or public.is_scheduler_or_admin()
);

drop policy if exists "leave_insert_own_pending" on public.leave_requests;
create policy "leave_insert_own_pending"
on public.leave_requests
for insert
to authenticated
with check (
  requester_profile_id = auth.uid()
  and status = 'in_attesa'
  and approved_by is null
  and approved_at is null
);

drop policy if exists "leave_update_own_only_pending" on public.leave_requests;
create policy "leave_update_own_only_pending"
on public.leave_requests
for update
to authenticated
using (
  requester_profile_id = auth.uid()
  and status = 'in_attesa'
)
with check (
  requester_profile_id = auth.uid()
  and status = 'in_attesa'
  and approved_by is null
  and approved_at is null
);

-- Solo transizione da in_attesa a approvato/rifiutato; approvatore = utente corrente; niente riscrittura storico.
drop policy if exists "leave_update_scheduler_admin_approval" on public.leave_requests;
create policy "leave_update_scheduler_admin_approval"
on public.leave_requests
for update
to authenticated
using (
  public.is_scheduler_or_admin()
  and status = 'in_attesa'
)
with check (
  public.is_scheduler_or_admin()
  and status in ('approvato', 'rifiutato')
  and approved_by = auth.uid()
  and approved_at is not null
);

-- ---------------------------------------------------------------------------
-- procedure_catalog
-- Decisione esplicita: catalogo di sola lettura per ogni utente autenticato.
-- Serve a select diretti (es. logbook) e embed PostgREST da logbook_entries;
-- nessuna INSERT/UPDATE/DELETE da ruolo authenticated (gestione catalogo solo
-- service role / amministratore DB).
-- ---------------------------------------------------------------------------

alter table public.procedure_catalog enable row level security;

drop policy if exists "procedure_catalog_select_authenticated" on public.procedure_catalog;
create policy "procedure_catalog_select_authenticated"
on public.procedure_catalog
for select
to authenticated
using (true);

-- ---------------------------------------------------------------------------
-- logbook_entries
-- Rules:
-- - trainee sees/modifies own entries
-- - admin can read all entries
-- ---------------------------------------------------------------------------

alter table public.logbook_entries enable row level security;

drop policy if exists "logbook_select_own_or_admin" on public.logbook_entries;
create policy "logbook_select_own_or_admin"
on public.logbook_entries
for select
to authenticated
using (
  trainee_profile_id = auth.uid()
  or public.get_my_role() = 'admin'
);

drop policy if exists "logbook_insert_own" on public.logbook_entries;
create policy "logbook_insert_own"
on public.logbook_entries
for insert
to authenticated
with check (trainee_profile_id = auth.uid());

drop policy if exists "logbook_update_own" on public.logbook_entries;
create policy "logbook_update_own"
on public.logbook_entries
for update
to authenticated
using (trainee_profile_id = auth.uid())
with check (trainee_profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- shifts
-- Rules:
-- - admin and tutor: read all
-- - specializzando: read own scope (assignee or own proposal)
-- - admin: full mutation
-- - specializzando: update only own non-approved proposals
-- ---------------------------------------------------------------------------

alter table public.shifts enable row level security;

drop policy if exists "shifts_select_own_or_scheduler_admin" on public.shifts;
drop policy if exists "shifts_select_admin_tutor_all" on public.shifts;
create policy "shifts_select_admin_tutor_all"
on public.shifts
for select
to authenticated
using (
  public.is_admin()
  or public.is_tutor()
);

drop policy if exists "shifts_select_specializzando_own_scope" on public.shifts;
create policy "shifts_select_specializzando_own_scope"
on public.shifts
for select
to authenticated
using (
  public.is_specializzando()
  and (
    assignee_profile_id = auth.uid()
    or proposed_by = auth.uid()
  )
);

drop policy if exists "shifts_insert_scheduler_admin" on public.shifts;
drop policy if exists "shifts_insert_admin" on public.shifts;
create policy "shifts_insert_admin"
on public.shifts
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "shifts_update_scheduler_admin" on public.shifts;
drop policy if exists "shifts_update_admin" on public.shifts;
create policy "shifts_update_admin"
on public.shifts
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "shifts_update_specializzando_bootstrap_or_own" on public.shifts;
create policy "shifts_update_specializzando_bootstrap_or_own"
on public.shifts
for update
to authenticated
using (
  public.is_specializzando()
  and (
    proposed_by = auth.uid()
    or proposed_by is null
  )
  and status <> 'approved'
)
with check (
  public.is_specializzando()
  and proposed_by = auth.uid()
  and status <> 'approved'
);

drop policy if exists "shifts_delete_scheduler_admin" on public.shifts;
drop policy if exists "shifts_delete_admin" on public.shifts;
create policy "shifts_delete_admin"
on public.shifts
for delete
to authenticated
using (public.is_admin());

-- ---------------------------------------------------------------------------
-- learning_resources (archivio didattico)
-- Rules:
-- - select: amministratore vede tutto; altri solo se il proprio ruolo e' in visibility[]
-- - insert/update/delete: solo amministratore
-- Nota: per resource_type = 'pdf', file_url contiene il path oggetto nel bucket privato learning-pdfs
--       (es. "{uuid}/nome-file.pdf"), non un URL pubblico.
-- ---------------------------------------------------------------------------

alter table public.learning_resources enable row level security;

drop policy if exists "learning_resources_select_visible" on public.learning_resources;
create policy "learning_resources_select_visible"
on public.learning_resources
for select
to authenticated
using (
  public.get_my_role() = 'admin'
  or (
    public.get_my_role() is not null
    and visibility @> ARRAY[public.get_my_role()]
  )
);

drop policy if exists "learning_resources_insert_admin" on public.learning_resources;
create policy "learning_resources_insert_admin"
on public.learning_resources
for insert
to authenticated
with check (public.get_my_role() = 'admin');

drop policy if exists "learning_resources_update_admin" on public.learning_resources;
create policy "learning_resources_update_admin"
on public.learning_resources
for update
to authenticated
using (public.get_my_role() = 'admin')
with check (public.get_my_role() = 'admin');

drop policy if exists "learning_resources_delete_admin" on public.learning_resources;
create policy "learning_resources_delete_admin"
on public.learning_resources
for delete
to authenticated
using (public.get_my_role() = 'admin');

-- ---------------------------------------------------------------------------
-- monthly_shift_plans
-- Rules:
-- - select: admin, tutor, specializzando
-- - insert: solo admin (creazione piano / import mese)
-- - update: admin completo; specializzando solo se non approved e non imposta approved
-- - delete: solo admin
-- - approvazione mese: solo admin (status = approved)
-- ---------------------------------------------------------------------------

alter table public.monthly_shift_plans enable row level security;

drop policy if exists "monthly_shift_plans_select_all_roles" on public.monthly_shift_plans;
create policy "monthly_shift_plans_select_all_roles"
on public.monthly_shift_plans
for select
to authenticated
using (
  public.is_admin()
  or public.is_tutor()
  or public.is_specializzando()
);

drop policy if exists "monthly_shift_plans_insert_admin" on public.monthly_shift_plans;
create policy "monthly_shift_plans_insert_admin"
on public.monthly_shift_plans
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "monthly_shift_plans_update_admin" on public.monthly_shift_plans;
create policy "monthly_shift_plans_update_admin"
on public.monthly_shift_plans
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "monthly_shift_plans_update_specializzando_non_approved" on public.monthly_shift_plans;
create policy "monthly_shift_plans_update_specializzando_non_approved"
on public.monthly_shift_plans
for update
to authenticated
using (
  public.is_specializzando()
  and status in ('draft', 'submitted')
)
with check (
  public.is_specializzando()
  and status in ('draft', 'submitted')
  and status <> 'approved'
);

drop policy if exists "monthly_shift_plans_delete_admin" on public.monthly_shift_plans;
create policy "monthly_shift_plans_delete_admin"
on public.monthly_shift_plans
for delete
to authenticated
using (public.is_admin());

-- ---------------------------------------------------------------------------
-- shift_items
-- Rules:
-- - select: admin, tutor, specializzando
-- - insert: solo admin (import Excel / righe generate lato app)
-- - update: admin sempre; specializzando solo se piano in draft (dopo invio: solo admin)
-- - delete: solo admin
-- ---------------------------------------------------------------------------

alter table public.shift_items enable row level security;

drop policy if exists "shift_items_select_all_roles" on public.shift_items;
create policy "shift_items_select_all_roles"
on public.shift_items
for select
to authenticated
using (
  public.is_admin()
  or public.is_tutor()
  or public.is_specializzando()
);

drop policy if exists "shift_items_insert_admin" on public.shift_items;
create policy "shift_items_insert_admin"
on public.shift_items
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "shift_items_update_admin" on public.shift_items;
create policy "shift_items_update_admin"
on public.shift_items
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "shift_items_update_specializzando_if_plan_not_approved" on public.shift_items;
create policy "shift_items_update_specializzando_draft_only"
on public.shift_items
for update
to authenticated
using (
  public.is_specializzando()
  and exists (
    select 1
    from public.monthly_shift_plans p
    where p.id = shift_items.plan_id
      and p.status = 'draft'
  )
)
with check (
  public.is_specializzando()
  and exists (
    select 1
    from public.monthly_shift_plans p
    where p.id = shift_items.plan_id
      and p.status = 'draft'
  )
);

drop policy if exists "shift_items_delete_admin" on public.shift_items;
create policy "shift_items_delete_admin"
on public.shift_items
for delete
to authenticated
using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage: bucket privato learning-pdfs (PDF didattici)
-- Eseguire anche l'insert in storage.buckets (vedi snippet sotto) se il bucket non esiste.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('learning-pdfs', 'learning-pdfs', false, 52428800, array['application/pdf']::text[])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "learning_pdfs_insert_admin" on storage.objects;
create policy "learning_pdfs_insert_admin"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'learning-pdfs'
  and public.get_my_role() = 'admin'
);

drop policy if exists "learning_pdfs_select_visible" on storage.objects;
create policy "learning_pdfs_select_visible"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'learning-pdfs'
  and exists (
    select 1
    from public.learning_resources lr
    where lr.resource_type = 'pdf'
      and lr.file_url = storage.objects.name
      and (
        public.get_my_role() = 'admin'
        or (
          public.get_my_role() is not null
          and lr.visibility @> ARRAY[public.get_my_role()]
        )
      )
  )
);

drop policy if exists "learning_pdfs_delete_admin" on storage.objects;
create policy "learning_pdfs_delete_admin"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'learning-pdfs'
  and public.get_my_role() = 'admin'
);
