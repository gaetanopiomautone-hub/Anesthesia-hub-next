-- Allinea RLS ferie su DB remoti con policy legacy (es. requester_profile_id).
-- Senza SELECT tutor/admin e UPDATE approvazione, le righe esistono ma non sono visibili/elaborabili dall'app.
--
-- Stesso contenuto (funzione + due policy) è documentato in `supabase/policies.sql` nel blocco
-- `leave_requests`, così `db reset` locale e produzione dopo `db push` restano allineati.

create or replace function public.is_scheduler_or_admin()
returns boolean
language sql
stable
as $$
  select public.get_my_role() in ('tutor', 'admin')
$$;

drop policy if exists "leave_select_own_or_scheduler_admin" on public.leave_requests;
create policy "leave_select_own_or_scheduler_admin"
on public.leave_requests
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_scheduler_or_admin()
);

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
  and reviewed_by = auth.uid()
  and reviewed_at is not null
  and cancelled_at is null
);
